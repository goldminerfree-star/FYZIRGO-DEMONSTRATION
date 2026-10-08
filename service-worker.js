/* Cache application */
const cacheNom = "fyzirgo-v1-7";
const ressources = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./assets/fyzirgo-logo.png"];

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(caches.open(cacheNom).then((cache) => cache.addAll(ressources)));
  self.skipWaiting();
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((cle) => cle !== cacheNom).map((cle) => caches.delete(cle)))));
  self.clients.claim();
});

self.addEventListener("fetch", (evenement) => {
  if (evenement.request.method !== "GET") return;
  evenement.respondWith(caches.match(evenement.request).then((reponse) => reponse || fetch(evenement.request)));
});
