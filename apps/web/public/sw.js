/* eslint-disable */
/**
 * DermaLand · Service Worker (offline básico para PWA)
 *
 * Estrategia minimalista para Fase 0/1:
 *  - Instala y precachea el shell HTML del modo móvil de conteo (`/conteo-fisico/[id]/movil`).
 *  - Para requests del API de sync (POST /api/inventory-counts/sync),
 *    usa Background Sync si está disponible — encola y reintenta cuando hay red.
 *  - Para todo lo demás: network-first, fallback al shell cacheado.
 *
 * No usar Workbox por ahora — mantener el SW simple. Workbox se evalúa cuando
 * crezcan los assets a precachear (Fase 9 con sitio público).
 */

const CACHE_NAME = "dermaland-shell-v2";
const SHELL_URLS = [
  "/",
  "/conteo-fisico",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => {
        // Si algún URL falla en instalar, no bloquear el SW
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first con fallback a cache para navegación
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/"))),
    );
    return;
  }
});

// Background Sync — cuando vuelve la red, dispara `syncNow()` desde la app.
self.addEventListener("sync", (event) => {
  if (event.tag === "dermaland-sync-scans") {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: "trigger-sync" }));
      }),
    );
  }
});
