// Renlink 配置文件
// 注意：网络配置（IP地址）请在根目录的 network-config.js 中修改

// 从 network-config.js 读取网络配置。
// 注意不要在这里重新声明 NETWORK_CONFIG，否则会和根目录脚本里的同名常量冲突。
const RUNTIME_NETWORK_CONFIG = (() => {
    if (typeof globalThis !== 'undefined' && globalThis.NETWORK_CONFIG) {
        return globalThis.NETWORK_CONFIG;
    }

    try {
        return typeof NETWORK_CONFIG !== 'undefined' ? NETWORK_CONFIG : null;
    } catch (e) {
        console.warn('无法加载 network-config.js，使用默认配置');
        return null;
    }
})();

// 如果没有加载到配置，使用当前页面主机名回退
const RESOLVED_SERVER_IP = RUNTIME_NETWORK_CONFIG ? RUNTIME_NETWORK_CONFIG.serverIp : window.location.hostname;

const CONFIG = {
    // Agora 配置
    agora: {
        appId: ''
    },
    
    // 百度 AI 配置（待填写）
    baidu: {
        apiKey: '', // 请在百度AI控制台获取
        secretKey: '' // 请在百度AI控制台获取
    },
    
    // 果不其然配置（长期 AppSecret 存储在后端）
    signLanguage: {
        enabled: true
    },

    // 手语边界手势识别配置（用于切分后续模型推理的视频帧区间）
    gestureRecognition: {
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
        captureFrameData: false
    },

    // 实时字幕配置
    subtitle: {
        provider: 'xfyun_rtasr_llm',
        lang: 'autodialect',
        pd: 'com',
        roleType: 0,
        fallbackToBrowser: false
    },

    // 实时文字转语音配置
    tts: {
        provider: 'xfyun_online_tts',
        vcn: 'x4_xiaoyan',
        customPresetValue: '__custom__',
        voicePresets: [
            { label: '默认小燕', value: 'x4_xiaoyan', description: '通用女声' },
            { label: '小露', value: 'x4_yezi', description: '通用场景女声' },
            { label: '小果', value: 'x4_xiaoguo', description: '新闻播报女声' },
            { label: '小忠', value: 'x4_xiaozhong', description: '新闻播报男声' },
            { label: '超哥', value: 'x4_chaoge', description: '沉稳男声' },
            { label: '明哥', value: 'x4_mingge', description: '阅读男声' },
            { label: '一菲', value: 'x4_yifei', description: '交互女声' }
        ],
        aue: 'lame',
        auf: 'audio/L16;rate=16000',
        tte: 'UTF8',
        speed: 50,
        volume: 50,
        pitch: 50,
        sfl: 1,
        localMonitor: false
    },
    
    // 后端 API（从 network-config.js 读取）
    backend: {
        baseUrl: RUNTIME_NETWORK_CONFIG ? RUNTIME_NETWORK_CONFIG.backend.baseUrl : `http://${RESOLVED_SERVER_IP}:8080/api`,
        wsUrl: RUNTIME_NETWORK_CONFIG ? RUNTIME_NETWORK_CONFIG.backend.wsUrl : `ws://${RESOLVED_SERVER_IP}:8080/ws`
    },
    
    // 通话设置
    call: {
        // 视频配置
        video: {
            width: 640,
            height: 480,
            frameRate: 15
        },
        // 音频配置
        audio: {
            echoCancellation: true,
            noiseSuppression: true
        }
    }
};

// 导出配置（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
