const CACHE_NAME = "smart-logistics-v189";

// path ต้องตรงกับที่ HTML เรียกจริง (มี query string ต่อท้าย) ไม่งั้น cache ไม่ถูกใช้
const ASSETS = [ "./", "./index.html", "./mobile.html", "./manifest.json", "./icon.svg", "./apple-touch-icon.png" ];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
});

// เทียบแคชโดยไม่สนใจ ?v=... ท้าย URL
const matchIgnoringQuery = request => caches.match(request, { ignoreSearch: true });

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;
    if (new URL(event.request.url).pathname.includes("/api/")) return;
    event.respondWith(fetch(event.request).catch(() => matchIgnoringQuery(event.request).then(res => res || caches.match("./index.html"))));
});

self.addEventListener("push", event => {
    let data = {
        title: "SCD Transport",
        body: "มีการแจ้งเตือนใหม่"
    };
    try {
        if (event.data) data = event.data.json();
    } catch (e) {}
    event.waitUntil(self.registration.showNotification(data.title || "SCD Transport", {
        body: data.body || "",
        icon: "./icon.svg",
        badge: "./icon.svg",
        tag: "scd-push-" + Date.now(),
        requireInteraction: false,
        data: {
            url: data.url || "/"
        }
    }));
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    const url = event.notification.data?.url || "/";
    event.waitUntil(clients.matchAll({
        type: "window",
        includeUncontrolled: true
    }).then(list => {
        const match = list.find(c => c.url.includes(url));
        if (match) return match.focus();
        return clients.openWindow(url);
    }));
});
