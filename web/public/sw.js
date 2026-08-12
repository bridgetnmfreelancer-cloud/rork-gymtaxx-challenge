/**
 * GymTaxx service worker.
 *
 * Deliberately narrow. It exists for two things only: reminders, and letting an
 * installed app open when the signal is bad. It does NOT try to be an offline
 * cache for the app's own code.
 *
 * That restraint is the point. An earlier version intercepted every static
 * asset, which meant one flaky request turned into a hard "module failed to
 * load" and a blank screen. Left alone, the browser retries those itself and
 * recovers. So: never touch JS, CSS or fonts — the network handles them.
 */

const CACHE = "gymtaxx-shell-v2";
/** Only assets that never change name between builds. */
const SHELL = ["/index.html", "/manifest.webmanifest", "/icon.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {
        // Precaching is a nicety. Failing it must not stop activation.
      })
      .then(() => self.skipWaiting()),
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

/**
 * Page loads only. Everything else — scripts, styles, Supabase, Stripe — goes
 * straight to the network untouched.
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Keep the last good shell for a cold launch with no signal.
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match("/index.html");
        if (cached) return cached;
        return new Response("You're offline. Reopen GymTaxx once you have signal.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }),
  );
});
