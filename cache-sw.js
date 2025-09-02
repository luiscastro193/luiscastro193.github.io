"use strict";
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

const {clientsClaim} = workbox.core;
const {registerRoute} = workbox.routing;
const {StaleWhileRevalidate} = workbox.strategies;

function hasUpdated(oldResponse, newResponse) {
	const timestamps = [...arguments].map(response => Date.parse(response.headers.get('last-modified')));
	return Math.abs(timestamps[0] - timestamps[1]) > 10000;
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
