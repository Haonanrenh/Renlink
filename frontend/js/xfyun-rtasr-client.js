class XfyunRtasrClient {
    constructor(options = {}) {
        this.onStatus = options.onStatus || (() => {});
        this.onText = options.onText || (() => {});
        this.onError = options.onError || (() => {});

        this.socket = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.silentGainNode = null;
        this.frameTimer = null;
        this.sessionId = null;
        this.pendingChunks = [];
        this.chunkOffset = 0;
        this.segmentTexts = new Map();
        this.segmentOrder = [];
        this.nextSegmentId = 1;
        this.stopRequested = false;
        this.serviceEnded = false;
    }

    async start(remoteAudioTrack, options = {}) {
        if (!remoteAudioTrack) {
            throw new Error('\u8fdc\u7aef\u97f3\u9891\u8f68\u9053\u5c1a\u672a\u5c31\u7eea\uff0c\u8bf7\u7b49\u5f85\u5bf9\u65b9\u52a0\u5165\u5e76\u8bf4\u8bdd\u540e\u518d\u5f00\u542f\u5b57\u5e55\u3002');
        }

        await this.stop();
        this.resetRuntimeState();
        this.onStatus('\u6b63\u5728\u8fde\u63a5\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199...');

        const session = await this.createSession(options);
        await this.openSocket(session.wsUrl);
        await this.attachAudioTrack(remoteAudioTrack, session.sampleRate || 16000);
        this.startFramePump(session.frameBytes || 1280, session.frameIntervalMs || 40);

        this.onStatus('\u5b9e\u65f6\u5b57\u5e55\u5df2\u542f\u52a8\uff0c\u8bf7\u5f00\u59cb\u8bf4\u8bdd\u3002');
    }

    async stop() {
        this.stopRequested = true;

        if (this.frameTimer) {
            window.clearInterval(this.frameTimer);
            this.frameTimer = null;
        }

        this.flushRemainingAudio();
        this.sendEndMarker();

        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode.onaudioprocess = null;
            this.processorNode = null;
        }

        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        if (this.silentGainNode) {
            this.silentGainNode.disconnect();
            this.silentGainNode = null;
        }

        if (this.audioContext) {
            try {
                await this.audioContext.close();
            } catch (error) {
                console.warn('[XFYUN ASR] 关闭 AudioContext 失败:', error);
            }
            this.audioContext = null;
        }

        this.mediaStream = null;

        if (this.socket) {
            try {
                this.socket.close();
            } catch (error) {
                console.warn('[XFYUN ASR] 关闭 WebSocket 失败:', error);
            }
            this.socket = null;
        }

        this.resetRuntimeState();
    }

    async createSession(options) {
        const token = localStorage.getItem('token');
        const response = await fetch(`${CONFIG.backend.baseUrl}/asr/xfyun/session`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lang: options.lang || CONFIG.subtitle.lang || 'autodialect',
                roleType: options.roleType ?? CONFIG.subtitle.roleType ?? 0,
                pd: options.pd || CONFIG.subtitle.pd || 'com'
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success || !data.wsUrl) {
            const statusHint = response.status ? `\uff08HTTP ${response.status}\uff09` : '';
            throw new Error(data.message || `\u65e0\u6cd5\u521b\u5efa\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u4f1a\u8bdd${statusHint}`);
        }

        return data;
    }

    openSocket(wsUrl) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(wsUrl);
            socket.binaryType = 'arraybuffer';

            let opened = false;

            socket.onopen = () => {
                opened = true;
                this.socket = socket;
                this.stopRequested = false;
                resolve();
            };

            socket.onmessage = (event) => {
                this.handleServerMessage(event.data);
            };

            socket.onerror = () => {
                if (!opened) {
                    reject(new Error('\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u8fde\u63a5\u5931\u8d25'));
                    return;
                }
                this.onError('\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u8fde\u63a5\u51fa\u73b0\u5f02\u5e38\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
            };

            socket.onclose = (event) => {
                if (!this.stopRequested && !this.serviceEnded) {
                    const detail = event && event.code ? `\uff08\u5173\u95ed\u7801 ${event.code}\uff09` : '';
                    this.onStatus(`\u5b9e\u65f6\u8f6c\u5199\u8fde\u63a5\u5df2\u5173\u95ed${detail}\u3002`);
                }
                if (!opened) {
                    reject(new Error('\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u8fde\u63a5\u5df2\u5173\u95ed'));
                }
            };
        });
    }

    async attachAudioTrack(remoteAudioTrack, targetSampleRate) {
        const mediaStreamTrack = this.extractMediaStreamTrack(remoteAudioTrack);

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.mediaStream = new MediaStream([mediaStreamTrack]);
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.silentGainNode = this.audioContext.createGain();
        this.silentGainNode.gain.value = 0;

        this.processorNode.onaudioprocess = (event) => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                return;
            }

            const inputData = event.inputBuffer.getChannelData(0);
            const pcmChunk = this.resampleTo16kPcm(inputData, event.inputBuffer.sampleRate, targetSampleRate);
            if (pcmChunk.length > 0) {
                this.pendingChunks.push(pcmChunk);
            }
        };

        this.sourceNode.connect(this.processorNode);
        this.processorNode.connect(this.silentGainNode);
        this.silentGainNode.connect(this.audioContext.destination);
    }

    extractMediaStreamTrack(remoteAudioTrack) {
        if (remoteAudioTrack && typeof remoteAudioTrack.getMediaStreamTrack === 'function') {
            return remoteAudioTrack.getMediaStreamTrack();
        }

        if (remoteAudioTrack && remoteAudioTrack._mediaStreamTrack) {
            return remoteAudioTrack._mediaStreamTrack;
        }

        throw new Error('\u5f53\u524d Agora \u97f3\u9891\u8f68\u9053\u65e0\u6cd5\u5bfc\u51fa MediaStreamTrack\uff0c\u65e0\u6cd5\u542f\u52a8\u5b9e\u65f6\u8f6c\u5199\u3002');
    }

    startFramePump(frameBytes, frameIntervalMs) {
        this.frameTimer = window.setInterval(() => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                return;
            }

            const frame = this.dequeueFrame(frameBytes);
            if (frame) {
                this.socket.send(frame);
            }
        }, frameIntervalMs);
    }

    dequeueFrame(frameBytes) {
        if (this.pendingChunks.length === 0) {
            return null;
        }

        let totalAvailable = 0;
        for (let i = 0; i < this.pendingChunks.length; i++) {
            totalAvailable += this.pendingChunks[i].length;
        }

        totalAvailable -= this.chunkOffset;
        if (totalAvailable < frameBytes) {
            return null;
        }

        const frame = new Uint8Array(frameBytes);
        let writeOffset = 0;

        while (writeOffset < frameBytes && this.pendingChunks.length > 0) {
            const chunk = this.pendingChunks[0];
            const available = chunk.length - this.chunkOffset;
            const needed = frameBytes - writeOffset;
            const copyLength = Math.min(available, needed);

            frame.set(chunk.subarray(this.chunkOffset, this.chunkOffset + copyLength), writeOffset);

            writeOffset += copyLength;
            this.chunkOffset += copyLength;

            if (this.chunkOffset >= chunk.length) {
                this.pendingChunks.shift();
                this.chunkOffset = 0;
            }
        }

        return frame.buffer;
    }

    flushRemainingAudio() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        const totalAvailable = this.pendingChunks.reduce((sum, chunk) => sum + chunk.length, 0) - this.chunkOffset;
        if (totalAvailable <= 0) {
            return;
        }

        const frame = new Uint8Array(totalAvailable);
        let writeOffset = 0;

        while (this.pendingChunks.length > 0) {
            const chunk = this.pendingChunks[0];
            const data = chunk.subarray(this.chunkOffset);
            frame.set(data, writeOffset);
            writeOffset += data.length;
            this.pendingChunks.shift();
            this.chunkOffset = 0;
        }

        this.socket.send(frame.buffer);
    }

    sendEndMarker() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        const payload = { end: true };
        if (this.sessionId) {
            payload.sessionId = this.sessionId;
        }

        this.socket.send(JSON.stringify(payload));
    }

    handleServerMessage(rawMessage) {
        let message;
        try {
            message = JSON.parse(rawMessage);
        } catch (error) {
            console.warn('[XFYUN ASR] Received non-JSON message:', rawMessage);
            return;
        }

        const msgType = message.msg_type || message.action || '';
        const action = message.action || message.data?.action || '';

        const serviceError = this.extractServiceError(message);
        if (serviceError) {
            this.serviceEnded = true;
            this.onError(serviceError);
            return;
        }

        if ((msgType === 'action' || msgType === 'started') && (action === '' || action === 'started')) {
            this.sessionId = message.data?.sessionId || message.sid || null;
            this.onStatus('\u5df2\u8fde\u63a5\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\uff0c\u6b63\u5728\u8fd4\u56de\u7ed3\u679c...');
            return;
        }

        if (msgType === 'error' || (message.code && Number(message.code) !== 0)) {
            const code = message.code || message.error_code;
            const reason = message.message || message.desc || message.error_msg || '\u8baf\u98de\u670d\u52a1\u8fd4\u56de\u5f02\u5e38';
            this.onError(`\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u5931\u8d25\uff08${code || 'unknown'}\uff09\uff1a${reason}`);
            return;
        }

        if (msgType === 'result' || message.res_type || message.data) {
            const resultData = message.data || message.result || message;
            const text = this.extractText(resultData);
            if (!text) {
                return;
            }

            const segmentId = this.extractSegmentId(resultData);
            const final = this.isFinalSegment(resultData);

            if (!this.segmentTexts.has(segmentId)) {
                this.segmentOrder.push(segmentId);
            }
            this.segmentTexts.set(segmentId, text);

            const fullText = this.segmentOrder
                .map((id) => this.segmentTexts.get(id))
                .filter(Boolean)
                .join('');

            this.onText(fullText, { segmentId, text, final });
        }
    }

    extractSegmentId(resultData) {
        const rawSegId = resultData.seg_id ?? resultData.segId ?? resultData.segment_id;
        if (rawSegId !== undefined && rawSegId !== null && rawSegId !== '') {
            return String(rawSegId);
        }

        const generatedId = `seg-${this.nextSegmentId}`;
        this.nextSegmentId += 1;
        return generatedId;
    }

    isFinalSegment(resultData) {
        const type = String(resultData.cn?.st?.type ?? resultData.type ?? '');
        return resultData.ls === true || resultData.final === true || resultData.is_final === true || type === '0';
    }

    extractText(resultData) {
        if (!resultData) {
            return '';
        }

        if (typeof resultData.text === 'string' && resultData.text.trim()) {
            return resultData.text.trim();
        }

        if (typeof resultData.result_text === 'string' && resultData.result_text.trim()) {
            return resultData.result_text.trim();
        }

        const wsList = resultData.ws || resultData.cn?.st?.rt?.flatMap((rt) => rt.ws || []) || [];
        if (Array.isArray(wsList) && wsList.length > 0) {
            return wsList
                .flatMap((ws) => ws.cw || [])
                .map((cw) => cw.w || cw.word || '')
                .join('')
                .trim();
        }

        return '';
    }

    resampleTo16kPcm(inputData, inputSampleRate, targetSampleRate) {
        if (!inputData || inputData.length === 0) {
            return new Uint8Array(0);
        }

        const ratio = inputSampleRate / targetSampleRate;
        const outputLength = Math.max(1, Math.round(inputData.length / ratio));
        const pcmData = new Int16Array(outputLength);

        let offsetInput = 0;
        for (let i = 0; i < outputLength; i++) {
            const nextOffsetInput = Math.round((i + 1) * ratio);
            let total = 0;
            let count = 0;

            for (let j = offsetInput; j < nextOffsetInput && j < inputData.length; j++) {
                total += inputData[j];
                count++;
            }

            const sample = count > 0 ? total / count : inputData[Math.min(offsetInput, inputData.length - 1)];
            const clamped = Math.max(-1, Math.min(1, sample));
            pcmData[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
            offsetInput = nextOffsetInput;
        }

        return new Uint8Array(pcmData.buffer);
    }

    resetRuntimeState() {
        this.sessionId = null;
        this.pendingChunks = [];
        this.chunkOffset = 0;
        this.segmentTexts = new Map();
        this.segmentOrder = [];
        this.nextSegmentId = 1;
        this.serviceEnded = false;
    }

    extractServiceError(message) {
        if (!message) {
            return '';
        }

        const action = message.action || message.data?.action || '';
        const code = message.code || message.error_code || message.data?.code || '';
        const reason = message.message
            || message.desc
            || message.error_msg
            || message.data?.message
            || message.data?.desc
            || '';

        if (action === 'end' && code && String(code) !== '0') {
            return `\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u7ed3\u675f\uff08${code}\uff09\uff1a${reason || '\u670d\u52a1\u5df2\u7ed3\u675f'}`;
        }

        if (message.res_type === 'frc' || message.data?.normal === false) {
            return `\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u5f02\u5e38\uff1a${reason || '\u670d\u52a1\u8fd4\u56de\u4e86\u5f02\u5e38\u7ed3\u679c'}`;
        }

        return '';
    }
}
