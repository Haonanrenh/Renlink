/**
 * Renlink 网络配置文件
 * 
 * 使用说明：
 * 1. 本地开发：保持 SERVER_IP = 'localhost'
 * 2. 局域网访问：修改 SERVER_IP 为你的局域网 IP（如 '192.168.1.100'）
 * 3. 获取本机 IP：在 CMD 中运行 ipconfig，查找 IPv4 地址
 */

// ==================== 核心配置 ====================
// 只需要修改这一个地方！
const SERVER_IP = (typeof window !== 'undefined' && window.location && window.location.hostname)
    ? window.location.hostname
    : 'localhost';
// ==================================================

const BACKEND_PORT = 8080;
const FRONTEND_PORT = 3000;

// 自动生成所有 URL
const NETWORK_CONFIG = {
    // 服务器 IP
    serverIp: SERVER_IP,
    
    // 后端配置
    backend: {
        host: SERVER_IP,
        port: BACKEND_PORT,
        baseUrl: `http://${SERVER_IP}:${BACKEND_PORT}/api`,
        wsUrl: `ws://${SERVER_IP}:${BACKEND_PORT}/ws`,
        fullUrl: `http://${SERVER_IP}:${BACKEND_PORT}`
    },
    
    // 前端配置
    frontend: {
        host: SERVER_IP,
        port: FRONTEND_PORT,
        baseUrl: `http://${SERVER_IP}:${FRONTEND_PORT}`,
        accessUrl: `http://${SERVER_IP}:${FRONTEND_PORT}/frontend/index.html`
    },
    
    // 显示配置信息
    getInfo() {
        return `
========================================
Renlink 网络配置
========================================
服务器 IP: ${this.serverIp}

后端服务:
  - 地址: ${this.backend.fullUrl}
  - API: ${this.backend.baseUrl}
  - WebSocket: ${this.backend.wsUrl}

前端服务:
  - 地址: ${this.frontend.baseUrl}
  - 访问: ${this.frontend.accessUrl}

局域网访问:
  1. 确保设备连接同一 WiFi
  2. 访问: ${this.frontend.accessUrl}
========================================
        `.trim();
    }
};

// 暴露到浏览器全局，方便前端页面直接复用。
if (typeof globalThis !== 'undefined') {
    globalThis.NETWORK_CONFIG = NETWORK_CONFIG;
}

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NETWORK_CONFIG;
}

// 在控制台显示配置信息
console.log(NETWORK_CONFIG.getInfo());
