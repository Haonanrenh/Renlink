import { runStandalone } from '../../../tests/support/test-harness.mjs';

function assertFrontendContracts(ctx) {
    const checks = [
        {
            file: 'frontend/js/agora-client.js',
            expectations: [
                ['media support inspection', /getMediaSupportStatus/],
                ['partial media option', /allowPartial/],
                ['track creation result errors', /errors,\s*\n\s*mediaSupport/]
            ]
        },
        {
            file: 'frontend/js/call-manager.js',
            expectations: [
                ['media-limited call state', /通话中 · 本机媒体受限/],
                ['local fallback UI', /local-media-fallback/],
                ['partial publishing enabled', /allowPartial:\s*true/],
                ['subtitle text is escaped', /escapeHtml\(item\.text\)/],
                ['typing indicator uses textContent', /text\.textContent = `\$\{this\.remoteUsername\} 正在输入\.\.\.`/]
            ]
        },
        {
            file: 'frontend/js/sign-learning-module.js',
            expectations: [
                ['pagination size', /pageSize\s*=\s*48/],
                ['activation hook', /activate\(\)/],
                ['deactivation hook', /deactivate\(\)/],
                ['back to top control', /BackTop|backTop|scrollTo/],
                ['per-user progress storage', /storageKeyBase\s*=\s*'renlink\.signLearning\.progress\.v2'/],
                ['current user lookup', /getCurrentUsername\(\)/],
                ['saved progress panel render', /renderProgressPanel\(\)/],
                ['progress detail toggle', /toggleProgressDetail\(type\)/]
            ]
        },
        {
            file: 'frontend/dashboard.html',
            expectations: [
                ['learning module shell', /sign-learning/i],
                ['online call module shell', /id="onlineCallModule"/],
                ['friends module shell', /id="friendsModule"/],
                ['missed call module shell', /id="missedCallsModule"/],
                ['saved learning panel', /data-testid="sign-learning-progress"/],
                ['favorites list', /data-testid="sign-learning-favorites"/],
                ['learned list', /data-testid="sign-learning-learned"/],
                ['progress detail list', /data-testid="sign-learning-progress-list"/],
                ['catalog script', /sign-learning-catalog\.js/],
                ['module script', /sign-learning-module\.js/]
            ]
        },
        {
            file: 'frontend/index.html',
            expectations: [
                ['login form', /id="loginForm"/],
                ['register form', /id="registerForm"/],
                ['network config script', /\.\.\/network-config\.js/],
                ['app script', /app\.js/]
            ]
        },
        {
            file: 'frontend/call.html',
            expectations: [
                ['local video container', /id="local-video-container"/],
                ['remote video container', /id="remote-video-container"/],
                ['subtitle toggle', /toggleSubtitle\(\)/],
                ['text to speech toggle', /toggleTextToSpeech\(\)/],
                ['Agora SDK script', /AgoraRTC_N-4\.20\.0\.js/]
            ]
        },
        {
            file: 'frontend/app.js',
            expectations: [
                ['login endpoint', /\/auth\/login/],
                ['register endpoint', /\/auth\/register/],
                ['logout endpoint', /\/auth\/logout/],
                ['auth store session', /Renlink\.auth\.setSession/]
            ]
        },
        {
            file: 'frontend/js/renlink-core.js',
            expectations: [
                ['module registry', /registerModule/],
                ['html escaping helper', /escapeHtml/]
            ]
        },
        {
            file: 'frontend/js/auth-store.js',
            expectations: [
                ['versioned token key', /renlink\.auth\.token/],
                ['legacy migration window', /LEGACY_TOKEN_KEY/],
                ['clear session', /clearSession/]
            ]
        },
        {
            file: 'frontend/js/api-client.js',
            expectations: [
                ['central api request', /async function request/],
                ['authorization header', /headers\.set\('Authorization'/],
                ['json post helper', /post\(path, body/]
            ]
        },
        {
            file: 'frontend/js/friends-module.js',
            expectations: [
                ['friends endpoint', /\/users\/friends/],
                ['messages endpoint', /\/messages/],
                ['unread summary endpoint', /\/messages\/unread-summary/],
                ['friend request accept endpoint', /\/friends\/requests\/\$\{requestId\}\/accept/],
                ['friend remove endpoint', /DELETE/]
            ]
        },
        {
            file: 'frontend/js/online-call-module.js',
            expectations: [
                ['user search endpoint', /\/users\/search\?query=/],
                ['call invitation endpoint', /\/call-invitations/],
                ['accept invitation endpoint', /\/accept/],
                ['reject invitation endpoint', /\/reject/]
            ]
        },
        {
            file: 'frontend/js/missed-call-module.js',
            expectations: [
                ['missed calls endpoint', /\/call-invitations\/missed-calls/],
                ['mark read endpoint', /\/mark-read/],
                ['mark all read endpoint', /\/mark-all-read/],
                ['callback creates invitation', /\/call-invitations/]
            ]
        },
        {
            file: 'frontend/js/websocket-client.js',
            expectations: [
                ['call invitation queue', /\/user\/queue\/call-invitations/],
                ['subtitle queue', /\/user\/queue\/subtitles/],
                ['direct message queue', /\/user\/queue\/direct-messages/],
                ['typing status queue', /\/user\/queue\/typing-status/]
            ]
        },
        {
            file: 'frontend/js/xfyun-rtasr-client.js',
            expectations: [
                ['asr session endpoint', /\/asr\/xfyun\/session/],
                ['authorization header', /Authorization.*Bearer/],
                ['audio frame size handling', /frameBytes/]
            ]
        },
        {
            file: 'frontend/js/xfyun-tts-client.js',
            expectations: [
                ['tts session endpoint', /\/tts\/xfyun\/session/],
                ['authorization header', /Authorization.*Bearer/],
                ['text length validation', /trim\(\)/]
            ]
        },
        {
            file: 'frontend/js/sign-language-avatar.js',
            expectations: [
                ['sign language init endpoint', /\/sign-language\/init/],
                ['SDK loader', /loadSDK/],
                ['short credential fetch', /fetchInitCredential/],
                ['no app secret response usage', /clientToken/]
            ]
        },
        {
            file: 'scripts/verify-sign-learning-data.mjs',
            expectations: [
                ['schema verification', /requiredKeys/],
                ['local video verification', /fs\.existsSync\(localVideoPath\)/],
                ['all real items', /catalog\.length === 6707/]
            ]
        }
    ];

    const forbiddenUiFiles = [
        'frontend/dashboard.html',
        'frontend/js/sign-learning-module.js',
        'frontend/css/dashboard.css'
    ];
    const forbiddenVisibleSourceTerms = [
        'NationalCSL-DP',
        '国家通用手语视频',
        '数据集视频待接入',
        'Participant_02'
    ];

    for (const check of checks) {
        const content = ctx.readText(check.file);
        for (const [label, pattern] of check.expectations) {
            ctx.assert(pattern.test(content), `${check.file} missing ${label}`);
        }
    }

    for (const file of forbiddenUiFiles) {
        const content = ctx.readText(file);
        for (const term of forbiddenVisibleSourceTerms) {
            ctx.assert(!content.includes(term), `${file} exposes source term "${term}" in UI code`);
        }
    }

    return `${checks.length} frontend files matched expected contracts`;
}

export async function run(ctx) {
    await ctx.step('frontend white-box', 'frontend dashboard, call, and sign-learning contracts are intact', async () => assertFrontendContracts(ctx));
}

await runStandalone(import.meta.url, run);
