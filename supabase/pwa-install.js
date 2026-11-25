(() => {
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInstalled = () => window.matchMedia?.("(display-mode: standalone)")?.matches === true || window.navigator.standalone === true;
  let deferredPrompt = null, installButton = null;
  function showButton() {
    if (isInstalled()) return;
    const nav = document.querySelector("header nav");
    if (!nav) return;
    if (!installButton) {
      installButton = document.createElement("button");
      installButton.type = "button"; installButton.className = "sh-pwa-install";
      installButton.textContent = "＋ تثبيت التطبيق";
      installButton.setAttribute("aria-label", "تثبيت تطبيق Shrimp House");
      installButton.addEventListener("click", async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt(); const choice = await deferredPrompt.userChoice; deferredPrompt = null;
          if (choice?.outcome === "accepted") installButton.hidden = true;
        } else if (isIOS()) {
          alert("لتثبيت Shrimp House على iPhone أو iPad: اضغط زر المشاركة Share، ثم اختر Add to Home Screen (إضافة إلى الشاشة الرئيسية).");
        } else {
          alert("لتثبيت Shrimp House: افتح قائمة المتصفح ⋮ أو ⋯، ثم اختر Install app أو Add to Home screen.");
        }
      });
      nav.appendChild(installButton);
    }
    installButton.hidden = false;
  }
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredPrompt = event; showButton(); });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; if (installButton) installButton.hidden = true; });
  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", {scope:"/", updateViaCache:"none"})
        .then(registration => registration.update().catch(() => {}))
        .catch(error => console.warn("Shrimp House app worker:", error));
    }, {once:true});
  }
  if (!isInstalled()) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showButton, {once:true});
    else showButton();
  }
})();
