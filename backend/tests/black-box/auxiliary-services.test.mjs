import { runStandalone } from '../../../tests/support/test-harness.mjs';

export async function run(ctx) {
    await ctx.step('environment', 'backend is reachable for auxiliary services', async () => {
        await ctx.ensureBackend();
        return ctx.config.backendUrl;
    });

    await ctx.ensureDemoSessions();

    await ctx.step('backend black-box auxiliary', 'sign-language status and init endpoints return safe public shape', async () => {
        const status = await ctx.api('/sign-language/status');
        ctx.assert(status.res.ok, `sign-language status failed: ${status.text}`);
        ctx.assert(typeof status.data?.enabled === 'boolean', 'sign-language status should expose enabled boolean');

        const anonymousInit = await ctx.api('/sign-language/init');
        ctx.assert(anonymousInit.res.status === 401 || anonymousInit.res.status === 403, `anonymous sign-language init should be rejected: ${anonymousInit.text}`);

        const init = await ctx.api('/sign-language/init', {}, ctx.test1Session.token);
        ctx.assert(init.res.ok, `sign-language init failed: ${init.text}`);
        ctx.assert(typeof init.data?.success === 'boolean', 'sign-language init should expose success boolean');
        ctx.assert(!('appSecret' in (init.data || {})), 'sign-language init must not expose appSecret');
        if (init.data.success) {
            ctx.assert(init.data.credentialType === 'server-managed', 'enabled sign-language init should expose server-managed credential mode');
        } else {
            ctx.assert(/未启用|未配置/.test(init.data.error || ''), `disabled sign-language init error unexpected: ${init.text}`);
        }

        return `sign-language enabled=${status.data.enabled}`;
    });

    await ctx.step('backend black-box auxiliary', 'ASR and TTS session endpoints fail gracefully or return signed sessions', async () => {
        const asr = await ctx.api('/asr/xfyun/session', {
            method: 'POST',
            body: {
                lang: 'zh_cn',
                roleType: 0,
                pd: 'com'
            }
        }, ctx.test1Session.token);
        ctx.assert([200, 503].includes(asr.res.status), `ASR session should be 200 or 503, got ${asr.res.status}`);
        ctx.assert(asr.data?.provider === 'xfyun-rtasr-llm', `ASR provider mismatch: ${asr.text}`);
        ctx.assert(typeof asr.data?.success === 'boolean', 'ASR response should expose success boolean');

        const tts = await ctx.api('/tts/xfyun/session', { method: 'POST' }, ctx.test1Session.token);
        ctx.assert([200, 503].includes(tts.res.status), `TTS session should be 200 or 503, got ${tts.res.status}`);
        ctx.assert(tts.data?.provider === 'xfyun-online-tts', `TTS provider mismatch: ${tts.text}`);
        ctx.assert(typeof tts.data?.success === 'boolean', 'TTS response should expose success boolean');

        return `ASR=${asr.res.status}, TTS=${tts.res.status}`;
    });

    await ctx.step('backend black-box auxiliary', 'subtitle share validates payload and accepts valid sync request', async () => {
        const valid = await ctx.api('/subtitles/share', {
            method: 'POST',
            body: {
                targetUsername: 'test2',
                channelName: `subtitle_${Date.now()}`,
                text: '测试字幕同步',
                finalSegment: true
            }
        }, ctx.test1Session.token);
        ctx.assert(valid.res.ok && valid.data?.success === true, `valid subtitle share failed: ${valid.text}`);

        const invalid = await ctx.api('/subtitles/share', {
            method: 'POST',
            body: {
                targetUsername: '',
                channelName: '',
                text: '',
                finalSegment: false
            }
        }, ctx.test1Session.token);
        ctx.assert(invalid.res.status === 400, `invalid subtitle share should be 400, got ${invalid.res.status}`);
        return 'subtitle sync accepted valid payload and rejected invalid payload';
    });
}

await runStandalone(import.meta.url, run);
