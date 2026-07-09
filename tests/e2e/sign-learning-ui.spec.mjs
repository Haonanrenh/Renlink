import { runStandalone } from '../support/test-harness.mjs';

export async function run(ctx) {
    if (!ctx.config.runBrowser) {
        ctx.skip('browser automation', 'sign learning browser flow', 'RENLINK_RUN_BROWSER=0');
        return;
    }

    await ctx.step('environment', 'backend and frontend are reachable for sign-learning E2E', async () => {
        await ctx.ensureServers();
        return `${ctx.config.backendUrl} and ${ctx.config.frontendUrl}`;
    });

    const { chromium } = await ctx.loadPlaywright();
    const browser = await chromium.launch({
        headless: ctx.config.headless,
        slowMo: ctx.config.slowMo
    });
    try {
        await ctx.step('browser automation', 'login and sign learning pagination/search flow', async () => {
            const page = await ctx.preparePage(browser, { width: 1280, height: 820 });
            const consoleProblems = [];
            page.on('console', (message) => {
                if (['error', 'warning'].includes(message.type())) {
                    consoleProblems.push(`${message.type()}: ${message.text()}`);
                }
            });

            try {
                await page.goto(`${ctx.config.frontendUrl}/index.html`, { waitUntil: 'domcontentloaded' });
                await page.evaluate(() => {
                    for (const key of Object.keys(localStorage)) {
                        if (key.startsWith('renlink.signLearning.progress.v2.')) {
                            localStorage.removeItem(key);
                        }
                    }
                });
                await page.locator('button', { hasText: '登录账号' }).first().click();
                await page.locator('#loginUsername').fill('test1');
                await page.locator('#loginPassword').fill('123456');
                await page.locator('#loginForm button[type="submit"]').click();
                await page.waitForURL('**/frontend/dashboard.html', { timeout: 15000 });

                await page.locator('[data-module="learning"]').click();
                await page.waitForSelector('[data-testid="sign-learning-grid"] .sign-card', { timeout: 15000 });

                const firstPageCount = await page.locator('[data-testid="sign-learning-grid"] .sign-card').count();
                ctx.assert(firstPageCount === 48, `expected 48 cards on page 1, got ${firstPageCount}`);
                const pageSummary = await page.locator('#signLearningPageSummary').textContent();
                ctx.assert(/第 1 \//.test(pageSummary || ''), `unexpected first page summary: ${pageSummary}`);

                await page.locator('[data-testid="sign-learning-next-page"]').click();
                await page.waitForFunction(() => document.querySelector('#signLearningPageSummary')?.textContent.includes('第 2 /'));
                const secondPageSummary = await page.locator('#signLearningPageSummary').textContent();
                ctx.assert(/显示 49-96 /.test(secondPageSummary || ''), `unexpected second page summary: ${secondPageSummary}`);

                await page.locator('[data-testid="sign-learning-search"]').fill('医院');
                await page.waitForFunction(() => document.querySelector('#signLearningPageSummary')?.textContent.includes('第 1 /'));
                await page.locator('[data-sign-card][data-sign-id="nationalcsl-1284"]').click();
                await page.waitForFunction(() => document.querySelector('#signLearningPlayerTitle')?.textContent.trim() === '医院');
                const videoSrc = await page.locator('#signLearningVideo').getAttribute('src');
                ctx.assert(videoSrc?.includes('nationalcsl_1284_p02_front.mp4'), `unexpected hospital video source: ${videoSrc}`);

                await page.locator('#signLearningFavoriteBtn').click();
                ctx.assert((await page.locator('#signLearningFavoriteBtn').textContent()).includes('取消收藏'), 'favorite state did not update');
                await page.locator('#signLearningLearnedBtn').click();
                ctx.assert((await page.locator('#signLearningLearnedBtn').textContent()).includes('已学会'), 'learned state did not update');
                ctx.assert(!(await page.locator('[data-testid="sign-learning-progress-detail"]').isVisible()), 'progress detail should stay collapsed before a user opens it');
                await page.locator('[data-testid="sign-learning-favorites"]').click();
                await page.waitForFunction(() => document.querySelector('[data-testid="sign-learning-progress-list"]')?.textContent.includes('医院'));
                ctx.assert((await page.locator('#signLearningProgressDetailTitle').textContent()).includes('我的收藏'), 'favorite detail title did not render');
                await page.locator('[data-testid="sign-learning-learned"]').click();
                await page.waitForFunction(() => document.querySelector('[data-testid="sign-learning-progress-list"]')?.textContent.includes('医院'));
                ctx.assert((await page.locator('#signLearningProgressDetailTitle').textContent()).includes('已学习内容'), 'learned detail title did not render');
                const test1Progress = await page.evaluate(() => JSON.parse(localStorage.getItem('renlink.signLearning.progress.v2.test1') || '{}'));
                ctx.assert(test1Progress['nationalcsl-1284']?.favorite === true, 'test1 favorite was not saved under the test1 progress key');
                ctx.assert(test1Progress['nationalcsl-1284']?.learned === true, 'test1 learned state was not saved under the test1 progress key');

                const test2Session = await ctx.login('test2');
                await page.evaluate(({ token, user }) => {
                    localStorage.setItem('token', token);
                    localStorage.setItem('user', JSON.stringify(user));
                }, { token: test2Session.token, user: test2Session.user });
                await page.goto(`${ctx.config.frontendUrl}/dashboard.html`, { waitUntil: 'load' });
                await page.waitForFunction(() => window.dashboardManager && document.querySelector('[data-module="learning"]'));
                await page.locator('[data-module="learning"]').click();
                await page.waitForSelector('[data-testid="sign-learning-grid"] .sign-card', { timeout: 15000 });
                const test2Favorites = await page.locator('[data-testid="sign-learning-favorites"]').innerText();
                const test2Learned = await page.locator('[data-testid="sign-learning-learned"]').innerText();
                ctx.assert(!test2Favorites.includes('医院'), 'test2 inherited test1 favorite progress');
                ctx.assert(!test2Learned.includes('医院'), 'test2 inherited test1 learned progress');
                await page.locator('[data-testid="sign-learning-favorites"]').click();
                const test2ProgressDetail = await page.locator('[data-testid="sign-learning-progress-list"]').innerText();
                ctx.assert(!test2ProgressDetail.includes('医院'), 'test2 inherited test1 progress detail');

                const bodyText = await page.locator('body').innerText();
                for (const forbidden of ['NationalCSL-DP', 'Participant_02', '国家通用手语视频', '数据集视频', '来源']) {
                    ctx.assert(!bodyText.includes(forbidden), `visible source wording leaked: ${forbidden}`);
                }

                await page.locator('[data-testid="sign-learning-search"]').fill('');
                await page.waitForFunction(() => document.querySelectorAll('[data-testid="sign-learning-grid"] .sign-card').length === 48);
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await page.waitForFunction(() => document.querySelector('.floating-navbar')?.classList.contains('learning-nav-hidden'), null, { timeout: 10000 });
                ctx.assert(await page.locator('#signLearningBackTopBtn').isVisible(), 'back-to-top button not visible after scroll');
                await page.locator('#signLearningBackTopBtn').click();
                await page.waitForFunction(() => window.scrollY < 20 && !document.querySelector('.floating-navbar')?.classList.contains('learning-nav-hidden'), null, { timeout: 10000 });

                const relevantConsoleProblems = consoleProblems.filter((line) => {
                    return !line.includes('WebSocket') &&
                        !line.includes('Tailwind') &&
                        !line.includes('Failed to load resource') &&
                        !line.includes('ERR_CONNECTION_REFUSED');
                });
                ctx.assert(relevantConsoleProblems.length === 0, `unexpected console problems:\n${relevantConsoleProblems.join('\n')}`);

                return 'login, learning page, pagination, search, per-user progress lists, and back-to-top verified';
            } finally {
                await page.close();
            }
        });
    } finally {
        await browser.close();
    }
}

await runStandalone(import.meta.url, run);
