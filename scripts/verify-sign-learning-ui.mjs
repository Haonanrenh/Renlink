import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const port = Number(process.env.SIGN_LEARNING_TEST_PORT || 4177);
const baseUrl = `http://127.0.0.1:${port}`;
const require = createRequire(import.meta.url);

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.mp4': 'video/mp4',
    '.md': 'text/markdown; charset=utf-8'
};

function startStaticServer() {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', baseUrl);
        const requestedPath = decodeURIComponent(url.pathname === '/' ? '/frontend/dashboard.html' : url.pathname);
        const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(projectRoot, normalizedPath);

        if (!filePath.startsWith(projectRoot)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(filePath, (error, buffer) => {
            if (error) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            res.writeHead(200, {
                'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            res.end(buffer);
        });
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function loadPlaywright() {
    try {
        return await import('playwright');
    } catch (projectImportError) {
        const candidateNodeModules = [
            process.env.PLAYWRIGHT_NODE_MODULES,
            process.env.NODE_REPL_NODE_MODULE_DIRS,
            '/Users/myz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
        ].filter(Boolean);

        for (const nodeModulesPath of candidateNodeModules) {
            try {
                const requireFromCandidate = createRequire(path.join(nodeModulesPath, 'playwright-loader.js'));
                return requireFromCandidate('playwright');
            } catch {
                // Try next candidate.
            }
        }

        throw projectImportError;
    }
}

const server = await startStaticServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
try {
    await verifyViewport({ width: 1280, height: 820 }, 'desktop');
    await verifyViewport({ width: 390, height: 844 }, 'mobile');
    console.log('Sign learning UI flow verified.');
} finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
}

async function verifyViewport(viewport, label) {
    const page = await browser.newPage({ viewport });
    const consoleMessages = [];

    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) {
            consoleMessages.push(`${message.type()}: ${message.text()}`);
        }
    });

    try {
        await page.goto(`${baseUrl}/frontend/index.html`, { waitUntil: 'domcontentloaded' });
        await page.locator('button', { hasText: '登录账号' }).first().click();
        await page.locator('#loginUsername').fill('test1');
        await page.locator('#loginPassword').fill('123456');
        await page.locator('#loginForm button[type="submit"]').click();
        await page.waitForURL('**/frontend/dashboard.html', { timeout: 15000 });
        await page.waitForFunction(() => {
            return window.dashboardManager && window.dashboardManager.currentModule === 'onlineCall';
        }, { timeout: 15000 });

        await page.locator('[data-module="learning"]').click();
        await page.waitForSelector('[data-testid="sign-learning-grid"] .sign-card', { timeout: 10000 });
        const initialCardCount = await page.locator('[data-testid="sign-learning-grid"] .sign-card').count();
        assert(initialCardCount === 48, `${label}: expected first page to show 48 cards, got ${initialCardCount}`);
        const paginationVisible = await page.locator('[data-testid="sign-learning-pagination"]').isVisible();
        assert(paginationVisible, `${label}: pagination should be visible for learning catalog`);

        const bodyText = await page.locator('body').innerText();
        const forbiddenUiTerms = ['NationalCSL-DP', 'Participant_02', '国家通用手语视频', '数据集视频', '来源'];
        for (const term of forbiddenUiTerms) {
            assert(!bodyText.includes(term), `${label}: frontend should not display source term "${term}"`);
        }

        const initialTitle = await page.locator('#signLearningPlayerTitle').textContent();
        assert(initialTitle && initialTitle.trim().length > 0 && initialTitle !== '请选择词句', `${label}: player did not select the first learning item`);

        const firstPageFirstCard = await page.locator('[data-testid="sign-learning-grid"] .sign-card h3').first().textContent();
        await page.locator('[data-testid="sign-learning-next-page"]').click();
        await page.waitForFunction(() => document.querySelector('#signLearningPageSummary')?.textContent.includes('第 2 /'));
        const secondPageFirstCard = await page.locator('[data-testid="sign-learning-grid"] .sign-card h3').first().textContent();
        assert(firstPageFirstCard !== secondPageFirstCard, `${label}: next page should render a different first card`);
        const secondPageCount = await page.locator('[data-testid="sign-learning-grid"] .sign-card').count();
        assert(secondPageCount === 48, `${label}: expected second page to show 48 cards, got ${secondPageCount}`);

        await page.locator('[data-testid="sign-learning-search"]').fill('医院');
        await page.waitForFunction(() => document.querySelector('#signLearningPageSummary')?.textContent.includes('第 1 /'));
        await page.waitForFunction(() => {
            const cards = Array.from(document.querySelectorAll('[data-testid="sign-learning-grid"] .sign-card h3'));
            return cards.some((card) => card.textContent.trim() === '医院');
        }, { timeout: 10000 });

        await page.locator('[data-sign-card][data-sign-id="nationalcsl-1284"]').click();
        await page.waitForFunction(() => document.querySelector('#signLearningPlayerTitle')?.textContent.trim() === '医院');

        const datasetText = await page.locator('#signLearningDatasetId').textContent();
        assert(datasetText.includes('本地视频'), `${label}: expected neutral local video label, got "${datasetText}"`);

        const videoSrc = await page.locator('#signLearningVideo').getAttribute('src');
        assert(videoSrc && videoSrc.includes('nationalcsl_1284_p02_front.mp4'), `${label}: expected hospital local sign video, got "${videoSrc}"`);
        const videoVisible = await page.locator('#signLearningVideo').isVisible();
        assert(videoVisible, `${label}: video element should be visible for hospital`);

        await page.locator('#signLearningFavoriteBtn').click();
        const favoriteText = await page.locator('#signLearningFavoriteBtn').textContent();
        assert(favoriteText.includes('取消收藏'), `${label}: favorite state did not update`);

        await page.locator('#signLearningLearnedBtn').click();
        const learnedText = await page.locator('#signLearningLearnedBtn').textContent();
        assert(learnedText.includes('已学会'), `${label}: learned state did not update`);

        await page.locator('[data-sign-category="medical"]').click();
        const medicalCount = await page.locator('[data-testid="sign-learning-grid"] .sign-card').count();
        assert(medicalCount >= 1, `${label}: medical category should show at least one card`);

        await page.locator('[data-testid="sign-learning-search"]').fill('');
        await page.locator('[data-sign-category="all"]').click();
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="sign-learning-grid"] .sign-card').length === 48);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForFunction(() => document.querySelector('.floating-navbar')?.classList.contains('learning-nav-hidden'), null, { timeout: 10000 });
        const backTopVisible = await page.locator('#signLearningBackTopBtn').isVisible();
        assert(backTopVisible, `${label}: back-to-top button should be visible after scrolling`);
        await page.locator('#signLearningBackTopBtn').click();
        await page.waitForFunction(() => window.scrollY < 20 && !document.querySelector('.floating-navbar')?.classList.contains('learning-nav-hidden'), null, { timeout: 10000 });

        await page.locator('[data-testid="sign-learning-search"]').fill('不存在的词');
        await page.waitForSelector('#signLearningEmpty:not(.hidden)', { timeout: 10000 });

        const relevantConsoleProblems = consoleMessages.filter((line) => {
            return !line.includes('Failed to load resource') &&
                !line.includes('ERR_CONNECTION_REFUSED') &&
                !line.includes('Tailwind') &&
                !line.includes('[WebSocket]') &&
                !line.includes('WebSocket 连接失败') &&
                !line.includes('Whoops! Lost connection');
        });
        assert(relevantConsoleProblems.length === 0, `${label}: unexpected console problems:\n${relevantConsoleProblems.join('\n')}`);
        console.log(`Sign learning UI flow verified (${label}).`);
    } finally {
        await page.close();
    }
}
