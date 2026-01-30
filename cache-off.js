"use strict";
navigator.serviceWorker.addEventListener('message', () => {
	navigator.serviceWorker.controller?.postMessage(null);
	location.reload();
}, {once: true});

const scope = new URL('.', location.href).pathname;
navigator.serviceWorker.register(new URL('cache-off-sw.js', import.meta.url), {scope});
