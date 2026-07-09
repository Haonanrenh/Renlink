(function initializeGestureRecognitionClient(global) {
    const DEFAULT_CONFIG = {
        holdDurationMs: 1500,
        boundaryCooldownMs: 1200,
        useControlZone: false,
        controlZoneRatio: 0.35,
        inferenceFps: 12,
        sampleFps: 8,
        maxSegmentDurationMs: 10000,
        minHandsForBoundary: 2,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65,
        captureFrameData: false,
        frameImageQuality: 0.72
    };

    const BOUNDARY_LABELS = {
        start: '开始边界',
        stop: '停止边界'
    };

    class GestureRecognitionClient {
        constructor(options = {}) {
            const runtimeConfig = global.CONFIG && global.CONFIG.gestureRecognition
                ? global.CONFIG.gestureRecognition
                : {};

            this.config = {
                ...DEFAULT_CONFIG,
                ...runtimeConfig,
                ...(options.config || {})
            };

            this.onStatus = options.onStatus || (() => {});
            this.onCandidate = options.onCandidate || (() => {});
            this.onBoundary = options.onBoundary || (() => {});
            this.onFrame = options.onFrame || (() => {});
            this.onResults = options.onResults || (() => {});
            this.onError = options.onError || (() => {});

            this.hands = null;
            this.sourceVideo = null;
            this.hiddenVideo = null;
            this.isRunning = false;
            this.loopId = null;
            this.lastInferenceAt = 0;
            this.lastFrameAt = 0;
            this.currentCandidate = null;
            this.emittedCandidateType = null;
            this.lastBoundaryAt = 0;
            this.inferenceInFlight = false;
            this.hasFatalError = false;
            this.frameCanvas = null;
            this.frameContext = null;
        }

        async start(source) {
            if (this.isRunning) {
                return;
            }

            this.ensureMediaPipeReady();
            this.sourceVideo = await this.resolveVideoSource(source);
            this.hands = this.createHands();
            this.isRunning = true;
            this.lastInferenceAt = 0;
            this.lastFrameAt = 0;
            this.currentCandidate = null;
            this.emittedCandidateType = null;
            this.lastBoundaryAt = 0;
            this.inferenceInFlight = false;
            this.hasFatalError = false;
            this.emitStatus('识别已启动，等待边界手势');
            this.runLoop();
        }

        async stop() {
            this.isRunning = false;

            if (this.loopId) {
                global.cancelAnimationFrame(this.loopId);
                this.loopId = null;
            }

            if (this.hands && typeof this.hands.close === 'function') {
                await this.hands.close();
            }

            this.hands = null;
            this.sourceVideo = null;
            this.hiddenVideo = null;
            this.currentCandidate = null;
            this.emittedCandidateType = null;
            this.inferenceInFlight = false;
            this.emitCandidate(null);
            this.emitStatus('识别已停止');
        }

        ensureMediaPipeReady() {
            if (typeof global.Hands === 'undefined') {
                throw new Error('MediaPipe Hands 未加载，请检查网络或刷新页面');
            }
        }

        async resolveVideoSource(source) {
            if (!source) {
                throw new Error('缺少视频源');
            }

            if (source instanceof HTMLVideoElement) {
                await this.waitForVideoReady(source);
                return source;
            }

            if (source && typeof source.getMediaStreamTrack === 'function') {
                return this.createVideoFromTrack(source.getMediaStreamTrack());
            }

            if (source instanceof MediaStreamTrack) {
                return this.createVideoFromTrack(source);
            }

            throw new Error('不支持的视频源类型');
        }

        async createVideoFromTrack(track) {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.srcObject = new MediaStream([track]);
            await video.play();
            this.hiddenVideo = video;
            await this.waitForVideoReady(video);
            return video;
        }

        waitForVideoReady(video) {
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
                return Promise.resolve();
            }

            return new Promise((resolve, reject) => {
                const timeoutId = global.setTimeout(() => {
                    cleanup();
                    reject(new Error('等待摄像头画面超时'));
                }, 8000);

                const cleanup = () => {
                    global.clearTimeout(timeoutId);
                    video.removeEventListener('loadeddata', handleReady);
                    video.removeEventListener('canplay', handleReady);
                    video.removeEventListener('error', handleError);
                };

                const handleReady = () => {
                    if (video.videoWidth > 0) {
                        cleanup();
                        resolve();
                    }
                };

                const handleError = () => {
                    cleanup();
                    reject(new Error('摄像头画面加载失败'));
                };

                video.addEventListener('loadeddata', handleReady);
                video.addEventListener('canplay', handleReady);
                video.addEventListener('error', handleError);
            });
        }

        createHands() {
            const hands = new global.Hands({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
            });

            hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: this.config.minDetectionConfidence,
                minTrackingConfidence: this.config.minTrackingConfidence
            });

            hands.onResults((results) => this.handleResults(results));
            return hands;
        }

        runLoop() {
            if (!this.isRunning) {
                return;
            }

            const now = performance.now();
            const inferenceInterval = 1000 / Math.max(1, this.config.inferenceFps);
            const frameInterval = 1000 / Math.max(1, this.config.sampleFps);

            if (now - this.lastFrameAt >= frameInterval) {
                this.lastFrameAt = now;
                this.emitFrame(now);
            }

            if (!this.inferenceInFlight && now - this.lastInferenceAt >= inferenceInterval) {
                this.lastInferenceAt = now;
                this.inferenceInFlight = true;
                Promise.resolve(this.hands.send({ image: this.sourceVideo }))
                    .catch((error) => {
                        this.handleError(error);
                    })
                    .finally(() => {
                        this.inferenceInFlight = false;
                    });
            }

            this.loopId = global.requestAnimationFrame(() => this.runLoop());
        }

        handleResults(results) {
            if (!this.isRunning) {
                return;
            }

            const hands = this.extractHands(results);
            const boundaryType = this.detectBoundaryType(hands);

            this.onResults({
                raw: results,
                hands,
                controlZoneRatio: this.config.controlZoneRatio,
                boundaryType
            });

            this.updateCandidate(boundaryType, hands);
        }

        extractHands(results) {
            const landmarksList = results.multiHandLandmarks || [];
            return landmarksList.map((landmarks, index) => {
                const classification = this.classifyHand(landmarks);
                const bounds = this.getBounds(landmarks);
                const inControlZone = !this.config.useControlZone || bounds.centerY <= this.config.controlZoneRatio;

                return {
                    index,
                    landmarks,
                    classification,
                    bounds,
                    inControlZone
                };
            });
        }

        detectBoundaryType(hands) {
            const activeHands = this.config.useControlZone
                ? hands.filter((hand) => hand.inControlZone)
                : hands;
            const requiredHands = Math.max(1, this.config.minHandsForBoundary);

            if (activeHands.length < requiredHands) {
                return null;
            }

            const selectedHands = activeHands.slice(0, requiredHands);
            const allOpen = selectedHands.every((hand) => hand.classification.pose === 'open');
            const allFist = selectedHands.every((hand) => hand.classification.pose === 'fist');

            if (allOpen) {
                return 'start';
            }

            if (allFist) {
                return 'stop';
            }

            return null;
        }

        updateCandidate(boundaryType, hands) {
            const now = performance.now();

            if (!boundaryType) {
                this.currentCandidate = null;
                this.emittedCandidateType = null;
                this.emitCandidate({
                    type: null,
                    label: '未检测到有效边界手势',
                    progress: 0,
                    durationMs: 0,
                    handsDetected: hands.length,
                    handsInControlZone: this.countActiveHands(hands)
                });
                return;
            }

            if (!this.currentCandidate || this.currentCandidate.type !== boundaryType) {
                this.currentCandidate = {
                    type: boundaryType,
                    startedAt: now
                };
                this.emittedCandidateType = null;
            }

            const durationMs = now - this.currentCandidate.startedAt;
            const progress = Math.min(1, durationMs / this.config.holdDurationMs);
            const candidatePayload = {
                type: boundaryType,
                label: BOUNDARY_LABELS[boundaryType],
                progress,
                durationMs,
                holdDurationMs: this.config.holdDurationMs,
                handsDetected: hands.length,
                handsInControlZone: this.countActiveHands(hands)
            };

            this.emitCandidate(candidatePayload);

            if (
                progress >= 1
                && this.emittedCandidateType !== boundaryType
                && now - this.lastBoundaryAt >= this.config.boundaryCooldownMs
            ) {
                this.emittedCandidateType = boundaryType;
                this.lastBoundaryAt = now;
                this.onBoundary({
                    type: boundaryType,
                    label: BOUNDARY_LABELS[boundaryType],
                    timestamp: Date.now(),
                    holdDurationMs: Math.round(durationMs),
                    confidence: this.estimateBoundaryConfidence(hands)
                });
            }
        }

        classifyHand(landmarks) {
            const fingerTips = [8, 12, 16, 20];
            const fingerPips = [6, 10, 14, 18];
            const wrist = landmarks[0];
            let extendedFingers = 0;

            const thumbTip = landmarks[4];
            const thumbIp = landmarks[3];
            const thumbMcp = landmarks[2];
            const thumbTipDistance = this.distance(wrist, thumbTip);
            const thumbIpDistance = this.distance(wrist, thumbIp);
            const thumbMcpDistance = this.distance(wrist, thumbMcp);

            if (
                thumbTipDistance > thumbIpDistance * 1.08
                && thumbTipDistance > thumbMcpDistance * 1.18
            ) {
                extendedFingers += 1;
            }

            fingerTips.forEach((tipIndex, position) => {
                const tip = landmarks[tipIndex];
                const pip = landmarks[fingerPips[position]];
                const tipDistance = this.distance(wrist, tip);
                const pipDistance = this.distance(wrist, pip);
                const isRaised = tip.y < pip.y - 0.015;
                const isFartherThanJoint = tipDistance > pipDistance * 1.08;

                if (isRaised && isFartherThanJoint) {
                    extendedFingers += 1;
                }
            });

            const pose = extendedFingers === 5
                ? 'open'
                : extendedFingers === 0
                    ? 'fist'
                    : 'unknown';

            return {
                pose,
                extendedFingers
            };
        }

        getBounds(landmarks) {
            const xs = landmarks.map((point) => point.x);
            const ys = landmarks.map((point) => point.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            return {
                minX,
                maxX,
                minY,
                maxY,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                width: maxX - minX,
                height: maxY - minY
            };
        }

        estimateBoundaryConfidence(hands) {
            const activeHands = this.config.useControlZone
                ? hands.filter((hand) => hand.inControlZone)
                : hands;
            const requiredHands = Math.max(1, this.config.minHandsForBoundary);
            const selectedHands = activeHands.slice(0, requiredHands);

            if (selectedHands.length === 0) {
                return 0;
            }

            const poseScores = selectedHands.map((hand) => {
                if (hand.classification.pose === 'open') {
                    return hand.classification.extendedFingers / 5;
                }

                if (hand.classification.pose === 'fist') {
                    return (5 - hand.classification.extendedFingers) / 5;
                }

                return 0.2;
            });

            const average = poseScores.reduce((sum, value) => sum + value, 0) / poseScores.length;
            return Math.round(Math.min(1, Math.max(0, average)) * 100) / 100;
        }

        emitFrame(timestamp) {
            if (!this.sourceVideo || this.sourceVideo.videoWidth === 0) {
                return;
            }

            const payload = {
                timestamp: Date.now(),
                performanceTimestamp: timestamp,
                width: this.sourceVideo.videoWidth,
                height: this.sourceVideo.videoHeight,
                source: 'local-camera'
            };

            if (this.config.captureFrameData) {
                payload.dataUrl = this.captureFrameDataUrl();
            }

            this.onFrame(payload);
        }

        countActiveHands(hands) {
            return this.config.useControlZone
                ? hands.filter((hand) => hand.inControlZone).length
                : hands.length;
        }

        captureFrameDataUrl() {
            if (!this.frameCanvas) {
                this.frameCanvas = document.createElement('canvas');
                this.frameContext = this.frameCanvas.getContext('2d');
            }

            this.frameCanvas.width = this.sourceVideo.videoWidth;
            this.frameCanvas.height = this.sourceVideo.videoHeight;
            this.frameContext.drawImage(this.sourceVideo, 0, 0, this.frameCanvas.width, this.frameCanvas.height);
            return this.frameCanvas.toDataURL('image/jpeg', this.config.frameImageQuality);
        }

        emitStatus(message) {
            this.onStatus(message);
        }

        emitCandidate(payload) {
            this.onCandidate(payload);
        }

        handleError(error) {
            const message = error && error.message ? error.message : String(error || '手势识别失败');
            if (/memory access out of bounds/i.test(message)) {
                this.hasFatalError = true;
                this.isRunning = false;

                if (this.loopId) {
                    global.cancelAnimationFrame(this.loopId);
                    this.loopId = null;
                }

                this.emitCandidate(null);
                this.emitStatus('手势识别运行异常，请关闭手语模式后重新开启');
                this.onError('手势识别运行异常：MediaPipe 内存访问越界，请关闭手语模式后重新开启或刷新页面');
                return;
            }

            this.onError(message);
        }

        distance(pointA, pointB) {
            const dx = pointA.x - pointB.x;
            const dy = pointA.y - pointB.y;
            const dz = (pointA.z || 0) - (pointB.z || 0);
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
    }

    global.GestureRecognitionClient = GestureRecognitionClient;
})(window);
