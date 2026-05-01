const COOKIE = process.env.NETEASE_COOKIE;
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
    console.log(`[云贝签到] 成功, +${data.point || 0} 云贝`);
  } else if (data.code === -2) {
    console.log("[云贝签到] 今天已签到");
  } else {
    console.log(`[云贝签到] 失败 code=${data.code}`);
  }
}

// ── VIP 信息查询 ──────────────────────────────────────
async function getVipInfo() {
  const res = await fetch(
    "https://music.163.com/api/vipnewcenter/app/level/growhpoint/basic",
    { method: "POST", headers }
  );
  const data = await res.json();
  if (data.code !== 200) {
    console.log("[VIP] 查询信息失败");
    return null;
  }
  const ul = data.data.userLevel;
  console.log(
    `[VIP] 等级: ${ul.levelName}  成长值: ${ul.growthPoint}  会员状态: ${ul.latestVipStatus === 1 ? "有效" : "异常"}`
  );
  if (ul.maxLevel) {
    console.log("[VIP] 已达最高等级");
    return null;
  }
  return data.data;
}

// ── VIP 签到 ──────────────────────────────────────────
async function vipSignIn() {
  const res = await fetch(
    "https://music.163.com/api/vip-center-bff/task/sign",
    { method: "POST", headers }
  );
  const data = await res.json();
  if (data.code === 200 && data.data === true) {
    console.log("[VIP签到] 成功");
  } else {
    console.log(`[VIP签到] 失败 code=${data.code}`);
  }
}

// ── 领取所有可领成长值 ──────────────────────────────
async function claimRewards() {
  const res = await fetch(
    "https://music.163.com/api/vipnewcenter/app/level/task/reward/getall",
    { method: "POST", headers }
  );
  const data = await res.json();
  if (data.code === 200 && data.data?.result === true) {
    console.log("[VIP奖励] 成长值领取成功");
  } else {
    console.log(`[VIP奖励] 无可领取奖励或领取失败 code=${data.code}`);
  }
}

// ── 主流程 ──────────────────────────────────────────
async function main() {
  if (!getCookieValue("MUSIC_U")) {
    console.warn("警告: 未找到 MUSIC_U cookie, session 可能已过期");
  }

  console.log("--- 云贝签到 ---");
  await cloudSignIn();

  console.log("\n--- VIP 签到 ---");
  const vipInfo = await getVipInfo();
  if (vipInfo) {
    await vipSignIn();
    await claimRewards();
  }
}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
