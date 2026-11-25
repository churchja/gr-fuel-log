// Keeps the LIMIT+1 Flex Fuel shell available offline, like GR Fuel Log's own sw.js. Data always comes from the network.
const CACHE = "lp1-flex-fuel-v35-1";
const SHELL = ["./", "index.html", "partner.css?v=1", "partner.js?v=1", "manifest.webmanifest", "logo-black.png", "logo-white.png", "icon-192.png",
  "../app.css?v=35", "../config.js?v=35", "../calc.js?v=35", "../service.js?v=35", "../app.js?v=35",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("lp1-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname.endsWith("supabase.co")) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && (url.origin === location.origin || url.hostname === "cdn.jsdelivr.net")) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match("index.html"))));
});
