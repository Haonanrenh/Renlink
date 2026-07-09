(function initializeAuthStore(global) {
    const Renlink = global.Renlink || (global.Renlink = {});
    const TOKEN_KEY = 'renlink.auth.token';
    const USER_KEY = 'renlink.auth.user';
    const LEGACY_TOKEN_KEY = 'token';
    const LEGACY_USER_KEY = 'user';

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
    }

    function getUser() {
        const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch (error) {
            clearSession();
            return null;
        }
    }

    function setSession(token, user) {
        if (!token || !user) {
            throw new Error('Token and user are required');
        }

        const serializedUser = JSON.stringify(user);
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, serializedUser);

        // Keep legacy keys during the migration window for older modules.
        localStorage.setItem(LEGACY_TOKEN_KEY, token);
        localStorage.setItem(LEGACY_USER_KEY, serializedUser);
    }

    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        localStorage.removeItem(LEGACY_USER_KEY);
    }

    function isAuthenticated() {
        return Boolean(getToken() && getUser());
    }

    Renlink.auth = {
        getToken,
        getUser,
        setSession,
        clearSession,
        isAuthenticated
    };
})(window);
