/* Shrimp House customer-facing PWA service worker. Admin Push has its own /admin scope. */
const CACHE_PREFIX = "shrimp-house-shell-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const SHELL_URLS = ["/", "/index.html", "/menu", "/menu.html", "/track-order.html", "/app-icon.svg", "/app-icon-180.png", "/app.webmanifest"];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_URLS.map(async url => {
      try { const response = await fetch(url, { cache: "no-store" }); if (response.ok) await cache.put(url, response); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data = {}; try { if (event.data) data = event.data.json(); } catch (_) {}
    if (data.title || data.body) await self.registration.showNotification(data.title || "Shrimp House", {
      body: data.body || "وصل تحديث جديد من المطعم.", icon: data.icon || "/app-icon.svg",
      badge: data.badge || "/app-icon.svg", tag: data.tag || "shrimp-house",
      data: { url: data.url || "/" }, dir: "rtl", lang: "ar"
    });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) if (new URL(client.url).origin === self.location.origin) {
      try { await client.navigate(target); } catch (_) {} return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/supabase/") ||
      url.pathname.startsWith("/auth/") || url.pathname.startsWith("/functions/")) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.includes("text/html")) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (_) {
        const cached = await cache.match(request) || await cache.match(url.pathname) || await cache.match("/");
        if (cached) return cached;
        return new Response("<!doctype html><html lang='ar' dir='rtl'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Shrimp House</title><body style='font-family:system-ui;background:#17191D;color:#D7DCE4;padding:2rem;text-align:center'><h1>Shrimp House</h1><p>الاتصال غير متاح حاليًا. اتصل بالإنترنت وحاول مرة أخرى.</p></body></html>", {status:503,headers:{"Content-Type":"text/html; charset=utf-8"}});
      }
    })());
    return;
  }
  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
      }
    })());
  }
});
