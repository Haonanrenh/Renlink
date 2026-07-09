class FriendsModule {
    constructor() {
        this.friends = [];
        this.incomingRequests = [];
        this.outgoingRequests = [];
        this.chatMessages = [];
        this.activeFriend = null;
        this.unreadCounts = {};
        this.totalUnreadMessageCount = 0;
        this.pendingRemoveFriendUsername = null;  // 待删除的好友用户名
        this.API_BASE_URL = (typeof CONFIG !== 'undefined' && CONFIG.backend)
            ? CONFIG.backend.baseUrl
            : 'http://localhost:8080/api';
        this.refreshTimer = null;
        this.handlersRegistered = false;
    }

    initialize() {
        this.ensureLayout();
        this.bindComposer();
        this.registerRealtimeHandlers();
        this.loadFriends();

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        this.refreshTimer = setInterval(() => {
            this.loadFriends();
        }, 30000);
    }

    ensureLayout() {
        const container = document.querySelector('#friendsModule .friends-container');
        if (!container || container.dataset.enhanced === 'true') {
            return;
        }

        container.innerHTML = `
            <div class="friends-header">
                <div class="friends-title-block">
                    <div class="friends-title">
                        <span>好友、申请与即时消息</span>
                    </div>
                    <p class="friends-subtitle">支持搜索添加好友、同意/拒绝申请、查看未读消息，并在成为好友后直接聊天或发起语音视频通话。</p>
                </div>
                <button onclick="friendsModule.loadFriends()" class="mark-all-read-btn">刷新数据</button>
            </div>
            <div class="friends-workspace">
                <div class="friends-main-column">
                    <section class="friends-section">
                        <div class="friends-section-head">
                            <div>
                                <h3>好友申请</h3>
                                <p>收到的申请可以直接处理；申请较多时，列表会在当前区域内滚动，不再把整页撑长。</p>
                            </div>
                            <span id="friendRequestCount" class="friend-count-pill">0</span>
                        </div>
                        <div class="friend-requests-grid">
                            <div class="request-column">
                                <div class="request-column-head">
                                    <span>收到的申请</span>
                                    <span id="incomingRequestsCount" class="request-column-count">0</span>
                                </div>
                                <div id="incomingRequestsList" class="request-list"></div>
                            </div>
                            <div class="request-column">
                                <div class="request-column-head">
                                    <span>我发出的申请</span>
                                    <span id="outgoingRequestsCount" class="request-column-count muted">0</span>
                                </div>
                                <div id="outgoingRequestsList" class="request-list"></div>
                            </div>
                        </div>
                    </section>
                    <section class="friends-section">
                        <div class="friends-section-head">
                            <div>
                                <h3>好友列表与快捷呼叫</h3>
                                <p>好友卡片会同步显示消息未读数，并支持聊天、语音、视频和删除好友。</p>
                            </div>
                        </div>
                        <div id="friendsList" class="friends-list"></div>
                    </section>
                </div>
                <aside class="chat-panel glass-panel">
                    <div class="chat-panel-header">
                        <div>
                            <span class="kicker">即时消息</span>
                            <h3 id="chatPanelTitle">选择好友开始聊天</h3>
                            <p id="chatPanelSubtitle">聊天内容会保存在当前云端数据库中，适合直接做好友消息演示。</p>
                        </div>
                    </div>
                    <div id="chatMessages" class="chat-messages">
                        ${this.renderEmptyChatState()}
                    </div>
                    <form id="chatComposer" class="chat-composer">
                        <textarea id="chatInput" class="chat-input" placeholder="选择好友后在这里输入消息..." maxlength="500" disabled></textarea>
                        <div class="chat-composer-actions">
                            <span id="chatHint" class="chat-hint">只有已经成为好友的账号，才可以互相发送文字消息。</span>
                            <button id="chatSendBtn" type="submit" class="call-btn message-btn" disabled>
                                <span>发送消息</span>
                            </button>
                        </div>
                    </form>
                </aside>
            </div>
        `;

        container.dataset.enhanced = 'true';
    }

    bindComposer() {
        const form = document.getElementById('chatComposer');
        if (!form || form.dataset.bound === 'true') {
            return;
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.sendMessage();
        });
        form.dataset.bound = 'true';
    }

    registerRealtimeHandlers() {
        if (this.handlersRegistered || typeof wsClient === 'undefined') {
            return;
        }

        wsClient.onMessage('friend-updated', () => {
            this.loadFriends();
            if (window.onlineCallModule && typeof window.onlineCallModule.refreshCurrentSearch === 'function') {
                window.onlineCallModule.refreshCurrentSearch();
            }
        });

        wsClient.onMessage('direct-message', (message) => {
            this.handleIncomingMessage(message);
        });

        this.handlersRegistered = true;
    }

    async loadFriends() {
        this.ensureLayout();

        try {
            const [friends, incomingRequests, outgoingRequests, unreadSummary] = await Promise.all([
                this.fetchJson('/users/friends'),
                this.fetchJson('/users/friends/requests/incoming'),
                this.fetchJson('/users/friends/requests/outgoing'),
                this.fetchJson('/messages/unread-summary')
            ]);

            this.friends = Array.isArray(friends) ? friends : [];
            this.incomingRequests = Array.isArray(incomingRequests) ? incomingRequests : [];
            this.outgoingRequests = Array.isArray(outgoingRequests) ? outgoingRequests : [];
            this.applyUnreadSummary(unreadSummary);

            if (this.activeFriend) {
                const matchedFriend = this.friends.find((friend) => friend.username === this.activeFriend.username);
                this.activeFriend = matchedFriend || null;
                if (!matchedFriend) {
                    this.chatMessages = [];
                }
            }

            this.renderOverview();

            if (this.activeFriend) {
                await this.loadConversation(this.activeFriend.username, false);
                await this.refreshUnreadSummary();
            } else {
                this.renderChatMessages(false);
            }
        } catch (error) {
            console.error('[Friends] 加载好友数据失败:', error);
            if (error.status === 401) {
                window.location.href = 'index.html';
                return;
            }
            this.showError(error.message || '好友模块加载失败，请确认后端服务正常运行');
        }
    }

    applyUnreadSummary(summary) {
        const nextUnreadCounts = {};
        const rawUnreadCounts = summary && typeof summary === 'object' ? (summary.unreadCounts || {}) : {};

        Object.entries(rawUnreadCounts).forEach(([username, count]) => {
            const normalizedCount = Number(count) || 0;
            if (normalizedCount > 0) {
                nextUnreadCounts[username] = normalizedCount;
            }
        });

        this.unreadCounts = nextUnreadCounts;
        const rawTotal = summary && typeof summary === 'object' ? Number(summary.totalUnreadCount) : NaN;
        this.totalUnreadMessageCount = Number.isFinite(rawTotal)
            ? Math.max(0, rawTotal)
            : Object.values(nextUnreadCounts).reduce((sum, count) => sum + count, 0);
    }

    async refreshUnreadSummary() {
        try {
            const summary = await this.fetchJson('/messages/unread-summary');
            this.applyUnreadSummary(summary);
            this.renderFriends();
            this.updateFriendIndicators();
        } catch (error) {
            console.error('[Friends] 刷新消息未读数失败:', error);
        }
    }

    async markConversationAsRead(username) {
        try {
            await this.fetchJson(`/messages/conversations/${encodeURIComponent(username)}/mark-read`, {
                method: 'POST'
            });
            await this.refreshUnreadSummary();
        } catch (error) {
            console.error('[Friends] 标记消息已读失败:', error);
        }
    }

    async fetchJson(path, options = {}) {
        const token = localStorage.getItem('token');
        const response = await fetch(`${this.API_BASE_URL}${path}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            }
        });

        if (response.status === 401) {
            const error = new Error('登录状态已失效');
            error.status = 401;
            throw error;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.message || '请求失败');
            error.status = response.status;
            throw error;
        }

        return data;
    }

    renderOverview() {
        this.renderStats();
        this.renderRequests();
        this.renderFriends();
        this.updateChatPanelState();
        this.updateFriendIndicators();
    }

    renderStats() {
        const totalCount = document.getElementById('friendsTotalCount');
        const onlineCount = document.getElementById('friendsOnlineCount');
        const requestCount = document.getElementById('friendRequestCount');
        const incomingRequestsCount = document.getElementById('incomingRequestsCount');
        const outgoingRequestsCount = document.getElementById('outgoingRequestsCount');
        const onlineFriends = this.friends.filter((friend) => friend.online);

        if (totalCount) {
            totalCount.textContent = String(this.friends.length);
        }

        if (onlineCount) {
            onlineCount.textContent = String(onlineFriends.length);
        }

        if (requestCount) {
            requestCount.textContent = this.formatCount(this.incomingRequests.length);
            requestCount.classList.toggle('alert', this.incomingRequests.length > 0);
        }

        if (incomingRequestsCount) {
            incomingRequestsCount.textContent = this.formatCount(this.incomingRequests.length);
            incomingRequestsCount.classList.toggle('muted', this.incomingRequests.length === 0);
        }

        if (outgoingRequestsCount) {
            outgoingRequestsCount.textContent = this.formatCount(this.outgoingRequests.length);
            outgoingRequestsCount.classList.toggle('muted', this.outgoingRequests.length === 0);
        }
    }

    updateFriendIndicators() {
        const navBadge = document.getElementById('navFriendsBadge');
        const alertCount = this.incomingRequests.length + this.totalUnreadMessageCount;

        if (navBadge) {
            if (alertCount > 0) {
                navBadge.textContent = this.formatCount(alertCount);
                navBadge.style.display = 'flex';
            } else {
                navBadge.style.display = 'none';
            }
        }
    }

    renderRequests() {
        const incomingContainer = document.getElementById('incomingRequestsList');
        const outgoingContainer = document.getElementById('outgoingRequestsList');

        if (incomingContainer) {
            incomingContainer.innerHTML = this.incomingRequests.length === 0
                ? this.renderMiniEmptyState('暂时没有收到新的好友申请')
                : this.incomingRequests.map((request) => this.renderRequestCard(request, true)).join('');
        }

        if (outgoingContainer) {
            outgoingContainer.innerHTML = this.outgoingRequests.length === 0
                ? this.renderMiniEmptyState('你发出的好友申请会显示在这里')
                : this.outgoingRequests.map((request) => this.renderRequestCard(request, false)).join('');
        }
    }

    renderRequestCard(request, incoming) {
        const username = this.escapeHtml(request.username);
        const jsUsername = this.escapeJsString(request.username);
        const avatar = this.getAvatarEmoji(request.username);
        const subtitle = incoming
            ? '对方向你发送了好友申请，通过后即可聊天和通话'
            : '申请已发出，等待对方同意后即可开始聊天和通话';
        const createdAt = this.formatDateTime(request.createdAt);
        const actions = incoming
            ? `
                <div class="friend-card-actions">
                    <button class="call-btn accept-request-btn" onclick="friendsModule.acceptFriendRequest(${request.requestId}, '${jsUsername}')">
                        <span>同意</span>
                    </button>
                    <button class="call-btn reject-request-btn" onclick="friendsModule.rejectFriendRequest(${request.requestId})">
                        <span>拒绝</span>
                    </button>
                </div>
            `
            : `
                <div class="friend-card-actions">
                    <button class="call-btn pending-request-btn" disabled>
                        <span>等待通过</span>
                    </button>
                </div>
            `;

        return `
            <div class="request-card">
                <div class="user-info-result">
                    <div class="user-avatar">${avatar}</div>
                    <div class="user-details">
                        <div class="user-result-head">
                            <div class="user-name">${username}</div>
                            <span class="friend-pill ${request.online ? 'online' : 'offline'}">${request.online ? '在线' : '离线'}</span>
                        </div>
                        <div class="user-status">${subtitle}</div>
                        <div class="request-meta">申请时间：${createdAt}</div>
                    </div>
                </div>
                ${actions}
            </div>
        `;
    }

    renderFriends() {
        const container = document.getElementById('friendsList');
        if (!container) {
            return;
        }

        if (this.friends.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <p class="empty-text">当前还没有好友。先在搜索区发起好友申请，对方同意后就能聊天和通话。</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.friends.map((friend) => {
            const username = this.escapeHtml(friend.username);
            const jsUsername = this.escapeJsString(friend.username);
            const avatar = this.getAvatarEmoji(friend.username);
            const onlineClass = friend.online ? 'online' : 'offline';
            const unreadCount = this.unreadCounts[friend.username] || 0;
            const unreadBadge = unreadCount > 0
                ? `<span class="friend-pill unread">${this.formatCount(unreadCount)} 条新消息</span>`
                : '';
            const activeClass = this.activeFriend && this.activeFriend.username === friend.username ? 'is-active' : '';

            return `
                <div class="friend-card ${onlineClass} ${activeClass}">
                    <div class="user-info-result">
                        <div class="user-avatar">${avatar}</div>
                        <div class="user-details">
                            <div class="user-result-head">
                                <div class="user-name">${username}</div>
                                <span class="friend-pill ${friend.online ? 'online' : 'offline'}">${friend.online ? '在线' : '离线'}</span>
                                ${unreadBadge}
                            </div>
                            <div class="user-status">${this.getFriendStatusText(friend)}</div>
                        </div>
                    </div>
                    <div class="friend-card-actions">
                        <button class="call-btn message-btn" onclick="friendsModule.openChatWithFriend('${jsUsername}')">
                            <span>消息</span>
                        </button>
                        <button class="call-btn video-call-btn" onclick="friendsModule.callFriend('${jsUsername}', true)">
                            <span>视频</span>
                        </button>
                        <button class="call-btn voice-call-btn" onclick="friendsModule.callFriend('${jsUsername}', false)">
                            <span>语音</span>
                        </button>
                        <button class="call-btn remove-friend-btn" onclick="friendsModule.removeFriend('${jsUsername}')">
                            <span>删除好友</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async openChatWithFriend(username) {
        this.ensureLayout();

        const friend = this.friends.find((item) => item.username === username);
        if (!friend) {
            this.showError('该用户还不是你的好友，无法发送消息');
            return;
        }

        const previousUnread = this.unreadCounts[username] || 0;
        if (previousUnread > 0) {
            this.totalUnreadMessageCount = Math.max(0, this.totalUnreadMessageCount - previousUnread);
            this.unreadCounts[username] = 0;
        }

        this.activeFriend = friend;
        this.renderFriends();
        this.updateChatPanelState();
        this.updateFriendIndicators();

        await this.loadConversation(username, true);
        await this.refreshUnreadSummary();
    }

    async loadConversation(username, scrollToBottom = true) {
        try {
            this.chatMessages = await this.fetchJson(`/messages/conversations/${encodeURIComponent(username)}`);
            this.renderChatMessages(scrollToBottom);
        } catch (error) {
            console.error('[Friends] 加载聊天记录失败:', error);
            this.showError(error.message || '聊天记录加载失败');
        }
    }

    renderChatMessages(scrollToBottom = true) {
        const container = document.getElementById('chatMessages');
        if (!container) {
            return;
        }

        if (!this.activeFriend) {
            container.innerHTML = this.renderEmptyChatState();
            return;
        }

        if (this.chatMessages.length === 0) {
            container.innerHTML = `
                <div class="empty-state compact">
                    <div class="empty-icon">💬</div>
                    <p class="empty-text">还没有聊天记录。现在可以给 ${this.escapeHtml(this.activeFriend.username)} 发送第一条消息。</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.chatMessages.map((message) => {
            const mine = message.mine ? 'mine' : 'theirs';
            const senderLabel = message.mine ? '我' : this.escapeHtml(message.senderUsername);
            const content = this.escapeHtml(message.content).replace(/\n/g, '<br>');
            const timestamp = this.formatDateTime(message.createdAt);

            return `
                <div class="chat-message ${mine}">
                    <div class="chat-message-meta">${senderLabel} · ${timestamp}</div>
                    <div class="chat-bubble">${content}</div>
                </div>
            `;
        }).join('');

        if (scrollToBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }

    updateChatPanelState() {
        const title = document.getElementById('chatPanelTitle');
        const subtitle = document.getElementById('chatPanelSubtitle');
        const input = document.getElementById('chatInput');
        const sendBtn = document.getElementById('chatSendBtn');
        const hint = document.getElementById('chatHint');

        if (!title || !subtitle || !input || !sendBtn || !hint) {
            return;
        }

        if (!this.activeFriend) {
            title.textContent = '选择好友开始聊天';
            subtitle.textContent = '聊天内容会保存在当前云端数据库中，适合直接做好友消息演示。';
            input.value = '';
            input.disabled = true;
            sendBtn.disabled = true;
            hint.textContent = '只有已经成为好友的账号，才可以互相发送文字消息。';
            return;
        }

        title.textContent = `正在和 ${this.activeFriend.username} 聊天`;
        subtitle.textContent = this.activeFriend.online
            ? '对方当前在线，适合继续切换到语音或视频通话。'
            : '对方当前离线，也可以先通过文字消息演示沟通流程。';
        input.disabled = false;
        sendBtn.disabled = false;
        hint.textContent = '打开当前会话后，对应未读消息会自动清零。';
    }

    resetChatPanel() {
        this.activeFriend = null;
        this.chatMessages = [];
        this.updateChatPanelState();
        this.renderChatMessages(false);
    }

    async sendMessage() {
        if (!this.activeFriend) {
            this.showError('请先选择一个好友再发送消息');
            return;
        }

        const input = document.getElementById('chatInput');
        if (!input) {
            return;
        }

        const content = input.value.trim();
        if (!content) {
            this.showError('消息内容不能为空');
            return;
        }

        try {
            const payload = await this.fetchJson('/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    receiverUsername: this.activeFriend.username,
                    content
                })
            });

            if (payload.message && !this.chatMessages.some((message) => message.id === payload.message.id)) {
                this.chatMessages.push(payload.message);
            }

            input.value = '';
            this.renderChatMessages(true);
        } catch (error) {
            console.error('[Friends] 发送消息失败:', error);
            this.showError(error.message || '发送消息失败');
        }
    }

    async acceptFriendRequest(requestId, username) {
        try {
            await this.fetchJson(`/users/friends/requests/${requestId}/accept`, {
                method: 'POST'
            });
            this.showNotification(`已同意 ${username} 的好友申请`, 'success');
            await this.loadFriends();
            if (window.onlineCallModule && typeof window.onlineCallModule.refreshCurrentSearch === 'function') {
                await window.onlineCallModule.refreshCurrentSearch();
            }
        } catch (error) {
            console.error('[Friends] 同意好友申请失败:', error);
            this.showError(error.message || '处理好友申请失败');
        }
    }

    async rejectFriendRequest(requestId) {
        try {
            await this.fetchJson(`/users/friends/requests/${requestId}/reject`, {
                method: 'POST'
            });
            this.showNotification('已拒绝好友申请', 'info');
            await this.loadFriends();
            if (window.onlineCallModule && typeof window.onlineCallModule.refreshCurrentSearch === 'function') {
                await window.onlineCallModule.refreshCurrentSearch();
            }
        } catch (error) {
            console.error('[Friends] 拒绝好友申请失败:', error);
            this.showError(error.message || '处理好友申请失败');
        }
    }

    async removeFriend(username) {
        // 显示美化的确认对话框
        this.pendingRemoveFriendUsername = username;
        const dialog = document.getElementById('removeFriendConfirmDialog');
        const usernameElement = document.getElementById('removeFriendUsername');
        const messageElement = document.getElementById('removeFriendMessage');
        
        if (dialog && usernameElement && messageElement) {
            usernameElement.textContent = username;
            messageElement.textContent = `删除好友 ${username} 后，你们将不能继续互发消息和通话。此操作不可撤销。`;
            dialog.classList.remove('hidden');
        }
    }

    cancelRemoveFriend() {
        const dialog = document.getElementById('removeFriendConfirmDialog');
        if (dialog) {
            dialog.classList.add('hidden');
        }
        this.pendingRemoveFriendUsername = null;
    }

    async confirmRemoveFriend() {
        const username = this.pendingRemoveFriendUsername;
        if (!username) {
            return;
        }

        // 隐藏对话框
        const dialog = document.getElementById('removeFriendConfirmDialog');
        if (dialog) {
            dialog.classList.add('hidden');
        }

        try {
            await this.fetchJson(`/users/friends/${encodeURIComponent(username)}`, {
                method: 'DELETE'
            });

            if (this.activeFriend && this.activeFriend.username === username) {
                this.resetChatPanel();
            }

            delete this.unreadCounts[username];
            this.showNotification(`已删除好友 ${username}`, 'success');
            await this.loadFriends();

            if (window.onlineCallModule && typeof window.onlineCallModule.refreshCurrentSearch === 'function') {
                await window.onlineCallModule.refreshCurrentSearch();
            }
        } catch (error) {
            console.error('[Friends] 删除好友失败:', error);
            this.showError(error.message || '删除好友失败');
        } finally {
            this.pendingRemoveFriendUsername = null;
        }
    }

    handleIncomingMessage(message) {
        if (!message || !message.senderUsername) {
            return;
        }

        if (this.activeFriend && this.activeFriend.username === message.senderUsername) {
            if (!this.chatMessages.some((item) => item.id === message.id)) {
                this.chatMessages.push(message);
                this.renderChatMessages(true);
            }

            this.markConversationAsRead(message.senderUsername);
            return;
        }

        this.unreadCounts[message.senderUsername] = (this.unreadCounts[message.senderUsername] || 0) + 1;
        this.totalUnreadMessageCount += 1;
        this.renderFriends();
        this.updateFriendIndicators();
        this.showNotification(`${message.senderUsername} 发来一条新消息`, 'info');
    }

    callFriend(username, isVideo) {
        if (window.onlineCallModule && typeof window.onlineCallModule.initiateCall === 'function') {
            window.onlineCallModule.initiateCall(username, username, isVideo);
            return;
        }

        this.showError('在线通话模块尚未初始化');
    }

    getFriendStatusText(friend) {
        const unreadCount = this.unreadCounts[friend.username] || 0;
        if (unreadCount > 0) {
            return `你有 ${unreadCount} 条来自 ${friend.username} 的未读消息，点击“消息”即可查看。`;
        }

        if (friend.online) {
            return '对方当前在线，可直接发送消息、发起语音或视频通话。';
        }

        if (friend.lastSeen) {
            const date = new Date(friend.lastSeen);
            if (!Number.isNaN(date.getTime())) {
                return `最近在线：${date.toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })}`;
            }
        }

        return '对方当前离线，但仍可通过文字消息保留沟通记录。';
    }

    renderEmptyChatState() {
        return `
            <div class="empty-state compact">
                <div class="empty-icon">💬</div>
                <p class="empty-text">左侧选择一个好友后，这里会展示聊天记录，并支持实时发送消息。</p>
            </div>
        `;
    }

    renderMiniEmptyState(text) {
        return `
            <div class="mini-empty-state">
                <p>${text}</p>
            </div>
        `;
    }

    formatDateTime(value) {
        if (!value) {
            return '刚刚';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '刚刚';
        }

        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatCount(count) {
        return count > 99 ? '99+' : String(count);
    }

    getAvatarEmoji(username) {
        const emojis = ['👩', '🧑', '👨', '👧', '👦', '🧕', '👱'];
        const index = username.charCodeAt(0) % emojis.length;
        return emojis[index];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeJsString(text) {
        return String(text)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            animation: slideIn 0.3s;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    showError(message) {
        this.showNotification(message, 'error');
    }
}
