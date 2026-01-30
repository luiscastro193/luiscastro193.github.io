"use strict";
const scope = new URL('.', location.href).pathname;
navigator.serviceWorker.register(new URL('cache-sw-off.js', import.meta.url), {scope});
