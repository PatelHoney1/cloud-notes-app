// Splash -> 3-slide onboarding -> login/home.
// Onboarding is shown once; the flag lives in localStorage.

(function () {
  "use strict";

  const SEEN_KEY = "onboardingSeen";
  const SPLASH_MS = 1500;

  const splash = document.getElementById("splashScreen");
  const onboard = document.getElementById("onboardScreen");
  const nextBtn = document.getElementById("nextBtn");
  const skipBtn = document.getElementById("skipBtn");
  const dots = Array.from(document.querySelectorAll("#dots .dot"));
  const slides = Array.from(document.querySelectorAll(".onboard-slide"));

  let index = 0;

  function seen() {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (err) {
      /* storage blocked — onboarding simply shows again next time */
    }
  }

  function finish() {
    markSeen();
    window.location.replace("index.html");
  }

  function render() {
    slides.forEach((s, i) => s.classList.toggle("active", i === index));
    dots.forEach((d, i) => d.classList.toggle("active", i === index));
    nextBtn.textContent = index === slides.length - 1 ? "Get started" : "Next";
    skipBtn.hidden = index === slides.length - 1;
  }

  nextBtn.addEventListener("click", () => {
    if (index < slides.length - 1) {
      index++;
      render();
    } else {
      finish();
    }
  });

  skipBtn.addEventListener("click", finish);

  // Swipe between slides on touch devices.
  let startX = null;
  onboard.addEventListener("touchstart", (e) => {
    startX = e.changedTouches[0].clientX;
  }, { passive: true });

  onboard.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) < 45) return;
    if (dx < 0 && index < slides.length - 1) index++;
    else if (dx > 0 && index > 0) index--;
    render();
  }, { passive: true });

  // Splash, then either straight on (returning user) or into onboarding.
  setTimeout(() => {
    if (seen()) {
      window.location.replace("index.html");
      return;
    }
    splash.hidden = true;
    onboard.hidden = false;
    render();
  }, SPLASH_MS);
})();
