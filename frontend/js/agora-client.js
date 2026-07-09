// Agora 客户端管理
class AgoraClient {
    constructor() {
        this.client = null;
        this.localAudioTrack = null;
        this.localVideoTrack = null;
        this.publishedAudioTrack = null;
        this.mixedAudioTrack = null;
        this.mixAudioContext = null;
        this.mixDestination = null;
        this.mixMicSource = null;
        this.mixMicGain = null;
        this.ttsPlaybackNodes = new Set();
        this.ttsBridgeEnabled = false;
        this.remoteUsers = {};
        this.isJoined = false;
        this.channelName = null;
        this.uid = null;
        this.isAudioEnabled = false;
        this.isVideoEnabled = false;
        this.audioTogglePending = false;
        this.videoTogglePending = false;
    }

    // 等待 Agora SDK 加载
    async waitForAgoraSDK(maxWaitTime = 10000) {
        const startTime = Date.now();
        
        while (typeof AgoraRTC === 'undefined') {
            if (Date.now() - startTime > maxWaitTime) {
                throw new Error('Agora SDK 加载超时，请刷新页面重试');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('Agora SDK ready:', AgoraRTC.VERSION);
    }

    // 初始化客户端
    async init() {
        try {
            // 等待 AgoraRTC SDK 加载
            await this.waitForAgoraSDK();

            // 创建 Agora 客户端
            this.client = AgoraRTC.createClient({
                mode: 'rtc',
                codec: 'vp8'
            });

            // 监听远程用户加入
            this.client.on('user-published', async (user, mediaType) => {
                await this.handleUserPublished(user, mediaType);
            });

            // 监听远程用户离开
            this.client.on('user-unpublished', (user, mediaType) => {
                this.handleUserUnpublished(user, mediaType);
            });

            // 监听远程用户离开频道
            this.client.on('user-left', (user) => {
                this.handleUserLeft(user);
            });

            console.log('Agora client initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize Agora client:', error);
            throw error;
        }
    }

    // 加入频道
    async join(channelName, uid = null) {
        try {
            if (this.isJoined) {
                console.warn('Already joined a channel');
                return;
            }

            // 检查配置
            if (typeof CONFIG === 'undefined') {
                throw new Error('配置文件未加载，请刷新页面重试');
            }
            
            // 从后端获取 Token（带上 JWT 认证）
            let token = null;
            let appId = CONFIG.agora ? CONFIG.agora.appId : '';
            try {
                const jwtToken = window.Renlink && window.Renlink.auth
                    ? window.Renlink.auth.getToken()
                    : localStorage.getItem('token');
                if (!jwtToken) {
                    throw new Error('未登录，请先登录');
                }

                const response = await fetch(
                    `${CONFIG.backend.baseUrl}/agora/token?channelName=${encodeURIComponent(channelName)}&uid=${uid || 0}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${jwtToken}`
                        }
                    }
                );
                
                const data = await response.json();
                if (data.success) {
                    token = data.token;
                    appId = data.appId || appId;
                } else {
                    console.error('Failed to get token:', data.message);
                    throw new Error(data.message || '获取 Token 失败');
                }
            } catch (error) {
                console.error('Failed to fetch token:', error);
                throw new Error('无法连接到服务器获取 Token: ' + error.message);
            }

            if (!appId) {
                throw new Error('Agora App ID 未配置');
            }

            // 加入频道
            this.uid = await this.client.join(
                appId,
                channelName,
                token,
                uid
            );

            this.channelName = channelName;
            this.isJoined = true;

            console.log(`Joined channel: ${channelName}, UID: ${this.uid}`);
            
            // 触发加入成功事件
            if (typeof onChannelJoined === 'function') {
                onChannelJoined(this.uid);
            }

            return this.uid;
        } catch (error) {
            console.error('Failed to join channel:', error);
            throw error;
        }
    }

    getMediaSupportStatus() {
        const mediaDevices = navigator.mediaDevices;
        const hasGetUserMedia = Boolean(mediaDevices && typeof mediaDevices.getUserMedia === 'function');
        return {
            supported: hasGetUserMedia,
            secureContext: Boolean(window.isSecureContext),
            protocol: window.location.protocol,
            host: window.location.host,
            reason: hasGetUserMedia ? '' : this.getMediaUnsupportedReason()
        };
    }

    getMediaUnsupportedReason() {
        if (!window.isSecureContext) {
            return '当前页面不是浏览器认可的安全来源，摄像头和麦克风接口不可用。请使用 localhost、HTTPS，或在 Chrome/Edge 中把当前局域网地址加入安全来源。';
        }

        return '当前浏览器没有提供摄像头和麦克风接口，请更换 Chrome、Edge 或 Safari 后重试。';
    }

    normalizeMediaError(kind, error) {
        const message = error && error.message ? error.message : String(error || '未知错误');
        const name = error && error.name ? error.name : 'MediaError';
        const mediaSupport = this.getMediaSupportStatus();
        return {
            kind,
            name,
            message,
            mediaSupport,
            userMessage: mediaSupport.supported
                ? `${kind === 'audio' ? '麦克风' : '摄像头'}启动失败：${message}`
                : mediaSupport.reason
        };
    }

    // 创建并发布本地音视频轨道
    async createAndPublishTracks(audioEnabled = true, videoEnabled = true, options = {}) {
        const allowPartial = Boolean(options.allowPartial);
        const errors = [];

        // 创建音频轨道
        if (audioEnabled) {
            try {
                this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
                    encoderConfig: 'music_standard',
                    AEC: true, // 回声消除
                    ANS: true  // 噪声抑制
                });
            } catch (error) {
                console.error('Failed to create microphone track:', error);
                errors.push(this.normalizeMediaError('audio', error));
                this.localAudioTrack = null;
                if (!allowPartial) {
                    throw error;
                }
            }
        }

        // 创建视频轨道
        if (videoEnabled) {
            try {
                this.localVideoTrack = await AgoraRTC.createCameraVideoTrack({
                    encoderConfig: {
                        width: CONFIG.call.video.width,
                        height: CONFIG.call.video.height,
                        frameRate: CONFIG.call.video.frameRate,
                        bitrateMin: 600,
                        bitrateMax: 1000
                    }
                });
            } catch (error) {
                console.error('Failed to create camera track:', error);
                errors.push(this.normalizeMediaError('video', error));
                this.localVideoTrack = null;
                if (!allowPartial) {
                    throw error;
                }
            }
        }

        // 发布到频道
        const tracks = [];
        if (this.localAudioTrack) {
            this.publishedAudioTrack = this.localAudioTrack;
            tracks.push(this.publishedAudioTrack);
        }
        if (this.localVideoTrack) tracks.push(this.localVideoTrack);

        if (tracks.length > 0) {
            await this.client.publish(tracks);
            console.log('Published local tracks');
        } else if (!allowPartial) {
            throw new Error('未能创建可发布的本地音视频轨道');
        }

        // 播放本地视频
        if (this.localVideoTrack) {
            this.localVideoTrack.play('local-video-container');
        }

        this.isAudioEnabled = Boolean(this.localAudioTrack && audioEnabled);
        this.isVideoEnabled = Boolean(this.localVideoTrack && videoEnabled);

        return {
            audio: this.localAudioTrack,
            video: this.localVideoTrack,
            errors,
            mediaSupport: this.getMediaSupportStatus()
        };
    }

    extractMediaStreamTrack(track) {
        if (track && typeof track.getMediaStreamTrack === 'function') {
            return track.getMediaStreamTrack();
        }

        if (track && track._mediaStreamTrack) {
            return track._mediaStreamTrack;
        }

        throw new Error('当前 Agora 音频轨道无法导出 MediaStreamTrack');
    }

    async resumeMixAudioContext() {
        if (this.mixAudioContext && this.mixAudioContext.state === 'suspended') {
            await this.mixAudioContext.resume();
        }
    }

    async ensureTtsBridge() {
        if (this.ttsBridgeEnabled && this.mixedAudioTrack) {
            await this.resumeMixAudioContext();
            return;
        }

        if (!this.localAudioTrack) {
            throw new Error('本地麦克风未就绪，暂时无法使用代发声');
        }

        const mediaStreamTrack = this.extractMediaStreamTrack(this.localAudioTrack);
        this.mixAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        await this.resumeMixAudioContext();

        this.mixDestination = this.mixAudioContext.createMediaStreamDestination();
        this.mixMicSource = this.mixAudioContext.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
        this.mixMicGain = this.mixAudioContext.createGain();
        this.mixMicGain.gain.value = this.isAudioEnabled ? 1 : 0;

        this.mixMicSource.connect(this.mixMicGain);
        this.mixMicGain.connect(this.mixDestination);

        const mixedStreamTrack = this.mixDestination.stream.getAudioTracks()[0];
        this.mixedAudioTrack = await AgoraRTC.createCustomAudioTrack({
            mediaStreamTrack: mixedStreamTrack
        });

        if (this.client && this.isJoined) {
            const currentTrack = this.publishedAudioTrack || this.localAudioTrack;
            try {
                if (currentTrack && currentTrack !== this.mixedAudioTrack) {
                    await this.client.unpublish(currentTrack);
                }
                await this.client.publish(this.mixedAudioTrack);
                this.publishedAudioTrack = this.mixedAudioTrack;
            } catch (error) {
                console.error('Failed to switch to mixed TTS audio track:', error);

                if (currentTrack && currentTrack !== this.mixedAudioTrack) {
                    try {
                        await this.client.publish(currentTrack);
                        this.publishedAudioTrack = currentTrack;
                    } catch (restoreError) {
                        console.error('Failed to restore microphone track:', restoreError);
                    }
                }

                if (this.mixedAudioTrack) {
                    this.mixedAudioTrack.stop();
                    this.mixedAudioTrack.close();
                    this.mixedAudioTrack = null;
                }

                throw new Error('切换到文字转语音混音轨道失败，请稍后重试');
            }
        }

        this.ttsBridgeEnabled = true;
    }

    getTrackEnabledState(track, fallbackValue = false) {
        if (track && typeof track.enabled === 'boolean') {
            return track.enabled;
        }

        return fallbackValue;
    }

    syncMixedMicGain() {
        if (this.mixMicGain) {
            this.mixMicGain.gain.value = this.isAudioEnabled ? 1 : 0;
        }
    }

    async setLocalAudioEnabled(enabled) {
        if (!this.localAudioTrack) {
            this.isAudioEnabled = false;
            return false;
        }

        await this.localAudioTrack.setEnabled(enabled);
        this.isAudioEnabled = enabled;
        this.syncMixedMicGain();
        return this.isAudioEnabled;
    }

    async setLocalVideoEnabled(enabled) {
        if (!this.localVideoTrack) {
            this.isVideoEnabled = false;
            return false;
        }

        await this.localVideoTrack.setEnabled(enabled);
        this.isVideoEnabled = enabled;

        if (enabled) {
            this.localVideoTrack.play('local-video-container');
        }

        return this.isVideoEnabled;
    }

    async decodeAudioBuffer(arrayBuffer) {
        return new Promise((resolve, reject) => {
            this.mixAudioContext.decodeAudioData(
                arrayBuffer.slice(0),
                resolve,
                reject
            );
        });
    }

    async playSynthesizedSpeech(audioBlob, options = {}) {
        if (!audioBlob) {
            throw new Error('未收到可播放的语音数据');
        }

        await this.ensureTtsBridge();
        await this.resumeMixAudioContext();
        this.stopTtsPlayback();

        const audioBuffer = await this.decodeAudioBuffer(await audioBlob.arrayBuffer());
        const sourceNode = this.mixAudioContext.createBufferSource();
        const gainNode = this.mixAudioContext.createGain();
        gainNode.gain.value = typeof options.gain === 'number' ? options.gain : 1;

        sourceNode.buffer = audioBuffer;
        sourceNode.connect(gainNode);
        gainNode.connect(this.mixDestination);

        if (options.localMonitor) {
            gainNode.connect(this.mixAudioContext.destination);
        }

        const playbackEntry = { sourceNode, gainNode };
        this.ttsPlaybackNodes.add(playbackEntry);

        return new Promise((resolve) => {
            sourceNode.onended = () => {
                try {
                    sourceNode.disconnect();
                } catch (error) {
                    console.warn('Failed to disconnect TTS source node:', error);
                }

                try {
                    gainNode.disconnect();
                } catch (error) {
                    console.warn('Failed to disconnect TTS gain node:', error);
                }

                this.ttsPlaybackNodes.delete(playbackEntry);
                resolve();
            };

            sourceNode.start();
        });
    }

    stopTtsPlayback() {
        this.ttsPlaybackNodes.forEach(({ sourceNode, gainNode }) => {
            try {
                sourceNode.stop();
            } catch (error) {
                console.warn('Failed to stop TTS playback:', error);
            }

            try {
                sourceNode.disconnect();
            } catch (error) {
                console.warn('Failed to disconnect TTS source node:', error);
            }

            try {
                gainNode.disconnect();
            } catch (error) {
                console.warn('Failed to disconnect TTS gain node:', error);
            }
        });

        this.ttsPlaybackNodes.clear();
    }

    // 处理远程用户发布
    async handleUserPublished(user, mediaType) {
        try {
            // 订阅远程用户
            await this.client.subscribe(user, mediaType);
            console.log(`Subscribed to ${user.uid} ${mediaType}`);

            // 保存远程用户
            this.remoteUsers[user.uid] = user;

            if (mediaType === 'video') {
                // 播放远程视频
                const remoteContainer = document.getElementById('remote-video-container');
                const placeholder = remoteContainer.querySelector('.video-placeholder');
                if (placeholder) {
                    placeholder.remove();
                }
                
                user.videoTrack.play('remote-video-container');
                
                // 触发远程视频就绪事件
                if (typeof onRemoteVideoReady === 'function') {
                    onRemoteVideoReady(user);
                }
            }

            if (mediaType === 'audio') {
                // 播放远程音频
                user.audioTrack.play();
                
                // 触发远程音频就绪事件（用于语音识别）
                if (typeof onRemoteAudioReady === 'function') {
                    onRemoteAudioReady(user.audioTrack);
                }
            }
        } catch (error) {
            console.error('Failed to handle user published:', error);
        }
    }

    // 处理远程用户取消发布
    handleUserUnpublished(user, mediaType) {
        console.log(`User ${user.uid} unpublished ${mediaType}`);
        
        if (mediaType === 'video') {
            // 移除视频显示
            const remoteContainer = document.getElementById('remote-video-container');
            remoteContainer.innerHTML = `
                <div class="video-placeholder">
                    <div class="avatar-large">👤</div>
                    <p class="text-white text-lg mt-4">对方已关闭摄像头</p>
                </div>
            `;
        }
    }

    // 处理远程用户离开
    handleUserLeft(user) {
        console.log(`User ${user.uid} left the channel`);
        delete this.remoteUsers[user.uid];
        
        // 显示占位符
        const remoteContainer = document.getElementById('remote-video-container');
        remoteContainer.innerHTML = `
            <div class="video-placeholder">
                <div class="avatar-large">👤</div>
                <p class="text-white text-lg mt-4">对方已离开</p>
            </div>
        `;
        
        // 触发用户离开事件
        if (typeof onRemoteUserLeft === 'function') {
            onRemoteUserLeft(user);
        }
    }

    // 静音/取消静音
    async toggleMute() {
        if (!this.localAudioTrack) {
            this.isAudioEnabled = false;
            return false;
        }

        if (this.audioTogglePending) {
            return this.isAudioEnabled;
        }

        this.audioTogglePending = true;

        try {
            const currentEnabled = this.getTrackEnabledState(this.localAudioTrack, this.isAudioEnabled);
            return await this.setLocalAudioEnabled(!currentEnabled);
        } finally {
            this.audioTogglePending = false;
        }
    }

    // 开启/关闭摄像头
    async toggleVideo() {
        if (!this.localVideoTrack) {
            this.isVideoEnabled = false;
            return false;
        }

        if (this.videoTogglePending) {
            return this.isVideoEnabled;
        }

        this.videoTogglePending = true;

        try {
            const currentEnabled = this.getTrackEnabledState(this.localVideoTrack, this.isVideoEnabled);
            return await this.setLocalVideoEnabled(!currentEnabled);
        } finally {
            this.videoTogglePending = false;
        }
    }

    // 离开频道
    async leave() {
        try {
            this.stopTtsPlayback();

            // 停止并关闭本地轨道
            if (this.localAudioTrack) {
                this.localAudioTrack.stop();
                this.localAudioTrack.close();
                this.localAudioTrack = null;
            }

            if (this.localVideoTrack) {
                this.localVideoTrack.stop();
                this.localVideoTrack.close();
                this.localVideoTrack = null;
            }

            if (this.mixedAudioTrack) {
                this.mixedAudioTrack.stop();
                this.mixedAudioTrack.close();
                this.mixedAudioTrack = null;
            }

            // 离开频道
            if (this.isJoined) {
                await this.client.leave();
                this.isJoined = false;
                console.log('Left the channel');
            }

            // 清空远程用户
            this.remoteUsers = {};
            this.channelName = null;
            this.uid = null;
            this.publishedAudioTrack = null;
            this.ttsBridgeEnabled = false;
            this.isAudioEnabled = false;
            this.isVideoEnabled = false;
            this.audioTogglePending = false;
            this.videoTogglePending = false;

            if (this.mixMicSource) {
                this.mixMicSource.disconnect();
                this.mixMicSource = null;
            }

            if (this.mixMicGain) {
                this.mixMicGain.disconnect();
                this.mixMicGain = null;
            }

            this.mixDestination = null;

            if (this.mixAudioContext) {
                try {
                    await this.mixAudioContext.close();
                } catch (error) {
                    console.warn('Failed to close mixed audio context:', error);
                }
                this.mixAudioContext = null;
            }

        } catch (error) {
            console.error('Failed to leave channel:', error);
            throw error;
        }
    }

    // 获取当前频道名
    getChannelName() {
        return this.channelName;
    }

    // 获取本地 UID
    getLocalUid() {
        return this.uid;
    }

    // 获取远程用户列表
    getRemoteUsers() {
        return Object.values(this.remoteUsers);
    }
}

// 导出全局实例
const agoraClient = new AgoraClient();
