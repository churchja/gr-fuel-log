// Keeps the app shell available offline so the pump plan opens with no signal. Data always comes from the network.
const CACHE = "gr-fuel-log-v7";
const SHELL = ["./", "index.html", "app.css?v=7", "config.js?v=7", "calc.js?v=7", "app.js?v=7", "manifest.webmanifest", "icons/icon-192.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname.endsWith("supabase.co")) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && (url.origin === location.origin || url.hostname === "cdn.jsdelivr.net")) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match("index.html"))));
});
