// WebSocket Client - 实时通信客户端
class WebSocketClient {
    constructor() {
        this.stompClient = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.messageHandlers = new Map();
    }

    /**
     * 连接到 WebSocket 服务器
     */
    connect(username) {
        return new Promise((resolve, reject) => {
            // 如果已经连接，直接返回
            if (this.connected && this.stompClient) {
                console.log('[WebSocket] 已连接，跳过重复连接');
                resolve();
                return;
            }
            
            console.log('[WebSocket] 正在连接到服务器...');
            
            // 获取 token
            const token = window.Renlink && window.Renlink.auth
                ? window.Renlink.auth.getToken()
                : localStorage.getItem('token');
            if (!token) {
                console.error('[WebSocket] Token 不存在');
                reject(new Error('Token 不存在'));
                return;
            }
            
            // 使用 SockJS 和 STOMP
            const socket = new SockJS(CONFIG.backend.wsUrl.replace('ws://', 'http://'));
            this.stompClient = Stomp.over(socket);
            
            // 禁用调试日志（可选）
            this.stompClient.debug = (msg) => {
                // console.log('[STOMP]', msg);
            };
            
            // 连接时发送 token
            const headers = {
                'Authorization': `Bearer ${token}`
            };
            
            // 连接到服务器
            this.stompClient.connect(
                headers,
                (frame) => {
                    console.log('[WebSocket] ✅ 连接成功');
                    console.log('[WebSocket] Frame:', frame);
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    
                    console.log('[WebSocket] 准备订阅用户队列，用户名:', username);
                    
                    // 订阅用户专属队列（接收呼叫邀请）
                    this.subscribeToUserQueue(username);
                    
                    console.log('[WebSocket] 订阅完成，连接就绪');
                    
                    resolve();
                },
                (error) => {
                    console.error('[WebSocket] ❌ 连接失败:', error);
                    this.connected = false;
                    
                    // 尝试重连
                    this.attemptReconnect(username);
                    
                    reject(error);
                }
            );
        });
    }

    /**
     * 订阅用户专属队列
     */
    subscribeToUserQueue(username) {
        console.log('[WebSocket] subscribeToUserQueue 被调用，用户名:', username);
        console.log('[WebSocket] stompClient:', this.stompClient);
        console.log('[WebSocket] connected:', this.connected);
        
        if (!this.stompClient || !this.connected) {
            console.error('[WebSocket] 未连接，无法订阅');
            return;
        }

        console.log('[WebSocket] 开始订阅队列...');

        // 订阅呼叫邀请队列（Spring 会自动添加用户前缀）
        // 客户端订阅 /user/queue/xxx，Spring 会自动转换为 /user/{username}/queue/xxx
        const sub1 = this.stompClient.subscribe(`/user/queue/call-invitations`, (message) => {
            console.log('[WebSocket] 📨 收到呼叫邀请');
            
            try {
                const invitation = JSON.parse(message.body);
                console.log('[WebSocket] 邀请详情:', invitation);
                
                // 触发消息处理器
                this.triggerHandler('call-invitation', invitation);
            } catch (error) {
                console.error('[WebSocket] 解析消息失败:', error);
            }
        });
        console.log('[WebSocket] ✅ 已订阅 /user/queue/call-invitations, subscription:', sub1);

        // 订阅拒绝通知队列
        const sub2 = this.stompClient.subscribe(`/user/queue/call-rejected`, (message) => {
            console.log('[WebSocket] 📨 收到拒绝通知');
            
            try {
                const invitation = JSON.parse(message.body);
                console.log('[WebSocket] 拒绝详情:', invitation);
                
                // 触发消息处理器
                this.triggerHandler('call-rejected', invitation);
            } catch (error) {
                console.error('[WebSocket] 解析消息失败:', error);
            }
        });
        console.log('[WebSocket] ✅ 已订阅 /user/queue/call-rejected, subscription:', sub2);

        // 订阅取消通知队列（发起方挂断时通知接收方）
        const sub3 = this.stompClient.subscribe(`/user/queue/call-cancelled`, (message) => {
            console.log('[WebSocket] 📨 收到取消通知');
            console.log('[WebSocket] 原始消息:', message);
            
            try {
                const invitation = JSON.parse(message.body);
                console.log('[WebSocket] 取消详情:', invitation);
                
                // 触发消息处理器
                this.triggerHandler('call-cancelled', invitation);
                console.log('[WebSocket] 已触发 call-cancelled 处理器');
            } catch (error) {
                console.error('[WebSocket] 解析消息失败:', error);
            }
        });
        console.log('[WebSocket] ✅ 已订阅 /user/queue/call-cancelled, subscription:', sub3);

        const sub4 = this.stompClient.subscribe(`/user/queue/subtitles`, (message) => {
            console.log('[WebSocket] 📨 收到字幕同步消息');

            try {
                const subtitleMessage = JSON.parse(message.body);
                console.log('[WebSocket] 字幕详情:', subtitleMessage);
                this.triggerHandler('subtitle-message', subtitleMessage);
            } catch (error) {
                console.error('[WebSocket] 解析字幕消息失败:', error);
            }
        });
        console.log('[WebSocket] ✅ 已订阅 /user/queue/subtitles, subscription:', sub4);

        const sub5 = this.stompClient.subscribe(`/user/queue/friend-updates`, (message) => {
            console.log('[WebSocket] 📨 收到好友关系更新');

            try {
                const payload = JSON.parse(message.body);
                console.log('[WebSocket] 好友关系更新详情:', payload);
                this.triggerHandler('friend-updated', payload);
            } catch (error) {
                console.error('[WebSocket] 解析好友关系更新失败:', error);
            }
        });
        console.log('[WebSocket] ✅ 已订阅 /user/queue/friend-updates, subscription:', sub5);

        const sub6 = this.stompClient.subscribe(`/user/queue/direct-messages`, (message) => {
            console.log('[WebSocket] 📨 收到即时消息');

            try {
                const chatMessage = JSON.parse(message.body);
                console.log('[WebSocket] 消息详情:', chatMessage);
                this.triggerHandler('direct-message', chatMessage);
            } catch (error) {
                console.error('[WebSocket] 解析即时消息失败:', error);
            }
        });
        console.log('[WebSocket] ✅ 已订阅 /user/queue/direct-messages, subscription:', sub6);

        const sub7 = this.stompClient.subscribe(`/user/queue/typing-status`, (message) => {
            console.log('[WebSocket] 📨 收到正在输入状态');

            try {
                const typingStatus = JSON.parse(message.body);
                console.log('[WebSocket] 输入状态详情:', typingStatus);
                this.triggerHandler('typing-status', typingStatus);
            } catch (error) {
                console.error('[WebSocket] 解析输入状态失败:', error);
            }
        });
        console.log('[WebSocket] ✅ 已订阅 /user/queue/typing-status, subscription:', sub7);

        console.log('[WebSocket] 📡 已订阅用户队列: /user/queue/call-invitations, /user/queue/call-rejected, /user/queue/call-cancelled, /user/queue/subtitles, /user/queue/friend-updates, /user/queue/direct-messages, /user/queue/typing-status');
        console.log('[WebSocket] （Spring 会自动转换为 /user/' + username + '/queue/...）');
    }

    /**
     * 注册消息处理器
     */
    onMessage(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    }

    /**
     * 触发消息处理器
     */
    triggerHandler(type, data) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error('[WebSocket] 处理器执行失败:', error);
                }
            });
        }
    }

    /**
     * 尝试重连
     */
    attemptReconnect(username) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WebSocket] 达到最大重连次数，停止重连');
            return;
        }

        this.reconnectAttempts++;
        console.log(`[WebSocket] 🔄 ${this.reconnectDelay / 1000} 秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connect(username).catch(() => {
                // 重连失败，会自动再次尝试
            });
        }, this.reconnectDelay);
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.stompClient && this.connected) {
            this.stompClient.disconnect(() => {
                console.log('[WebSocket] 已断开连接');
                this.connected = false;
            });
        }
    }

    /**
     * 检查连接状态
     */
    isConnected() {
        return this.connected;
    }

    /**
     * 发送消息到服务器
     * @param {string} destination - 目标地址 (如 /app/typing-status)
     * @param {object} message - 消息内容
     */
    send(destination, message) {
        if (!this.stompClient || !this.connected) {
            console.error('[WebSocket] 未连接，无法发送消息');
            return false;
        }

        try {
            this.stompClient.send(destination, {}, JSON.stringify(message));
            console.log(`[WebSocket] 📤 已发送消息到 ${destination}:`, message);
            return true;
        } catch (error) {
            console.error('[WebSocket] 发送消息失败:', error);
            return false;
        }
    }
}

// 创建全局实例
const wsClient = new WebSocketClient();

