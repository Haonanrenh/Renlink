class XfyunTtsClient {
    constructor(options = {}) {
        this.onStatus = options.onStatus || (() => {});
        this.onError = options.onError || (() => {});
        this.socket = null;
        this.abortRequested = false;
    }

    async synthesize(text, options = {}) {
        const trimmedText = (text || '').trim();
        if (!trimmedText) {
            throw new Error('请输入要播报的文字');
        }

        const session = await this.createSession();
        return this.streamSynthesis(session, trimmedText, options);
    }

    async createSession() {
        const token = localStorage.getItem('token');
        const response = await fetch(`${CONFIG.backend.baseUrl}/tts/xfyun/session`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !data.wsUrl || !data.appId) {
            const statusHint = response.status ? `（HTTP ${response.status}）` : '';
            throw new Error(data.message || `无法创建讯飞在线语音合成会话${statusHint}`);
        }

        return data;
    }

    streamSynthesis(session, text, options = {}) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(session.wsUrl);
            const audioChunks = [];
            let finished = false;
            this.abortRequested = false;

            const fail = (error, silent = false) => {
                if (finished) {
                    return;
                }

                finished = true;
                this.socket = null;
                try {
                    socket.close();
                } catch (closeError) {
                    console.warn('[TTS] 关闭 WebSocket 失败:', closeError);
                }

                const normalizedError = error instanceof Error ? error : new Error(String(error));
                if (!silent) {
                    this.onError(normalizedError.message);
                }
                reject(normalizedError);
            };

            socket.onopen = () => {
                this.socket = socket;
                this.onStatus('语音合成服务已连接，正在生成...');
                socket.send(JSON.stringify(this.buildPayload(session, text, options)));
            };

            socket.onmessage = (event) => {
                let message;
                try {
                    message = JSON.parse(event.data);
                } catch (error) {
                    fail(new Error('讯飞在线语音合成返回了无法解析的消息'));
                    return;
                }

                if (Number(message.code || 0) !== 0) {
                    const reason = message.message || message.desc || message.error || '讯飞在线语音合成失败';
                    fail(new Error(`${reason}（${message.code}）`));
                    return;
                }

                const payload = message.data || {};
                if (payload.audio) {
                    audioChunks.push(this.base64ToUint8Array(payload.audio));
                }

                if (payload.status === 2) {
                    finished = true;
                    this.socket = null;

                    try {
                        socket.close();
                    } catch (closeError) {
                        console.warn('[TTS] 关闭 WebSocket 失败:', closeError);
                    }

                    this.onStatus('语音合成完成');
                    resolve({
                        blob: new Blob(audioChunks, { type: this.resolveMimeType(options.aue || session.aue) }),
                        session,
                        text
                    });
                }
            };

            socket.onerror = () => {
                fail(new Error('讯飞在线语音合成连接异常'));
            };

            socket.onclose = (event) => {
                if (finished) {
                    return;
                }

                if (this.abortRequested) {
                    fail(new Error('已取消播报'), true);
                    return;
                }

                const detail = event && event.code ? `（关闭码 ${event.code}）` : '';
                fail(new Error(`讯飞在线语音合成连接已关闭${detail}`));
            };
        });
    }

    abort() {
        if (this.socket) {
            this.abortRequested = true;
            try {
                this.socket.close(1000, 'cancelled');
            } catch (error) {
                console.warn('[TTS] 手动关闭 WebSocket 失败:', error);
            }
            this.socket = null;
        }
    }

    buildPayload(session, text, options) {
        return {
            common: {
                app_id: session.appId
            },
            business: {
                aue: options.aue || session.aue || CONFIG.tts.aue,
                auf: options.auf || session.auf || CONFIG.tts.auf,
                vcn: options.vcn || session.vcn || CONFIG.tts.vcn,
                tte: options.tte || session.tte || CONFIG.tts.tte,
                speed: this.normalizeNumber(options.speed ?? session.speed ?? CONFIG.tts.speed, 50),
                volume: this.normalizeNumber(options.volume ?? session.volume ?? CONFIG.tts.volume, 50),
                pitch: this.normalizeNumber(options.pitch ?? session.pitch ?? CONFIG.tts.pitch, 50),
                sfl: this.normalizeNumber(options.sfl ?? session.sfl ?? CONFIG.tts.sfl, 1)
            },
            data: {
                status: 2,
                text: this.encodeText(text)
            }
        };
    }

    encodeText(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        bytes.forEach((value) => {
            binary += String.fromCharCode(value);
        });
        return btoa(binary);
    }

    base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    normalizeNumber(value, fallback) {
        const normalized = Number(value);
        return Number.isFinite(normalized) ? normalized : fallback;
    }

    resolveMimeType(aue) {
        if (aue === 'lame') {
            return 'audio/mpeg';
        }

        if (aue === 'speex-wb' || aue === 'speex') {
            return 'audio/webm';
        }

        return 'audio/mpeg';
    }
}

if (typeof window !== 'undefined') {
    window.XfyunTtsClient = XfyunTtsClient;
}
