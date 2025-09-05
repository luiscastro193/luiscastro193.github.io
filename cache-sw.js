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

async function reloadIfNeeded(oldResponse, newResponse, event) {
	if (await hasUpdated(oldResponse, newResponse)) {
		const clientId = event.resultingClientId || event.clientId;
		clearTimeout(timeouts.get(clientId));
		timeouts.set(clientId, setTimeout(reload, 500, clientId));
	}
}

async function race(cached, response) {
	const raced = await Promise.any([cached, response]);
	return raced?.status == 200 && raced || await cached || response;
}

async function cleanRepeated(request, cache) {
	for (const key of await cache.keys(request, {ignoreSearch: true}))
		if (key.url != request.url) cache.delete(key);
}

addEventListener('fetch', event => {
	const request = event.request;
	if (!isValid(request)) return;
	const mayReload = forcesReload(request);
	const response = fetch(request);
	const cache = caches.open('runtime');
	const cached = cache.then(myCache => myCache.match(request, {ignoreSearch: mayReload}));
	const raced = race(cached, response);
	
	event.respondWith((async () => {
		event.waitUntil(response.then(async myResponse => {
			if (myResponse.status == 200) {
				const myCache = await cache;
				await myCache.put(request, myResponse.clone());
				if (mayReload) cleanRepeated(request, myCache);
				
				if (mayReload && await cached)
					await reloadIfNeeded((await raced).clone(), myResponse.clone(), event);
			}
			else if (myResponse.type == 'opaque' && !await cached)
				console.error(`${request.url} request is not crossorigin`);
		}));
		
		return (await raced).clone();
	})());
});

addEventListener('activate', () => clients.claim());
skipWaiting();
