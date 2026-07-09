import { runStandalone } from '../../../tests/support/test-harness.mjs';

function assertBackendContracts(ctx) {
    const checks = [
        {
            file: 'backend/src/main/java/com/renlink/config/DemoDataInitializer.java',
            expectations: [
                ['dev or test profile only', /@Profile\(\{"dev", "test"\}\)/],
                ['test1 demo account', /"test1"/],
                ['test2 demo account', /"test2"/],
                ['default password', /"123456"/],
                ['friendship bootstrap', /ensureMutualFriendship/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/AuthController.java',
            expectations: [
                ['login endpoint', /@PostMapping\("\/login"\)/],
                ['register endpoint', /@PostMapping\("\/register"\)/],
                ['logout endpoint', /@PostMapping\("\/logout"\)/],
                ['current user endpoint', /@GetMapping\("\/me"\)/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/UserController.java',
            expectations: [
                ['friend search', /@GetMapping\("\/search"\)/],
                ['friend list', /@GetMapping\("\/friends"\)/],
                ['friend request accept', /@PostMapping\("\/friends\/requests\/\{id\}\/accept"\)/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/CallInvitationController.java',
            expectations: [
                ['create call invitation', /@PostMapping\s*\n\s*public ResponseEntity/],
                ['pending invitations', /@GetMapping\("\/pending"\)/],
                ['accept invitation', /@PostMapping\("\/\{id\}\/accept"\)/],
                ['reject invitation', /@PostMapping\("\/\{id\}\/reject"\)/],
                ['cancel invitation', /@PostMapping\("\/\{id\}\/cancel"\)/],
                ['missed calls', /@GetMapping\("\/missed-calls"\)/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/ChatMessageController.java',
            expectations: [
                ['conversation endpoint', /@GetMapping\("\/conversations\/\{friendUsername\}"\)/],
                ['unread summary endpoint', /@GetMapping\("\/unread-summary"\)/],
                ['mark read endpoint', /@PostMapping\("\/conversations\/\{friendUsername\}\/mark-read"\)/],
                ['send message endpoint', /@PostMapping\s*\n\s*public ResponseEntity/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/AgoraController.java',
            expectations: [
                ['app id endpoint', /@GetMapping\("\/app-id"\)/],
                ['uid token endpoint', /@GetMapping\("\/token"\)/],
                ['account token endpoint', /@GetMapping\("\/token\/account"\)/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/AsrController.java',
            expectations: [
                ['asr session endpoint', /@PostMapping\("\/xfyun\/session"\)/],
                ['service unavailable fallback', /HttpStatus\.SERVICE_UNAVAILABLE/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/TtsController.java',
            expectations: [
                ['tts session endpoint', /@PostMapping\("\/xfyun\/session"\)/],
                ['service unavailable fallback', /HttpStatus\.SERVICE_UNAVAILABLE/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/SignLanguageController.java',
            expectations: [
                ['init endpoint', /@GetMapping\("\/init"\)/],
                ['status endpoint', /@GetMapping\("\/status"\)/],
                ['disabled response', /手语功能未启用或未配置/],
                ['server managed credential mode', /server-managed/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/SubtitleController.java',
            expectations: [
                ['subtitle share endpoint', /@PostMapping\("\/share"\)/],
                ['authenticated sender', /authentication != null \? authentication\.getName\(\) : null/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/controller/TypingStatusController.java',
            expectations: [
                ['typing websocket mapping', /@MessageMapping\("\/typing-status"\)/],
                ['user queue forwarding', /convertAndSendToUser/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/service/AgoraTokenService.java',
            expectations: [
                ['official token builder', /RtcTokenBuilder2/],
                ['certificate validation', /App Certificate .*配置/],
                ['uid token build', /buildTokenWithUid/],
                ['account token build', /buildTokenWithUserAccount/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/service/ChatMessageService.java',
            expectations: [
                ['friend-only validation', /只有好友之间才能发送消息/],
                ['self-message validation', /不能给自己发送消息/],
                ['unread summary', /findUnreadCountsBySenderId/],
                ['mark messages read', /markMessagesAsRead/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/service/FriendRequestService.java',
            expectations: [
                ['self request validation', /不能给自己发送好友申请/],
                ['duplicate outgoing guard', /好友申请已发送/],
                ['reverse request guard', /对方已经向你发来好友申请/],
                ['accept creates friendship', /ensureMutualFriendship/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/service/SubtitleService.java',
            expectations: [
                ['sender validation', /发送者不能为空/],
                ['target validation', /目标用户不能为空/],
                ['friend-only subtitle validation', /只有好友之间才能同步字幕/],
                ['queue forwarding', /\/queue\/subtitles/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/config/SecurityConfig.java',
            expectations: [
                ['auth endpoints are public', /requestMatchers\("\/api\/auth\/\*\*"\)\.permitAll/],
                ['sign language status is public', /requestMatchers\("\/api\/sign-language\/status"\)\.permitAll/],
                ['other requests require authentication', /anyRequest\(\)\.authenticated/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/config/WebSocketAuthInterceptor.java',
            expectations: [
                ['missing token rejected', /requires a Bearer token/],
                ['invalid token rejected', /Invalid WebSocket token/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/dto/RegisterRequest.java',
            expectations: [
                ['username pattern validation', /用户名只能包含字母、数字和下划线/],
                ['password size validation', /密码长度必须在 6-20 个字符之间/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/dto/ChatMessageRequest.java',
            expectations: [
                ['receiver validation', /接收方用户名不能为空/],
                ['content size validation', /消息内容不能超过 500 个字符/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/entity/ChatMessage.java',
            expectations: [
                ['message table', /@Table\(/],
                ['sender index', /idx_chat_messages_sender_id/],
                ['read default', /isRead = false/]
            ]
        },
        {
            file: 'backend/src/main/java/com/renlink/entity/Friendship.java',
            expectations: [
                ['unique friendship pair', /@UniqueConstraint\(columnNames = \{"user_id", "friend_id"\}\)/],
                ['createdAt pre-persist', /@PrePersist/]
            ]
        }
    ];

    for (const check of checks) {
        const content = ctx.readText(check.file);
        for (const [label, pattern] of check.expectations) {
            ctx.assert(pattern.test(content), `${check.file} missing ${label}`);
        }
    }

    return `${checks.length} backend files matched expected contracts`;
}

export async function run(ctx) {
    await ctx.step('backend white-box', 'backend auth, friendship, call, and Agora contracts are intact', async () => assertBackendContracts(ctx));
}

await runStandalone(import.meta.url, run);
