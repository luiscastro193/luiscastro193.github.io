"use strict";
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');
importScripts('https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/xxhash128.umd.min.js');

const {registerRoute} = workbox.routing;
const {StaleWhileRevalidate} = workbox.strategies;
hashwasm.createXXHash128();

async function hash(stream) {
	const hasher = await hashwasm.createXXHash128();
	await stream.pipeTo(new WritableStream({write: chunk => hasher.update(chunk)}));
	return hasher.digest('binary');
}

async function hasUpdated(oldResponse, newResponse) {
	const etags = [...arguments].map(response => response.headers.get('etag')?.trim().replace(/^W\//, ''));
	if (etags[0] && etags[0] == etags[1]) return false;
	const hashes = await Promise.all([...arguments].map(response => hash(response.body)));
	return hashes[0].some((value, index) => value != hashes[1][index]);
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

addEventListener('activate', () => clients.claim());
skipWaiting();
