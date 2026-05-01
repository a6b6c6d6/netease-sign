# 网易云音乐自动签到

每天北京时间 00:05 通过 GitHub Actions 自动签到，支持钉钉推送通知。

## 功能

| 任务 | 说明 |
|------|------|
| 云贝签到 | 每日签到领取云贝 |
| VIP 黑胶乐签 | 每日 VIP 签到 |
| VIP 成长值 | 自动领取可领成长值 |
| 钉钉通知 | 签到完成推送到钉钉群 |

## 使用

### 1. 获取 Cookie

浏览器打开并登录 [music.163.com](https://music.163.com)，按 F12 打开开发者工具。

**方法：从 Network 复制（推荐）**
- 切到 **Network（网络）** 标签
- 刷新页面，或在页面上点击任意一首歌
- 在请求列表中找到任意一个到 `music.163.com` 的请求
- 点该请求 → 找到 **Request Headers（请求头）**
- 找到 `Cookie:` 那一行，**右键 → Copy value** 复制整段 Cookie 字符串

> 关键要有 `MUSIC_U` 和 `__csrf` 这两个字段，缺一不可。
> 从 Network 复制的 Cookie 最完整，包含 HttpOnly 类型。

**备选：从 Application 复制**
- 切到 **Application（应用）** → **Storage（存储）** → **Cookies** → `music.163.com`
- 全选所有 Cookie，复制为字符串

### 2. 配置 GitHub Secrets

把仓库 Fork 到你自己的 GitHub，然后进入 Settings → Secrets and variables → Actions → **New repository secret**：

| Name | Value |
|------|-------|
| `NETEASE_COOKIE` | 上面复制的 Cookie 字符串（必填） |
| `DINGTALK_WEBHOOK` | 钉钉机器人 Webhook 地址（选填） |
| `DINGTALK_SECRET` | 钉钉机器人加签密钥（选填，开了加签必填） |

### 3. 触发运行

- **自动**：每天 UTC 16:05（北京时间 00:05）
- **手动**：Actions → Netease Daily Sign → **Run workflow**

## 钉钉通知设置（可选）

1. 在钉钉群里添加一个**自定义机器人**
2. 安全设置勾选**加签**，复制生成的 `SEC` 开头的密钥
3. 获取 Webhook 地址（`https://oapi.dingtalk.com/robot/send?access_token=xxx`）
4. 到 GitHub Secrets 添加：
   - `DINGTALK_WEBHOOK` → 粘贴 Webhook 地址
   - `DINGTALK_SECRET` → 粘贴加签密钥（没开启加签则不填）

设置后每次签到完成会推送类似这样的消息：

```
📋 网易云音乐签到报告

📅 2026-05-01　　　　👑 SVIP黑胶·陆
─────────────────────────
✅ 云贝签到 — +2 云贝
✅ VIP 状态 — SVIP黑胶·陆　成长值 20205
✅ VIP 签到
✅ VIP 成长值 — 已领取
─────────────────────────
```

## Cookie 过期

Cookie 有效期通常几周到几个月，过期后 GitHub Actions 运行会失败并邮件通知你，重新登录一次获取新的 Cookie 更新 Secret 即可。
