(function () {
    const frame = document.getElementById('operationsWorkspaceFrame');
    const hint = document.getElementById('operationsWorkspaceLoading');
    if (!frame) return;
    let sessionUser = '';
    function clear() {
        frame.removeAttribute('src');
        frame.style.height = '800px';
        sessionUser = '';
        if (hint) hint.hidden = false;
    }
    function open(userId) {
        if (!userId) return clear();
        if (sessionUser === userId && frame.getAttribute('src')) return;
        clear();
        sessionUser = userId;
        const url = new URL('/operations-control', window.location.origin);
        url.searchParams.set('embedded', '1');
        const params = new URLSearchParams(window.location.search);
        for (const key of ['query', 'from', 'to', 'dateBasis', 'period']) {
            if (params.has(key)) url.searchParams.set(key, params.get(key));
        }
        frame.src = url.pathname + url.search;
    }
    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.type !== 'scd-operations-size') return;
        const height = event.data.height;
        if (typeof height !== 'number' || !Number.isFinite(height) || height < 1 || height > 1000000) return;
        frame.style.height = Math.max(800, Math.ceil(height)) + 'px';
        if (hint) hint.hidden = true;
    });
    window.addEventListener('storage', event => {
        if (['scdTransportWebSession', 'scdTransportWebUser', 'scdTransportWebAuth'].includes(event.key)) clear();
    });
    window.OperationsWorkspace = { open, clear };
})();
