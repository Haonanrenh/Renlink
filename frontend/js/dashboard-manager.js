// Dashboard Manager - 管理主控制台的核心逻辑
class DashboardManager {
    constructor() {
        this.currentModule = 'onlineCall';
        this.authToken = null;
        this.currentUser = null;
    }

    // 初始化控制台
    async initialize() {
        // 验证认证状态
        if (!this.verifyAuth()) {
            this.redirectToLogin();
            return;
        }

        // 加载用户信息
        this.loadUserInfo();

        // 设置导航事件监听
        this.setupNavigation();

        // 显示默认模块
        this.switchModule('onlineCall');
    }

    // 验证认证
    verifyAuth() {
        if (!window.Renlink || !window.Renlink.auth || !window.Renlink.auth.isAuthenticated()) {
            return false;
        }

        this.authToken = window.Renlink.auth.getToken();
        this.currentUser = window.Renlink.auth.getUser();
        return true;
    }

    // 加载用户信息
    loadUserInfo() {
        if (this.currentUser) {
            const usernameElement = document.getElementById('sidebarUsername');
            if (usernameElement) {
                usernameElement.textContent = this.currentUser.username;
            }
        }
    }

    // 设置导航
    setupNavigation() {
        console.log('[Dashboard] 设置导航事件监听...');
        const navItems = document.querySelectorAll('.floating-nav-item');
        console.log('[Dashboard] 找到导航项数量:', navItems.length);
        
        navItems.forEach((item, index) => {
            const moduleName = item.getAttribute('data-module');
            console.log(`[Dashboard] 导航项 ${index}:`, moduleName);
            
            item.addEventListener('click', () => {
                console.log('[Dashboard] 点击导航:', moduleName);
                this.switchModule(moduleName);
            });
        });
    }

    // 切换模块
    switchModule(moduleName) {
        console.log('[Dashboard] 切换模块:', moduleName);
        const previousModule = this.currentModule;

        if (
            previousModule === 'learning' &&
            moduleName !== 'learning' &&
            window.signLearningModule &&
            typeof window.signLearningModule.deactivate === 'function'
        ) {
            window.signLearningModule.deactivate();
        }
        
        // 隐藏所有模块
        const modules = document.querySelectorAll('.module');
        console.log('[Dashboard] 找到模块数量:', modules.length);
        modules.forEach(module => {
            module.classList.remove('active');
        });

        // 显示目标模块
        const targetModule = document.getElementById(`${moduleName}Module`);
        console.log('[Dashboard] 目标模块:', targetModule ? targetModule.id : 'null');
        if (targetModule) {
            targetModule.classList.add('active');
        } else {
            console.error('[Dashboard] 未找到模块:', `${moduleName}Module`);
        }

        // 更新导航高亮
        const navItems = document.querySelectorAll('.floating-nav-item');
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-module') === moduleName) {
                item.classList.add('active');
            }
        });

        this.currentModule = moduleName;
        console.log('[Dashboard] 当前模块:', this.currentModule);

        if (moduleName === 'friends' && window.friendsModule && typeof window.friendsModule.loadFriends === 'function') {
            window.friendsModule.loadFriends();
        }

        if (moduleName === 'learning') {
            if (!window.signLearningModule && typeof SignLearningModule !== 'undefined') {
                window.signLearningModule = new SignLearningModule();
            }

            if (window.signLearningModule && typeof window.signLearningModule.initialize === 'function') {
                window.signLearningModule.initialize();
            }

            if (window.signLearningModule && typeof window.signLearningModule.activate === 'function') {
                window.signLearningModule.activate();
            }
        }
    }

    // 登出
    async logout() {
        try {
            await window.Renlink.api.post('/auth/logout');
        } catch (error) {
            console.error('Logout error:', error);
        }

        // 清除本地状态
        window.Renlink.auth.clearSession();

        // 重定向到登录页
        this.redirectToLogin();
    }

    // 重定向到登录页
    redirectToLogin() {
        window.location.href = 'index.html';
    }

    // 显示通知
    showNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: ${type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            animation: slideIn 0.3s;
        `;

        document.body.appendChild(notification);

        // 3秒后自动移除
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}
