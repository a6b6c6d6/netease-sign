# 网易云音乐自动签到

每天 UTC 16:05（北京时间 00:05）通过 GitHub Actions 自动完成每日任务。

## 功能

- **云贝签到** — 每日签到领取云贝
- **VIP 黑胶乐签** — 每日 VIP 签到
- **VIP 成长值领取** — 自动领取所有可领成长值

## 快速开始

### 1. 获取 Cookie

浏览器打开 [music.163.com](https://music.163.com) 并登录账号。

**方法一：F12 Console（最简单）**
```
F12 → Console → 输入下面代码回车
```

```js
copy(document.cookie)
```

**方法二：Cookie-Editor 插件**
装 [Cookie-Editor](https://chromewebstore.google.com/detail/cookie-editor/ookdjilphngeeeghgngjabigmpepanpl) → 点图标 → Export → 复制 header 格式的字符串

> 关键要有 `MUSIC_U` 和 `__csrf` 这两个 cookie

### 2. 配置 GitHub Secrets

| 步骤 | 操作 |
|------|------|
| 1 | 把本仓库 Fork 到你自己的 GitHub |
| 2 | Settings → Secrets and variables → Actions → New repository secret |
| 3 | Name: `NETEASE_COOKIE` |
| 4 | Value: 粘贴你上面复制的 Cookie 字符串 |

### 3. 触发运行

- **自动**：每天 UTC 16:05（北京时间 00:05）自动执行
- **手动**：Actions → Netease Daily Sign → Run workflow

## Cookie 过期

Cookie 过期后 GitHub Actions 会发邮件通知你运行失败，届时重新登录一次，更新 Secret 即可。
