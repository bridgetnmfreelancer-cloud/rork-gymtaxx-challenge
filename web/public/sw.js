/**
 * GymTaxx service worker.
 *
 * Deliberately minimal. The job here is that an installed app opens instantly
 * and shows something useful with a bad signal — not full offline support.
 * Workouts still need a connection to submit, and pretending otherwise would
 * lose someone's proof.
 */

const CACHE = "gymtaxx-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {
        // A failed precache must not block activation — the app works online
        // regardless, and this only costs the offline fallback.
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never cache Supabase or Stripe: stale auth, payment or workout data would
  // be worse than an honest error.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, falling back to the cached shell so a cold
  // launch on the Underground still opens.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Static assets: cache first, they're content-hashed by the build.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
    }),
  );
});
