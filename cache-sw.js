"use strict";
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

const {clientsClaim} = workbox.core;
const {registerRoute} = workbox.routing;
const {StaleWhileRevalidate} = workbox.strategies;
const {responsesAreSame} = workbox.broadcastUpdate;
const headers = ['content-length', 'etag', 'last-modified'];

async function reload() {
	for (let client of await clients.matchAll())
		client.navigate(client.url);
}

let timeout;

registerRoute(
	({url}) => url.origin == location.origin,
	new StaleWhileRevalidate({plugins: [{
		cacheDidUpdate: ({oldResponse, newResponse}) => {
			if (oldResponse && !responsesAreSame(oldResponse, newResponse, headers)) {
				clearTimeout(timeout);
				timeout = setTimeout(reload, 1000);
			}
		}
	}]})
);

clientsClaim();
skipWaiting();
