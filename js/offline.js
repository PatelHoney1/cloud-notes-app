// Offline support: Firestore local persistence + a connection status banner.
// Must load immediately after firebase-config.js and before any Firestore read,
// because enablePersistence() has to run before the first query is issued.

(function () {
  "use strict";

  // js/firebase-config.js is gitignored, so a fresh clone has no config at all.
  // Without this check the failure is a bare "db is not defined" in the console
  // and a login button that silently does nothing.
  if (typeof firebase === "undefined" || typeof db === "undefined") {
    window.addEventListener("DOMContentLoaded", () => {
      const bar = document.createElement("div");
      bar.className = "pwa-banner pwa-banner-error";
      bar.textContent =
        "Firebase is not configured. Copy js/firebase-config.example.js to " +
        "js/firebase-config.js and add your project values.";
      document.body.appendChild(bar);
    });
    console.error(
      "[Cloud Notes] Missing js/firebase-config.js — copy " +
        "js/firebase-config.example.js and fill in your Firebase values."
    );
    return;
  }

  // --- local persistence --------------------------------------------------
  // synchronizeTabs lets several open tabs share one IndexedDB-backed cache;
  // without it, the second tab fails with 'failed-precondition'.
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn(
        "[Cloud Notes] Offline cache unavailable: another tab holds it."
      );
    } else if (err.code === "unimplemented") {
      console.warn(
        "[Cloud Notes] This browser does not support offline persistence."
      );
    } else {
      console.warn("[Cloud Notes] Offline cache failed:", err.message);
    }
  });

  // --- connection banner --------------------------------------------------
  // Firestore queues writes while offline and replays them on reconnect, so
  // this is informational: it tells the user why nothing appears to sync.
  let banner = null;

  function setOffline(isOffline) {
    if (isOffline) {
      if (banner) return;
      banner = document.createElement("div");
      banner.className = "pwa-banner pwa-banner-offline";
      banner.textContent = "Offline — changes are saved and will sync later.";
      document.body.appendChild(banner);
    } else if (banner) {
      banner.remove();
      banner = null;
    }
  }

  window.addEventListener("DOMContentLoaded", () => setOffline(!navigator.onLine));
  window.addEventListener("offline", () => setOffline(true));
  window.addEventListener("online", () => setOffline(false));
})();
