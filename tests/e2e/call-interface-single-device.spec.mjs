import { runStandalone } from '../support/test-harness.mjs';

export async function run(ctx) {
    if (!ctx.config.runBrowser) {
        ctx.skip('browser automation', 'single-computer call interface', 'RENLINK_RUN_BROWSER=0');
        return;
    }

    await ctx.step('environment', 'backend and frontend are reachable for call-interface E2E', async () => {
        await ctx.ensureServers();
        return `${ctx.config.backendUrl} and ${ctx.config.frontendUrl}`;
    });
    await ctx.ensureDemoSessions();

    const tokenCheck = await ctx.ensureAgoraTokenAvailable();
    if (!tokenCheck.available) {
        ctx.skip('browser automation', 'single-computer call interface', `${tokenCheck.message}; configure .env to run this part`);
        return;
    }

    const { chromium } = await ctx.loadPlaywright();
    const browser = await chromium.launch({
        headless: ctx.config.headless,
        slowMo: ctx.config.slowMo
    });
    try {
        await ctx.step('browser automation', 'single-computer call interface uses media fallback', async () => {
            const page = await ctx.preparePage(browser, { width: 1280, height: 820 });
            try {
                await page.addInitScript(({ token, user }) => {
                    localStorage.setItem('token', token);
                    localStorage.setItem('user', JSON.stringify(user));
                    try {
                        Object.defineProperty(navigator, 'mediaDevices', {
                            configurable: true,
                            value: undefined
                        });
                    } catch {
                        // Some browsers may not allow redefining this property; the Agora stub still throws.
                    }
                }, {
                    token: ctx.test1Session.token,
                    user: ctx.test1Session.user
                });

                const channelName = `unified_browser_${Date.now()}`;
                await page.goto(`${ctx.config.frontendUrl}/call.html?channel=${encodeURIComponent(channelName)}&user=test2&type=video&role=caller`, {
                    waitUntil: 'domcontentloaded'
                });
                await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('hidden'), null, { timeout: 20000 });
                await page.waitForFunction(() => document.querySelector('#callStatus')?.textContent.includes('通话中'), null, { timeout: 20000 });
                const statusText = await page.locator('#callStatus').textContent();
                ctx.assert(statusText.includes('本机媒体受限'), `expected media-limited status, got ${statusText}`);
                ctx.assert(await page.locator('.local-media-fallback').isVisible(), 'local media fallback is not visible');
                ctx.assert(await page.locator('#muteBtn').isDisabled(), 'mute button should be disabled when microphone is unavailable');
                ctx.assert(await page.locator('#videoBtn').isDisabled(), 'video button should be disabled when camera is unavailable');
                const joined = await page.evaluate(() => window.__renlinkAgoraJoin);
                ctx.assert(joined?.channelName === channelName, `Agora join did not use expected channel: ${JSON.stringify(joined)}`);
                ctx.assert(joined.hasToken === true, 'Agora join did not receive backend token');
                const publishedCount = await page.evaluate(() => window.__renlinkAgoraPublishedTrackCount ?? 0);
                ctx.assert(publishedCount === 0, `expected no local tracks to publish in media-limited mode, got ${publishedCount}`);
                return 'call token, channel join, and media-limited UI verified without claiming two-device video';
            } finally {
                await page.close();
            }
        });
    } finally {
        await browser.close();
    }
}

await runStandalone(import.meta.url, run);
