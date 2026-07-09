import { runStandalone } from '../../../tests/support/test-harness.mjs';

export async function run(ctx) {
    await ctx.step('environment', 'backend is reachable for message flow', async () => {
        await ctx.ensureBackend();
        return ctx.config.backendUrl;
    });

    await ctx.ensureDemoSessions();

    await ctx.step('backend black-box messages', 'send, unread summary, conversation read, and mark-read flow', async () => {
        const content = `hello from test ${Date.now()}`;
        const sent = await ctx.api('/messages', {
            method: 'POST',
            body: {
                receiverUsername: 'test2',
                content: `  ${content}  `
            }
        }, ctx.test1Session.token);
        ctx.assert(sent.res.ok && sent.data?.success === true, `send message failed: ${sent.text}`);
        ctx.assert(sent.data.message.content === content, 'message content should be trimmed');
        ctx.assert(sent.data.message.mine === true, 'sender response should mark message as mine');
        ctx.assert(sent.data.message.read === false, 'new message should start unread');

        const unreadBefore = await ctx.api('/messages/unread-summary', {}, ctx.test2Session.token);
        ctx.assert(unreadBefore.res.ok, `unread summary failed: ${unreadBefore.text}`);
        ctx.assert(Number(unreadBefore.data.totalUnreadCount) >= 1, 'receiver should have at least one unread message');
        ctx.assert(Number(unreadBefore.data.unreadCounts.test1) >= 1, 'test1 unread count should be present');

        const conversation = await ctx.api('/messages/conversations/test1', {}, ctx.test2Session.token);
        ctx.assert(conversation.res.ok && Array.isArray(conversation.data), `conversation failed: ${conversation.text}`);
        const received = conversation.data.find((item) => item.content === content);
        ctx.assert(received, 'sent message not found in conversation');
        ctx.assert(received.mine === false, 'receiver conversation item should not be mine');

        const unreadAfterConversation = await ctx.api('/messages/unread-summary', {}, ctx.test2Session.token);
        ctx.assert(Number(unreadAfterConversation.data.totalUnreadCount) === 0, 'conversation load should mark messages as read');

        const markRead = await ctx.api('/messages/conversations/test1/mark-read', { method: 'POST' }, ctx.test2Session.token);
        ctx.assert(markRead.res.ok && markRead.data?.success === true, `mark-read failed: ${markRead.text}`);
        ctx.assert(Number(markRead.data.updatedCount) === 0, 'mark-read after conversation should update 0 rows');

        return `message ${sent.data.message.id} lifecycle verified`;
    });

    await ctx.step('backend black-box messages', 'message validation rejects blank and non-friend recipients', async () => {
        const blank = await ctx.api('/messages', {
            method: 'POST',
            body: {
                receiverUsername: 'test2',
                content: '   '
            }
        }, ctx.test1Session.token);
        ctx.assert(blank.res.status === 400, `blank message should be 400, got ${blank.res.status}`);

        const nonFriend = await ctx.registerUser(ctx.uniqueUsername('msg'));
        const blocked = await ctx.api('/messages', {
            method: 'POST',
            body: {
                receiverUsername: nonFriend.user.username,
                content: 'not friends'
            }
        }, ctx.test1Session.token);
        ctx.assert(blocked.res.status === 409, `non-friend message should be 409, got ${blocked.res.status}`);
        ctx.assert(/好友/.test(blocked.data?.message || blocked.text), `non-friend message response unexpected: ${blocked.text}`);
        return 'message validation and friend-only guard verified';
    });
}

await runStandalone(import.meta.url, run);
