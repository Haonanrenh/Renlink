/**
 * 果不其然手语数字人 SDK 封装模块
 * 前端不保存长期 AppSecret，只接受后端签发的短期凭证。
 */

class SignLanguageAvatar {
    constructor(options = {}) {
        this.containerId = options.containerId || 'sign-language-avatar';
        this.onReady = options.onReady || (() => {});
        this.onSentenceFinished = options.onSentenceFinished || (() => {});
        this.onSingleSignFinished = options.onSingleSignFinished || (() => {});
        this.onError = options.onError || ((err) => console.error('[SignLanguageAvatar]', err));

        this.sdk = null;
        this.sdkLoaded = false;
        this.sdkReady = false;
        this.initialized = false;
        this.clientToken = null;
    }

    /**
     * 从后端获取短期初始化凭证
     */
    async fetchInitCredential() {
        try {
            const token = window.Renlink && window.Renlink.auth
                ? window.Renlink.auth.getToken()
                : localStorage.getItem('token');
            const response = await fetch(`${CONFIG.backend.baseUrl}/sign-language/init`, {
                method: 'GET',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });

            if (!response.ok) {
                throw new Error('获取手语初始化凭证失败');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || '手语功能未启用');
            }
            if (!data.clientToken) {
                throw new Error('后端未返回短期手语凭证，已阻止前端接收长期密钥');
            }

            return data.clientToken;
        } catch (e) {
            console.error('[SignLanguageAvatar] 获取手语初始化凭证失败:', e);
            throw e;
        }
    }

    /**
     * 加载数字人 SDK
     */
    async loadSDK() {
        if (this.sdkLoaded) {
            return true;
        }

        try {
            console.log('[SignLanguageAvatar] 加载 SDK...');
            // 使用本地 SDK 避免跨域问题
            const module = await import('./yiyu-sdk.js');
            this.sdk = module.yiyu;
            this.sdkLoaded = true;
            console.log('[SignLanguageAvatar] SDK 模块加载成功');
            return true;
        } catch (e) {
            console.error('[SignLanguageAvatar] SDK 加载失败:', e);
            this.onError('SDK 加载失败: ' + e.message);
            return false;
        }
    }

    /**
     * 初始化数字人
     */
    async init() {
        if (this.initialized) {
            console.log('[SignLanguageAvatar] 已初始化');
            return true;
        }

        try {
            console.log('[SignLanguageAvatar] 从后端获取短期初始化凭证...');

            this.clientToken = await this.fetchInitCredential();
            if (!this.clientToken) {
                throw new Error('未获取到短期手语凭证');
            }

            console.log('[SignLanguageAvatar] 初始化数字人...');

            // 加载 SDK
            const loaded = await this.loadSDK();
            if (!loaded) {
                return false;
            }

            // 注册回调 - 必须在 init 之前
            this._setupCallbacks();

            // 等待 onHtmlReady
            await this._waitForHtmlReady();

            // 调用 init
            const initFunc = this._getMethod('init');
            if (!initFunc) {
                throw new Error('init 方法不存在');
            }

            initFunc({
                name: this.clientToken,
                readLocalResource: false,
                draggable: true
            });

            // 等待 onAppReady
            await this._waitForAppReady();

            this.initialized = true;
            console.log('[SignLanguageAvatar] 数字人初始化完成');
            return true;
        } catch (e) {
            console.error('[SignLanguageAvatar] 初始化失败:', e);
            this.onError('初始化失败: ' + e.message);
            return false;
        }
    }

    /**
     * 获取 SDK 方法（兼容不同版本）
     */
    _getMethod(name) {
        if (this.sdk && typeof this.sdk[name] === 'function') {
            return this.sdk[name];
        }
        if (this.sdk && this.sdk.app && typeof this.sdk.app[name] === 'function') {
            return this.sdk.app[name];
        }
        return null;
    }

    /**
     * 设置回调
     */
    _setupCallbacks() {
        // onAppReady - 数字人加载完成
        const onAppReady = this._getMethod('onAppReady');
        if (onAppReady) {
            onAppReady(() => {
                console.log('[SignLanguageAvatar] onAppReady 触发');
                this.sdkReady = true;
                this.onReady();
            });
        }

        // onSingleSignFinished - 单个手势完成
        const onSingleSignFinished = this._getMethod('onSingleSignFinished');
        if (onSingleSignFinished) {
            onSingleSignFinished(() => {
                console.log('[SignLanguageAvatar] 单个手势动作完成');
                this.onSingleSignFinished();
            });
        }

        // onSentenceFinished - 整句翻译完成
        const onSentenceFinished = this._getMethod('onSentenceFinished');
        if (onSentenceFinished) {
            onSentenceFinished(() => {
                console.log('[SignLanguageAvatar] 整句翻译完成');
                this.onSentenceFinished();
            });
        }
    }

    /**
     * 等待 HTML 就绪
     */
    _waitForHtmlReady() {
        return new Promise((resolve) => {
            const onHtmlReady = this._getMethod('onHtmlReady');
            if (onHtmlReady) {
                onHtmlReady(() => {
                    console.log('[SignLanguageAvatar] onHtmlReady 触发');
                    resolve();
                });
                // 超时处理
                setTimeout(() => {
                    console.warn('[SignLanguageAvatar] 等待 onHtmlReady 超时');
                    resolve();
                }, 5000);
            } else {
                resolve();
            }
        });
    }

    /**
     * 等待数字人应用就绪
     */
    _waitForAppReady() {
        return new Promise((resolve) => {
            const checkReady = setInterval(() => {
                if (this.sdkReady) {
                    clearInterval(checkReady);
                    resolve();
                }
            }, 100);

            // 30秒超时（增加超时时间，首次加载可能较慢）
            setTimeout(() => {
                clearInterval(checkReady);
                if (!this.sdkReady) {
                    console.warn('[SignLanguageAvatar] 等待 onAppReady 超时');
                    const error = '手语数字人资源加载超时，可能是网络问题或首次加载较慢。请检查：\n1. 网络连接是否正常\n2. 是否能访问外部资源服务器\n3. 尝试刷新页面重新加载';
                    this.onError(error);
                }
                resolve();
            }, 30000);
        });
    }

    /**
     * 显示数字人
     */
    show() {
        if (!this.sdk) {
            console.warn('[SignLanguageAvatar] SDK 未加载');
            return;
        }

        try {
            const enableFunc = this._getMethod('enableYiyuApp');
            if (enableFunc) {
                enableFunc();
                console.log('[SignLanguageAvatar] 数字人已显示');
            } else {
                console.warn('[SignLanguageAvatar] enableYiyuApp 方法不存在');
            }
        } catch (e) {
            console.error('[SignLanguageAvatar] 显示数字人失败:', e);
            this.onError('显示失败: ' + e.message);
        }
    }

    /**
     * 隐藏数字人
     */
    hide() {
        if (!this.sdk) {
            return;
        }

        try {
            const disableFunc = this._getMethod('disableYiyuApp');
            if (disableFunc) {
                disableFunc();
                console.log('[SignLanguageAvatar] 数字人已隐藏');
            }
        } catch (e) {
            console.error('[SignLanguageAvatar] 隐藏数字人失败:', e);
        }
    }

    /**
     * 翻译文字为手语
     * @param {string} text - 要翻译的文字
     */
    translate(text) {
        if (!this.sdk) {
            console.warn('[SignLanguageAvatar] SDK 未加载');
            return;
        }

        if (!text || !text.trim()) {
            return;
        }

        try {
            const translateFunc = this._getMethod('startTranslate');
            if (translateFunc) {
                console.log('[SignLanguageAvatar] 翻译:', text);
                translateFunc(text);
            } else {
                console.warn('[SignLanguageAvatar] startTranslate 方法不存在');
            }
        } catch (e) {
            console.error('[SignLanguageAvatar] 翻译失败:', e);
            this.onError('翻译失败: ' + e.message);
        }
    }

    /**
     * 检查是否就绪
     */
    isReady() {
        return this.initialized && this.sdkReady;
    }

    /**
     * 检查是否已初始化
     */
    isInitialized() {
        return this.initialized;
    }
}

// 导出为全局变量
window.SignLanguageAvatar = SignLanguageAvatar;
