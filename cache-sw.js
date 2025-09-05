"use strict";
importScripts('https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/xxhash128.umd.min.js');
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

function forcesReload(request) {
	const url = new URL(request.url);
	return url.origin == location.origin;
}

function isValid(request) {
	return forcesReload(request) || request.destination == 'style';
}

const timeouts = new Map();

async function reload(clientId) {
	timeouts.delete(clientId);
	const client = await clients.get(clientId);
	if (client) client.navigate(client.url);
}

async function cacheDidUpdate(oldResponse, newResponse, event) {
	if (await hasUpdated(oldResponse, newResponse)) {
		const clientId = event.resultingClientId || event.clientId;
		clearTimeout(timeouts.get(clientId));
		timeouts.set(clientId, setTimeout(reload, 500, clientId));
	}
}

addEventListener('fetch', event => {
	const request = event.request;
	if (!isValid(request)) return;
	const mayReload = forcesReload(request);
	
	event.respondWith((async () => {
		const cache = caches.open('runtime');
		const cached = cache.then(myCache => myCache.match(request, {ignoreSearch: mayReload}));
		const response = fetch(request);
		
		event.waitUntil(response.then(async myResponse => {
			if ([200, 203].includes(myResponse.status)) {
				await (await cache).put(request, myResponse.clone());
				
				if (mayReload && await cached)
					await cacheDidUpdate((await cached).clone(), myResponse, event);
			}
		}));
		
		return (await cached || await response).clone();
	})());
});

addEventListener('activate', () => clients.claim());
skipWaiting();
