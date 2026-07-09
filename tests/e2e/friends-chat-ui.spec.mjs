import { runStandalone } from '../support/test-harness.mjs';

export async function run(ctx) {
    if (!ctx.config.runBrowser) {
        ctx.skip('browser automation', 'friends and chat browser flow', 'RENLINK_RUN_BROWSER=0');
        return;
    }

    await ctx.step('environment', 'backend and frontend are reachable for friends/chat E2E', async () => {
        await ctx.ensureServers();
        return `${ctx.config.backendUrl} and ${ctx.config.frontendUrl}`;
    });

    const { chromium } = await ctx.loadPlaywright();
    const browser = await chromium.launch({
        headless: ctx.config.headless,
        slowMo: ctx.config.slowMo
    });
    try {
        await ctx.step('browser automation', 'friends list opens chat and sends a real message through backend API', async () => {
            const page = await ctx.preparePage(browser, { width: 1280, height: 820 });
            const consoleProblems = [];
            page.on('console', (message) => {
                if (['error', 'warning'].includes(message.type())) {
                    consoleProblems.push(`${message.type()}: ${message.text()}`);
                }
            });

            try {
                await page.goto(`${ctx.config.frontendUrl}/index.html`, { waitUntil: 'domcontentloaded' });
                await page.locator('button', { hasText: '登录账号' }).first().click();
                await page.locator('#loginUsername').fill('test1');
                await page.locator('#loginPassword').fill('123456');
                await page.locator('#loginForm button[type="submit"]').click();
                await page.waitForURL('**/frontend/dashboard.html', { timeout: 15000 });

                await page.locator('[data-module="friends"]').click();
                await page.waitForSelector('#friendsList .friend-card', { timeout: 15000 });

                const test2Card = page.locator('#friendsList .friend-card').filter({ hasText: 'test2' }).first();
                await test2Card.locator('button', { hasText: '消息' }).click();
                await page.waitForFunction(() => document.querySelector('#chatPanelTitle')?.textContent.includes('test2'));

                const message = `E2E message ${Date.now()}`;
                await page.locator('#chatInput').fill(message);
                await page.locator('#chatSendBtn').click();
                await page.waitForFunction((expected) => {
                    return Array.from(document.querySelectorAll('#chatMessages .chat-bubble'))
                        .some((node) => node.textContent.includes(expected));
                }, message, { timeout: 15000 });

                const hint = await page.locator('#chatHint').textContent();
                ctx.assert(hint.includes('未读消息'), `chat hint did not reflect active conversation: ${hint}`);

                const relevantConsoleProblems = consoleProblems.filter((line) => {
                    return !line.includes('WebSocket') &&
                        !line.includes('Tailwind') &&
                        !line.includes('Failed to load resource') &&
                        !line.includes('ERR_CONNECTION_REFUSED');
                });
                ctx.assert(relevantConsoleProblems.length === 0, `unexpected console problems:\n${relevantConsoleProblems.join('\n')}`);

                return `message sent to test2 from friends UI: ${message}`;
            } finally {
                await page.close();
            }
        });
    } finally {
        await browser.close();
    }
}

await runStandalone(import.meta.url, run);
