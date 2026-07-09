// Sign Learning Module - 离线学习区的中国手语词句学习
class SignLearningModule {
    constructor() {
        this.catalog = Array.isArray(window.SIGN_LEARNING_CATALOG) ? window.SIGN_LEARNING_CATALOG : [];
        this.filteredItems = [];
        this.currentCategory = 'all';
        this.currentItem = null;
        this.initialized = false;
        this.active = false;
        this.avatar = null;
        this.avatarInitPromise = null;
        this.pageSize = 48;
        this.currentPage = 1;
        this.storageKeyBase = 'renlink.signLearning.progress.v2';
        this.storageUserKey = this.getStorageKey();
        this.progress = this.loadProgress();
        this.openProgressType = null;
        this.handleLearningScroll = this.handleLearningScroll.bind(this);
        this.categories = [
            { id: 'all', label: '全部' },
            { id: 'greeting', label: '问候' },
            { id: 'time', label: '时间' },
            { id: 'traffic', label: '交通' },
            { id: 'medical', label: '医疗' },
            { id: 'campus', label: '校园' },
            { id: 'shopping', label: '购物' },
            { id: 'help', label: '求助' },
            { id: 'people', label: '人物' },
            { id: 'place', label: '地点' },
            { id: 'action', label: '动作' },
            { id: 'food', label: '饮食' },
            { id: 'number', label: '数字' },
            { id: 'nature', label: '自然' },
            { id: 'general', label: '通用' }
        ];
    }

    initialize() {
        if (this.initialized) {
            return;
        }

        this.cacheElements();
        if (!this.root || !this.grid) {
            console.warn('[SignLearning] 学习模块 DOM 未就绪');
            return;
        }

        this.syncUserProgress({ rerender: false });
        this.bindEvents();
        if (this.totalText) this.totalText.textContent = String(this.catalog.length);
        this.renderCategories();
        this.applyFilters();

        if (this.filteredItems.length > 0) {
            this.selectItem(this.filteredItems[0].id, { scroll: false });
        }

        this.initialized = true;
        console.log('[SignLearning] 初始化完成，条目数量:', this.catalog.length);
    }

    activate() {
        if (!this.initialized) {
            this.initialize();
        }

        if (!this.root) {
            return;
        }

        this.syncUserProgress();

        if (!this.active) {
            window.addEventListener('scroll', this.handleLearningScroll, { passive: true });
            this.active = true;
        }

        this.handleLearningScroll();
    }

    deactivate() {
        if (this.active) {
            window.removeEventListener('scroll', this.handleLearningScroll);
            this.active = false;
        }

        this.restoreFloatingNav();
    }

    cacheElements() {
        this.root = document.getElementById('learningModule');
        this.searchInput = document.getElementById('signLearningSearch');
        this.categoryList = document.getElementById('signLearningCategories');
        this.grid = document.getElementById('signLearningGrid');
        this.emptyState = document.getElementById('signLearningEmpty');
        this.pagination = document.getElementById('signLearningPagination');
        this.prevPageButton = document.getElementById('signLearningPrevPage');
        this.nextPageButton = document.getElementById('signLearningNextPage');
        this.pageSummary = document.getElementById('signLearningPageSummary');
        this.pageInput = document.getElementById('signLearningPageInput');
        this.backTopButton = document.getElementById('signLearningBackTopBtn');
        this.floatingNavbar = document.querySelector('.floating-navbar');
        this.progressSummary = document.getElementById('signLearningProgressSummary');
        this.favoriteCount = document.getElementById('signLearningFavoriteCount');
        this.learnedCount = document.getElementById('signLearningLearnedCount');
        this.progressPanel = document.querySelector('[data-testid="sign-learning-progress"]');
        this.favoriteEntry = document.getElementById('signLearningFavorites');
        this.learnedEntry = document.getElementById('signLearningLearned');
        this.favoriteHint = document.getElementById('signLearningFavoriteHint');
        this.learnedHint = document.getElementById('signLearningLearnedHint');
        this.progressDetail = document.getElementById('signLearningProgressDetail');
        this.progressDetailTitle = document.getElementById('signLearningProgressDetailTitle');
        this.progressDetailList = document.getElementById('signLearningProgressDetailList');
        this.progressClose = document.getElementById('signLearningProgressClose');
        this.countText = document.getElementById('signLearningCount');
        this.totalText = document.getElementById('signLearningTotal');
        this.playerTitle = document.getElementById('signLearningPlayerTitle');
        this.playerMeta = document.getElementById('signLearningPlayerMeta');
        this.playerStatus = document.getElementById('signLearningPlayerStatus');
        this.video = document.getElementById('signLearningVideo');
        this.avatarPanel = document.getElementById('signLearningAvatarPanel');
        this.avatarText = document.getElementById('signLearningAvatarText');
        this.datasetId = document.getElementById('signLearningDatasetId');
        this.notes = document.getElementById('signLearningNotes');
        this.favoriteButton = document.getElementById('signLearningFavoriteBtn');
        this.learnedButton = document.getElementById('signLearningLearnedBtn');
        this.playButton = document.getElementById('signLearningPlayBtn');
    }

    bindEvents() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.applyFilters({ resetPage: true }));
        }

        if (this.categoryList) {
            this.categoryList.addEventListener('click', (event) => {
                const button = event.target.closest('[data-sign-category]');
                if (!button) return;
                this.currentCategory = button.getAttribute('data-sign-category');
                this.applyFilters({ resetPage: true });
            });
        }

        this.grid.addEventListener('click', (event) => {
            const actionButton = event.target.closest('[data-sign-action]');
            if (actionButton) {
                const id = actionButton.getAttribute('data-sign-id');
                const action = actionButton.getAttribute('data-sign-action');
                this.toggleProgress(id, action);
                return;
            }

            const card = event.target.closest('[data-sign-card]');
            if (card) {
                this.selectItem(card.getAttribute('data-sign-id'), { scroll: true });
            }
        });

        this.grid.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const card = event.target.closest('[data-sign-card]');
            if (!card) return;
            event.preventDefault();
            this.selectItem(card.getAttribute('data-sign-id'), { scroll: true });
        });

        if (this.favoriteButton) {
            this.favoriteButton.addEventListener('click', () => {
                if (this.currentItem) this.toggleProgress(this.currentItem.id, 'favorite');
            });
        }

        if (this.learnedButton) {
            this.learnedButton.addEventListener('click', () => {
                if (this.currentItem) this.toggleProgress(this.currentItem.id, 'learned');
            });
        }

        if (this.playButton) {
            this.playButton.addEventListener('click', () => this.playCurrentItem());
        }

        if (this.prevPageButton) {
            this.prevPageButton.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        }

        if (this.nextPageButton) {
            this.nextPageButton.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        }

        if (this.pageInput) {
            this.pageInput.addEventListener('change', () => {
                this.goToPage(Number(this.pageInput.value));
            });
            this.pageInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.goToPage(Number(this.pageInput.value));
                }
            });
        }

        if (this.backTopButton) {
            this.backTopButton.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        if (this.progressPanel) {
            this.progressPanel.addEventListener('click', (event) => {
                const opener = event.target.closest('[data-sign-progress-open]');
                if (opener) {
                    this.toggleProgressDetail(opener.getAttribute('data-sign-progress-open'));
                    return;
                }

                if (event.target.closest('[data-sign-progress-close]') || event.target === this.progressClose) {
                    this.openProgressType = null;
                    this.renderProgressPanel();
                    return;
                }

                const itemButton = event.target.closest('[data-sign-progress-item]');
                if (itemButton) {
                    this.selectItem(itemButton.getAttribute('data-sign-id'), { scroll: true });
                }
            });

            this.progressPanel.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const itemButton = event.target.closest('[data-sign-progress-item]');
                if (!itemButton) return;
                event.preventDefault();
                this.selectItem(itemButton.getAttribute('data-sign-id'), { scroll: true });
            });
        }
    }

    renderCategories() {
        const counts = this.catalog.reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + 1;
            return acc;
        }, { all: this.catalog.length });

        this.categoryList.innerHTML = this.categories.map((category) => `
            <button
                type="button"
                class="sign-category-btn${category.id === this.currentCategory ? ' active' : ''}"
                data-sign-category="${this.escapeHtml(category.id)}"
            >
                <span>${this.escapeHtml(category.label)}</span>
                <strong>${counts[category.id] || 0}</strong>
            </button>
        `).join('');
    }

    applyFilters(options = {}) {
        const { resetPage = true } = options;
        const query = (this.searchInput ? this.searchInput.value : '').trim().toLowerCase();
        if (resetPage) {
            this.currentPage = 1;
        }

        this.filteredItems = this.catalog.filter((item) => {
            const matchesCategory = this.currentCategory === 'all' || item.category === this.currentCategory;
            const searchable = [
                item.text,
                item.type,
                item.category,
                item.difficulty,
                ...(item.tags || [])
            ].join(' ').toLowerCase();
            const matchesQuery = !query || searchable.includes(query);
            return matchesCategory && matchesQuery;
        });

        this.renderCategories();
        this.renderGrid();
        this.renderProgressPanel();

        if (this.currentItem && !this.filteredItems.some((item) => item.id === this.currentItem.id)) {
            if (this.filteredItems.length > 0) {
                this.selectItem(this.filteredItems[0].id, { scroll: false });
            } else {
                this.clearPlayer();
            }
        }
    }

    renderGrid() {
        const totalItems = this.filteredItems.length;
        const totalPages = Math.max(Math.ceil(totalItems / this.pageSize), 1);
        this.currentPage = Math.min(Math.max(this.currentPage, 1), totalPages);

        const startIndex = (this.currentPage - 1) * this.pageSize;
        const visibleItems = this.filteredItems.slice(startIndex, startIndex + this.pageSize);
        const rangeStart = totalItems === 0 ? 0 : startIndex + 1;
        const rangeEnd = totalItems === 0 ? 0 : startIndex + visibleItems.length;

        if (this.countText) {
            this.countText.textContent = totalItems > 0
                ? `第 ${this.currentPage} / ${totalPages} 页，显示 ${rangeStart}-${rangeEnd} / ${totalItems} 个词语`
                : `当前显示 0 / 0 个词语，共 ${this.catalog.length} 个学习内容`;
        }

        if (this.emptyState) {
            this.emptyState.classList.toggle('hidden', totalItems > 0);
        }

        this.updatePagination(totalItems, totalPages, rangeStart, rangeEnd);

        this.grid.innerHTML = visibleItems.map((item) => {
            const state = this.getItemState(item.id);
            const isActive = this.currentItem && this.currentItem.id === item.id;
            const modeText = item.videoUrl ? '本地视频' : '数字人';

            return `
                <article
                    class="sign-card${isActive ? ' active' : ''}${state.learned ? ' learned' : ''}"
                    data-sign-card
                    data-sign-id="${this.escapeHtml(item.id)}"
                    tabindex="0"
                    role="button"
                    aria-label="学习 ${this.escapeHtml(item.text)}"
                >
                    <div class="sign-card-main">
                        <div>
                            <span class="sign-card-type">${this.escapeHtml(this.getTypeLabel(item.type))}</span>
                            <h3>${this.escapeHtml(item.text)}</h3>
                        </div>
                        <span class="sign-card-mode">${modeText}</span>
                    </div>
                    <p class="sign-card-tags">${this.escapeHtml((item.tags || []).slice(0, 3).join(' · '))}</p>
                    <div class="sign-card-meta">
                        <span>${this.escapeHtml(item.difficulty)}</span>
                        <span>${this.escapeHtml(modeText)}</span>
                    </div>
                    <div class="sign-card-actions">
                        <button type="button" data-sign-action="favorite" data-sign-id="${this.escapeHtml(item.id)}">
                            ${state.favorite ? '已收藏' : '收藏'}
                        </button>
                        <button type="button" data-sign-action="learned" data-sign-id="${this.escapeHtml(item.id)}">
                            ${state.learned ? '已学' : '标记已学'}
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    updatePagination(totalItems, totalPages, rangeStart, rangeEnd) {
        if (this.pagination) {
            this.pagination.classList.toggle('hidden', totalItems === 0);
        }

        if (this.pageSummary) {
            this.pageSummary.textContent = totalItems > 0
                ? `第 ${this.currentPage} / ${totalPages} 页，显示 ${rangeStart}-${rangeEnd} / ${totalItems} 个词语`
                : '第 0 / 0 页';
        }

        if (this.pageInput) {
            this.pageInput.max = String(totalPages);
            this.pageInput.value = String(this.currentPage);
            this.pageInput.disabled = totalItems === 0;
        }

        if (this.prevPageButton) {
            this.prevPageButton.disabled = this.currentPage <= 1 || totalItems === 0;
        }

        if (this.nextPageButton) {
            this.nextPageButton.disabled = this.currentPage >= totalPages || totalItems === 0;
        }
    }

    goToPage(page) {
        const totalPages = Math.max(Math.ceil(this.filteredItems.length / this.pageSize), 1);
        const nextPage = Math.min(Math.max(Number.isFinite(page) ? Math.trunc(page) : 1, 1), totalPages);
        if (nextPage === this.currentPage) {
            if (this.pageInput) this.pageInput.value = String(this.currentPage);
            return;
        }

        this.currentPage = nextPage;
        this.renderGrid();

        const library = this.root ? this.root.querySelector('.sign-learning-library') : null;
        if (library) {
            library.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    selectItem(id, options = {}) {
        const item = this.catalog.find((entry) => entry.id === id);
        if (!item) return;

        this.currentItem = item;
        const state = this.getItemState(item.id);

        if (this.playerTitle) this.playerTitle.textContent = item.text;
        if (this.playerMeta) {
            this.playerMeta.textContent = `${this.getCategoryLabel(item.category)} · ${this.getTypeLabel(item.type)} · ${item.difficulty}`;
        }
        if (this.playerStatus) {
            this.playerStatus.textContent = item.videoUrl ? '手语视频已载入，可直接播放。' : '当前使用中文手语数字人演示。';
        }
        if (this.avatarText) this.avatarText.textContent = item.avatarText || item.text;
        if (this.datasetId) this.datasetId.textContent = item.videoUrl ? '本地视频' : '数字人演示';
        if (this.notes) this.notes.textContent = '选择词语后可观看对应手语视频，也可以收藏或标记已学。';

        if (this.video && this.avatarPanel) {
            if (item.videoUrl) {
                this.video.src = item.videoUrl;
                this.video.load();
                this.video.classList.remove('hidden');
                this.avatarPanel.classList.add('hidden');
            } else {
                this.video.removeAttribute('src');
                this.video.classList.add('hidden');
                this.avatarPanel.classList.remove('hidden');
            }
        }

        this.updatePlayerActions(state);
        this.renderGrid();
        this.renderProgressPanel();

        if (options.scroll && this.root) {
            this.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    clearPlayer() {
        this.currentItem = null;
        if (this.playerTitle) this.playerTitle.textContent = '请选择词句';
        if (this.playerMeta) this.playerMeta.textContent = '没有匹配结果';
        if (this.playerStatus) this.playerStatus.textContent = '调整搜索或分类后继续学习。';
        if (this.video) this.video.classList.add('hidden');
        if (this.avatarPanel) this.avatarPanel.classList.remove('hidden');
        if (this.avatarText) this.avatarText.textContent = '无匹配词句';
        if (this.datasetId) this.datasetId.textContent = '暂无内容';
        if (this.notes) this.notes.textContent = '未找到对应词句。';
    }

    async playCurrentItem() {
        if (!this.currentItem) return;

        if (this.currentItem.videoUrl && this.video) {
            try {
                await this.video.play();
                this.setStatus('正在播放手语视频。');
            } catch (error) {
                console.warn('[SignLearning] 视频播放被浏览器阻止或加载失败:', error);
                this.setStatus('视频已载入，请使用播放器控件开始播放。');
            }
            return;
        }

        this.setStatus('正在准备中文手语数字人演示...');

        try {
            const ready = await this.ensureAvatarReady();
            if (!ready) {
                this.setStatus('数字人暂不可用。仍可先查看词句并稍后重试。', true);
                return;
            }

            this.avatar.show();
            this.avatar.translate(this.currentItem.avatarText || this.currentItem.text);
            this.setStatus(`正在演示：${this.currentItem.avatarText || this.currentItem.text}`);
        } catch (error) {
            console.error('[SignLearning] 数字人播放失败:', error);
            this.setStatus('数字人初始化失败，请确认后端手语配置和网络可用。', true);
        }
    }

    async ensureAvatarReady() {
        if (this.avatar && this.avatar.isReady()) {
            return true;
        }

        if (typeof SignLanguageAvatar === 'undefined') {
            this.setStatus('未加载 SignLanguageAvatar，无法启动数字人演示。', true);
            return false;
        }

        if (!this.avatar) {
            this.avatar = new SignLanguageAvatar({
                containerId: 'sign-learning-avatar-runtime',
                onReady: () => this.setStatus('数字人已就绪，可以开始演示。'),
                onError: (message) => this.setStatus(String(message || '数字人演示发生错误。'), true)
            });
        }

        if (!this.avatarInitPromise) {
            this.avatarInitPromise = this.avatar.init();
        }

        return this.avatarInitPromise;
    }

    toggleProgress(id, action) {
        const state = this.getItemState(id);
        if (action === 'favorite') {
            state.favorite = !state.favorite;
        }
        if (action === 'learned') {
            state.learned = !state.learned;
        }

        state.updatedAt = new Date().toISOString();
        if (!state.favorite && !state.learned) {
            delete this.progress[id];
        } else {
            this.progress[id] = state;
        }
        this.saveProgress();

        if (this.currentItem && this.currentItem.id === id) {
            this.updatePlayerActions(state);
        }

        this.renderGrid();
        this.renderProgressPanel();
    }

    renderProgressPanel() {
        const favorites = this.getProgressItems('favorite');
        const learned = this.getProgressItems('learned');
        const activeItems = this.openProgressType === 'favorite' ? favorites : learned;
        const activeTitle = this.openProgressType === 'favorite' ? '我的收藏' : '已学习内容';

        if (this.progressSummary) {
            this.progressSummary.textContent = `收藏 ${favorites.length} 个 · 已学 ${learned.length} 个`;
        }

        if (this.favoriteCount) this.favoriteCount.textContent = String(favorites.length);
        if (this.learnedCount) this.learnedCount.textContent = String(learned.length);
        if (this.favoriteHint) this.favoriteHint.textContent = favorites.length > 0 ? `点击查看 ${favorites.length} 个收藏内容` : '暂无收藏内容';
        if (this.learnedHint) this.learnedHint.textContent = learned.length > 0 ? `点击查看 ${learned.length} 个已学习内容` : '暂无已学习内容';
        if (this.favoriteEntry) {
            this.favoriteEntry.classList.toggle('active', this.openProgressType === 'favorite');
            this.favoriteEntry.setAttribute('aria-expanded', String(this.openProgressType === 'favorite'));
        }
        if (this.learnedEntry) {
            this.learnedEntry.classList.toggle('active', this.openProgressType === 'learned');
            this.learnedEntry.setAttribute('aria-expanded', String(this.openProgressType === 'learned'));
        }

        if (!this.progressDetail || !this.progressDetailList || !this.openProgressType) {
            if (this.progressDetail) this.progressDetail.classList.add('hidden');
            return;
        }

        this.progressDetail.classList.remove('hidden');
        if (this.progressDetailTitle) this.progressDetailTitle.textContent = activeTitle;
        this.renderProgressList(
            this.progressDetailList,
            activeItems,
            this.openProgressType === 'favorite' ? '还没有收藏内容。' : '还没有标记已学的内容。'
        );
    }

    toggleProgressDetail(type) {
        if (type !== 'favorite' && type !== 'learned') return;
        this.openProgressType = this.openProgressType === type ? null : type;
        this.renderProgressPanel();
    }

    renderProgressList(container, items, emptyText) {
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = `<p class="sign-progress-empty">${this.escapeHtml(emptyText)}</p>`;
            return;
        }

        container.innerHTML = items.map((item) => {
            const isActive = this.currentItem && this.currentItem.id === item.id;
            return `
                <button
                    type="button"
                    class="sign-progress-chip${isActive ? ' active' : ''}"
                    data-sign-progress-item
                    data-sign-id="${this.escapeHtml(item.id)}"
                >
                    <span>${this.escapeHtml(item.text)}</span>
                    <em>${this.escapeHtml(this.getCategoryLabel(item.category))}</em>
                </button>
            `;
        }).join('');
    }

    getProgressItems(flag) {
        const touchedAt = (id) => {
            const timestamp = this.progress[id] && this.progress[id].updatedAt;
            const value = timestamp ? Date.parse(timestamp) : 0;
            return Number.isFinite(value) ? value : 0;
        };

        return this.catalog
            .filter((item) => this.progress[item.id] && this.progress[item.id][flag])
            .sort((left, right) => touchedAt(right.id) - touchedAt(left.id));
    }

    updatePlayerActions(state) {
        if (this.favoriteButton) {
            this.favoriteButton.textContent = state.favorite ? '取消收藏' : '收藏';
            this.favoriteButton.classList.toggle('active', state.favorite);
        }

        if (this.learnedButton) {
            this.learnedButton.textContent = state.learned ? '已学会' : '标记已学';
            this.learnedButton.classList.toggle('active', state.learned);
        }

        if (this.playButton) {
            this.playButton.textContent = this.currentItem && this.currentItem.videoUrl ? '播放视频' : '播放数字人演示';
        }
    }

    getItemState(id) {
        return this.progress[id] || { favorite: false, learned: false };
    }

    getCurrentUsername() {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            return String(user.username || 'guest').trim() || 'guest';
        } catch (error) {
            return 'guest';
        }
    }

    getStorageKey() {
        return `${this.storageKeyBase}.${encodeURIComponent(this.getCurrentUsername())}`;
    }

    syncUserProgress(options = {}) {
        const { rerender = true } = options;
        const nextKey = this.getStorageKey();
        if (nextKey === this.storageUserKey) {
            return;
        }

        this.storageUserKey = nextKey;
        this.progress = this.loadProgress();

        if (rerender) {
            this.renderGrid();
            this.renderProgressPanel();
            if (this.currentItem) {
                this.updatePlayerActions(this.getItemState(this.currentItem.id));
            }
        }
    }

    loadProgress() {
        try {
            const stored = localStorage.getItem(this.storageUserKey || this.getStorageKey());
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.warn('[SignLearning] 学习进度读取失败:', error);
            return {};
        }
    }

    saveProgress() {
        try {
            localStorage.setItem(this.storageUserKey || this.getStorageKey(), JSON.stringify(this.progress));
        } catch (error) {
            console.warn('[SignLearning] 学习进度保存失败:', error);
        }
    }

    handleLearningScroll() {
        if (!this.active) return;

        const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        const hideNav = scrollTop > 160;
        if (this.floatingNavbar) {
            this.floatingNavbar.classList.toggle('learning-nav-hidden', hideNav);
        }

        if (this.backTopButton) {
            this.backTopButton.classList.toggle('hidden', !hideNav);
        }
    }

    restoreFloatingNav() {
        if (this.floatingNavbar) {
            this.floatingNavbar.classList.remove('learning-nav-hidden');
        }

        if (this.backTopButton) {
            this.backTopButton.classList.add('hidden');
        }
    }

    setStatus(message, isError = false) {
        if (!this.playerStatus) return;
        this.playerStatus.textContent = message;
        this.playerStatus.classList.toggle('error', Boolean(isError));
    }

    getCategoryLabel(category) {
        const entry = this.categories.find((item) => item.id === category);
        return entry ? entry.label : category;
    }

    getTypeLabel(type) {
        return type === 'phrase' ? '短句' : '字词';
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

window.SignLearningModule = SignLearningModule;
