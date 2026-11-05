// ATUL Speed Watch — service worker.
// Caches the app shell for fast offline load on Android (PWA).
const CACHE = "atul-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/", "/index.html", "/manifest.webmanifest", "/icon.svg"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for navigation; cache fallback for offline.
// API calls (/api/...) are NEVER cached so users always get fresh data
// (no stale orders from another session).
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  let url;
  try {
    url = new URL(e.request.url);
  } catch {
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/")))
  );
});
