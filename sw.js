// Service worker: makes Nepaligames installable and lets the games open offline.
// Internet first: every page, script and style is fetched fresh when online (so an
// installed app always gets the newest version), and the saved copy is only used
// when there's no connection. Supabase (scores, sign-in) is never cached.

const CACHE = "nepaligames-v1"; // bump to clear old saved copies
const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "home.css",
  "baghchal.css",
  "momo.css",
  "account.css",
  "supabase-config.js",
  "online.js",
  "script.js",
  "baghchal-logic.js",
  "baghchal.js",
  "momo-logic.js",
  "momo.js",
  "account.js",
  "install.js",
  "home.js",
  "privacy.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_FILES.map((f) => new Request(f, { cache: "no-cache" }))))
      .then(() => self.skipWaiting()) // a new version takes over right away
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, CDN, Sports: straight to the network

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // "no-cache": check with GitHub Pages every time instead of trusting a 10-minute-old copy
      const fresh = await fetch(req, { cache: "no-cache" });
      if (fresh.ok && fresh.type === "basic") cache.put(stripQuery(req, url), fresh.clone());
      return fresh;
    } catch {
      const saved = await cache.match(stripQuery(req, url));
      if (saved) return saved;
      if (req.mode === "navigate") return (await cache.match("index.html")) || Response.error();
      return Response.error();
    }
  })());
});

// "?v=2" style links (used to refresh chat previews) share one saved copy
function stripQuery(req, url) {
  return url.search ? new Request(url.origin + url.pathname) : req;
}
