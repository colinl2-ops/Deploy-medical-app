const CACHE_NAME = "med-helper-cache-v20260728193419";
const ASSETS = ["./", "./index.html", "./styles.css?v=20260728-193419", "./state.js?v=20260728-193419", "./forms.js?v=20260728-193419", "./renderer.js?v=20260728-193419", "./app.js?v=20260728-193419", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.searchParams.has("force")) {
    const networkRequest = new Request(event.request, { cache: "reload" });
    event.respondWith(fetch(networkRequest).catch(() => caches.match("./index.html")));
    return;
  }

  const isApplicationCode = event.request.mode === "navigate"
    || event.request.destination === "script"
    || event.request.destination === "style";

  if (isApplicationCode) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
