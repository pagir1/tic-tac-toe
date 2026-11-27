// Installable app: registers the service worker and runs the
// "📲 Add Nepaligames to your home screen" card on the home screen.
// Android / Chrome / Edge: the Install button opens the browser's real install prompt.
// iPhone / iPad: it opens a short "Share → Add to Home Screen" popup.
// The card hides when the app is installed, when it's opened from the home screen,
// and for 7 days after someone taps ✕.

(function () {
  const DISMISS_KEY = "ng-install-dismissed";
  const INSTALLED_KEY = "ng-installed";
  const HIDE_DAYS = 7;
  const card = document.getElementById("ng-install");
  const iosModal = document.getElementById("ng-ios");
  let deferredPrompt = null;

  // ---------- offline support + automatic updates ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Offline mode unavailable:", e));
    });
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* n/a */ } },
  };

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigator.standalone === true;
  const isIOS = () =>
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS shows as a Mac
  const dismissedRecently = () => {
    const at = Number(store.get(DISMISS_KEY) || 0);
    return at && Date.now() - at < HIDE_DAYS * 86400000;
  };

  function render() {
    const canInstall = Boolean(deferredPrompt) || (isIOS() && !store.get(INSTALLED_KEY));
    card.hidden = isStandalone() || dismissedRecently() || !canInstall;
  }

  // Chrome / Edge / Samsung Internet: keep the real prompt for our button
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    store.set(INSTALLED_KEY, null); // the browser says it isn't installed (any more)
    render();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    store.set(INSTALLED_KEY, "1");
    render();
    window.NGUI?.toast("Nepaligames is on your home screen 🎉");
  });

  document.getElementById("ng-install-btn").addEventListener("click", async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null; // a prompt can only be used once
      prompt.prompt();
      try {
        const { outcome } = await prompt.userChoice;
        if (outcome === "accepted") store.set(INSTALLED_KEY, "1");
      } catch { /* n/a */ }
      render();
      return;
    }
    if (isIOS()) window.NGUI.openModal(iosModal);
  });

  document.getElementById("ng-install-close").addEventListener("click", () => {
    store.set(DISMISS_KEY, String(Date.now()));
    render();
  });

  // opened from the home screen later on: hide straight away
  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", render);

  render();
  window.NGInstall = { render, isStandalone, isIOS };
})();
