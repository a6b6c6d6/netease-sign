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

const headers = {
  Cookie: COOKIE,
  "User-Agent": UA,
  Referer: "https://music.163.com/",
};

// ── 状态收集 ──────────────────────────────────────────
const state = {
  cloud: { ok: false, text: "" },
  vipLevel: "",
  vipGrowth: 0,
  vipSign: { ok: false, text: "" },
  vipReward: { ok: false, text: "" },
};

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

// ── 云贝签到 ──────────────────────────────────────────
async function cloudSignIn() {
  const csrfToken = getCookieValue("__csrf");
  const body = new URLSearchParams();
  body.append("type", "1");
  if (csrfToken) body.append("csrf_token", csrfToken);

  let data;
  try {
    const res = await fetch("https://music.163.com/api/point/dailyTask", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    data = await res.json();
  } catch (e) {
    state.cloud = { ok: false, text: "请求失败" };
    log("云贝签到", "请求失败 " + e.message);
    return;
  }

  if (data.code === 200) {
    state.cloud = { ok: true, text: `+${data.point || 0} 云贝` };
    log("云贝签到", `成功, +${data.point || 0} 云贝`);
  } else if (data.code === -2) {
    state.cloud = { ok: true, text: "今日已签到" };
    log("云贝签到", "今天已签到");
  } else {
    state.cloud = { ok: false, text: `code=${data.code}` };
    log("云贝签到", `失败 code=${data.code}`);
  }
}

// ── VIP 信息查询 ──────────────────────────────────────
async function getVipInfo() {
  try {
    const res = await fetch(
      "https://music.163.com/api/vipnewcenter/app/level/growhpoint/basic",
      { method: "POST", headers }
    );
    const data = await res.json();
    if (data.code !== 200) return null;
    return data.data;
  } catch {
    return null;
  }
}

// ── VIP 签到 ──────────────────────────────────────────
async function vipSignIn() {
  try {
    const res = await fetch("https://music.163.com/api/vip-center-bff/task/sign", {
      method: "POST",
      headers,
    });
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
    const res = await fetch(
      "https://music.163.com/api/vipnewcenter/app/level/task/reward/getall",
      { method: "POST", headers }
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
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const lines = [`### 📋 网易云音乐签到报告`, ``, `**📅 ${dateStr}**`];

  // 云贝
  lines.push(
    ``,
    `**☁️ 云贝签到**`,
    `${state.cloud.ok ? "✅" : "❌"} ${state.cloud.text}`
  );

  // VIP
  if (state.vipLevel) {
    lines.push(
      ``,
      `**👑 VIP 签到**`,
      `🏷️ ${state.vipLevel}`,
      `📊 当前成长值 ${state.vipGrowth}`,
      `${state.vipSign.ok ? "✅" : "❌"} 签到${state.vipSign.ok ? "" : " — " + state.vipSign.text}`,
      `${state.vipReward.ok ? "✅" : "❌"} 成长值 ${state.vipReward.text}`
    );
  } else {
    lines.push(``, `**👑 VIP 签到**`, `❌ 非会员或查询失败`);
  }

  lines.push(``, `---`, ``, `> 🤖 [netease-sign](https://github.com/a6b6c6d6/netease-sign)`);

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
      markdown: { title: `签到报告 ${dateStr}`, text: lines.join("\n") },
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

  await cloudSignIn();

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
