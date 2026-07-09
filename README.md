# Renlink
Web based system supports real time video call with real time sign language recognition assistance and real time voice-to-sign language. It also supports many deaf-mute friendly assistances。 一个基于web的系统，支持实时视频通话，并提供实时手语识别辅助及实时语音转手语功能。同时，该系统还支持多项聋哑人友好型辅助功能

Renlink 是一个面向无障碍沟通场景的 Web 应用，包含 Spring Boot 后端和原生 JavaScript 前端。项目提供账号认证、好友关系、私信、音视频呼叫、未接来电、实时字幕、文字转语音、手语数字人与手语学习等功能。

## 技术栈

- 后端：Java 17、Spring Boot 3.2、Spring Security、JWT、Spring WebSocket、Spring Data JPA
- 前端：原生 HTML/CSS/JavaScript、SockJS、STOMP、Agora Web SDK
- 数据库：开发默认 H2，生产可通过环境变量切换 PostgreSQL 或 MySQL
- 测试：Maven 编译测试、Node.js 黑盒/白盒测试、可选 Playwright E2E

## 目录结构

```text
Renlink/
├── backend/                 # Spring Boot 服务
├── frontend/                # 静态前端页面和 JS 模块
├── scripts/                 # 数据构建与统一测试脚本
├── tests/                   # 跨端集成与 E2E 测试
├── network-config.js        # 本地网络入口配置
├── .env.example             # 后端环境变量模板
└── API接口文档.md           # REST 与 WebSocket 接口说明
```

## 快速启动

1. 复制 `.env.example` 为 `.env`，填写本地密钥。开发环境可以不配置数据库，后端会使用 H2 内存库。
2. 启动后端：

```cmd
cd backend
start.bat
```

3. 从仓库根目录启动静态前端服务，推荐访问 `http://localhost:3000/frontend/index.html`。如果使用 `frontend/start.bat`，需要确认页面仍能加载根目录的 `network-config.js`。

```cmd
python -m http.server 3000
```

4. 默认演示账号仅用于开发环境：`test1` / `123456`、`test2` / `123456`。

## 配置

- 后端密钥、数据库、Agora、讯飞、手语服务配置放在 `.env`。
- `network-config.js` 只负责本地访问地址，默认应使用 `localhost` 或当前页面主机名。
- 前端不得保存长期密钥、证书或 AppSecret。需要第三方能力时，由后端代理、生成服务端签名或发放短期 token。

## 核心功能

- 认证：注册、登录、登出、当前用户查询
- 社交：用户搜索、好友申请、好友列表、删除好友
- 消息：好友私信、未读统计、实时推送
- 呼叫：呼叫邀请、接听、拒绝、取消、未接来电
- 通话：Agora 音视频、媒体受限降级、字幕、TTS、正在输入状态
- 手语：通话数字人、离线手语学习 catalog 和视频资源

## 测试

统一测试入口：

```cmd
node scripts\renlink-unified-test-suite.mjs
```

常用专项验证：

```cmd
node scripts\verify-sign-learning-data.mjs
node scripts\verify-sign-learning-ui.mjs
node scripts\verify-subtitle-dual-browser.mjs
```

E2E 需要 Playwright。若环境未安装浏览器依赖，可先运行后端编译和 Node 白盒/黑盒测试。

## 安全约束

- 生产环境必须提供强随机 `JWT_SECRET`，不得使用示例值。
- 生产环境关闭 H2 Console、SQL 输出、演示账号和 `ddl-auto=create-drop`。
- CORS 与 WebSocket Origin 必须配置白名单。
- WebSocket CONNECT 必须携带有效 JWT。
- 不可信文本进入页面前必须转义或使用 `textContent`。

