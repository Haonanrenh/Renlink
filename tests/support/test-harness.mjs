import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createTestContext(overrides = {}) {
    const projectRoot = overrides.projectRoot || path.resolve(__dirname, '..', '..');
    const backendDir = path.join(projectRoot, 'backend');
    const config = {
        backendUrl: (process.env.RENLINK_BACKEND_URL || 'http://127.0.0.1:8080/api').replace(/\/$/, ''),
        frontendUrl: (process.env.RENLINK_FRONTEND_URL || 'http://127.0.0.1:3000/frontend').replace(/\/$/, ''),
        frontendHost: process.env.RENLINK_FRONTEND_HOST || '127.0.0.1',
        frontendPort: Number(process.env.RENLINK_FRONTEND_PORT || 3000),
        skipServerStart: process.env.RENLINK_SKIP_SERVER_START === '1',
        runBrowser: process.env.RENLINK_RUN_BROWSER !== '0',
        headless: process.env.RENLINK_HEADLESS !== '0',
        slowMo: Number(process.env.RENLINK_SLOW_MO_MS || 0),
        verboseFiles: process.env.RENLINK_VERBOSE_FILES === '1',
        timeoutMs: Number(process.env.RENLINK_TEST_TIMEOUT_MS || 90000),
        ...overrides.config
    };

    const ctx = {
        projectRoot,
        backendDir,
        config,
        results: [],
        spawned: [],
        frontendServer: null,
        backendStarted: false,
        frontendStarted: false,
        test1Session: null,
        test2Session: null,
        agoraTokenAvailable: false
    };

    ctx.record = (status, group, name, detail = '') => {
        ctx.results.push({ status, group, name, detail });
        const suffix = detail ? ` - ${detail}` : '';
        console.log(`[${status}] ${group}: ${name}${suffix}`);
    };

    ctx.pass = (group, name, detail = '') => ctx.record('PASS', group, name, detail);
    ctx.skip = (group, name, detail = '') => ctx.record('SKIP', group, name, detail);
    ctx.fail = (group, name, error) => ctx.record('FAIL', group, name, error instanceof Error ? error.message : String(error));

    ctx.assert = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };

    ctx.step = async (group, name, fn) => {
        try {
            const detail = await fn(ctx);
            ctx.pass(group, name, detail || '');
            return detail;
        } catch (error) {
            ctx.fail(group, name, error);
            throw error;
        }
    };

    ctx.readText = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

    ctx.runGit = (args, options = {}) => execFileSync('git', args, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: options.stdio || ['ignore', 'pipe', 'pipe']
    }).trim();

    ctx.listTrackedFiles = (scope = []) => ctx.runGit(['-c', 'core.quotePath=false', 'ls-files', ...scope])
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    ctx.loadSignCatalog = () => {
        const catalogPath = path.join(projectRoot, 'frontend', 'data', 'sign-learning-catalog.js');
        const code = fs.readFileSync(catalogPath, 'utf8');
        const sandbox = { window: {} };
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox, { filename: catalogPath });
        return sandbox.window.SIGN_LEARNING_CATALOG;
    };

    ctx.api = async (pathname, options = {}, token = null) => {
        const headers = {
            Accept: 'application/json',
            ...(options.headers || {})
        };

        let body = options.body;
        if (body && typeof body === 'object' && !(body instanceof Uint8Array) && !(body instanceof ArrayBuffer)) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
            body = JSON.stringify(body);
        }

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(`${config.backendUrl}${pathname}`, {
            ...options,
            headers,
            body
        });
        const text = await res.text();
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = null;
            }
        }
        return { res, data, text };
    };

    ctx.login = async (username) => {
        const response = await ctx.api('/auth/login', {
            method: 'POST',
            body: {
                username,
                password: '123456'
            }
        });
        ctx.assert(response.res.ok, `login ${username} failed with ${response.res.status}: ${response.text}`);
        ctx.assert(response.data?.success === true && response.data?.token, `login ${username} did not return a token`);
        ctx.assert(response.data?.user?.username === username, `login ${username} returned wrong user`);
        return response.data;
    };

    ctx.registerUser = async (username, password = '123456') => {
        const response = await ctx.api('/auth/register', {
            method: 'POST',
            body: {
                username,
                password
            }
        });
        ctx.assert(response.res.ok, `register ${username} failed with ${response.res.status}: ${response.text}`);
        ctx.assert(response.data?.success === true && response.data?.token, `register ${username} did not return a token`);
        ctx.assert(response.data?.user?.username === username, `register ${username} returned wrong user`);
        return response.data;
    };

    ctx.uniqueUsername = (prefix = 'u') => {
        const suffix = Date.now().toString(36).slice(-7) + Math.random().toString(36).slice(2, 6);
        return `${prefix}${suffix}`.slice(0, 20);
    };

    ctx.ensureDemoSessions = async () => {
        if (!ctx.test1Session) {
            ctx.test1Session = await ctx.login('test1');
        }
        if (!ctx.test2Session) {
            ctx.test2Session = await ctx.login('test2');
        }
        return {
            test1: ctx.test1Session,
            test2: ctx.test2Session
        };
    };

    ctx.createInvitation = async (channelName, callType) => {
        await ctx.ensureDemoSessions();
        const response = await ctx.api('/call-invitations', {
            method: 'POST',
            body: {
                calleeUsername: 'test2',
                channelName,
                callType
            }
        }, ctx.test1Session.token);
        ctx.assert(response.res.ok && response.data?.success === true, `create invitation failed: ${response.text}`);
        ctx.assert(response.data.invitation?.id, 'create invitation response missing invitation id');
        ctx.assert(response.data.invitation.channelName === channelName, 'create invitation returned wrong channel name');
        return response.data.invitation;
    };

    ctx.ensureAgoraTokenAvailable = async () => {
        await ctx.ensureDemoSessions();
        const appIdResponse = await ctx.api('/agora/app-id', {}, ctx.test1Session.token);
        if (!appIdResponse.data?.appId) {
            ctx.agoraTokenAvailable = false;
            return { available: false, message: 'AGORA_APP_ID is not configured in this environment' };
        }

        const channelName = `unified_token_${Date.now()}`;
        const response = await ctx.api(`/agora/token?channelName=${encodeURIComponent(channelName)}&uid=0`, {}, ctx.test1Session.token);
        if (!response.res.ok || response.data?.success !== true) {
            const message = response.data?.message || response.text;
            if (/Certificate|证书|未配置/.test(message)) {
                ctx.agoraTokenAvailable = false;
                return { available: false, message: 'AGORA_APP_CERTIFICATE is not configured in this environment' };
            }
            throw new Error(`token endpoint failed with ${response.res.status}: ${message}`);
        }

        ctx.assert(typeof response.data.token === 'string' && response.data.token.length > 20, 'token response missing token');
        ctx.agoraTokenAvailable = true;
        return { available: true, channelName };
    };

    ctx.backendIsReady = async () => {
        try {
            const response = await fetch(`${config.backendUrl}/agora/app-id`);
            return response.ok;
        } catch {
            return false;
        }
    };

    ctx.frontendIsReady = async () => {
        try {
            const response = await fetch(`${config.frontendUrl}/index.html`);
            return response.ok;
        } catch {
            return false;
        }
    };

    ctx.waitUntil = async (name, fn, timeoutMs = config.timeoutMs) => {
        const start = Date.now();
        let lastError = null;
        while (Date.now() - start < timeoutMs) {
            try {
                if (await fn()) {
                    return;
                }
            } catch (error) {
                lastError = error;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const tails = ctx.spawned
            .map((item) => {
                const tail = item.tail();
                return tail ? `\n--- ${item.name} tail ---\n${tail}` : '';
            })
            .join('');
        throw new Error(`${name} timed out${lastError ? `: ${lastError.message}` : ''}${tails}`);
    };

    ctx.waitForBackend = async () => {
        await ctx.waitUntil('backend demo login ready', async () => {
            try {
                const response = await ctx.api('/auth/login', {
                    method: 'POST',
                    body: {
                        username: 'test1',
                        password: '123456'
                    }
                });
                return response.res.ok && response.data?.success === true && Boolean(response.data?.token);
            } catch {
                return false;
            }
        });
    };

    ctx.waitForFrontend = async () => {
        await ctx.waitUntil('frontend static files ready', ctx.frontendIsReady);
    };

    ctx.ensureBackend = async () => {
        if (config.skipServerStart) {
            await ctx.waitForBackend();
            return;
        }

        if (!ctx.backendStarted && !(await ctx.backendIsReady())) {
            ctx.startBackend();
        }
        await ctx.waitForBackend();
    };

    ctx.startBackend = () => {
        const backendEnv = {
            ...process.env,
            DB_URL: process.env.RENLINK_TEST_DB_URL || 'jdbc:h2:mem:renlinkdb',
            DB_DRIVER: process.env.RENLINK_TEST_DB_DRIVER || 'org.h2.Driver',
            DB_USERNAME: process.env.RENLINK_TEST_DB_USERNAME || 'sa',
            DB_PASSWORD: process.env.RENLINK_TEST_DB_PASSWORD || '',
            HIBERNATE_DIALECT: process.env.RENLINK_TEST_HIBERNATE_DIALECT || 'org.hibernate.dialect.H2Dialect',
            DDL_AUTO: process.env.RENLINK_TEST_DDL_AUTO || 'create-drop',
            SHOW_SQL: process.env.RENLINK_TEST_SHOW_SQL || 'false'
        };
        const mavenCommand = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
        const processHandle = spawn(mavenCommand, ['spring-boot:run'], {
            cwd: backendDir,
            env: backendEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32'
        });
        const tail = [];
        const capture = (chunk) => {
            tail.push(chunk.toString());
            while (tail.join('').length > 12000) {
                tail.shift();
            }
        };
        processHandle.stdout.on('data', capture);
        processHandle.stderr.on('data', capture);
        processHandle.on('exit', (code) => {
            if (code !== null && code !== 0) {
                console.error(`[backend spring-boot:run exited with ${code}]`);
            }
        });
        ctx.backendStarted = true;
        ctx.spawned.push({
            name: 'backend spring-boot:run',
            kill: () => terminateProcess(processHandle),
            tail: () => tail.join('')
        });
    };

    ctx.startFrontendServer = () => {
        const mimeTypes = {
            '.css': 'text/css; charset=utf-8',
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.md': 'text/markdown; charset=utf-8',
            '.mp4': 'video/mp4',
            '.png': 'image/png',
            '.svg': 'image/svg+xml'
        };

        const server = http.createServer((req, res) => {
            const requestUrl = new URL(req.url || '/', `http://${config.frontendHost}:${config.frontendPort}`);
            const requestedPath = decodeURIComponent(requestUrl.pathname === '/' ? '/frontend/index.html' : requestUrl.pathname);
            const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
            const filePath = path.join(projectRoot, normalized);

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

        return new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(config.frontendPort, config.frontendHost, () => resolve(server));
        });
    };

    ctx.ensureServers = async () => {
        await ctx.ensureBackend();

        if (!ctx.frontendStarted && !(await ctx.frontendIsReady())) {
            ctx.frontendServer = await ctx.startFrontendServer();
            ctx.frontendStarted = true;
            ctx.spawned.push({
                name: 'frontend static server',
                kill: () => new Promise((resolve) => ctx.frontendServer.close(resolve)),
                tail: () => ''
            });
        }
        await ctx.waitForFrontend();
    };

    ctx.loadPlaywright = async () => {
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
    };

    ctx.preparePage = async (browser, viewport = { width: 1280, height: 820 }) => {
        const page = await browser.newPage({ viewport });
        await ctx.routeBackendApi(page);
        await ctx.routeRealtimeAndAgoraStubs(page);
        return page;
    };

    ctx.routeBackendApi = async (page) => {
        await page.route('**/api/**', async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const apiIndex = url.pathname.indexOf('/api');
            const apiPath = `${url.pathname.slice(apiIndex + 4)}${url.search}`;
            const headers = { ...request.headers() };
            delete headers.host;
            delete headers['content-length'];

            try {
                const response = await fetch(`${config.backendUrl}${apiPath}`, {
                    method: request.method(),
                    headers,
                    body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer()
                });
                const body = Buffer.from(await response.arrayBuffer());
                const responseHeaders = {};
                const contentType = response.headers.get('content-type');
                if (contentType) {
                    responseHeaders['content-type'] = contentType;
                }
                await route.fulfill({
                    status: response.status,
                    headers: responseHeaders,
                    body
                });
            } catch (error) {
                await route.fulfill({
                    status: 502,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: false, message: error.message })
                });
            }
        });
    };

    ctx.routeRealtimeAndAgoraStubs = async (page) => {
        const stompStub = `
            window.SockJS = function SockJS() { return {}; };
            window.Stomp = {
                over() {
                    return {
                        debug: null,
                        connect(headers, onConnect) { setTimeout(() => onConnect({ command: 'CONNECTED', headers }), 0); },
                        subscribe() { return { unsubscribe() {} }; },
                        send() {},
                        disconnect(callback) { if (callback) callback(); }
                    };
                }
            };
        `;
        await page.route('**/sockjs-client@1/dist/sockjs.min.js', (route) => {
            route.fulfill({ status: 200, contentType: 'text/javascript', body: stompStub });
        });
        await page.route('**/stompjs@2.3.3/lib/stomp.min.js', (route) => {
            route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
        });

        const agoraStub = `
            window.AgoraRTC = {
                VERSION: 'unified-test-stub',
                createClient() {
                    return {
                        on() {},
                        async join(appId, channelName, token, uid) {
                            window.__renlinkAgoraJoin = { appId, channelName, hasToken: Boolean(token), uid };
                            return uid || 1001;
                        },
                        async publish(tracks) {
                            window.__renlinkAgoraPublishedTrackCount = Array.isArray(tracks) ? tracks.length : 0;
                        },
                        async unpublish() {},
                        async leave() {}
                    };
                },
                async createMicrophoneAudioTrack() {
                    const error = new Error('can not find getUserMedia');
                    error.name = 'NOT_SUPPORTED';
                    throw error;
                },
                async createCameraVideoTrack() {
                    const error = new Error('can not find getUserMedia');
                    error.name = 'NOT_SUPPORTED';
                    throw error;
                },
                createCustomAudioTrack(options) {
                    return {
                        play() {},
                        stop() {},
                        close() {},
                        async setEnabled() {},
                        getMediaStreamTrack() { return options && options.mediaStreamTrack; }
                    };
                }
            };
        `;
        await page.route('**/AgoraRTC_N-4.20.0.js', (route) => {
            route.fulfill({ status: 200, contentType: 'text/javascript', body: agoraStub });
        });
    };

    ctx.cleanup = async () => {
        const items = [...ctx.spawned].reverse();
        ctx.spawned.length = 0;
        for (const item of items) {
            try {
                await item.kill();
            } catch (error) {
                console.error(`Failed to stop ${item.name}: ${error.message}`);
            }
        }
    };

    ctx.printSummary = () => {
        const failed = ctx.results.filter((item) => item.status === 'FAIL');
        const skipped = ctx.results.filter((item) => item.status === 'SKIP');
        const passed = ctx.results.filter((item) => item.status === 'PASS');

        console.log('\nRenlink test summary');
        console.log(`PASS: ${passed.length}`);
        console.log(`SKIP: ${skipped.length}`);
        console.log(`FAIL: ${failed.length}`);

        for (const item of skipped) {
            console.log(`SKIP detail: ${item.group} / ${item.name} - ${item.detail}`);
        }

        return {
            passed,
            skipped,
            failed
        };
    };

    return ctx;
}

function terminateProcess(processHandle) {
    return new Promise((resolve) => {
        if (processHandle.exitCode !== null || processHandle.killed) {
            resolve();
            return;
        }
        const timeout = setTimeout(() => {
            try {
                processHandle.kill('SIGKILL');
            } catch {
                // Process already exited.
            }
            resolve();
        }, 5000);
        processHandle.once('exit', () => {
            clearTimeout(timeout);
            resolve();
        });
        processHandle.kill('SIGTERM');
    });
}

export async function runWithContext(ctx, runner) {
    const handleSignal = async (code) => {
        await ctx.cleanup();
        process.exit(code);
    };
    process.once('SIGINT', () => {
        handleSignal(130);
    });
    process.once('SIGTERM', () => {
        handleSignal(143);
    });

    try {
        await runner(ctx);
    } finally {
        await ctx.cleanup();
    }

    const summary = ctx.printSummary();
    if (summary.failed.length > 0) {
        process.exitCode = 1;
    }
    return summary;
}

export async function runStandalone(importMetaUrl, runner) {
    const currentFile = fileURLToPath(importMetaUrl);
    if (path.resolve(process.argv[1] || '') !== path.resolve(currentFile)) {
        return;
    }

    const ctx = createTestContext();
    await runWithContext(ctx, runner);
}
