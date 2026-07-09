class CallManager {
    constructor() {
        this.callStartTime = null;
        this.timerInterval = null;
        this.isMuted = false;
        this.isVideoOff = false;
        this.isSubtitleEnabled = false;
        this.isSignLanguageEnabled = false;
        this.remoteUsername = '';
        this.currentUsername = '';
        this.channelName = '';
        this.role = null;
        this.invitationId = null;
        this.callAnswered = false;
        this.localAudioTrack = null;
        this.remoteAudioTrack = null;
        this.browserFallbackSource = null;
        this.realtimeReady = false;
        this.subtitleRealtimeBound = false;
        this.rejectionHandlerBound = false;
        this.isTextToSpeechEnabled = false;
        this.isTextToSpeechBusy = false;
        this.ttsPlaybackInterrupted = false;
        this.maxTtsChars = 300;
        this.ttsSettingsOpen = false;
        this.ttsSettingsStorageKey = 'renlink_tts_settings';
        this.ttsSettings = this.loadTtsSettings();
        this.ttsClient = typeof XfyunTtsClient !== 'undefined'
            ? new XfyunTtsClient({
                onStatus: (message) => this.updateTtsStatus(message),
                onError: (message) => this.handleTtsError(message)
            })
            : null;

        // 正在输入状态管理
        this.typingTimeout = null;
        this.isRemoteTyping = false;
        this.typingStatusBound = false;

        this.subtitleStreams = {
            local: this.createSubtitleStream('local'),
            remote: this.createSubtitleStream('remote')
        };

        this.isSignRecognitionEnabled = false;
        this.signRecognitionClient = null;
        this.signRecognitionState = 'idle';
        this.signRecognitionFrames = [];
        this.signRecognitionStartAt = null;
        this.signRecognitionEndAt = null;
        this.signRecognitionStatsTimer = null;
        this.signRecognitionLastSegment = null;
    }

    createSubtitleStream(source) {
        return {
            source,
            client: typeof XfyunRtasrClient !== 'undefined'
                ? new XfyunRtasrClient({
                    onStatus: (message) => this.updateSubtitleStatus(source, message),
                    onText: (_fullText, payload) => this.handleSubtitleResult(source, payload),
                    onError: (message) => this.handleSubtitleError(source, message)
                })
                : null,
            isRunning: false,
            history: [],
            liveText: '',
            status: source === 'local' ? '等待我的麦克风就绪' : '等待对方语音流接入',
            segmentTexts: new Map(),
            lastCommittedNormalized: ''
        };
    }

    async initialize() {
        try {
            const params = new URLSearchParams(window.location.search);
            const channelName = params.get('channel');
            const username = params.get('user');
            this.role = params.get('role');
            this.invitationId = params.get('invitationId');

            if (!channelName) {
                throw new Error('缺少频道名称');
            }

            this.channelName = channelName;
            this.remoteUsername = username || '对方';
            document.getElementById('callUser').textContent = this.remoteUsername;
            this.updateSubtitleSpeakerLabels();
            this.renderAllSubtitleLanes();
            this.initializeTtsPanel();

            await this.setupRealtimeConnection();

            await agoraClient.init();
            await agoraClient.join(channelName);

            const publishedTracks = await agoraClient.createAndPublishTracks(true, true, { allowPartial: true });
            this.localAudioTrack = publishedTracks.audio || null;
            this.updateSubtitleStatus('local', this.localAudioTrack ? '我方字幕待命中' : '本地麦克风未就绪');
            this.applyLocalMediaState(publishedTracks);

            document.getElementById('loading').classList.add('hidden');
            document.getElementById('callStatus').textContent = this.hasLocalMediaWarning(publishedTracks)
                ? '通话中 · 本机媒体受限'
                : '通话中';
            this.startTimer();

            if (this.isSubtitleEnabled) {
                await this.startSubtitleEngines();
            }

            console.log('Call initialized successfully');
        } catch (error) {
            console.error('Failed to initialize call:', error);
            this.showError('连接失败：' + error.message);
        }
    }

    async setupRealtimeConnection() {
        const userStr = localStorage.getItem('user');
        if (!userStr) {
            console.error('[Call] 用户信息不存在，无法连接实时通道');
            return;
        }

        try {
            const user = JSON.parse(userStr);
            this.currentUsername = user.username;

            await wsClient.connect(user.username);
            this.realtimeReady = true;

            if (!this.subtitleRealtimeBound) {
                wsClient.onMessage('subtitle-message', (message) => {
                    this.handleIncomingSubtitle(message);
                });
                this.subtitleRealtimeBound = true;
            }

            if (!this.typingStatusBound) {
                wsClient.onMessage('typing-status', (message) => {
                    this.handleTypingStatus(message);
                });
                this.typingStatusBound = true;
            }

            if (this.role === 'caller' && !this.rejectionHandlerBound) {
                wsClient.onMessage('call-rejected', () => {
                    console.log('[Call] 📨 收到拒绝通知');
                    this.invitationId = null;
                    this.handleCallRejected();
                });
                this.rejectionHandlerBound = true;
            }
        } catch (error) {
            console.error('[Call] ❌ 实时通道初始化失败:', error);
        }
    }

    handleCallRejected() {
        console.log('[Call] 处理通话被拒绝');
        stopSpeechRecognition();

        if (typeof audioManager !== 'undefined') {
            audioManager.playRejectSound();
        }

        this.showRejectionNotification();

        setTimeout(async () => {
            try {
                this.stopTimer();
                await agoraClient.leave();
                window.location.href = 'dashboard.html';
            } catch (error) {
                console.error('[Call] 退出失败:', error);
                window.location.href = 'dashboard.html';
            }
        }, 3000);
    }

    showRejectionNotification() {
        const notification = document.createElement('div');
        notification.className = 'rejection-notification';
        notification.innerHTML = `
            <div class="rejection-content">
                <div class="rejection-icon">📵</div>
                <h2 class="rejection-title">${this.remoteUsername} 拒绝了通话</h2>
                <p class="rejection-message">即将返回主页...</p>
                <div class="rejection-progress"></div>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
    }

    startTimer() {
        this.callStartTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('callTimer').textContent =
                `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    showError(message) {
        const loading = document.getElementById('loading');
        loading.querySelector('.loading-spinner').style.display = 'none';
        loading.querySelector('.loading-text').textContent = message;
        loading.querySelector('.loading-text').style.color = '#ef4444';

        console.error('Call initialization failed:', message);
    }

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    hasLocalMediaWarning(publishedTracks) {
        return Boolean(
            publishedTracks
            && Array.isArray(publishedTracks.errors)
            && publishedTracks.errors.length > 0
        );
    }

    applyLocalMediaState(publishedTracks) {
        this.updateLocalControlAvailability(publishedTracks);

        if (!this.hasLocalMediaWarning(publishedTracks)) {
            return;
        }

        this.renderLocalMediaWarning(publishedTracks);
        const firstError = publishedTracks.errors[0];
        if (firstError && firstError.userMessage) {
            this.updateSubtitleStatus('local', firstError.userMessage);
        }
    }

    updateLocalControlAvailability(publishedTracks) {
        const muteBtn = document.getElementById('muteBtn');
        const videoBtn = document.getElementById('videoBtn');

        if (muteBtn && !publishedTracks.audio) {
            muteBtn.disabled = true;
            muteBtn.classList.add('disabled');
            const label = muteBtn.querySelector('.label');
            if (label) label.textContent = '无麦克风';
        }

        if (videoBtn && !publishedTracks.video) {
            videoBtn.disabled = true;
            videoBtn.classList.add('disabled');
            const label = videoBtn.querySelector('.label');
            if (label) label.textContent = '无摄像头';
        }
    }

    renderLocalMediaWarning(publishedTracks) {
        const localContainer = document.getElementById('local-video-container');
        if (!localContainer || publishedTracks.video) {
            return;
        }

        const mediaSupport = publishedTracks.mediaSupport || {};
        const isInsecureContext = mediaSupport.secureContext === false;
        const currentOrigin = window.location.origin;
        const secureOriginHint = isInsecureContext
            ? `Chrome/Edge 可将 ${currentOrigin} 加入安全来源后重启浏览器。`
            : '请检查浏览器摄像头权限或更换浏览器。';
        const details = publishedTracks.errors
            .map((error) => error.userMessage || error.message)
            .filter(Boolean);
        const uniqueDetails = [...new Set(details)];

        localContainer.innerHTML = `
            <div class="video-label">我的画面</div>
            <div class="local-media-fallback">
                <div class="local-media-icon">!</div>
                <p class="local-media-title">本机摄像头暂不可用</p>
                <p class="local-media-message">${this.escapeHtml(uniqueDetails[0] || '浏览器暂时无法打开摄像头。')}</p>
                <p class="local-media-hint">${this.escapeHtml(secureOriginHint)} 你仍然会留在通话中，可继续观看对方画面。</p>
            </div>
        `;
    }

    getSpeakerLabel(source) {
        if (source === 'local') {
            return '我方';
        }
        return this.remoteUsername ? `对方 · ${this.remoteUsername}` : '对方';
    }

    getSubtitlePlaceholder(source) {
        return source === 'local'
            ? '我方发言后会显示在这里'
            : '对方发言后会显示在这里';
    }

    updateSubtitleSpeakerLabels() {
        const localLabel = document.getElementById('localSubtitleSpeaker');
        const remoteLabel = document.getElementById('remoteSubtitleSpeaker');

        if (localLabel) {
            localLabel.textContent = this.getSpeakerLabel('local');
        }

        if (remoteLabel) {
            remoteLabel.textContent = this.getSpeakerLabel('remote');
        }
    }

    updateSubtitleStatus(source, message) {
        const stream = this.subtitleStreams[source];
        if (!stream) {
            return;
        }

        stream.status = message;
        this.renderSubtitleLane(source);
    }

    handleIncomingSubtitle(message) {
        if (!message) {
            return;
        }

        if (message.channelName && this.channelName && message.channelName !== this.channelName) {
            return;
        }

        if (message.senderUsername && this.remoteUsername && message.senderUsername !== this.remoteUsername) {
            return;
        }

        const remoteStream = this.subtitleStreams.remote;
        const cleanedText = this.cleanSubtitleText(message.text || '');
        if (!cleanedText) {
            return;
        }

        if (message.finalSegment) {
            remoteStream.liveText = '';
            this.commitSubtitleText('remote', cleanedText);
            this.updateSubtitleStatus('remote', `${this.getSpeakerLabel('remote')}字幕已更新`);
            // 对方说话完成时，翻译为手语
            if (this.isSignLanguageEnabled) {
                translateToSignLanguage(cleanedText);
            }
        } else {
            remoteStream.liveText = this.formatLiveSubtitle(cleanedText);
            this.updateSubtitleStatus('remote', `${this.getSpeakerLabel('remote')}正在说话...`);
        }

        this.renderSubtitleLane('remote');
    }

    handleSubtitleError(source, message) {
        const stream = this.subtitleStreams[source];
        if (!stream) {
            return;
        }

        stream.isRunning = false;
        stream.liveText = '';
        console.error(`[Subtitle][${source}] ${message}`);
        this.updateSubtitleStatus(source, message);
    }

    handleSubtitleResult(source, payload) {
        const stream = this.subtitleStreams[source];
        if (!stream || !payload || !payload.text) {
            return;
        }

        const cleanedText = this.cleanSubtitleText(payload.text);
        if (!cleanedText) {
            return;
        }

        const segmentId = payload.segmentId || `segment-${Date.now()}`;
        const normalized = this.normalizeSubtitleText(cleanedText);
        const previousText = stream.segmentTexts.get(segmentId);

        if (previousText && this.normalizeSubtitleText(previousText) === normalized) {
            return;
        }

        stream.segmentTexts.set(segmentId, cleanedText);

        if (payload.final) {
            stream.liveText = '';
            stream.segmentTexts.delete(segmentId);
            this.commitSubtitleText(source, cleanedText);
            this.updateSubtitleStatus(source, `${this.getSpeakerLabel(source)}已更新字幕`);

            if (source === 'local') {
                this.shareSubtitleToRemote(cleanedText, true);
            }

            // 只在对方(remote)说话时翻译为手语
            if (source === 'remote' && this.isSignLanguageEnabled) {
                translateToSignLanguage(cleanedText);
            }
        } else {
            stream.liveText = this.formatLiveSubtitle(cleanedText);
            this.updateSubtitleStatus(source, `${this.getSpeakerLabel(source)}正在说话...`);

            if (source === 'local') {
                this.shareSubtitleToRemote(stream.liveText, false);
            }
        }

        this.renderSubtitleLane(source);
    }

    commitSubtitleText(source, text) {
        const stream = this.subtitleStreams[source];
        if (!stream) {
            return;
        }

        const dedupedText = this.prepareCommittedText(stream, text);
        if (!dedupedText) {
            return;
        }

        const chunks = this.chunkSubtitleText(dedupedText);
        chunks.forEach((chunk) => {
            const normalizedChunk = this.normalizeSubtitleText(chunk);
            const lastItem = stream.history[stream.history.length - 1];
            if (lastItem && lastItem.normalized === normalizedChunk) {
                return;
            }

            stream.history.push({
                text: chunk,
                normalized: normalizedChunk
            });
        });

        stream.history = stream.history.slice(-2);
    }

    prepareCommittedText(stream, text) {
        const cleaned = this.cleanSubtitleText(text);
        const normalized = this.normalizeSubtitleText(cleaned);

        if (!normalized) {
            return '';
        }

        if (normalized === stream.lastCommittedNormalized) {
            return '';
        }

        if (stream.lastCommittedNormalized) {
            const previous = stream.lastCommittedNormalized;
            const overlapRatio = Math.min(normalized.length, previous.length) / Math.max(normalized.length, previous.length);
            const containsEachOther = normalized.includes(previous) || previous.includes(normalized);

            if (containsEachOther && overlapRatio > 0.72) {
                stream.lastCommittedNormalized = normalized.length >= previous.length ? normalized : previous;
                return '';
            }
        }

        stream.lastCommittedNormalized = normalized;
        return cleaned;
    }

    cleanSubtitleText(text) {
        if (!text) {
            return '';
        }

        return text
            .replace(/\s+/g, '')
            .replace(/[，,]{2,}/g, '，')
            .replace(/[。！？!?]{2,}/g, '。')
            .replace(/([。！？!?，,；;、])\1+/g, '$1')
            .trim();
    }

    normalizeSubtitleText(text) {
        if (!text) {
            return '';
        }

        return text
            .replace(/[\s，,。！？!?；;、:“”"'‘’（）()]/g, '')
            .trim();
    }

    formatLiveSubtitle(text) {
        const chunks = this.chunkSubtitleText(text);
        return chunks[chunks.length - 1] || text;
    }

    chunkSubtitleText(text) {
        const cleanText = this.cleanSubtitleText(text);
        if (!cleanText) {
            return [];
        }

        const rawParts = cleanText.match(/[^。！？!?；;]{1,22}[。！？!?；;]?/g) || [cleanText];
        const chunks = [];

        rawParts.forEach((part) => {
            const trimmed = part.trim();
            if (!trimmed) {
                return;
            }

            if (trimmed.length <= 22) {
                chunks.push(trimmed);
                return;
            }

            for (let start = 0; start < trimmed.length; start += 20) {
                chunks.push(trimmed.slice(start, start + 20));
            }
        });

        return chunks.slice(-2);
    }

    renderSubtitleLane(source) {
        const stream = this.subtitleStreams[source];
        if (!stream) {
            return;
        }

        const statusEl = document.getElementById(`${source}SubtitleStatus`);
        const linesEl = document.getElementById(`${source}SubtitleLines`);

        if (statusEl) {
            statusEl.textContent = stream.status;
        }

        if (!linesEl) {
            return;
        }

        const visibleItems = stream.history
            .slice(-2)
            .map((item) => ({ text: item.text, live: false }));

        if (stream.liveText) {
            visibleItems.push({ text: stream.liveText, live: true });
        }

        const lastItems = visibleItems.slice(-2);

        if (lastItems.length === 0) {
            linesEl.innerHTML = `<p class="subtitle-placeholder">${this.escapeHtml(this.getSubtitlePlaceholder(source))}</p>`;
            return;
        }

        linesEl.innerHTML = lastItems
            .map((item) => `
                <p class="subtitle-line${item.live ? ' live' : ''}">
                    ${this.escapeHtml(item.text)}
                </p>
            `)
            .join('');
    }

    renderAllSubtitleLanes() {
        this.renderSubtitleLane('remote');
        this.renderSubtitleLane('local');
    }

    async shareSubtitleToRemote(text, finalSegment) {
        if (!this.realtimeReady || !this.remoteUsername || !this.channelName) {
            return;
        }

        const cleanedText = this.cleanSubtitleText(text);
        if (!cleanedText) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            await fetch(`${CONFIG.backend.baseUrl}/subtitles/share`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    targetUsername: this.remoteUsername,
                    channelName: this.channelName,
                    text: cleanedText,
                    finalSegment
                })
            });
        } catch (error) {
            console.error('[Subtitle] 字幕同步失败:', error);
        }
    }

    resetSubtitleDisplay() {
        Object.values(this.subtitleStreams).forEach((stream) => {
            stream.history = [];
            stream.liveText = '';
            stream.segmentTexts.clear();
            stream.lastCommittedNormalized = '';
            stream.status = stream.source === 'local' ? '等待我的麦克风就绪' : '等待对方语音流接入';
        });

        this.renderAllSubtitleLanes();
    }

    createDefaultTtsSettings() {
        return {
            vcn: (CONFIG.tts.vcn || 'x4_xiaoyan').trim(),
            speed: this.normalizeTtsNumber(CONFIG.tts.speed, 50),
            volume: this.normalizeTtsNumber(CONFIG.tts.volume, 50),
            pitch: this.normalizeTtsNumber(CONFIG.tts.pitch, 50)
        };
    }

    getTtsVoicePresets() {
        if (!Array.isArray(CONFIG.tts.voicePresets)) {
            return [];
        }

        return CONFIG.tts.voicePresets.filter((item) => item && item.value && item.label);
    }

    findTtsVoicePreset(value) {
        return this.getTtsVoicePresets().find((item) => item.value === value) || null;
    }

    normalizeTtsNumber(value, fallback) {
        const normalized = Number(value);
        if (!Number.isFinite(normalized)) {
            return fallback;
        }

        return Math.min(100, Math.max(0, Math.round(normalized)));
    }

    loadTtsSettings() {
        const defaults = this.createDefaultTtsSettings();

        try {
            const rawValue = localStorage.getItem(this.ttsSettingsStorageKey);
            if (!rawValue) {
                return defaults;
            }

            const parsed = JSON.parse(rawValue);
            return {
                vcn: (parsed.vcn || defaults.vcn).trim() || defaults.vcn,
                speed: this.normalizeTtsNumber(parsed.speed, defaults.speed),
                volume: this.normalizeTtsNumber(parsed.volume, defaults.volume),
                pitch: this.normalizeTtsNumber(parsed.pitch, defaults.pitch)
            };
        } catch (error) {
            console.warn('[TTS] Failed to load saved settings:', error);
            return defaults;
        }
    }

    persistTtsSettings() {
        try {
            localStorage.setItem(this.ttsSettingsStorageKey, JSON.stringify(this.ttsSettings));
        } catch (error) {
            console.warn('[TTS] Failed to persist settings:', error);
        }
    }

    bindTtsRangeControl(inputId, valueId) {
        const input = document.getElementById(inputId);
        const valueLabel = document.getElementById(valueId);

        if (!input || !valueLabel || input.dataset.bound === 'true') {
            return;
        }

        valueLabel.textContent = input.value;
        input.addEventListener('input', () => {
            valueLabel.textContent = input.value;
        });
        input.dataset.bound = 'true';
    }

    bindTtsVoicePresetControl() {
        const select = document.getElementById('ttsVoicePresetSelect');
        if (!select) {
            return;
        }

        const customValue = CONFIG.tts.customPresetValue || '__custom__';
        select.innerHTML = [
            ...this.getTtsVoicePresets().map(
                (item) => `<option value="${item.value}">${item.label}${item.description ? ` · ${item.description}` : ''}</option>`
            ),
            `<option value="${customValue}">自定义音色代码</option>`
        ].join('');

        if (select.dataset.bound !== 'true') {
            select.addEventListener('change', () => {
                this.updateTtsVoiceInputVisibility();
            });
            select.dataset.bound = 'true';
        }
    }

    setTtsRangeValue(inputId, valueId, value) {
        const input = document.getElementById(inputId);
        const valueLabel = document.getElementById(valueId);

        if (input) {
            input.value = String(value);
        }

        if (valueLabel) {
            valueLabel.textContent = String(value);
        }
    }

    syncTtsSettingsInputs() {
        const presetSelect = document.getElementById('ttsVoicePresetSelect');
        const voiceInput = document.getElementById('ttsVoiceInput');
        const preset = this.findTtsVoicePreset(this.ttsSettings.vcn);
        const customValue = CONFIG.tts.customPresetValue || '__custom__';

        if (presetSelect) {
            presetSelect.value = preset ? preset.value : customValue;
        }

        if (voiceInput) {
            voiceInput.value = this.ttsSettings.vcn;
        }

        this.setTtsRangeValue('ttsSpeedInput', 'ttsSpeedValue', this.ttsSettings.speed);
        this.setTtsRangeValue('ttsVolumeInput', 'ttsVolumeValue', this.ttsSettings.volume);
        this.setTtsRangeValue('ttsPitchInput', 'ttsPitchValue', this.ttsSettings.pitch);
        this.updateTtsVoiceInputVisibility();
    }

    updateTtsVoiceInputVisibility() {
        const presetSelect = document.getElementById('ttsVoicePresetSelect');
        const customField = document.getElementById('ttsCustomVoiceField');
        const voiceInput = document.getElementById('ttsVoiceInput');
        const customValue = CONFIG.tts.customPresetValue || '__custom__';
        const showCustomInput = !presetSelect || presetSelect.value === customValue;

        if (customField) {
            customField.classList.toggle('hidden', !showCustomInput);
        }

        if (voiceInput) {
            voiceInput.disabled = !showCustomInput || this.isTextToSpeechBusy;
        }
    }

    updateTtsVoiceSummary() {
        const summaryEl = document.getElementById('ttsVoiceSummary');
        if (!summaryEl) {
            return;
        }

        summaryEl.textContent = `当前声音：${this.ttsSettings.vcn} · 语速 ${this.ttsSettings.speed} · 音量 ${this.ttsSettings.volume} · 语调 ${this.ttsSettings.pitch}`;
    }

    refreshTtsVoiceSummary() {
        const summaryEl = document.getElementById('ttsVoiceSummary');
        if (!summaryEl) {
            return;
        }

        const preset = this.findTtsVoicePreset(this.ttsSettings.vcn);
        const voiceLabel = preset
            ? `${preset.label}${preset.description ? `（${preset.description}）` : ''}`
            : `自定义（${this.ttsSettings.vcn}）`;

        summaryEl.textContent = `当前声音：${voiceLabel} · 语速 ${this.ttsSettings.speed} · 音量 ${this.ttsSettings.volume} · 语调 ${this.ttsSettings.pitch}`;
    }

    toggleTtsSettingsPanel(forceOpen = null) {
        const panel = document.getElementById('tts-settings-panel');
        const btn = document.getElementById('ttsSettingsBtn');

        if (!panel || !btn) {
            return;
        }

        const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !this.ttsSettingsOpen;
        this.ttsSettingsOpen = nextOpen;

        if (nextOpen) {
            this.syncTtsSettingsInputs();
            panel.classList.remove('hidden');
            btn.classList.add('active');
            btn.setAttribute('aria-expanded', 'true');
        } else {
            panel.classList.add('hidden');
            btn.classList.remove('active');
            btn.setAttribute('aria-expanded', 'false');
        }
    }

    saveTtsSettings() {
        const presetSelect = document.getElementById('ttsVoicePresetSelect');
        const voiceInput = document.getElementById('ttsVoiceInput');
        const speedInput = document.getElementById('ttsSpeedInput');
        const volumeInput = document.getElementById('ttsVolumeInput');
        const pitchInput = document.getElementById('ttsPitchInput');
        const selectedPresetValue = presetSelect?.value || '';
        const customValue = CONFIG.tts.customPresetValue || '__custom__';

        const vcn = selectedPresetValue && selectedPresetValue !== customValue
            ? selectedPresetValue
            : (voiceInput?.value || '').trim();
        if (!vcn) {
            this.handleTtsError('请先填写发音人或音色代码');
            return;
        }

        this.ttsSettings = {
            vcn,
            speed: this.normalizeTtsNumber(speedInput?.value, CONFIG.tts.speed),
            volume: this.normalizeTtsNumber(volumeInput?.value, CONFIG.tts.volume),
            pitch: this.normalizeTtsNumber(pitchInput?.value, CONFIG.tts.pitch)
        };

        this.persistTtsSettings();
        this.syncTtsSettingsInputs();
        this.refreshTtsVoiceSummary();
        this.toggleTtsSettingsPanel(false);
        this.updateTtsStatus(this.callAnswered ? '发音设置已保存，可开始代发声' : '发音设置已保存，等待对方加入通话');
    }

    cancelTtsSettings() {
        this.syncTtsSettingsInputs();
        this.toggleTtsSettingsPanel(false);
    }

    initializeTtsPanel() {
        const textarea = document.getElementById('ttsTextInput');
        this.bindTtsVoicePresetControl();
        this.bindTtsRangeControl('ttsSpeedInput', 'ttsSpeedValue');
        this.bindTtsRangeControl('ttsVolumeInput', 'ttsVolumeValue');
        this.bindTtsRangeControl('ttsPitchInput', 'ttsPitchValue');
        this.syncTtsSettingsInputs();
        this.refreshTtsVoiceSummary();
        this.toggleTtsSettingsPanel(false);

        if (textarea) {
            textarea.value = '';
            
            // 输入事件 - 字符计数
            textarea.addEventListener('input', () => {
                if (textarea.value.length > this.maxTtsChars) {
                    textarea.value = textarea.value.slice(0, this.maxTtsChars);
                }
                this.updateTtsCharCount();
                
                // 发送正在输入状态
                this.handleTtsTyping();
            });
            
            // 快捷键提交
            textarea.addEventListener('keydown', (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    submitTextToSpeech();
                }
            });
            
            // 失去焦点时停止输入状态
            textarea.addEventListener('blur', () => {
                this.stopTtsTyping();
            });
        }

        this.updateTtsCharCount();
        this.updateTtsStatus(this.callAnswered ? '对方已加入，可开始代发声' : '等待对方加入通话');
        this.setTtsBusy(false);
    }

    /**
     * 处理 TTS 输入框输入事件
     */
    handleTtsTyping() {
        // 清除之前的定时器
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // 发送正在输入状态
        this.sendTypingStatus(true, 'tts');

        // 3秒后自动停止输入状态
        this.typingTimeout = setTimeout(() => {
            this.stopTtsTyping();
        }, 3000);
    }

    /**
     * 停止 TTS 输入状态
     */
    stopTtsTyping() {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
        this.sendTypingStatus(false, 'tts');
    }

    updateTtsCharCount() {
        const textarea = document.getElementById('ttsTextInput');
        const counter = document.getElementById('ttsCharCount');
        if (!textarea || !counter) {
            return;
        }

        counter.textContent = `${textarea.value.length}/${this.maxTtsChars}`;
    }

    updateTtsStatus(message) {
        const statusEl = document.getElementById('ttsStatus');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    handleTtsError(message) {
        console.error(`[TTS] ${message}`);
        this.updateTtsStatus(message);
        this.setTtsBusy(false);
    }

    setTtsBusy(isBusy) {
        this.isTextToSpeechBusy = isBusy;

        const submitBtn = document.getElementById('ttsSubmitBtn');
        const stopBtn = document.getElementById('ttsStopBtn');
        const settingsBtn = document.getElementById('ttsSettingsBtn');
        const settingsSaveBtn = document.getElementById('ttsSettingsSaveBtn');
        const textarea = document.getElementById('ttsTextInput');
        const presetSelect = document.getElementById('ttsVoicePresetSelect');
        const voiceInput = document.getElementById('ttsVoiceInput');
        const speedInput = document.getElementById('ttsSpeedInput');
        const volumeInput = document.getElementById('ttsVolumeInput');
        const pitchInput = document.getElementById('ttsPitchInput');

        if (submitBtn) {
            submitBtn.disabled = isBusy;
            submitBtn.textContent = isBusy ? '播报中...' : '播报给对方';
        }

        if (stopBtn) {
            stopBtn.disabled = !isBusy;
        }

        if (settingsBtn) {
            settingsBtn.disabled = isBusy;
        }

        if (settingsSaveBtn) {
            settingsSaveBtn.disabled = isBusy;
        }

        if (textarea) {
            textarea.disabled = isBusy;
        }

        if (presetSelect) {
            presetSelect.disabled = isBusy;
        }

        if (voiceInput) {
            voiceInput.disabled = isBusy || (presetSelect && presetSelect.value !== (CONFIG.tts.customPresetValue || '__custom__'));
        }

        if (speedInput) {
            speedInput.disabled = isBusy;
        }

        if (volumeInput) {
            volumeInput.disabled = isBusy;
        }

        if (pitchInput) {
            pitchInput.disabled = isBusy;
        }
    }

    collectTtsOptions() {
        return {
            vcn: this.ttsSettings.vcn || CONFIG.tts.vcn,
            speed: this.ttsSettings.speed,
            volume: this.ttsSettings.volume,
            pitch: this.ttsSettings.pitch,
            aue: CONFIG.tts.aue,
            auf: CONFIG.tts.auf,
            tte: CONFIG.tts.tte,
            sfl: CONFIG.tts.sfl
        };
    }

    async submitTextToSpeech() {
        if (this.isTextToSpeechBusy) {
            return;
        }

        if (!this.ttsClient) {
            this.handleTtsError('未加载讯飞文字转语音客户端');
            return;
        }

        if (!this.callAnswered) {
            this.handleTtsError('对方尚未加入通话，暂时无法播报');
            return;
        }

        const textarea = document.getElementById('ttsTextInput');
        const text = (textarea?.value || '').trim();
        if (!text) {
            this.handleTtsError('请输入要播报的文字');
            return;
        }

        this.setTtsBusy(true);
        this.ttsPlaybackInterrupted = false;
        this.updateTtsStatus('正在生成语音...');

        try {
            const synthesisResult = await this.ttsClient.synthesize(text, this.collectTtsOptions());
            this.updateTtsStatus('正在播报给对方...');

            await agoraClient.playSynthesizedSpeech(synthesisResult.blob, {
                localMonitor: CONFIG.tts.localMonitor
            });

            if (this.ttsPlaybackInterrupted) {
                return;
            }

            const cleanedText = this.cleanSubtitleText(text);
            if (cleanedText && this.isSubtitleEnabled) {
                this.commitSubtitleText('local', cleanedText);
                this.renderSubtitleLane('local');
            }

            if (cleanedText && this.realtimeReady) {
                this.shareSubtitleToRemote(cleanedText, true);
            }

            if (cleanedText && this.isSignLanguageEnabled) {
                translateToSignLanguage(cleanedText);
            }

            if (textarea) {
                textarea.value = '';
            }
            this.updateTtsCharCount();
            this.updateTtsStatus('播报完成，可继续输入');
        } catch (error) {
            if (this.ttsPlaybackInterrupted && (error.message || '').includes('已取消播报')) {
                return;
            }
            this.handleTtsError(error.message || '文字转语音失败');
            return;
        } finally {
            this.setTtsBusy(false);
        }
    }

    async stopTextToSpeechPlayback() {
        this.ttsPlaybackInterrupted = true;
        if (this.ttsClient) {
            this.ttsClient.abort();
        }
        agoraClient.stopTtsPlayback();
        this.updateTtsStatus(this.callAnswered ? '已停止播报，可继续输入' : '等待对方加入通话');
        this.setTtsBusy(false);
    }

    async startSubtitleStream(source, track) {
        const stream = this.subtitleStreams[source];
        if (!stream) {
            return false;
        }

        if (!track) {
            this.updateSubtitleStatus(
                source,
                source === 'local' ? '等待我的麦克风就绪' : '等待对方语音流接入'
            );
            return false;
        }

        if (!stream.client) {
            this.handleSubtitleError(source, '未加载讯飞字幕客户端');
            return false;
        }

        if (stream.isRunning) {
            return true;
        }

        try {
            await stream.client.start(track, {
                lang: CONFIG.subtitle.lang,
                roleType: CONFIG.subtitle.roleType,
                pd: CONFIG.subtitle.pd
            });
            stream.isRunning = true;
            return true;
        } catch (error) {
            stream.isRunning = false;
            this.handleSubtitleError(source, error.message || '讯飞实时转写启动失败');
            return false;
        }
    }

    async startSubtitleEngines() {
        if (!this.isSubtitleEnabled) {
            return;
        }

        let started = false;

        if (CONFIG.subtitle.provider === 'xfyun_rtasr_llm') {
            this.updateSubtitleStatus('remote', '等待对方字幕同步');
            const localStarted = await this.startSubtitleStream('local', this.localAudioTrack);
            started = localStarted;

            if (started) {
                return;
            }

            if (!CONFIG.subtitle.fallbackToBrowser) {
                return;
            }
        }

        this.startBrowserSpeechRecognition();
    }

    async stopSubtitleStream(source) {
        const stream = this.subtitleStreams[source];
        if (!stream) {
            return;
        }

        if (stream.client) {
            await stream.client.stop();
        }

        stream.isRunning = false;
        stream.liveText = '';
        stream.segmentTexts.clear();
    }

    async stopAllSubtitleEngines() {
        await Promise.all([
            this.stopSubtitleStream('local'),
            this.stopSubtitleStream('remote')
        ]);

        this.browserFallbackSource = null;
        stopBrowserSpeechRecognition();
    }

    applyBrowserSubtitleText(text, isFinal) {
        const stream = this.subtitleStreams.local;
        const cleanedText = this.cleanSubtitleText(text);

        if (!cleanedText) {
            return;
        }

        if (isFinal) {
            stream.liveText = '';
            this.commitSubtitleText('local', cleanedText);
            this.updateSubtitleStatus('local', '浏览器本地字幕已更新');
        } else {
            stream.liveText = this.formatLiveSubtitle(cleanedText);
            this.updateSubtitleStatus('local', '浏览器正在识别我的发言...');
        }

        this.updateSubtitleStatus('remote', '浏览器兜底仅支持我方字幕');
        this.renderAllSubtitleLanes();
    }

    /**
     * 暂停本地字幕识别（静音时调用）
     */
    async pauseLocalSubtitle() {
        const stream = this.subtitleStreams.local;
        if (!stream || !stream.isRunning) {
            return;
        }

        console.log('[Subtitle] 暂停本地字幕识别');
        await this.stopSubtitleStream('local');
        this.updateSubtitleStatus('local', '已静音，字幕已暂停');
    }

    /**
     * 恢复本地字幕识别（取消静音时调用）
     */
    async resumeLocalSubtitle() {
        const stream = this.subtitleStreams.local;
        if (!stream || stream.isRunning) {
            return;
        }

        console.log('[Subtitle] 恢复本地字幕识别');
        
        if (!this.localAudioTrack) {
            this.updateSubtitleStatus('local', '麦克风未就绪');
            return;
        }

        // 重新启动字幕识别
        const started = await this.startSubtitleStream('local', this.localAudioTrack);
        
        if (started) {
            this.updateSubtitleStatus('local', '字幕已恢复');
        } else {
            this.updateSubtitleStatus('local', '字幕恢复失败，请重新开启字幕');
        }
    }

    /**
     * 发送正在输入状态
     * @param {boolean} isTyping - 是否正在输入
     * @param {string} context - 上下文 (tts/chat)
     */
    sendTypingStatus(isTyping, context = 'tts') {
        if (!this.realtimeReady || !this.remoteUsername) {
            return;
        }

        console.log(`[TypingStatus] 发送状态: isTyping=${isTyping}, context=${context}`);

        wsClient.send('/app/typing-status', {
            username: this.remoteUsername,
            isTyping: isTyping,
            context: context
        });
    }

    /**
     * 处理接收到的正在输入状态
     * @param {Object} message - 输入状态消息
     */
    handleTypingStatus(message) {
        console.log('[TypingStatus] 收到状态:', message);

        // 注意：Java 的 isTyping() getter 序列化后字段名是 typing，不是 isTyping
        const isTyping = message.typing !== undefined ? message.typing : message.isTyping;
        this.isRemoteTyping = isTyping;

        if (message.context === 'tts') {
            this.updateRemoteTtsTypingIndicator(isTyping);
        }
    }

    /**
     * 更新对方正在输入的提示
     * @param {boolean} isTyping - 是否正在输入
     */
    updateRemoteTtsTypingIndicator(isTyping) {
        const remoteVideoContainer = document.getElementById('remote-video-container');
        if (!remoteVideoContainer) return;

        let indicator = remoteVideoContainer.querySelector('.typing-indicator');

        if (isTyping) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'typing-indicator';
                const content = document.createElement('div');
                content.className = 'typing-indicator-content';

                const icon = document.createElement('span');
                icon.className = 'typing-icon';
                icon.textContent = '✍️';

                const text = document.createElement('span');
                text.className = 'typing-text';
                text.textContent = `${this.remoteUsername} 正在输入...`;

                content.appendChild(icon);
                content.appendChild(text);
                indicator.appendChild(content);
                remoteVideoContainer.appendChild(indicator);
            }
        } else {
            if (indicator) {
                indicator.remove();
            }
        }
    }

    getSignRecognitionStateLabel(state = this.signRecognitionState) {
        const labels = {
            idle: '未启动',
            waitingStart: '等待开始手势',
            collecting: '采集中',
            captured: '已截取',
            error: '错误'
        };

        return labels[state] || state;
    }

    setSignRecognitionState(state) {
        this.signRecognitionState = state;
        const stateEl = document.getElementById('signRecognitionState');
        if (stateEl) {
            stateEl.textContent = this.getSignRecognitionStateLabel(state);
        }
        this.updateSignRecognitionButtonState();
    }

    updateSignRecognitionStatus(message) {
        const statusEl = document.getElementById('signRecognitionStatus');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    updateSignRecognitionButtonState() {
        const btn = document.getElementById('signRecognitionBtn');
        if (!btn) {
            return;
        }

        const icon = btn.querySelector('.icon');
        const label = btn.querySelector('.label');
        const isCollecting = this.signRecognitionState === 'collecting';
        const isModeEnabled = this.isSignRecognitionEnabled;

        btn.classList.toggle('hidden', !isModeEnabled);
        btn.disabled = !isModeEnabled;
        btn.classList.toggle('active', isCollecting);
        btn.classList.toggle('muted', isCollecting);
        btn.title = !isModeEnabled
            ? '请先开启手语识别模式'
            : isCollecting ? '停止截取手语片段' : '开始截取手语片段';

        if (icon) {
            icon.textContent = isCollecting ? '停' : '识';
        }

        if (label) {
            label.textContent = isCollecting ? '停止识别' : '开始识别';
        }
    }

    updateSignRecognitionModeButtonState() {
        const btn = document.getElementById('signRecognitionModeBtn');
        if (!btn) {
            return;
        }

        const icon = btn.querySelector('.icon');
        const label = btn.querySelector('.label');

        btn.classList.toggle('active', this.isSignRecognitionEnabled);
        btn.title = this.isSignRecognitionEnabled ? '关闭手语识别模式' : '开启手语识别模式';

        if (icon) {
            icon.textContent = this.isSignRecognitionEnabled ? '开' : '模';
        }

        if (label) {
            label.textContent = this.isSignRecognitionEnabled ? '模式开启' : '手语模式';
        }

        this.updateSignRecognitionButtonState();
    }

    updateSignRecognitionCandidate(payload) {
        const candidateEl = document.getElementById('signRecognitionCandidate');
        const handsEl = document.getElementById('signRecognitionHands');
        const holdEl = document.getElementById('signRecognitionHold');
        const progressEl = document.getElementById('signRecognitionProgressBar');

        if (!payload || !payload.type) {
            if (candidateEl) candidateEl.textContent = '无';
            if (handsEl) handsEl.textContent = payload ? String(payload.handsInControlZone || 0) : '0';
            if (holdEl) holdEl.textContent = '0 ms';
            if (progressEl) progressEl.style.width = '0%';
            return;
        }

        if (candidateEl) candidateEl.textContent = payload.label;
        if (handsEl) handsEl.textContent = String(payload.handsInControlZone || 0);
        if (holdEl) holdEl.textContent = `${Math.round(payload.durationMs)} ms`;
        if (progressEl) progressEl.style.width = `${Math.round(payload.progress * 100)}%`;
    }

    updateSignRecognitionStats() {
        const frameCountEl = document.getElementById('signRecognitionFrameCount');
        const durationEl = document.getElementById('signRecognitionDuration');
        const sampleFpsEl = document.getElementById('signRecognitionSampleFps');
        const config = CONFIG.gestureRecognition || {};

        if (frameCountEl) {
            const count = this.signRecognitionState === 'captured' && this.signRecognitionLastSegment
                ? this.signRecognitionLastSegment.frameCount
                : this.signRecognitionFrames.length;
            frameCountEl.textContent = String(count);
        }

        if (durationEl) {
            let durationMs = 0;
            if (this.signRecognitionState === 'collecting' && this.signRecognitionStartAt) {
                durationMs = Date.now() - this.signRecognitionStartAt;
            } else if (this.signRecognitionLastSegment) {
                durationMs = this.signRecognitionLastSegment.durationMs;
            }
            durationEl.textContent = `${(durationMs / 1000).toFixed(2)} s`;
        }

        if (sampleFpsEl) {
            sampleFpsEl.textContent = `${config.sampleFps || 8} fps`;
        }
    }

    resetSignRecognitionSegment(nextState = null) {
        this.signRecognitionFrames = [];
        this.signRecognitionStartAt = null;
        this.signRecognitionEndAt = null;
        this.signRecognitionLastSegment = null;
        this.setSignRecognitionState(nextState || (this.isSignRecognitionEnabled ? 'waitingStart' : 'idle'));

        const resultEl = document.getElementById('signRecognitionLastResult');
        if (resultEl) {
            resultEl.textContent = '还没有截取区间。';
        }

        this.updateSignRecognitionStats();
    }

    async startSignRecognition() {
        if (this.isSignRecognitionEnabled) {
            return true;
        }

        if (typeof GestureRecognitionClient === 'undefined') {
            this.updateSignRecognitionStatus('未加载手势识别客户端');
            this.setSignRecognitionState('error');
            return false;
        }

        if (!agoraClient.localVideoTrack) {
            this.updateSignRecognitionStatus('本地摄像头未就绪，无法识别手语边界');
            this.setSignRecognitionState('error');
            return false;
        }

        this.signRecognitionClient = new GestureRecognitionClient({
            onStatus: (message) => this.updateSignRecognitionStatus(message),
            onCandidate: (payload) => this.updateSignRecognitionCandidate(payload),
            onBoundary: (event) => this.handleSignRecognitionBoundary(event),
            onFrame: (frame) => this.handleSignRecognitionFrame(frame),
            onError: (message) => {
                this.updateSignRecognitionStatus(message);
                this.setSignRecognitionState('error');
                this.isSignRecognitionEnabled = false;
                this.updateSignRecognitionModeButtonState();
                this.updateSignRecognitionButtonState();
            }
        });

        try {
            await this.signRecognitionClient.start(agoraClient.localVideoTrack);
            this.isSignRecognitionEnabled = true;
            this.resetSignRecognitionSegment('waitingStart');
            this.updateSignRecognitionStatus('手语识别模式已开启，等待开始手势或按钮');
            this.updateSignRecognitionModeButtonState();
            this.updateSignRecognitionButtonState();
            this.signRecognitionStatsTimer = setInterval(() => this.updateSignRecognitionStats(), 200);
            return true;
        } catch (error) {
            console.error('[SignRecognition] 启动失败:', error);
            this.signRecognitionClient = null;
            this.isSignRecognitionEnabled = false;
            this.updateSignRecognitionStatus(error.message || '手语边界识别启动失败');
            this.setSignRecognitionState('error');
            this.updateSignRecognitionModeButtonState();
            this.updateSignRecognitionButtonState();
            return false;
        }
    }

    async stopSignRecognition() {
        if (this.signRecognitionStatsTimer) {
            clearInterval(this.signRecognitionStatsTimer);
            this.signRecognitionStatsTimer = null;
        }

        if (this.signRecognitionClient) {
            await this.signRecognitionClient.stop();
            this.signRecognitionClient = null;
        }

        this.isSignRecognitionEnabled = false;
        this.signRecognitionFrames = [];
        this.signRecognitionStartAt = null;
        this.signRecognitionEndAt = null;
        this.updateSignRecognitionCandidate(null);
        this.updateSignRecognitionStatus('已停止');
        this.setSignRecognitionState('idle');
        this.updateSignRecognitionModeButtonState();
        this.updateSignRecognitionButtonState();
        this.updateSignRecognitionStats();
    }

    handleSignRecognitionBoundary(event) {
        if (!event || !event.type) {
            return;
        }

        if (event.type === 'start') {
            this.beginSignFrameSegment('开始边界手势');
            return;
        }

        if (event.type === 'stop') {
            if (this.signRecognitionState !== 'collecting') {
                this.updateSignRecognitionStatus('检测到停止边界，但当前没有正在采集的区间');
                return;
            }

            this.finalizeSignFrameSegment('停止边界');
        }
    }

    handleSignRecognitionFrame(frame) {
        if (this.signRecognitionState !== 'collecting') {
            return;
        }

        const config = CONFIG.gestureRecognition || {};
        const maxDurationMs = config.maxSegmentDurationMs || 10000;
        const durationMs = Date.now() - this.signRecognitionStartAt;
        this.signRecognitionFrames.push(frame);

        if (durationMs >= maxDurationMs) {
            this.finalizeSignFrameSegment('达到最大区间时长');
        }
    }

    beginSignFrameSegment(reason) {
        if (this.signRecognitionState === 'collecting') {
            this.updateSignRecognitionStatus('正在采集中，检测到新的开始边界已忽略');
            return false;
        }

        this.signRecognitionFrames = [];
        this.signRecognitionStartAt = Date.now();
        this.signRecognitionEndAt = null;
        this.signRecognitionLastSegment = null;
        this.setSignRecognitionState('collecting');
        this.updateSignRecognitionStatus(reason === '按钮'
            ? '已通过按钮开始采集有效帧'
            : '已检测到开始边界，正在采集有效帧');

        const resultEl = document.getElementById('signRecognitionLastResult');
        if (resultEl) {
            resultEl.textContent = '正在采集开始到停止之间的视频帧。';
        }

        this.updateSignRecognitionStats();
        return true;
    }

    finalizeSignFrameSegment(reason) {
        if (this.signRecognitionState !== 'collecting' || !this.signRecognitionStartAt) {
            this.updateSignRecognitionStatus('当前没有正在采集的手语片段');
            return;
        }

        this.signRecognitionEndAt = Date.now();
        const config = CONFIG.gestureRecognition || {};
        const durationMs = this.signRecognitionEndAt - this.signRecognitionStartAt;
        const metadata = {
            frameCount: this.signRecognitionFrames.length,
            startTime: this.signRecognitionStartAt,
            endTime: this.signRecognitionEndAt,
            durationMs,
            sampleFps: config.sampleFps || 8,
            source: 'local-camera',
            reason
        };

        this.signRecognitionLastSegment = metadata;
        this.signRecognitionFrames = [];
        this.setSignRecognitionState('captured');
        this.submitSignFrameSegment(metadata);
        this.updateSignRecognitionStats();
    }

    submitSignFrameSegment(metadata) {
        const resultEl = document.getElementById('signRecognitionLastResult');
        if (resultEl) {
            resultEl.textContent = `已截取区间：${metadata.frameCount} 帧，${(metadata.durationMs / 1000).toFixed(2)} 秒。等待 signlen 接入。`;
        }

        this.updateSignRecognitionStatus('区间已截取，等待模型接入');
        console.log('[SignRecognition] frame segment ready:', metadata);
    }
}


const callManager = window.Renlink
    ? window.Renlink.registerModule('call', new CallManager())
    : new CallManager();

window.addEventListener('load', () => {
    callManager.initialize();
});

function goBack() {
    if (confirm('确定要结束通话吗？')) {
        hangup();
    }
}

async function toggleMute() {
    const btn = document.getElementById('muteBtn');
    if (!btn) {
        return;
    }

    btn.disabled = true;

    try {
        const enabled = await agoraClient.toggleMute();

        callManager.isMuted = !enabled;

        if (callManager.isMuted) {
            btn.classList.add('muted');
            btn.querySelector('.icon').textContent = '🔇';
            btn.querySelector('.label').textContent = '已静音';
            
            // 静音时暂停本地字幕识别
            if (callManager.isSubtitleEnabled) {
                console.log('[Subtitle] 静音时暂停本地字幕识别');
                await callManager.pauseLocalSubtitle();
            }
        } else {
            btn.classList.remove('muted');
            btn.querySelector('.icon').textContent = '🎤';
            btn.querySelector('.label').textContent = '静音';
            
            // 取消静音时恢复本地字幕识别
            if (callManager.isSubtitleEnabled) {
                console.log('[Subtitle] 取消静音时恢复本地字幕识别');
                await callManager.resumeLocalSubtitle();
            }
        }
    } catch (error) {
        console.error('Failed to toggle mute:', error);
    } finally {
        btn.disabled = false;
    }
}

async function toggleVideo() {
    const btn = document.getElementById('videoBtn');
    if (!btn) {
        return;
    }

    btn.disabled = true;

    try {
        const enabled = await agoraClient.toggleVideo();

        callManager.isVideoOff = !enabled;

        if (callManager.isVideoOff) {
            btn.classList.add('muted');
            btn.querySelector('.icon').textContent = '📹';
            btn.querySelector('.label').textContent = '已关闭';
            if (callManager.isSignRecognitionEnabled) {
                await callManager.stopSignRecognition();
                const signRecognitionModeBtn = document.getElementById('signRecognitionModeBtn');
                const signRecognitionBtn = document.getElementById('signRecognitionBtn');
                const signRecognitionContainer = document.getElementById('sign-recognition-container');
                if (signRecognitionModeBtn) signRecognitionModeBtn.classList.remove('active');
                if (signRecognitionBtn) signRecognitionBtn.classList.remove('active');
                if (signRecognitionContainer) signRecognitionContainer.classList.add('hidden');
            }
        } else {
            btn.classList.remove('muted');
            btn.querySelector('.icon').textContent = '📹';
            btn.querySelector('.label').textContent = '摄像头';
        }
    } catch (error) {
        console.error('Failed to toggle video:', error);
    } finally {
        btn.disabled = false;
    }
}

function toggleSubtitle() {
    const btn = document.getElementById('subtitleBtn');
    const container = document.getElementById('subtitle-container');

    callManager.isSubtitleEnabled = !callManager.isSubtitleEnabled;

    if (callManager.isSubtitleEnabled) {
        btn.classList.add('active');
        container.classList.remove('hidden');
        callManager.resetSubtitleDisplay();
        startSpeechRecognition();
    } else {
        btn.classList.remove('active');
        container.classList.add('hidden');
        stopSpeechRecognition();
    }
}

function toggleTextToSpeech() {
    const btn = document.getElementById('ttsBtn');
    const container = document.getElementById('tts-container');

    callManager.isTextToSpeechEnabled = !callManager.isTextToSpeechEnabled;

    if (callManager.isTextToSpeechEnabled) {
        btn.classList.add('active');
        container.classList.remove('hidden');
        callManager.updateTtsStatus(callManager.callAnswered ? '对方已加入，可开始代发声' : '等待对方加入通话');
    } else {
        btn.classList.remove('active');
        container.classList.add('hidden');
        callManager.toggleTtsSettingsPanel(false);
        callManager.stopTextToSpeechPlayback();
    }
}

function toggleTtsSettings() {
    callManager.toggleTtsSettingsPanel();
}

function saveTtsSettings() {
    callManager.saveTtsSettings();
}

function cancelTtsSettings() {
    callManager.cancelTtsSettings();
}

async function submitTextToSpeech() {
    await callManager.submitTextToSpeech();
}

async function stopTextToSpeechPlayback() {
    await callManager.stopTextToSpeechPlayback();
}

function toggleSignLanguage() {
    const btn = document.getElementById('signLanguageBtn');
    const container = document.getElementById('sign-language-container');

    callManager.isSignLanguageEnabled = !callManager.isSignLanguageEnabled;

    if (callManager.isSignLanguageEnabled) {
        btn.classList.add('active');
        container.classList.remove('hidden');
        initSignLanguage();
    } else {
        btn.classList.remove('active');
        container.classList.add('hidden');
    }
}

async function toggleSignRecognitionMode() {
    const btn = document.getElementById('signRecognitionModeBtn');
    const container = document.getElementById('sign-recognition-container');

    if (!btn || !container) {
        return;
    }

    btn.disabled = true;

    try {
        if (!callManager.isSignRecognitionEnabled) {
            container.classList.remove('hidden');
            await callManager.startSignRecognition();
        } else {
            if (callManager.signRecognitionState === 'collecting') {
                callManager.finalizeSignFrameSegment('关闭手语识别模式');
            }
            await callManager.stopSignRecognition();
            container.classList.add('hidden');
        }
    } finally {
        callManager.updateSignRecognitionModeButtonState();
        callManager.updateSignRecognitionButtonState();
        btn.disabled = false;
    }
}

async function toggleSignRecognition() {
    const btn = document.getElementById('signRecognitionBtn');
    const container = document.getElementById('sign-recognition-container');

    if (!btn || !container) {
        return;
    }

    btn.disabled = true;

    try {
        container.classList.remove('hidden');

        if (!callManager.isSignRecognitionEnabled) {
            callManager.updateSignRecognitionStatus('请先开启手语识别模式');
            callManager.updateSignRecognitionButtonState();
            return;
        }

        if (callManager.signRecognitionState === 'collecting') {
            callManager.finalizeSignFrameSegment('按钮');
        } else {
            callManager.beginSignFrameSegment('按钮');
        }
    } finally {
        callManager.updateSignRecognitionButtonState();
        btn.disabled = false;
    }
}

async function hangup() {
    try {
        console.log('[Call] hangup 被调用');
        console.log('[Call] role:', callManager.role);
        console.log('[Call] callAnswered:', callManager.callAnswered);
        console.log('[Call] invitationId:', callManager.invitationId);

        await stopSpeechRecognition();

        if (typeof audioManager !== 'undefined') {
            audioManager.stopRingtone();
        }

        await callManager.stopSignRecognition();

        await callManager.stopTextToSpeechPlayback();

        if (callManager.role === 'caller' && !callManager.callAnswered && callManager.invitationId) {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${CONFIG.backend.baseUrl}/call-invitations/${callManager.invitationId}/cancel`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[Call] ❌ 取消邀请失败:', errorText);
                }
            } catch (error) {
                console.error('[Call] ❌ 取消邀请异常:', error);
            }
        }

        callManager.stopTimer();

        const loading = document.getElementById('loading');
        loading.classList.remove('hidden');
        loading.querySelector('.loading-text').textContent = '正在结束通话...';

        await agoraClient.leave();

        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 500);
    } catch (error) {
        console.error('Failed to hangup:', error);
        window.location.href = 'dashboard.html';
    }
}

function onChannelJoined(uid) {
    console.log('Channel joined, UID:', uid);
}

function onRemoteVideoReady(user) {
    console.log('Remote video ready:', user.uid);
    document.getElementById('callStatus').textContent = '通话中';
    callManager.callAnswered = true;
    callManager.updateTtsStatus('对方已加入，可开始代发声');
}

function onRemoteAudioReady(audioTrack) {
    console.log('Remote audio ready');
    callManager.remoteAudioTrack = audioTrack;
    if (!callManager.callAnswered) {
        callManager.callAnswered = true;
        callManager.updateTtsStatus('对方已加入，可开始代发声');
    }
    callManager.updateSubtitleStatus('remote', '等待对方字幕同步');
}

function onRemoteUserLeft(user) {
    console.log('Remote user left:', user.uid);
    callManager.callAnswered = false;
    callManager.updateTtsStatus('对方已离开，代发声功能已暂停');
    document.getElementById('callStatus').textContent = '对方已离开';
    stopSpeechRecognition();

    setTimeout(() => {
        hangup();
    }, 3000);
}

let recognition = null;

async function startSpeechRecognition() {
    if (!callManager.isSubtitleEnabled) {
        return;
    }

    await callManager.startSubtitleEngines();
}

async function stopSpeechRecognition() {
    await callManager.stopAllSubtitleEngines();
}

function startBrowserSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        callManager.handleSubtitleError('local', '浏览器不支持本地语音识别');
        callManager.updateSubtitleStatus('remote', '当前未成功连接讯飞实时转写');
        return;
    }

    if (recognition) {
        recognition.stop();
        recognition = null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';
    callManager.browserFallbackSource = 'local';

    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        if (finalTranscript) {
            callManager.applyBrowserSubtitleText(finalTranscript, true);
        } else if (interimTranscript) {
            callManager.applyBrowserSubtitleText(interimTranscript, false);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        callManager.handleSubtitleError('local', '浏览器本地语音识别失败：' + event.error);
    };

    recognition.start();
}

function stopBrowserSpeechRecognition() {
    if (recognition) {
        recognition.stop();
        recognition = null;
    }
}

let signLanguageAvatar = null;

function initSignLanguage() {
    const container = document.getElementById('sign-language-avatar');

    if (!CONFIG.signLanguage.enabled) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666;">
                <p style="font-size: 3rem; margin-bottom: 1rem;">🤟</p>
                <p>手语功能已禁用</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">
                    请在后端配置中启用手语功能
                </p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #666;">
            <p style="font-size: 3rem; margin-bottom: 1rem;">🤟</p>
            <p>手语数字人准备中...</p>
        </div>
    `;

    // 创建并初始化数字人（只接受后端短期凭证）
    signLanguageAvatar = new SignLanguageAvatar({
        containerId: 'sign-language-avatar',
        onReady: () => {
            console.log('[Call] 数字人已就绪');
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #666;">
                    <p style="font-size: 3rem; margin-bottom: 1rem;">🤟</p>
                    <p>手语数字人已就绪</p>
                    <p style="font-size: 0.875rem; margin-top: 0.5rem; color: #888;">
                        对方说话时会自动翻译为手语
                    </p>
                </div>
            `;
            // 显示数字人
            signLanguageAvatar.show();
        },
        onSentenceFinished: () => {
            console.log('[Call] 手语翻译完成');
        },
        onError: (err) => {
            console.error('[Call] 数字人错误:', err);
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #ff6b6b;">
                    <p style="font-size: 3rem; margin-bottom: 1rem;">⚠️</p>
                    <p>手语功能初始化失败</p>
                    <p style="font-size: 0.875rem; margin-top: 0.5rem;">
                        ${err}
                    </p>
                </div>
            `;
        }
    });

    // 初始化数字人
    signLanguageAvatar.init();
}

function translateToSignLanguage(text) {
    if (!signLanguageAvatar || !signLanguageAvatar.isReady()) {
        return;
    }

    if (!text || !text.trim()) {
        return;
    }

    console.log('[Call] 翻译为手语:', text);
    signLanguageAvatar.translate(text);
}
