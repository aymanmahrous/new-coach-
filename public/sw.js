// Relax Fix Command Center service worker.
// Scope: app-shell asset caching + Web Push only.
// No offline business-data writes, no API response caching, no sync queue.

const SHELL_CACHE = "rf-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets: safe to cache-first (a new deploy ships new filenames).
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(request).then((cached) => cached || fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }))
      )
    );
    return;
  }

  // Everything else (index.html, API calls, etc.): always go to the network
  // first so staff never act on stale data; fall back to a cached shell only
  // for page navigations while offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put("/", response.clone());
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match("/");
        return cached || new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const { title, body, section, tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: tag || section,
      renotify: false,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { section: section || "dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const section = event.notification.data?.section || "dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "rf-push-navigate", section });
          return client.focus();
        }
      }
      return self.clients.openWindow(`/?section=${section}`);
    })
  );
});