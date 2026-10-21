/* Cloud Notes service worker.
 *
 * Three routing rules, in priority order:
 *   1. Firebase API traffic  -> never touched. Auth and Firestore manage their
 *      own transport and their own offline queue; intercepting it here breaks
 *      long-polling and silently corrupts the offline write queue.
 *   2. Navigations           -> network first, cache as backup. The app shell
 *      stays fresh when online and still opens with no connection.
 *   3. Everything else (our  -> stale-while-revalidate. Instant paint from
 *      assets + CDN libraries)  cache, refreshed in the background.
 *
 * Bump CACHE_VERSION whenever the precached shell changes; the activate step
 * drops every older cache.
 */

const CACHE_VERSION = "v3";
const CACHE = `cloud-notes-${CACHE_VERSION}`;

// Same-origin files that make up the app shell.
const SHELL = [
  "./",
  "./index.html",
  "./signup.html",
  "./forgot-password.html",
  "./splash.html",
  "./home.html",
  "./editor.html",
  "./folder.html",
  "./settings.html",
  "./notes.html",
  "./offline.html",
  "./404.html",
  "./css/styles.css",
  "./js/firebase-config.js",
  "./js/offline.js",
  "./js/core.js",
  "./js/reminders.js",
  "./js/pwa.js",
  "./js/auth.js",
  "./js/onboarding.js",
  "./js/home.js",
  "./js/editor.js",
  "./js/folder.js",
  "./js/settings.js",
  "./js/notes-render.js",
  "./js/notes.js",
  "./js/main.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

// Hosts whose requests must always go straight to the network.
const BYPASS_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "www.googleapis.com"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // addAll is atomic: one 404 would discard the whole precache, and a
      // missing optional file should not block installation.
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// Lets the page tell a waiting worker to take over immediately.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Rule 1 — Firebase owns its own transport and offline queue.
  if (BYPASS_HOSTS.includes(url.hostname)) return;
  if (url.hostname.endsWith(".firebaseio.com")) return;

  // Rule 2 — navigations: network first so deploys land, cache as fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match(req);
          if (cached) return cached;
          return (
            (await caches.match("./offline.html")) ||
            (await caches.match("./notes.html")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // Rule 3 — assets and CDN libraries: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);

      const network = fetch(req)
        .then((res) => {
          // Opaque responses (cross-origin, no CORS) still cache usefully.
          if (res && (res.ok || res.type === "opaque")) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);

      return cached || (await network) || Response.error();
    })()
  );
});
