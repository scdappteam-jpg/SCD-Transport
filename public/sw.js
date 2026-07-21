const CACHE_NAME = "smart-logistics-v152";
const ASSETS = [
  "./",
  "./index.html",
  "./mobile.html",
  "./styles.css",
  "./mobile.css",
  "./config.js",
  "./demo-data.js",
  "./app.js",
  "./mobile.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).pathname.includes("/api/")) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then(res => res || caches.match("./index.html")))
  );
});
// ── Push Notification Handler ────────────────────────────────────
self.addEventListener("push", event => {
  let data = { title: "SCD Transport", body: "มีการแจ้งเตือนใหม่" };
  try { if (event.data) data = event.data.json(); } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || "SCD Transport", {
      body: data.body || "",
      icon: "./icon.svg",
      badge: "./icon.svg",
      tag: "scd-push-" + Date.now(),
      requireInteraction: false,
      data: { url: data.url || "/" }
    })
  );
});

// ── Notification Click ───────────────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const match = list.find(c => c.url.includes(url));
    if (match) return match.focus();
    return clients.openWindow(url);
  }));
});
