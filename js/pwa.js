// Service-worker registration, install prompt and update handling.
// Loaded on every page; safe to include before the page's own setup runs.

(function () {
  "use strict";

  // --- registration -------------------------------------------------------
  // file:// has no service-worker support and no Firebase Auth either, so a
  // silent no-op there is correct rather than a thrown error in the console.
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((reg) => {
          // A worker waiting to activate means a new version is ready.
          reg.addEventListener("updatefound", () => {
            const incoming = reg.installing;
            if (!incoming) return;
            incoming.addEventListener("statechange", () => {
              if (
                incoming.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                showUpdateBanner(reg);
              }
            });
          });
        })
        .catch((err) => {
          console.warn("Service worker registration failed:", err.message);
        });

      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    });
  }

  function showUpdateBanner(reg) {
    if (document.getElementById("pwaUpdateBanner")) return;

    const bar = document.createElement("div");
    bar.id = "pwaUpdateBanner";
    bar.className = "pwa-banner";

    const text = document.createElement("span");
    text.textContent = "A new version is available.";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-light";
    btn.textContent = "Refresh";
    btn.addEventListener("click", () => {
      if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
    });

    bar.append(text, btn);
    document.body.appendChild(bar);
  }

  // --- install prompt -----------------------------------------------------
  // Chrome fires beforeinstallprompt when the app qualifies for installation.
  // The event must be kept and replayed from a user gesture.
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    revealInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    const btn = document.getElementById("installAppBtn");
    if (btn) btn.remove();
  });

  function revealInstallButton() {
    let btn = document.getElementById("installAppBtn");

    if (!btn) {
      // Pages may supply their own button; otherwise float one bottom-right.
      btn = document.createElement("button");
      btn.id = "installAppBtn";
      btn.type = "button";
      btn.className = "btn btn-sm install-fab";
      btn.textContent = "Install app";
      document.body.appendChild(btn);
    }

    btn.hidden = false;
    btn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      btn.disabled = true;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.remove();
    });
  }

  // Expose the running display mode so pages can adapt if they need to.
  window.isInstalledApp = function () {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  };
})();
