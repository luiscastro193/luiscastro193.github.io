"use strict";
const scope = new URL('.', location.href).pathname;
navigator.serviceWorker.register(new URL('cache-off-sw.js', import.meta.url), {scope});
