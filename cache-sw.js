"use strict";
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

const {clientsClaim} = workbox.core;
const {registerRoute} = workbox.routing;
const {StaleWhileRevalidate} = workbox.strategies;

function hasUpdated(oldResponse, newResponse) {
	const etags = [...arguments].map(response => (response.headers.get('etag') || '').trim().replace(/^W\//, ''));
	return etags[0] && etags[1] && etags[0] != etags[1];
}

async function reload() {
	for (const client of await clients.matchAll())
		client.navigate(client.url);
}

let timeout;

registerRoute(
	({url}) => url.origin == location.origin,
	new StaleWhileRevalidate({plugins: [{
		cacheDidUpdate: ({oldResponse, newResponse}) => {
			if (oldResponse && hasUpdated(oldResponse, newResponse)) {
				clearTimeout(timeout);
				timeout = setTimeout(reload, 500);
			}
		}
	}]})
);

registerRoute(({request}) => request.destination == 'style', new StaleWhileRevalidate());

clientsClaim();
skipWaiting();
