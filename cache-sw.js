"use strict";
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

const {clientsClaim} = workbox.core;
const {registerRoute} = workbox.routing;
const {StaleWhileRevalidate} = workbox.strategies;

async function toHash(blob) {
	return new Uint32Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}

async function hasUpdated(oldResponse, newResponse) {
	const etags = [...arguments].map(response => response.headers.get('etag')?.trim().replace(/^W\//, ''));
	if (etags[0] && etags[0] == etags[1]) return false;
	let bodies = await Promise.all([...arguments].map(response => response.blob()));
	if (bodies[0].size != bodies[1].size) return true;
	bodies = await Promise.all(bodies.map(toHash));
	return bodies[0].some((value, index) => value != bodies[1][index]);
}

const timeouts = new Map();

async function reload(clientId) {
	timeouts.delete(clientId);
	const client = await clients.get(clientId);
	if (client) client.navigate(client.url);
}

registerRoute(
	({url}) => url.origin == location.origin,
	new StaleWhileRevalidate({plugins: [{
		cacheDidUpdate: async ({oldResponse, newResponse, event}) => {
			if (oldResponse && await hasUpdated(oldResponse, newResponse)) {
				const clientId = event.resultingClientId || event.clientId;
				clearTimeout(timeouts.get(clientId));
				timeouts.set(clientId, setTimeout(reload, 500, clientId));
			}
		}
	}]})
);

registerRoute(({request}) => request.destination == 'style', new StaleWhileRevalidate());

clientsClaim();
skipWaiting();
