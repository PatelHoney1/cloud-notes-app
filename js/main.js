// Page dispatcher — routes to the right setup function based on which HTML
// page loaded this script. Must be loaded last, after firebase-config.js and
// whichever of auth.js / notes.js the page includes.
//
// The app pages (home, editor, folder, settings, splash) each load their own
// module and initialise themselves, so they are deliberately absent here.

const path = window.location.pathname;

function pageIs(name) {
  return path.endsWith("/" + name) || path.endsWith(name);
}

document.addEventListener("DOMContentLoaded", () => {
  if (pageIs("signup.html")) {
    setupSignupPage();
  } else if (pageIs("forgot-password.html")) {
    setupForgotPasswordPage();
  } else if (pageIs("notes.html")) {
    setupNotesPage();
  } else if (pageIs("index.html") || path.endsWith("/") || path === "") {
    setupLoginPage();
  }
});
