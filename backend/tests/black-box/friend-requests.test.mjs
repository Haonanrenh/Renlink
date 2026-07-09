import { runStandalone } from '../../../tests/support/test-harness.mjs';

export async function run(ctx) {
    await ctx.step('environment', 'backend is reachable for friend request flow', async () => {
        await ctx.ensureBackend();
        return ctx.config.backendUrl;
    });

    await ctx.step('backend black-box friends', 'send, inspect, accept, and remove friend request', async () => {
        const userA = await ctx.registerUser(ctx.uniqueUsername('fa'));
        const userB = await ctx.registerUser(ctx.uniqueUsername('fb'));

        const create = await ctx.api('/users/friends', {
            method: 'POST',
            body: {
                friendUsername: userB.user.username
            }
        }, userA.token);
        ctx.assert(create.res.ok && create.data?.success === true, `friend request create failed: ${create.text}`);

        const duplicate = await ctx.api('/users/friends', {
            method: 'POST',
            body: {
                friendUsername: userB.user.username
            }
        }, userA.token);
        ctx.assert(duplicate.res.status === 409, `duplicate friend request should be 409, got ${duplicate.res.status}`);

        const outgoing = await ctx.api('/users/friends/requests/outgoing', {}, userA.token);
        ctx.assert(outgoing.res.ok && Array.isArray(outgoing.data), `outgoing requests failed: ${outgoing.text}`);
        const outgoingRequest = outgoing.data.find((item) => item.username === userB.user.username);
        ctx.assert(outgoingRequest?.direction === 'outgoing', 'outgoing request metadata is missing');

        const incoming = await ctx.api('/users/friends/requests/incoming', {}, userB.token);
        ctx.assert(incoming.res.ok && Array.isArray(incoming.data), `incoming requests failed: ${incoming.text}`);
        const incomingRequest = incoming.data.find((item) => item.username === userA.user.username);
        ctx.assert(incomingRequest?.direction === 'incoming', 'incoming request metadata is missing');

        const searchOutgoing = await ctx.api(`/users/search?query=${encodeURIComponent(userB.user.username)}`, {}, userA.token);
        const outgoingTarget = searchOutgoing.data.find((item) => item.username === userB.user.username);
        ctx.assert(outgoingTarget?.relationshipStatus === 'OUTGOING_REQUEST', `expected OUTGOING_REQUEST, got ${outgoingTarget?.relationshipStatus}`);

        const accept = await ctx.api(`/users/friends/requests/${incomingRequest.requestId}/accept`, { method: 'POST' }, userB.token);
        ctx.assert(accept.res.ok && accept.data?.success === true, `accept friend request failed: ${accept.text}`);

        const friendsA = await ctx.api('/users/friends', {}, userA.token);
        ctx.assert(friendsA.data.some((item) => item.username === userB.user.username), 'accepted friend missing from requester friends list');

        const remove = await ctx.api(`/users/friends/${encodeURIComponent(userB.user.username)}`, { method: 'DELETE' }, userA.token);
        ctx.assert(remove.res.ok && remove.data?.success === true, `remove friend failed: ${remove.text}`);

        const friendsAfterRemove = await ctx.api('/users/friends', {}, userA.token);
        ctx.assert(!friendsAfterRemove.data.some((item) => item.username === userB.user.username), 'removed friend still appears in friends list');

        return `${userA.user.username} -> ${userB.user.username} friend lifecycle verified`;
    });

    await ctx.step('backend black-box friends', 'reject friend request returns users to no relationship', async () => {
        const userA = await ctx.registerUser(ctx.uniqueUsername('fc'));
        const userB = await ctx.registerUser(ctx.uniqueUsername('fd'));

        const create = await ctx.api('/users/friends', {
            method: 'POST',
            body: {
                friendUsername: userB.user.username
            }
        }, userA.token);
        ctx.assert(create.res.ok, `friend request create failed: ${create.text}`);

        const incoming = await ctx.api('/users/friends/requests/incoming', {}, userB.token);
        const request = incoming.data.find((item) => item.username === userA.user.username);
        ctx.assert(request?.requestId, 'incoming reject request not found');

        const reject = await ctx.api(`/users/friends/requests/${request.requestId}/reject`, { method: 'POST' }, userB.token);
        ctx.assert(reject.res.ok && reject.data?.success === true, `reject friend request failed: ${reject.text}`);

        const search = await ctx.api(`/users/search?query=${encodeURIComponent(userB.user.username)}`, {}, userA.token);
        const target = search.data.find((item) => item.username === userB.user.username);
        ctx.assert(target?.relationshipStatus === 'NONE', `expected NONE after reject, got ${target?.relationshipStatus}`);
        return `${userA.user.username} -> ${userB.user.username} rejection verified`;
    });
}

await runStandalone(import.meta.url, run);
