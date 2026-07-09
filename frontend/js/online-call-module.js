// Online Call Module - 在线通话模块
class OnlineCallModule {
    constructor() {
        this.searchResults = [];
        this.searchTimeout = null;
        this.lastSearchQuery = '';
        this.API_BASE_URL = (typeof CONFIG !== 'undefined' && CONFIG.backend) ? CONFIG.backend.baseUrl : 'http://localhost:8080/api';
        this.currentInvitation = null;
        this.ringtoneOscillator = null;
        this.ringtoneContext = null;
        console.log('[OnlineCall] API_BASE_URL:', this.API_BASE_URL);
    }

    // 初始化
    initialize() {
        console.log('[OnlineCall] 初始化中...');
        this.setupSearchInput();
        this.connectWebSocket();
    }
    
    // 连接 WebSocket
    connectWebSocket() {
        const userStr = localStorage.getItem('user');
        if (!userStr) {
            console.error('[OnlineCall] 用户信息不存在，无法连接 WebSocket');
            return;
        }
        
        try {
            const user = JSON.parse(userStr);
            console.log('[OnlineCall] 正在连接 WebSocket，用户名:', user.username);
            
            // 连接 WebSocket（使用用户名而不是用户 ID）
            wsClient.connect(user.username).then(() => {
                console.log('[OnlineCall] WebSocket 连接成功');
                
                // 注册呼叫邀请处理器
                wsClient.onMessage('call-invitation', (invitation) => {
                    console.log('[OnlineCall] 收到呼叫邀请:', invitation);
                    this.showIncomingCallNotification(invitation);
                });
                
                // 注册取消通知处理器（发起方挂断时自动关闭来电提醒）
                wsClient.onMessage('call-cancelled', (invitation) => {
                    console.log('[OnlineCall] 📨 收到取消通知（发起方已挂断）:', invitation);
                    console.log('[OnlineCall] 当前邀请:', this.currentInvitation);
                    console.log('[OnlineCall] 准备停止铃声并隐藏来电提醒');
                    
                    // 停止铃声
                    if (typeof audioManager !== 'undefined') {
                        audioManager.stopRingtone();
                        console.log('[OnlineCall] ✅ 铃声已停止');
                    } else {
                        console.warn('[OnlineCall] ⚠️ audioManager 未定义');
                    }
                    
                    // 强制隐藏来电提醒（直接操作DOM）
                    const notification = document.getElementById('incomingCallNotification');
                    if (notification) {
                        notification.style.display = 'none';
                        notification.classList.add('hidden');
                        console.log('[OnlineCall] ✅ 来电提醒已强制隐藏（display: none）');
                    } else {
                        console.error('[OnlineCall] ❌ 找不到来电提醒元素');
                    }
                    
                    // 清除当前邀请
                    this.currentInvitation = null;
                    console.log('[OnlineCall] ✅ 当前邀请已清除');
                    
                    // 显示提示
                    this.showNotification('对方已取消通话', 'info');
                    console.log('[OnlineCall] ✅ 已显示取消提示');
                });
            }).catch(error => {
                console.error('[OnlineCall] WebSocket 连接失败:', error);
            });
        } catch (error) {
            console.error('[OnlineCall] 解析用户信息失败:', error);
        }
    }

    // 设置搜索输入
    setupSearchInput() {
        const searchInput = document.getElementById('userSearchInput');
        const searchHint = document.getElementById('searchHint');
        
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            // 清除之前的定时器
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }

            // 防抖：300ms后执行搜索
            this.searchTimeout = setTimeout(() => {
                if (query.length > 0) {
                    if (searchHint) searchHint.style.display = 'none';
                    this.searchUsers(query);
                } else {
                    if (searchHint) searchHint.style.display = 'block';
                    this.clearSearchResults();
                }
            }, 300);
        });
    }

    // 搜索用户
    async searchUsers(query) {
        this.lastSearchQuery = query;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.API_BASE_URL}/users/search?query=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const users = await response.json();
                this.searchResults = users;
                this.displaySearchResults(users);
            } else if (response.status === 401) {
                // Token 过期，重定向到登录
                window.location.href = 'index.html';
            } else {
                this.showError('搜索失败，请重试');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showError('网络错误，请检查后端服务是否启动');
        }
    }

    // 显示搜索结果
    displaySearchResults(users) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        if (users.length === 0) {
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #6b7280;">
                    <p>未找到匹配的用户</p>
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = users.map(user => {
            const username = this.escapeHtml(user.username);
            const jsUsername = this.escapeJsString(user.username);
            const avatar = this.getAvatarEmoji(user.username);
            const relationStatus = this.getRelationshipStatus(user);
            const relationBadge = this.getRelationshipBadge(relationStatus);
            const statusText = this.getRelationshipText(user, relationStatus);
            const actions = this.getRelationshipActions(user, relationStatus, jsUsername);
            return `
            <div class="user-result-item">
                <div class="user-info-result">
                    <div class="user-avatar">
                        ${avatar}
                    </div>
                    <div class="user-details">
                        <div class="user-result-head">
                            <div class="user-name">${username}</div>
                            ${relationBadge}
                        </div>
                        <div class="user-status">
                            ${statusText}
                        </div>
                    </div>
                </div>
                <div class="call-actions">
                    ${actions}
                </div>
            </div>
            `;
        }).join('');
    }

    async addFriend(username) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.API_BASE_URL}/users/friends`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    friendUsername: username
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                this.showError(data.message || '发送好友申请失败，请稍后重试');
                return;
            }

            this.showNotification(`已向 ${username} 发送好友申请`, 'success');
            await this.refreshCurrentSearch();

            if (window.friendsModule && typeof window.friendsModule.loadFriends === 'function') {
                window.friendsModule.loadFriends();
            }
        } catch (error) {
            console.error('[OnlineCall] 发送好友申请失败:', error);
            this.showError('网络错误，请稍后再试');
        }
    }

    async acceptFriendRequest(requestId, username) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.API_BASE_URL}/users/friends/requests/${requestId}/accept`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                this.showError(data.message || '处理好友申请失败');
                return;
            }

            this.showNotification(`已同意 ${username} 的好友申请`, 'success');
            await this.refreshCurrentSearch();

            if (window.friendsModule && typeof window.friendsModule.loadFriends === 'function') {
                await window.friendsModule.loadFriends();
            }
        } catch (error) {
            console.error('[OnlineCall] 同意好友申请失败:', error);
            this.showError('网络错误，请稍后再试');
        }
    }

    async rejectFriendRequest(requestId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.API_BASE_URL}/users/friends/requests/${requestId}/reject`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                this.showError(data.message || '处理好友申请失败');
                return;
            }

            this.showNotification('已拒绝好友申请', 'info');
            await this.refreshCurrentSearch();

            if (window.friendsModule && typeof window.friendsModule.loadFriends === 'function') {
                await window.friendsModule.loadFriends();
            }
        } catch (error) {
            console.error('[OnlineCall] 拒绝好友申请失败:', error);
            this.showError('网络错误，请稍后再试');
        }
    }

    openChat(username) {
        if (window.dashboardManager && typeof window.dashboardManager.switchModule === 'function') {
            window.dashboardManager.switchModule('friends');
        }

        if (window.friendsModule && typeof window.friendsModule.openChatWithFriend === 'function') {
            Promise.resolve(window.friendsModule.loadFriends())
                .then(() => window.friendsModule.openChatWithFriend(username))
                .catch(() => window.friendsModule.openChatWithFriend(username));
        }
    }

    async refreshCurrentSearch() {
        const searchInput = document.getElementById('userSearchInput');
        const query = searchInput ? searchInput.value.trim() : this.lastSearchQuery;
        if (query) {
            await this.searchUsers(query);
        }
    }

    getRelationshipStatus(user) {
        return user.relationshipStatus || (user.friend ? 'FRIEND' : 'NONE');
    }

    getRelationshipBadge(relationStatus) {
        switch (relationStatus) {
            case 'FRIEND':
                return '<span class="friend-pill">已是好友</span>';
            case 'INCOMING_REQUEST':
                return '<span class="friend-pill unread">待你处理</span>';
            case 'OUTGOING_REQUEST':
                return '<span class="friend-pill offline">等待通过</span>';
            default:
                return '';
        }
    }

    getRelationshipText(user, relationStatus) {
        switch (relationStatus) {
            case 'FRIEND':
                return user.online
                    ? '已是好友，可直接发消息、视频或语音通话'
                    : '已是好友，可先发送消息，待对方上线后继续语音或视频';
            case 'INCOMING_REQUEST':
                return '对方已向你发来好友申请，通过后即可聊天和通话';
            case 'OUTGOING_REQUEST':
                return '好友申请已发出，等待对方同意';
            default:
                return user.online
                    ? '可先发送好友申请，通过后即可聊天和通话'
                    : '对方当前离线，也可以先发送好友申请';
        }
    }

    getRelationshipActions(user, relationStatus, jsUsername) {
        switch (relationStatus) {
            case 'FRIEND':
                return `
                    <button class="call-btn message-btn" onclick="onlineCallModule.openChat('${jsUsername}')">
                        <span>✉</span>
                        <span>消息</span>
                    </button>
                    <button class="call-btn video-call-btn" onclick="onlineCallModule.initiateCall('${jsUsername}', '${jsUsername}', true)">
                        <span>📹</span>
                        <span>视频</span>
                    </button>
                    <button class="call-btn voice-call-btn" onclick="onlineCallModule.initiateCall('${jsUsername}', '${jsUsername}', false)">
                        <span>🎤</span>
                        <span>语音</span>
                    </button>
                `;
            case 'INCOMING_REQUEST':
                return `
                    <button class="call-btn accept-request-btn" onclick="onlineCallModule.acceptFriendRequest(${user.pendingRequestId}, '${jsUsername}')">
                        <span>✓</span>
                        <span>同意</span>
                    </button>
                    <button class="call-btn reject-request-btn" onclick="onlineCallModule.rejectFriendRequest(${user.pendingRequestId})">
                        <span>✕</span>
                        <span>拒绝</span>
                    </button>
                `;
            case 'OUTGOING_REQUEST':
                return `
                    <button class="call-btn pending-request-btn" disabled>
                        <span>…</span>
                        <span>等待通过</span>
                    </button>
                `;
            default:
                return `
                    <button class="call-btn add-friend-btn" onclick="onlineCallModule.addFriend('${jsUsername}')">
                        <span>+</span>
                        <span>发送申请</span>
                    </button>
                `;
        }
    }

    // 清除搜索结果
    clearSearchResults() {
        const resultsContainer = document.getElementById('searchResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = '';
        }
    }

    // 发起通话
    async initiateCall(username, displayName, isVideo) {
        const callType = isVideo ? 'video' : 'audio';
        
        // 生成频道名（使用时间戳确保唯一性）
        const channelName = `call_${Date.now()}_${username}`;
        
        console.log('[OnlineCall] 发起呼叫:', {
            calleeUsername: username,
            displayName,
            channelName,
            callType
        });
        
        try {
            // 发送呼叫邀请到后端
            const token = localStorage.getItem('token');
            
            console.log('[OnlineCall] 发送请求到:', `${this.API_BASE_URL}/call-invitations`);
            
            const response = await fetch(`${this.API_BASE_URL}/call-invitations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    calleeUsername: username,  // 使用用户名而不是 ID
                    channelName: channelName,
                    callType: callType
                })
            });
            
            console.log('[OnlineCall] 响应状态:', response.status);
            
            if (response.ok) {
                const result = await response.json();
                console.log('[OnlineCall] 呼叫邀请已发送:', result);
                
                // 显示提示
                this.showNotification(`正在呼叫 ${displayName}...`, 'info');
                
                // 跳转到通话页面，传递邀请 ID
                const invitationId = result.invitation.id;
                window.location.href = `call.html?channel=${channelName}&user=${encodeURIComponent(displayName)}&type=${callType}&role=caller&invitationId=${invitationId}`;
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error('[OnlineCall] 请求失败:', response.status, errorData);
                this.showError(errorData.message || '发起呼叫失败，请重试');
            }
        } catch (error) {
            console.error('[OnlineCall] 发起呼叫异常:', error);
            this.showError('网络错误，请检查连接');
        }
    }

    // 接听通话
    acceptCall(invitation) {
        // 停止铃声
        audioManager.stopRingtone();
        
        // 播放接听音
        audioManager.playAcceptSound();
        
        // 接受邀请
        const token = localStorage.getItem('token');
        fetch(`${this.API_BASE_URL}/call-invitations/${invitation.id}/accept`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }).then(response => {
            if (response.ok) {
                // 跳转到通话页面
                window.location.href = `call.html?channel=${invitation.channelName}&user=${encodeURIComponent(invitation.callerName)}&type=${invitation.callType}&role=callee`;
            }
        }).catch(error => {
            console.error('Accept call error:', error);
            this.showError('接听失败');
        });
    }

    // 拒绝通话
    declineCall(invitation) {
        console.log('[OnlineCall] 拒绝通话，邀请 ID:', invitation.id);
        
        // 停止铃声
        audioManager.stopRingtone();
        
        // 播放拒绝音
        audioManager.playRejectSound();
        
        // 先隐藏来电提醒（无论API调用是否成功）
        this.hideIncomingCallNotification();
        
        // 拒绝邀请
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('[OnlineCall] Token 不存在');
            this.showError('未登录，请重新登录');
            return;
        }
        
        console.log('[OnlineCall] 发送拒绝请求，邀请ID:', invitation.id);
        
        fetch(`${this.API_BASE_URL}/call-invitations/${invitation.id}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }).then(response => {
            console.log('[OnlineCall] 拒绝响应状态:', response.status);
            if (response.ok) {
                this.showNotification('已拒绝通话', 'info');
            } else if (response.status === 400) {
                // 邀请已处理（可能发起方已取消）
                return response.json().then(data => {
                    console.log('[OnlineCall] 邀请已处理:', data.message);
                    this.showNotification('通话已结束', 'info');
                }).catch(() => {
                    this.showNotification('通话已结束', 'info');
                });
            } else if (response.status === 403) {
                // 权限问题
                console.error('[OnlineCall] 403 权限错误');
                this.showNotification('通话已结束', 'info');
            } else {
                return response.text().then(text => {
                    console.error('[OnlineCall] 拒绝失败，响应:', text);
                    // 不显示错误，因为来电提醒已经关闭了
                    this.showNotification('通话已结束', 'info');
                });
            }
        }).catch(error => {
            console.error('[OnlineCall] 拒绝请求失败:', error);
            // 网络错误也不显示错误提示，因为来电提醒已经关闭了
            this.showNotification('通话已结束', 'info');
        });
    }
    
    // 显示来电通知
    showIncomingCallNotification(invitation) {
        console.log('[OnlineCall] showIncomingCallNotification 被调用:', invitation);
        const notification = document.getElementById('incomingCallNotification');
        const callerName = document.getElementById('callerName');
        const callType = document.getElementById('callType');
        
        if (notification && callerName && callType) {
            callerName.textContent = invitation.callerName;
            callType.textContent = invitation.callType === 'video' ? '视频通话' : '语音通话';
            notification.classList.remove('hidden');
            notification.style.display = 'block';
            console.log('[OnlineCall] 来电提醒已显示（display: block）');
            
            // 保存当前邀请
            this.currentInvitation = invitation;
            
            // 播放铃声
            audioManager.playRingtone();
            
            // 播放浏览器通知音
            audioManager.playNotificationSound();
            
            console.log('[OnlineCall] 来电通知已显示，铃声播放中');
        } else {
            console.error('[OnlineCall] 找不到来电提醒元素');
        }
    }
    
    // 隐藏来电通知
    hideIncomingCallNotification() {
        console.log('[OnlineCall] hideIncomingCallNotification 被调用');
        const notification = document.getElementById('incomingCallNotification');
        if (notification) {
            notification.style.display = 'none';
            notification.classList.add('hidden');
            console.log('[OnlineCall] 来电提醒已隐藏');
        } else {
            console.error('[OnlineCall] 找不到来电提醒元素 #incomingCallNotification');
        }
        this.currentInvitation = null;
        if (typeof audioManager !== 'undefined') {
            audioManager.stopRingtone();
        }
    }
    
    // 播放铃声
    playRingtone() {
        // 简单的提示音（可以替换为真实的铃声文件）
        if (window.AudioContext || window.webkitAudioContext) {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = 800;
                gainNode.gain.value = 0.1;
                
                oscillator.start();
                
                this.ringtoneOscillator = oscillator;
                this.ringtoneContext = audioContext;
                
                // 2秒后停止
                setTimeout(() => this.stopRingtone(), 2000);
            } catch (e) {
                console.log('无法播放铃声:', e);
            }
        }
    }
    
    // 停止铃声
    stopRingtone() {
        if (this.ringtoneOscillator) {
            try {
                this.ringtoneOscillator.stop();
                this.ringtoneContext.close();
            } catch (e) {
                // 忽略错误
            }
            this.ringtoneOscillator = null;
            this.ringtoneContext = null;
        }
    }

    // 获取头像表情
    getAvatarEmoji(username) {
        const emojis = ['👤', '👨', '👩', '🧑', '👦', '👧', '🧒'];
        const index = username.charCodeAt(0) % emojis.length;
        return emojis[index];
    }

    // 转义 HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeJsString(text) {
        return String(text)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    // 显示通知
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

    // 显示错误
    showError(message) {
        this.showNotification(message, 'error');
    }
}

// 注意：初始化在 dashboard.html 中手动调用

