/* service-worker.js */
const CACHE_NAME = "btx-prontuario-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./offline.html",
  "./icons/icon.svg"
];

// CDN que a gente aceita cachear
const RUNTIME_CACHE = "btx-runtime-v1";
const CDN_ALLOWLIST = [
  "cdn.jsdelivr.net"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== CACHE_NAME && k !== RUNTIME_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

function isNavigation(req) {
  return req.mode === "navigate" || (req.method === "GET" && req.headers.get("accept")?.includes("text/html"));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Navegação: network-first com fallback
  if (isNavigation(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(req)) || (await cache.match("./index.html")) || (await cache.match("./offline.html"));
      }
    })());
    return;
  }

  // App shell: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return caches.match("./offline.html");
      }
    })());
    return;
  }

  // CDN runtime cache: stale-while-revalidate
  if (CDN_ALLOWLIST.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((fresh) => {
        cache.put(req, fresh.clone());
        return fresh;
      }).catch(() => null);

      return cached || (await fetchPromise) || new Response("", { status: 504, statusText: "Offline" });
    })());
    return;
  }

  // Outros: tenta rede, fallback cache se existir
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      return caches.match(req);
    }
  })());
});
