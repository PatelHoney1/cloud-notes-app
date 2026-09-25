// Page dispatcher — routes to the right setup function based on which HTML page loaded this script.
// Must be loaded last, after firebase-config.js and whichever of auth.js / notes.js the page includes.
const path = window.location.pathname;

document.addEventListener("DOMContentLoaded", () => {
  if (path.endsWith("index.html") || path.endsWith("/")) {
    setupLoginPage();
  } else if (path.endsWith("signup.html")) {
    setupSignupPage();
  } else if (path.endsWith("notes.html")) {
    setupNotesPage();
  }
});
