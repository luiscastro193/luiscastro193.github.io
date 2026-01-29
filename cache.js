"use strict";
navigator.serviceWorker.addEventListener('message', () => {
	navigator.serviceWorker.controller?.postMessage(null);
	location.reload();
}, {once: true});

navigator.serviceWorker.register(new URL('cache-sw.min.js', import.meta.url));
