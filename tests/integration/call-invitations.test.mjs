import { runStandalone } from '../support/test-harness.mjs';

export async function run(ctx) {
    await ctx.step('environment', 'backend and frontend are reachable for integration tests', async () => {
        await ctx.ensureServers();
        return `${ctx.config.backendUrl} and ${ctx.config.frontendUrl}`;
    });

    await ctx.ensureDemoSessions();

    await ctx.step('integration api', 'call invitation create and accept flow', async () => {
        const channelName = `unified_accept_${Date.now()}`;
        const created = await ctx.createInvitation(channelName, 'video');
        const pending = await ctx.api('/call-invitations/pending', {}, ctx.test2Session.token);
        ctx.assert(pending.res.ok, `pending invitations failed with ${pending.res.status}`);
        ctx.assert(pending.data.some((item) => item.id === created.id), 'created invitation not visible to callee');

        const accepted = await ctx.api(`/call-invitations/${created.id}/accept`, { method: 'POST' }, ctx.test2Session.token);
        ctx.assert(accepted.res.ok && accepted.data?.success === true, `accept failed: ${accepted.text}`);
        ctx.assert(accepted.data.invitation.status === 'accepted', `expected accepted, got ${accepted.data.invitation.status}`);
        return `invitation ${created.id} accepted`;
    });

    await ctx.step('integration api', 'call invitation reject flow', async () => {
        const channelName = `unified_reject_${Date.now()}`;
        const created = await ctx.createInvitation(channelName, 'voice');
        const rejected = await ctx.api(`/call-invitations/${created.id}/reject`, { method: 'POST' }, ctx.test2Session.token);
        ctx.assert(rejected.res.ok && rejected.data?.success === true, `reject failed: ${rejected.text}`);
        ctx.assert(rejected.data.invitation.status === 'rejected', `expected rejected, got ${rejected.data.invitation.status}`);
        return `invitation ${created.id} rejected`;
    });

    await ctx.step('integration api', 'call invitation cancel creates missed call', async () => {
        const channelName = `unified_cancel_${Date.now()}`;
        const before = await ctx.api('/call-invitations/missed-calls', {}, ctx.test2Session.token);
        ctx.assert(before.res.ok, `initial missed calls failed with ${before.res.status}`);
        const created = await ctx.createInvitation(channelName, 'video');
        const cancelled = await ctx.api(`/call-invitations/${created.id}/cancel`, { method: 'POST' }, ctx.test1Session.token);
        ctx.assert(cancelled.res.ok && cancelled.data?.success === true, `cancel failed: ${cancelled.text}`);

        const missed = await ctx.api('/call-invitations/missed-calls', {}, ctx.test2Session.token);
        ctx.assert(missed.res.ok, `missed calls failed with ${missed.res.status}`);
        ctx.assert(Array.isArray(missed.data), 'missed calls response must be an array');
        const newest = missed.data[0];
        ctx.assert(newest.callerName === 'test1', `expected newest missed caller test1, got ${JSON.stringify(newest)}`);
        ctx.assert(newest.callType === 'video', `expected newest missed call type video, got ${newest.callType}`);
        ctx.assert(newest.isRead === false, 'newest missed call should be unread');
        return `invitation ${created.id} cancelled and newest missed call recorded`;
    });

    await ctx.step('integration api', 'missed call unread count and read actions stay consistent', async () => {
        const channelName = `unified_missed_${Date.now()}`;
        const created = await ctx.createInvitation(channelName, 'video');
        const cancelled = await ctx.api(`/call-invitations/${created.id}/cancel`, { method: 'POST' }, ctx.test1Session.token);
        ctx.assert(cancelled.res.ok && cancelled.data?.success === true, `cancel failed: ${cancelled.text}`);

        const countBefore = await ctx.api('/call-invitations/missed-calls/unread-count', {}, ctx.test2Session.token);
        ctx.assert(countBefore.res.ok, `unread missed count failed: ${countBefore.text}`);
        ctx.assert(Number(countBefore.data.count) >= 1, 'unread missed-call count should be at least 1 after cancel');

        const missed = await ctx.api('/call-invitations/missed-calls', {}, ctx.test2Session.token);
        const newest = missed.data[0];
        ctx.assert(newest?.id, 'newest missed call is missing id');

        const markOne = await ctx.api(`/call-invitations/missed-calls/${newest.id}/mark-read`, { method: 'POST' }, ctx.test2Session.token);
        ctx.assert(markOne.res.ok && markOne.data?.success === true, `mark one missed call read failed: ${markOne.text}`);

        const markAll = await ctx.api('/call-invitations/missed-calls/mark-all-read', { method: 'POST' }, ctx.test2Session.token);
        ctx.assert(markAll.res.ok && markAll.data?.success === true, `mark all missed calls read failed: ${markAll.text}`);

        const countAfter = await ctx.api('/call-invitations/missed-calls/unread-count', {}, ctx.test2Session.token);
        ctx.assert(Number(countAfter.data.count) === 0, `expected unread count 0 after mark-all, got ${countAfter.data.count}`);
        return `missed call ${newest.id} read state verified`;
    });

    await ctx.step('integration api', 'call invitation rejects self and non-friend calls', async () => {
        const selfCall = await ctx.api('/call-invitations', {
            method: 'POST',
            body: {
                calleeUsername: 'test1',
                channelName: `self_${Date.now()}`,
                callType: 'video'
            }
        }, ctx.test1Session.token);
        ctx.assert(selfCall.res.status === 400 && selfCall.data?.success === false, `self call should be rejected: ${selfCall.text}`);

        const userA = await ctx.registerUser(ctx.uniqueUsername('ca'));
        const userB = await ctx.registerUser(ctx.uniqueUsername('cb'));
        const nonFriendCall = await ctx.api('/call-invitations', {
            method: 'POST',
            body: {
                calleeUsername: userB.user.username,
                channelName: `nonfriend_${Date.now()}`,
                callType: 'video'
            }
        }, userA.token);
        ctx.assert(nonFriendCall.res.status === 400 && nonFriendCall.data?.success === false, `non-friend call should be rejected: ${nonFriendCall.text}`);

        return 'self-call and non-friend call guards verified';
    });
}

await runStandalone(import.meta.url, run);
