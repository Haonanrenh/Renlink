# Renlink Frontend

前端是无构建工具的多页静态应用，页面通过普通 `<script>` 加载模块。当前官方入口建议从仓库根目录静态服务访问：`http://localhost:3000/frontend/index.html`。

## 页面

- `index.html`：登录和注册
- `dashboard.html`：控制台，包含在线呼叫、好友、聊天、未接来电、手语学习
- `call.html`：通话页，包含 Agora 音视频、字幕、TTS、手语数字人

## 模块分层

```text
frontend/
├── app.js                         # 登录页逻辑
├── config.js                      # 前端运行配置
├── js/
│   ├── renlink-core.js            # 全局命名空间和模块注册
│   ├── auth-store.js              # token/user 存取
│   ├── api-client.js              # 统一 fetch
│   ├── websocket-client.js        # STOMP 实时连接
│   ├── dashboard-manager.js       # 控制台导航和鉴权
│   ├── online-call-module.js      # 搜索和呼叫邀请
│   ├── friends-module.js          # 好友和聊天
│   ├── missed-call-module.js      # 未接来电
│   ├── call-manager.js            # 通话生命周期
│   ├── agora-client.js            # Agora 封装
│   ├── xfyun-rtasr-client.js      # 实时字幕
│   ├── xfyun-tts-client.js        # TTS
│   ├── sign-language-avatar.js    # 手语数字人
│   └── sign-learning-module.js    # 手语学习
├── data/
└── assets/
```

## 配置原则

- `network-config.js` 负责后端地址和前端访问地址。
- `config.js` 只放公开、必要的运行配置。
- 前端不得保存长期 `secret`、`certificate`、`AppSecret` 或第三方 API 私钥。
- Agora App ID 若作为公开标识使用，需要与后端配置保持一致；敏感 token 由后端签发。

## 实时通信

`websocket-client.js` 使用 SockJS + STOMP，连接时从 `auth-store.js` 获取 JWT，并订阅用户队列：

- `/user/queue/call-invitations`
- `/user/queue/call-rejected`
- `/user/queue/call-cancelled`
- `/user/queue/friend-updates`
- `/user/queue/direct-messages`
- `/user/queue/subtitles`
- `/user/queue/typing-status`

## 测试

前端白盒测试：

```cmd
node frontend\tests\white-box\frontend-contracts.test.mjs
node frontend\tests\white-box\sign-learning-data.test.mjs
```

仓库级 E2E：

```cmd
node scripts\renlink-unified-test-suite.mjs
```

## 开发约定

- 新增模块优先注册到 `window.Renlink.modules`，避免继续扩散全局变量。
- API 请求统一走 `Renlink.api`。
- token 和用户信息统一走 `Renlink.auth`。
- 不可信文本使用 `textContent` 或统一转义函数，不直接拼入 `innerHTML`。
