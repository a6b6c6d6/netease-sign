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

const results = [];

function record(tag, ok, detail = "") {
  const status = ok ? "✅" : "❌";
  const line = `${status} ${tag}${detail ? " — " + detail : ""}`;
  results.push(line);
  console.log(line);
}

// ── 云贝签到 ──────────────────────────────────────────
async function cloudSignIn() {
  const csrfToken = getCookieValue("__csrf");
  const body = new URLSearchParams();
  body.append("type", "1");
  if (csrfToken) body.append("csrf_token", csrfToken);

  const res = await fetch("https://music.163.com/api/point/dailyTask", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();

  if (data.code === 200) {
    record("云贝签到", true, `+${data.point || 0} 云贝`);
  } else if (data.code === -2) {
    record("云贝签到", true, "今天已签到");
  } else {
    record("云贝签到", false, `code=${data.code}`);
  }
}

// ── VIP 信息查询 ──────────────────────────────────────
async function getVipInfo() {
  const res = await fetch(
    "https://music.163.com/api/vipnewcenter/app/level/growhpoint/basic",
    { method: "POST", headers }
  );
  const data = await res.json();
  if (data.code !== 200) return null;
  return data.data;
}

// ── VIP 签到 ──────────────────────────────────────────
async function vipSignIn() {
  const res = await fetch("https://music.163.com/api/vip-center-bff/task/sign", {
    method: "POST",
    headers,
  });
  const data = await res.json();
  if (data.code === 200 && data.data === true) {
    record("VIP 签到", true);
  } else {
    record("VIP 签到", false, `code=${data.code}`);
  }
}

// ── VIP 成长值领取 ────────────────────────────────────
async function claimRewards() {
  const res = await fetch(
    "https://music.163.com/api/vipnewcenter/app/level/task/reward/getall",
    { method: "POST", headers }
  );
  const data = await res.json();
  if (data.code === 200 && data.data?.result === true) {
    record("VIP 成长值", true, "已领取");
  } else {
    record("VIP 成长值", true, "无可领取");
  }
}

// ── 钉钉通知 ──────────────────────────────────────────
async function sendDingTalk(levelName) {
  if (!DT_WEBHOOK) return;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const text = [
    `### 📋 网易云音乐签到报告`,
    ``,
    `**📅 ${dateStr}**${levelName ? `　　**👑 ${levelName}**` : ""}`,
    ``,
    `---`,
    ``,
    ...results.map((r) => `- ${r}`),
    ``,
    `---`,
    ``,
    `> 🤖 [netease-sign](https://github.com/a6b6c6d6/netease-sign) · GitHub Actions`,
  ].join("\n");

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
      markdown: { title: `签到报告 ${dateStr}`, text },
    }),
  });
  const data = await res.json();
  if (data.errcode === 0) {
    console.log("[钉钉] 通知发送成功");
  } else {
    console.warn(`[钉钉] 发送失败 errcode=${data.errcode}`);
  }
}

// ── 主流程 ──────────────────────────────────────────
async function main() {
  if (!getCookieValue("MUSIC_U")) {
    console.warn("⚠️ 未找到 MUSIC_U cookie，session 可能已过期");
  }

  await cloudSignIn();

  let vipLevel = "";
  const vipInfo = await getVipInfo();
  if (vipInfo) {
    vipLevel = vipInfo.userLevel.levelName;
    record("VIP 状态", true, `${vipLevel}　成长值 ${vipInfo.userLevel.growthPoint}`);
    await vipSignIn();
    await claimRewards();
  } else {
    record("VIP 签到", false, "查询失败或非会员");
  }

  await sendDingTalk(vipLevel);
}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
