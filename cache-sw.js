"use strict";
importScripts('https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/xxhash128.umd.min.js');
let hasherPromise;

async function hash(stream) {
	if (!hasherPromise) hasherPromise = hashwasm.createXXHash128();
	const hasher = await hasherPromise;
	let state;
	
	await stream.pipeTo(new WritableStream({write: chunk => {
		state ? hasher.load(state) : hasher.init();
		hasher.update(chunk)
		state = hasher.save();
	}}));
	
	hasher.load(state);
	return hasher.digest('binary');
}

async function hasUpdated(oldResponse, newResponse) {
	const etags = [...arguments].map(response => response.headers.get('etag')?.trim().replace(/^W\//, ''));
	if (etags[0] && etags[0] == etags[1]) return false;
	if (etags.every(etag => etag?.length >= 34)) return true;
	const hashes = await Promise.all([...arguments].map(response => hash(response.clone().body)));
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

async function cleanRepeated(request, cache) {
	const matches = await cache.keys(request, {ignoreSearch: true, ignoreVary: true});
	await Promise.all(matches.slice(0, -1).map(key => cache.delete(key)));
}

async function fullClean(cache) {
	const matches = await cache.keys();
	const nCleaned = Math.max(Math.trunc(matches.length / 2), 1);
	await Promise.all(matches.slice(0, nCleaned).map(key => cache.delete(key)));
}

let cleanPromise;

function setCleanPromise(cache) {
	cleanPromise = fullClean(cache);
	cleanPromise.finally(() => setTimeout(() => {cleanPromise = null}));
}

async function cleanAndRetry(cache, request, response, error) {
	if (error.name != 'QuotaExceededError') throw error;
	if (!cleanPromise) setCleanPromise(cache);
	await cleanPromise;
	return cache.put(request, response.clone());
}

async function race(cached, response) {
	const raced = await Promise.any([cached, response]);
	return raced?.status < 500 && raced || await cached || response;
}

async function safeFetch(request, event) {
	return event.preloadResponse
		.then(myResponse => myResponse || fetch(request))
		.then(myResponse => {if (myResponse.status < 500) return myResponse; else throw null})
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
			await myCache.put(request, myResponse.clone())
				.catch(error => cleanAndRetry(myCache, request, myResponse, error));
			
			if (mayReload && await cached) {
				await Promise.all([
					markReload(await raced, myResponse, client),
					cleanRepeated(request, myCache)
				]);
			}
		}
		else if (myResponse.type == 'opaque') {
			if (!await cached) console.error(`${request.url} request is not crossorigin`);
		}
		else if (myResponse.status < 500 && await cached)
			await (await cache).delete(request);
	}).finally(async () => {
		if (mayReload) await reloadIfNeeded(client, clientId);
	}));
});

addEventListener('activate', event => event.waitUntil(registration.navigationPreload.enable()));
skipWaiting();
