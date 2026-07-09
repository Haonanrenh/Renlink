import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const BASE_FRONTEND_URL = 'http://127.0.0.1:3000/frontend';
const BASE_BACKEND_URL = 'http://127.0.0.1:8080/api';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SAMPLE_PCM_PATH = path.join(projectRoot, 'scripts', 'fixtures', 'subtitle-sample.pcm');
const TEMP_WAV_PATH = path.join(projectRoot, 'scripts', '.subtitle-sample.wav');

const USER_A = {
    username: 'subtitle_tester_a',
    password: 'test1234'
};

const USER_B = {
    username: 'subtitle_tester_b',
    password: 'test1234'
};

function pcmToWav(pcmBuffer, sampleRate = 16000, channels = 1, bitsPerSample = 16) {
    const blockAlign = channels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);

    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
    wavBuffer.write('WAVE', 8);
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20);
    wavBuffer.writeUInt16LE(channels, 22);
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(byteRate, 28);
    wavBuffer.writeUInt16LE(blockAlign, 32);
    wavBuffer.writeUInt16LE(bitsPerSample, 34);
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
    pcmBuffer.copy(wavBuffer, 44);

    return wavBuffer;
}

async function ensureTestUser(user) {
    const loginResponse = await fetch(`${BASE_BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: user.username,
            password: user.password
        })
    });

    if (loginResponse.ok) {
        return loginResponse.json();
    }

    const registerResponse = await fetch(`${BASE_BACKEND_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
    });

    if (!registerResponse.ok) {
        const errorText = await registerResponse.text();
        throw new Error(`无法创建测试用户 ${user.username}: ${errorText}`);
    }

    return registerResponse.json();
}

async function preparePage(page, authPayload, remoteUserName, role, channelName) {
    await page.goto(`${BASE_FRONTEND_URL}/index.html`, { waitUntil: 'domcontentloaded' });

    await page.evaluate(({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
    }, {
        token: authPayload.token,
        user: authPayload.user
    });

    await page.goto(
        `${BASE_FRONTEND_URL}/call.html?channel=${encodeURIComponent(channelName)}&user=${encodeURIComponent(remoteUserName)}&type=video&role=${encodeURIComponent(role)}`,
        { waitUntil: 'domcontentloaded' }
    );
}

async function waitForCallReady(page, label) {
    await page.waitForFunction(() => {
        const callStatus = document.getElementById('callStatus');
        return callStatus && callStatus.textContent.includes('通话中');
    }, { timeout: 45000 });

    console.log(`${label}: call status is ready`);
}

async function enableSubtitle(page, label) {
    await page.click('#subtitleBtn');
    await page.waitForSelector('#subtitle-container:not(.hidden)', { timeout: 10000 });
    console.log(`${label}: subtitle panel enabled`);
}

async function waitForSubtitleUpdate(page, label) {
    await page.waitForFunction(() => {
        const readLines = (id) => Array.from(document.querySelectorAll(`#${id} .subtitle-line`))
            .map((node) => node.textContent.trim())
            .filter(Boolean);

        const localLines = readLines('localSubtitleLines');
        const remoteLines = readLines('remoteSubtitleLines');

        return localLines.length > 0 && remoteLines.length > 0;
    }, { timeout: 50000 });

    const snapshot = await page.evaluate(() => {
        const collect = (prefix) => ({
            speaker: document.getElementById(`${prefix}SubtitleSpeaker`)?.textContent?.trim() || '',
            status: document.getElementById(`${prefix}SubtitleStatus`)?.textContent?.trim() || '',
            lines: Array.from(document.querySelectorAll(`#${prefix}SubtitleLines .subtitle-line`))
                .map((node) => node.textContent.trim())
                .filter(Boolean)
        });

        return {
            local: collect('local'),
            remote: collect('remote')
        };
    });

    console.log(`${label}: subtitle snapshot`);
    console.log(JSON.stringify(snapshot, null, 2));

    const lineCountOk = snapshot.local.lines.length <= 2 && snapshot.remote.lines.length <= 2;
    if (!lineCountOk) {
        throw new Error(`${label}: 字幕行数超过 2 行，当前 local=${snapshot.local.lines.length}, remote=${snapshot.remote.lines.length}`);
    }

    return snapshot;
}

async function main() {
    if (!fs.existsSync(EDGE_PATH)) {
        throw new Error(`未找到 Edge 浏览器: ${EDGE_PATH}`);
    }

    if (!fs.existsSync(SAMPLE_PCM_PATH)) {
        throw new Error(`未找到样例音频: ${SAMPLE_PCM_PATH}`);
    }

    fs.writeFileSync(TEMP_WAV_PATH, pcmToWav(fs.readFileSync(SAMPLE_PCM_PATH)));

    const userAAuth = await ensureTestUser(USER_A);
    const userBAuth = await ensureTestUser(USER_B);
    const channelName = `subtitle_dual_${Date.now()}`;

    const browserArgs = [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${TEMP_WAV_PATH}`,
        '--autoplay-policy=no-user-gesture-required'
    ];

    let browserA;
    let browserB;

    try {
        browserA = await chromium.launch({
            executablePath: EDGE_PATH,
            headless: true,
            args: browserArgs
        });

        browserB = await chromium.launch({
            executablePath: EDGE_PATH,
            headless: true,
            args: browserArgs
        });

        const contextA = await browserA.newContext();
        const contextB = await browserB.newContext();
        await contextA.grantPermissions(['camera', 'microphone'], { origin: BASE_FRONTEND_URL });
        await contextB.grantPermissions(['camera', 'microphone'], { origin: BASE_FRONTEND_URL });

        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();

        pageA.on('console', (msg) => console.log(`[A console] ${msg.type()}: ${msg.text()}`));
        pageB.on('console', (msg) => console.log(`[B console] ${msg.type()}: ${msg.text()}`));

        await Promise.all([
            preparePage(pageA, userAAuth, USER_B.username, 'caller', channelName),
            preparePage(pageB, userBAuth, USER_A.username, 'callee', channelName)
        ]);

        await Promise.all([
            waitForCallReady(pageA, 'Browser A'),
            waitForCallReady(pageB, 'Browser B')
        ]);

        await Promise.all([
            enableSubtitle(pageA, 'Browser A'),
            enableSubtitle(pageB, 'Browser B')
        ]);

        const [snapshotA, snapshotB] = await Promise.all([
            waitForSubtitleUpdate(pageA, 'Browser A'),
            waitForSubtitleUpdate(pageB, 'Browser B')
        ]);

        console.log('Dual-browser subtitle verification passed.');
        console.log(JSON.stringify({ snapshotA, snapshotB }, null, 2));
    } finally {
        try {
            if (browserA) {
                await browserA.close();
            }
        } catch {}

        try {
            if (browserB) {
                await browserB.close();
            }
        } catch {}

        try {
            fs.unlinkSync(TEMP_WAV_PATH);
        } catch {}
    }
}

main().catch((error) => {
    console.error('Dual-browser subtitle verification failed:');
    console.error(error);
    process.exit(1);
});
