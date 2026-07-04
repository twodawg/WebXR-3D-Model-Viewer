const CACHE_NAME = 'webxr-viewer-v2';
const assetsToCache = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/app.js',
    './js/xr-manager.js'
];

// Install service worker and cache files
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const requests = assetsToCache.map((asset) => new Request(new URL(asset, self.registration.scope).toString()));

            // Cache each asset individually so one bad response does not abort installation.
            await Promise.all(
                requests.map(async (request) => {
                    try {
                        await cache.add(request);
                    } catch (error) {
                        console.warn('ServiceWorker cache add failed:', request.url, error);
                    }
                })
            );

            await self.skipWaiting();
        })()
    );
});

// Fetch from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
    );
});

// Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                    return Promise.resolve();
                })
            );
            await self.clients.claim();
        })()
    );
});
