(function initializeApiClient(global) {
    const Renlink = global.Renlink || (global.Renlink = {});

    function getBaseUrl() {
        return global.CONFIG && global.CONFIG.backend
            ? global.CONFIG.backend.baseUrl
            : 'http://localhost:8080/api';
    }

    async function request(path, options = {}) {
        const headers = new Headers(options.headers || {});
        const token = Renlink.auth && Renlink.auth.getToken ? Renlink.auth.getToken() : null;

        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }

        const response = await fetch(`${getBaseUrl()}${path}`, {
            ...options,
            headers
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = data.message || `请求失败 (${response.status})`;
            const error = new Error(message);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    Renlink.api = {
        request,
        get(path, options = {}) {
            return request(path, { ...options, method: 'GET' });
        },
        post(path, body, options = {}) {
            return request(path, {
                ...options,
                method: 'POST',
                body: body === undefined ? undefined : JSON.stringify(body)
            });
        },
        delete(path, options = {}) {
            return request(path, { ...options, method: 'DELETE' });
        }
    };
})(window);
