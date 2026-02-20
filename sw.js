const CACHE_NAME = 'racoon-game-v2';
const ASSETS = [
    './',
    './index.html',
    './normal.png',
    './hole.png',
    './yes.png',
    './no.png',
    './over.png',
    './background.png',
    './beaver_main.png'
];

self.addEventListener('install', (event) => {
    // Force this SW to become the waiting SW immediately
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cache hit or fetch from network
                // For critical files like index.html, we could use Network First.
                return response || fetch(event.request);
            })
    );
});

self.addEventListener('activate', (event) => {
    // Force this SW to become the active SW immediately
    event.waitUntil(clients.claim());

    // Clear old caches
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('Removing old cache:', key);
                    return caches.delete(key);
                }
            }));
        })
    );
});
