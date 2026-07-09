import { runStandalone } from '../../../tests/support/test-harness.mjs';

export async function run(ctx) {
    await ctx.step('environment', 'backend is reachable', async () => {
        await ctx.ensureBackend();
        return ctx.config.backendUrl;
    });

    await ctx.ensureDemoSessions();

    await ctx.step('black-box api', 'current user endpoint returns test1', async () => {
        const response = await ctx.api('/auth/me', {}, ctx.test1Session.token);
        ctx.assert(response.res.ok, `GET /auth/me failed with ${response.res.status}`);
        ctx.assert(response.data?.username === 'test1', `expected test1, got ${JSON.stringify(response.data)}`);
        return 'authenticated user is stable';
    });

    await ctx.step('black-box api', 'friend search returns existing mutual friend', async () => {
        const response = await ctx.api('/users/search?query=test2', {}, ctx.test1Session.token);
        ctx.assert(response.res.ok, `GET /users/search failed with ${response.res.status}`);
        ctx.assert(Array.isArray(response.data), 'search response must be an array');
        const test2 = response.data.find((item) => item.username === 'test2');
        ctx.assert(test2, 'test2 not found in search results');
        ctx.assert(test2.relationshipStatus === 'FRIEND', `expected FRIEND, got ${test2.relationshipStatus}`);
        return 'test1 can find test2 as a friend';
    });

    await ctx.step('black-box api', 'friends endpoint includes test2', async () => {
        const response = await ctx.api('/users/friends', {}, ctx.test1Session.token);
        ctx.assert(response.res.ok, `GET /users/friends failed with ${response.res.status}`);
        ctx.assert(response.data.some((item) => item.username === 'test2'), 'test2 not found in friends list');
        return `${response.data.length} friend records returned`;
    });

    await ctx.step('black-box api', 'Agora app id endpoint is safe', async () => {
        const response = await ctx.api('/agora/app-id', {}, ctx.test1Session.token);
        ctx.assert(response.res.ok, `GET /agora/app-id failed with ${response.res.status}`);
        if (!response.data?.appId) {
            ctx.skip('black-box api', 'Agora app id format assertion', 'AGORA_APP_ID is not configured in this environment');
            return 'App ID is not configured';
        }
        ctx.assert(/^[0-9a-f]{32}$/i.test(response.data.appId), `unexpected appId ${response.text}`);
        return 'App ID format is valid when configured';
    });

    await ctx.step('black-box api', 'Agora token endpoint is reachable', async () => {
        const result = await ctx.ensureAgoraTokenAvailable();
        if (!result.available) {
            ctx.skip('black-box api', 'Agora token generation secret-dependent assertion', result.message);
            return 'endpoint reports missing certificate as configuration issue';
        }
        return `token generated for ${result.channelName}`;
    });
}

await runStandalone(import.meta.url, run);
