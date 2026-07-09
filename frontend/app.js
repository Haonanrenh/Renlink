const INTRO_HOLD_MS = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 1100;
const INTRO_TRANSITION_MS = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 980;

let introState = 'idle';
let currentUser = null;

function syncBodyModalState() {
    const hasOpenModal = document.querySelector('.modal.show');
    document.body.classList.toggle('modal-open', Boolean(hasOpenModal));
}

function focusFirstField(modalId) {
    const modal = document.getElementById(modalId);
    const firstField = modal ? modal.querySelector('input, select, textarea') : null;

    if (firstField) {
        window.requestAnimationFrame(() => {
            firstField.focus();
        });
    }
}

function toggleModal(modalId, shouldOpen) {
    const modal = document.getElementById(modalId);

    if (!modal) {
        return;
    }

    modal.classList.toggle('show', shouldOpen);
    syncBodyModalState();

    if (shouldOpen) {
        focusFirstField(modalId);
    }
}

function finishIntroTransition() {
    const introOverlay = document.getElementById('introOverlay');
    const body = document.body;

    if (introOverlay && introOverlay.parentNode) {
        introOverlay.parentNode.removeChild(introOverlay);
    }

    body.classList.remove('intro-active');
    body.classList.remove('intro-reveal');
    body.classList.add('intro-complete');
    introState = 'done';
}

function beginIntroTransition() {
    if (introState === 'revealing' || introState === 'done') {
        return;
    }

    const introOverlay = document.getElementById('introOverlay');
    const body = document.body;

    if (!introOverlay) {
        finishIntroTransition();
        return;
    }

    introState = 'revealing';
    body.classList.add('intro-reveal');
    introOverlay.classList.add('is-exiting');

    window.requestAnimationFrame(() => {
        introOverlay.classList.add('hidden');
    });

    window.setTimeout(() => {
        finishIntroTransition();
    }, INTRO_TRANSITION_MS);
}

function initializeIntroOverlay() {
    const introOverlay = document.getElementById('introOverlay');
    const body = document.body;

    if (!introOverlay) {
        body.classList.add('intro-complete');
        return;
    }

    body.classList.add('intro-active');
    introState = 'holding';

    const autoDismissTimer = window.setTimeout(() => {
        beginIntroTransition();
    }, INTRO_HOLD_MS);

    const skipIntro = () => {
        window.clearTimeout(autoDismissTimer);
        beginIntroTransition();
    };

    introOverlay.addEventListener('click', skipIntro, { once: true });
    window.addEventListener('keydown', skipIntro, { once: true });
}

document.addEventListener('DOMContentLoaded', () => {
    initializeIntroOverlay();

    if (window.Renlink && window.Renlink.auth && window.Renlink.auth.isAuthenticated()) {
        // window.location.href = 'dashboard.html';
    }
});

function openLoginModal() {
    toggleModal('loginModal', true);
    document.getElementById('loginError').classList.remove('show');
    document.getElementById('loginForm').reset();
}

function closeLoginModal() {
    toggleModal('loginModal', false);
}

function openRegisterModal() {
    toggleModal('registerModal', true);
    document.getElementById('registerError').classList.remove('show');
    document.getElementById('registerForm').reset();
}

function closeRegisterModal() {
    toggleModal('registerModal', false);
}

function switchToRegister(e) {
    e.preventDefault();
    closeLoginModal();
    openRegisterModal();
}

function switchToLogin(e) {
    e.preventDefault();
    closeRegisterModal();
    openLoginModal();
}

window.onclick = function(event) {
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');

    if (event.target === loginModal) {
        closeLoginModal();
    }

    if (event.target === registerModal) {
        closeRegisterModal();
    }
};

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
        return;
    }

    closeLoginModal();
    closeRegisterModal();
});

async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = '登录中...';
    errorDiv.classList.remove('show');

    try {
        const data = await window.Renlink.api.post('/auth/login', { username, password });
        currentUser = data.user;
        window.Renlink.auth.setSession(data.token, data.user);
        window.location.href = 'dashboard.html';
    } catch (error) {
        showError(errorDiv, error.message || '网络错误，请确认后端服务已启动。');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '登录';
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const errorDiv = document.getElementById('registerError');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (password !== confirmPassword) {
        showError(errorDiv, '两次输入的密码不一致。');
        return;
    }

    if (password.length < 6) {
        showError(errorDiv, '密码长度至少为 6 位。');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '注册中...';
    errorDiv.classList.remove('show');

    try {
        const data = await window.Renlink.api.post('/auth/register', { username, password });
        currentUser = data.user;
        window.Renlink.auth.setSession(data.token, data.user);
        window.location.href = 'dashboard.html';
    } catch (error) {
        showError(errorDiv, error.message || '网络错误，请确认后端服务已启动。');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '注册';
    }
}

async function logout() {
    try {
        await window.Renlink.api.post('/auth/logout');
    } catch (error) {
        console.error('Logout error:', error);
    }

    window.Renlink.auth.clearSession();
    window.location.reload();
}

function showError(errorDiv, message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}
