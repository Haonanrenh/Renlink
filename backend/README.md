# Renlink Backend

Spring Boot 后端负责认证、用户关系、消息、呼叫信令、实时推送和第三方服务签名。前端不直接保存长期密钥，所有敏感配置均由后端读取环境变量并按需代理或签发短期凭证。

## 模块结构

```text
backend/src/main/java/com/renlink/
├── config/       # 安全、CORS、WebSocket、开发数据
├── controller/   # REST API 与 STOMP 入口
├── dto/          # 请求和响应对象
├── entity/       # JPA 实体
├── exception/    # 全局异常处理
├── filter/       # JWT 认证过滤器
├── mapper/       # DTO 映射
├── repository/   # Spring Data JPA
├── service/      # 业务逻辑与第三方服务签名
└── util/         # .env 加载
```

## 启动

```cmd
start.bat
```

默认端口为 `8080`。启动前会读取仓库根目录 `.env`，优先级为系统环境变量、JVM 参数、`.env`。

## 环境变量

核心变量：

- `JWT_SECRET`：JWT 签名密钥，生产必须为强随机值。
- `DB_URL`、`DB_DRIVER`、`DB_USERNAME`、`DB_PASSWORD`、`HIBERNATE_DIALECT`：数据库配置。
- `DDL_AUTO`、`SHOW_SQL`：开发可用，生产不得使用 `create-drop`。
- `AGORA_APP_ID`、`AGORA_APP_CERTIFICATE`：Agora token 签发。
- `XFYUN_RTASR_LLM_*`：讯飞实时转写。
- `XFYUN_TTS_*`：讯飞 TTS。
- `SIGN_LANGUAGE_ENABLED`、`SIGN_LANGUAGE_APP_SECRET`：手语服务配置。

## REST 模块

- `AuthController`：`/api/auth/**`
- `UserController`：`/api/users/**`
- `ChatMessageController`：`/api/messages/**`
- `CallInvitationController`：`/api/call-invitations/**`
- `AgoraController`：`/api/agora/**`
- `AsrController`：`/api/asr/xfyun/session`
- `TtsController`：`/api/tts/xfyun/session`
- `SubtitleController`：`/api/subtitles/share`
- `SignLanguageController`：`/api/sign-language/**`

## WebSocket

- 端点：`/ws`
- 应用前缀：`/app`
- 用户队列前缀：`/user/queue`
- 服务端推送：呼叫邀请、呼叫拒绝、呼叫取消、好友更新、私信、字幕、正在输入状态
- 客户端 CONNECT 必须携带 `Authorization: Bearer <token>`

## 数据模型

核心实体：

- `User`
- `Friendship`
- `FriendRequest`
- `ChatMessage`
- `CallInvitation`
- `MissedCall`

## 测试

后端 Maven 测试：

```cmd
mvn test
```

仓库统一测试：

```cmd
node ..\scripts\renlink-unified-test-suite.mjs
```

现有 Node 黑盒测试覆盖认证、用户、好友、消息、呼叫和辅助服务。Java 单元测试应优先补齐 `JwtService`、`AuthService`、`CallInvitationService` 和 `ChatMessageService`。
