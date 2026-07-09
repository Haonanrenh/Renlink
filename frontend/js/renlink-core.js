(function initializeRenlink(global) {
    const Renlink = global.Renlink || {};

    Renlink.config = Renlink.config || (global.CONFIG || {});
    Renlink.modules = Renlink.modules || {};

    Renlink.registerModule = function registerModule(name, instance) {
        if (!name) {
            throw new Error('Module name is required');
        }
        Renlink.modules[name] = instance;
        return instance;
    };

    Renlink.getModule = function getModule(name) {
        return Renlink.modules[name] || null;
    };

    Renlink.escapeHtml = function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    global.Renlink = Renlink;
})(window);
