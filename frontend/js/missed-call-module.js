// Missed Call Module - 未接来电模块
class MissedCallModule {
    constructor() {
        this.missedCalls = [];
        this.API_BASE_URL = (typeof CONFIG !== 'undefined' && CONFIG.backend) ? CONFIG.backend.baseUrl : 'http://localhost:8080/api';
        console.log('[MissedCall] API_BASE_URL:', this.API_BASE_URL);
    }

    // 初始化
    initialize() {
        console.log('[MissedCall] 初始化中...');
        this.loadMissedCalls();
        
        // 每30秒刷新一次
        setInterval(() => {
            this.loadMissedCalls();
        }, 30000);
    }

    // 加载未接来电列表
    async loadMissedCalls() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.API_BASE_URL}/call-invitations/missed-calls`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                this.missedCalls = await response.json();
                this.displayMissedCalls();
                this.updateUnreadBadge();
            } else if (response.status === 401) {
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('[MissedCall] 加载失败:', error);
        }
    }

    // 显示未接来电列表
    displayMissedCalls() {
        const container = document.getElementById('missedCallsList');
        if (!container) return;

        if (this.missedCalls.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📵</div>
                    <p class="empty-text">暂无未接来电</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.missedCalls.map(call => {
            const icon = call.callType === 'video' ? '📹' : '🎤';
            return `
                <div class="missed-call-item ${call.isRead ? 'read' : 'unread'}" data-id="${call.id}">
                    <div class="missed-call-icon">
                        <span style="font-size: 28px;">${icon}</span>
                    </div>
                    <div class="missed-call-info">
                        <div class="missed-call-name">${this.escapeHtml(call.callerName)}</div>
                        <div class="missed-call-time">${this.formatTime(call.missedAt)}</div>
                    </div>
                    <div class="missed-call-actions">
                        <button class="callback-btn video-callback" onclick="missedCallModule.callBack('${this.escapeHtml(call.callerName)}', 'video')" title="视频回拨">
                            <span>📹</span>
                        </button>
                        <button class="callback-btn voice-callback" onclick="missedCallModule.callBack('${this.escapeHtml(call.callerName)}', 'audio')" title="语音回拨">
                            <span>🎤</span>
                        </button>
                        ${!call.isRead ? `
                            <button class="mark-read-btn" onclick="missedCallModule.markAsRead(${call.id})" title="标记已读">
                                <span>✓</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    // 更新未读徽章
    updateUnreadBadge() {
        const unreadCount = this.missedCalls.filter(call => !call.isRead).length;
        const badge = document.getElementById('missedCallBadge');
        
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // 回拨
    async callBack(username, callType) {
        console.log('[MissedCall] 回拨:', username, callType);
        
        // 生成频道名
        const channelName = `call_${Date.now()}_${username}`;
        const isVideo = callType === 'video';
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.API_BASE_URL}/call-invitations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    calleeUsername: username,
                    channelName: channelName,
                    callType: callType
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                const invitationId = result.invitation.id;
                window.location.href = `call.html?channel=${channelName}&user=${encodeURIComponent(username)}&type=${callType}&role=caller&invitationId=${invitationId}`;
            } else {
                this.showError('回拨失败');
            }
        } catch (error) {
            console.error('[MissedCall] 回拨失败:', error);
            this.showError('网络错误');
        }
    }

    // 标记为已读
    async markAsRead(id) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.API_BASE_URL}/call-invitations/missed-calls/${id}/mark-read`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                // 重新加载列表
                await this.loadMissedCalls();
            }
        } catch (error) {
            console.error('[MissedCall] 标记已读失败:', error);
        }
    }

    // 标记所有为已读
    async markAllAsRead() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.API_BASE_URL}/call-invitations/missed-calls/mark-all-read`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                await this.loadMissedCalls();
                this.showNotification('已标记所有为已读', 'success');
            }
        } catch (error) {
            console.error('[MissedCall] 标记所有已读失败:', error);
        }
    }

    // 格式化时间
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        // 1分钟内
        if (diff < 60000) {
            return '刚刚';
        }
        
        // 1小时内
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes}分钟前`;
        }
        
        // 今天
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        
        // 昨天
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        
        // 更早
        return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + 
               date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    // 转义 HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

// 创建全局实例
const missedCallModule = new MissedCallModule();

