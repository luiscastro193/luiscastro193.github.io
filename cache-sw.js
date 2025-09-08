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

const myClients = new Map();

function getClient(clientId) {
	let client = myClients.get(clientId);
	
	if (!client) {
		client = {petitions: 0};
		myClients.set(clientId, client);
	}
	
	return client;
}

async function markReload(oldResponse, newResponse, client) {
	if (!client.reload && await hasUpdated(oldResponse, newResponse))
		client.reload = true;
}

async function reload(clientId) {
	const client = await clients.get(clientId);
	if (client) await client.navigate(client.url);
}

async function reloadIfNeeded(client, clientId) {
	return new Promise(resolve => {setTimeout(() => {
		client.petitions--;
		
		if (client.petitions <= 0) {
			myClients.delete(clientId);
			if (client.reload) resolve(reload(clientId));
		}
		
		resolve();
	})});
}

async function race(cached, response) {
	const raced = await Promise.any([cached, response]);
	return raced?.status == 200 && raced || await cached || response;
}

async function cleanRepeated(request, cache) {
	const matches = await cache.keys(request, {ignoreSearch: true});
	await Promise.all(matches.slice(0, -1).map(key => cache.delete(key)));
}

async function safeFetch(request, event) {
	return event.preloadResponse
		.then(myResponse => myResponse || fetch(request))
		.catch(() => fetch(request, {cache: 'force-cache'}));
}

function defaultHandler(request, event) {
	if (request.method == 'GET') event.respondWith(safeFetch(request, event));
}

addEventListener('fetch', event => {
	const request = event.request;
	if (!isValid(request)) return defaultHandler(request, event);
	const mayReload = forcesReload(request);
	const response = safeFetch(request, event);
	const cache = caches.open('runtime');
	const cached = cache.then(myCache => myCache.match(request, {ignoreSearch: mayReload}));
	const raced = race(cached, response);
	event.respondWith(raced.then(myRaced => myRaced.clone()));
	
	if (mayReload) {
		var clientId = event.resultingClientId || event.clientId;
		var client = getClient(clientId);
		client.petitions++;
	}
	
	event.waitUntil(response.then(async myResponse => {
		if (myResponse.status == 200) {
			const myCache = await cache;
			await myCache.put(request, myResponse.clone());
			
			if (mayReload && await cached) {
				await Promise.all([
					markReload((await raced).clone(), myResponse.clone(), client),
					cleanRepeated(request, myCache)
				]);
			}
		}
		else if (myResponse.status == 206 && await cached)
			await (await cache).delete(request);
		else if (myResponse.type == 'opaque' && !await cached)
			console.error(`${request.url} request is not crossorigin`);
	}).finally(async () => {
		if (mayReload) await reloadIfNeeded(client, clientId);
	}));
});

addEventListener('activate', event => event.waitUntil(registration.navigationPreload.enable()));
skipWaiting();
