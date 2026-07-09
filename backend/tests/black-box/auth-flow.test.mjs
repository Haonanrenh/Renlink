import { runStandalone } from '../../../tests/support/test-harness.mjs';

export async function run(ctx) {
    await ctx.step('environment', 'backend is reachable for auth flow', async () => {
        await ctx.ensureBackend();
        return ctx.config.backendUrl;
    });

    await ctx.step('backend black-box auth', 'register, duplicate register, login failure, and logout flow', async () => {
        const username = ctx.uniqueUsername('auth');
        const registered = await ctx.registerUser(username);
        ctx.assert(registered.user.online === true, 'newly registered user should be online');

        const duplicate = await ctx.api('/auth/register', {
            method: 'POST',
            body: {
                username,
                password: '123456'
            }
        });
        ctx.assert(duplicate.res.status === 400, `duplicate register should be 400, got ${duplicate.res.status}`);
        ctx.assert(/已存在/.test(duplicate.data?.message || ''), `duplicate register message unexpected: ${duplicate.text}`);

        const badLogin = await ctx.api('/auth/login', {
            method: 'POST',
            body: {
                username,
                password: 'wrongpass'
            }
        });
        ctx.assert(badLogin.res.status === 401, `bad login should be 401, got ${badLogin.res.status}`);

        const login = await ctx.login(username);
        const meOnline = await ctx.api('/auth/me', {}, login.token);
        ctx.assert(meOnline.res.ok, `auth/me before logout failed: ${meOnline.text}`);
        ctx.assert(meOnline.data.username === username, 'auth/me returned wrong user before logout');
        ctx.assert(meOnline.data.online === true, 'user should be online after login');

        const logout = await ctx.api('/auth/logout', { method: 'POST' }, login.token);
        ctx.assert(logout.res.ok, `logout failed: ${logout.text}`);

        const meOffline = await ctx.api('/auth/me', {}, login.token);
        ctx.assert(meOffline.res.ok, `auth/me after logout failed: ${meOffline.text}`);
        ctx.assert(meOffline.data.online === false, 'logout should mark user offline');

        return `auth lifecycle verified for ${username}`;
    });

    await ctx.step('backend black-box auth', 'validation rejects malformed registration input', async () => {
        const response = await ctx.api('/auth/register', {
            method: 'POST',
            body: {
                username: 'bad user!',
                password: '123'
            }
        });
        ctx.assert(response.res.status === 400, `invalid register should be 400, got ${response.res.status}`);
        ctx.assert(response.data?.errors?.username, 'username validation error is missing');
        ctx.assert(response.data?.errors?.password, 'password validation error is missing');
        return 'register validation errors returned';
    });
}

await runStandalone(import.meta.url, run);
