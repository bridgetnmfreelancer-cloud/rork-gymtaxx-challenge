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

/**
 * A reminder arrived. iOS requires every push to show something visible, so
 * there is always a fallback title and body.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "GymTaxx";
  const options = {
    body: payload.body || "Time to check in on your week.",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: payload.tag || "gymtaxx-reminder",
    renotify: true,
    data: { url: payload.url || "/home" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/** Tapping a reminder lands on the right screen, reusing an open window. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/home";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
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
