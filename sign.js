import crypto from "crypto";

const COOKIE = process.env.NETEASE_COOKIE;
const DT_WEBHOOK = process.env.DINGTALK_WEBHOOK;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

if (!COOKIE) {
  console.error("Error: NETEASE_COOKIE environment variable is not set.");
  process.exit(1);
}

function getCookieValue(name) {
  const match = COOKIE.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : "";
}

function randomChineseIP() {
  const prefixes = ["118.31", "119.23", "123.56", "47.92", "39.96", "47.100", "120.25", "112.126"];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  return p + "." + Math.floor(Math.random() * 256) + "." + Math.floor(Math.random() * 256);
}

const headers = {
  Cookie: COOKIE,
  "User-Agent": UA,
  Referer: "https://music.163.com/",
  Origin: "https://music.163.com",
  "X-Real-IP": randomChineseIP(),
};

// ── Weapi 加密 ──────────────────────────────────────────
const presetKey = Buffer.from("0CoJUm6Qyw8W8jud");
const aesIv = Buffer.from("0102030405060708");
const modulusHex =
  "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";

function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function randomSecret(size = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(size);
  let s = "";
  for (let i = 0; i < size; i++) s += chars[bytes[i] % chars.length];
  return s;
}

function aesEncrypt(text, key) {
  const cipher = crypto.createCipheriv("aes-128-cbc", key, aesIv);
  return cipher.update(text, "utf8", "base64") + cipher.final("base64");
}

function rsaEncrypt(text) {
  const reversed = text.split("").reverse().join("");
  const m = BigInt("0x" + Buffer.from(reversed, "utf8").toString("hex"));
  const n = BigInt("0x" + modulusHex);
  return modPow(m, 0x010001n, n).toString(16).padStart(256, "0");
}

function weapiEncrypt(data) {
  const secKey = randomSecret(16);
  let params = aesEncrypt(JSON.stringify(data), presetKey);
  params = aesEncrypt(params, Buffer.from(secKey));
  return { params, encSecKey: rsaEncrypt(secKey) };
}

// ── 状态收集 ──────────────────────────────────────────
const state = {
  cloud: { ok: false, text: "", shells: 0 },
  vipLevel: "",
  vipGrowth: 0,
  vipSign: { ok: false, text: "" },
  vipReward: { ok: false, text: "" },
};

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

// 发起 weapi 加密的 POST 请求，返回解析后的 JSON；失败返回 null
async function weapiPost(url, data) {
  const csrfToken = getCookieValue("__csrf");
  const fullUrl = `${url}${csrfToken ? "?csrf_token=" + csrfToken : ""}`;
  const { params, encSecKey } = weapiEncrypt(data);
  try {
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ params, encSecKey }),
    });
    if (!res.ok) {
      log("请求", `HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    log("请求", "失败 " + e.message);
    return null;
  }
}

// ── 云贝中心签到 ──────────────────────────────────────────
// 真正的云贝签到接口（签到成功后可在手机 App 云贝中心看到奖励与记录）
// 注意：老的 point/dailyTask 是"乐签/积分"签到，云贝中心看不到记录，已接近废弃
async function cloudSignIn() {
  const data = await weapiPost("https://music.163.com/weapi/pointmall/user/sign", {});

  if (!data) {
    state.cloud = { ok: false, text: "请求失败", shells: 0 };
    log("云贝签到", "请求失败");
    return;
  }

  if (data.code === 200) {
    // data.sign: true 签到成功 | false 今日已签到
    if (data.data?.sign === true) {
      state.cloud = { ok: true, text: "签到成功", shells: 0 };
      log("云贝签到", "签到成功");
    } else {
      state.cloud = { ok: true, text: "今日已签到", shells: 0 };
      log("云贝签到", "今日已签到");
    }
  } else {
    state.cloud = { ok: false, text: `code=${data.code}`, shells: 0 };
    log("云贝签到", `失败 code=${data.code} msg=${data.message || data.msg || ""}`);
  }
}

// ── 查询今日签到所得云贝 ─────────────────────────────────
async function getTodayShells() {
  const data = await weapiPost("https://music.163.com/weapi/point/today/get", {});
  if (data?.code === 200) {
    const shells = data.data?.shells;
    if (typeof shells === "number") {
      state.cloud.shells = shells;
      log("云贝", `今日已获得 ${shells} 云贝`);
      return;
    }
  }
  log("云贝", "查询今日云贝失败");
}

// ── VIP 信息查询（weapi 加密，兼容海外 IP）──────────────────────────
async function getVipInfo() {
  try {
    const csrfToken = getCookieValue("__csrf");
    const { params, encSecKey } = weapiEncrypt({});
    const res = await fetch(
      `https://music.163.com/weapi/vipnewcenter/app/level/growhpoint/basic${csrfToken ? "?csrf_token=" + csrfToken : ""}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ params, encSecKey }),
      }
    );
    const data = await res.json();
    if (data.code !== 200) {
      log("VIP", `查询失败 code=${data.code} msg=${data.message || data.msg || ""}`);
      return null;
    }
    return data.data;
  } catch (e) {
    log("VIP", "查询异常 " + e.message);
    return null;
  }
}

// ── VIP 签到 ──────────────────────────────────────────
async function vipSignIn() {
  try {
    const csrfToken = getCookieValue("__csrf");
    const { params, encSecKey } = weapiEncrypt({});
    const res = await fetch(
      `https://music.163.com/weapi/vip-center-bff/task/sign${csrfToken ? "?csrf_token=" + csrfToken : ""}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ params, encSecKey }),
      }
    );
    const data = await res.json();
    if (data.code === 200 && data.data === true) {
      state.vipSign = { ok: true, text: "success" };
      log("VIP签到", "成功");
    } else {
      state.vipSign = { ok: false, text: `code=${data.code}` };
      log("VIP签到", `失败 code=${data.code}`);
    }
  } catch (e) {
    state.vipSign = { ok: false, text: "请求失败" };
    log("VIP签到", "请求失败 " + e.message);
  }
}

// ── VIP 成长值领取 ────────────────────────────────────
async function claimRewards() {
  try {
    const csrfToken = getCookieValue("__csrf");
    const { params, encSecKey } = weapiEncrypt({});
    const res = await fetch(
      `https://music.163.com/weapi/vipnewcenter/app/level/task/reward/getall${csrfToken ? "?csrf_token=" + csrfToken : ""}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ params, encSecKey }),
      }
    );
    const data = await res.json();
    if (data.code === 200 && data.data?.result === true) {
      state.vipReward = { ok: true, text: "已领取" };
      log("VIP成长值", "领取成功");
    } else {
      state.vipReward = { ok: true, text: "无可领取" };
      log("VIP成长值", "无可领取");
    }
  } catch (e) {
    state.vipReward = { ok: false, text: "请求失败" };
    log("VIP成长值", "请求失败 " + e.message);
  }
}

// ── 钉钉通知 ──────────────────────────────────────────
async function sendDingTalk() {
  if (!DT_WEBHOOK) return;

  const now = new Date();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const weekDay = weekdays[now.getDay()];

  const cloudLine = state.cloud.ok
    ? `${state.cloud.shells > 0 ? `🎁 ${state.cloud.text} · 今日 +${state.cloud.shells} 云贝` : state.cloud.text}`
    : state.cloud.text;

  // 钉钉 markdown：用 \n 换行（不用 <br/>），手机端更美观
  // 钉钉不支持表格，用引用块和列表排版
  const md = [
    `## 🎵 网易云音乐签到`,
    ``,
    `> 📅 ${dateStr} 星期${weekDay}`,
    ``,
    `---`,
    ``,
    `☁️ **云贝签到**`,
    ``,
    `${state.cloud.ok ? "✅" : "❌"} ${cloudLine}`,
  ];

  if (state.vipLevel) {
    md.push(
      ``,
      `---`,
      ``,
      `👑 **VIP 会员**`,
      ``,
      `> 🏷️ ${state.vipLevel}  📊 成长值 ${state.vipGrowth}`,
      ``,
      `${state.vipSign.ok ? "✅" : "❌"} VIP签到：${state.vipSign.ok ? "成功" : state.vipSign.text}`,
      `${state.vipReward.text !== "-" ? (state.vipReward.ok ? "🎁" : "❌") : "  "} 成长值：${state.vipReward.ok ? state.vipReward.text : state.vipReward.text}`
    );
  } else {
    md.push(
      ``,
      `---`,
      ``,
      `👑 **VIP 会员**`,
      ``,
      `❌ 非会员或查询失败`
    );
  }

  md.push(
    ``,
    `---`,
    ``,
    `🤖 [netease-sign](https://github.com/a6b6c6d6/netease-sign)`
  );

  let url = DT_WEBHOOK;
  const secret = process.env.DINGTALK_SECRET;
  if (secret) {
    const timestamp = Date.now();
    const sign = crypto
      .createHmac("sha256", secret)
      .update(timestamp + "\n" + secret)
      .digest("base64");
    url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { title: `🎵 签到报告 ${dateStr}`, text: md.join("\n") },
    }),
  });
  const data = await res.json();
  if (data.errcode === 0) {
    log("钉钉", "通知发送成功");
  } else {
    log("钉钉", `发送失败 errcode=${data.errcode}`);
  }
}

// ── 主流程 ──────────────────────────────────────────
async function main() {
  if (!getCookieValue("MUSIC_U")) {
    console.warn("⚠️ 未找到 MUSIC_U cookie，session 可能已过期");
  }
  if (!getCookieValue("__csrf")) {
    console.warn("⚠️ 未找到 __csrf cookie，云贝签到可能失败");
  }

  await cloudSignIn();
  await getTodayShells();

  const vipInfo = await getVipInfo();
  if (vipInfo) {
    const ul = vipInfo.userLevel;
    state.vipLevel = ul.levelName;
    state.vipGrowth = ul.growthPoint;
    log("VIP", `等级 ${ul.levelName}  成长值 ${ul.growthPoint}`);

    if (ul.latestVipStatus === 1 && !ul.maxLevel) {
      await vipSignIn();
      await claimRewards();
    } else {
      state.vipSign = { ok: true, text: "会员等级已达上限" };
      state.vipReward = { ok: true, text: "-" };
    }
  } else {
    log("VIP", "查询失败或非会员");
  }

  await sendDingTalk();
}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
