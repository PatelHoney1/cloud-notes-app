// Settings: theme, reminder permission, export, logout, delete account.

(function () {
  "use strict";

  let user = null;

  document.addEventListener("DOMContentLoaded", async () => {
    const themeToggle = document.getElementById("themeToggle");
    const notifBtn = document.getElementById("notifBtn");
    const notifState = document.getElementById("notifState");
    const exportAllBtn = document.getElementById("exportAllBtn");
    const replayBtn = document.getElementById("replayBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const deleteBtn = document.getElementById("deleteAccountBtn");

    // ---- theme ----
    let saved = "light";
    try { saved = localStorage.getItem("theme") || "light"; } catch (err) {}
    themeToggle.checked = saved === "dark";
    document.body.classList.toggle("dark-mode", saved === "dark");

    themeToggle.addEventListener("change", () => {
      const next = themeToggle.checked ? "dark" : "light";
      document.body.classList.toggle("dark-mode", next === "dark");
      try { localStorage.setItem("theme", next); } catch (err) {}
    });

    // ---- notifications ----
    function renderNotif() {
      if (!("Notification" in window)) {
        notifState.textContent = "Not supported in this browser";
        notifBtn.disabled = true;
        return;
      }
      const p = Notification.permission;
      notifState.textContent =
        p === "granted" ? "On — you'll be told when a note falls due"
        : p === "denied" ? "Blocked in your browser settings"
        : "Off — turn on to be reminded";
      notifBtn.hidden = p === "granted";
      notifBtn.disabled = p === "denied";
    }

    renderNotif();

    notifBtn.addEventListener("click", async () => {
      try {
        await Notification.requestPermission();
      } catch (err) {
        /* older browsers use the callback form; the state check below covers it */
      }
      renderNotif();
      if (Notification.permission === "granted") {
        showToast("Reminders on", "You'll be notified while a tab is open.", "ok");
      }
    });

    // ---- auth-dependent ----
    user = await requireAuth();
    document.getElementById("userEmail").textContent = user.email || "";

    exportAllBtn.addEventListener("click", async () => {
      exportAllBtn.disabled = true;
      try {
        const notes = await loadAllNotes(user.uid);
        if (!notes.length) {
          showToast("Nothing to export", "You have no notes yet.", "warn");
          return;
        }
        exportAllTxt(notes);
        showToast("Exported", notes.length + " note(s) saved as .txt", "ok");
      } catch (err) {
        showToast("Export failed", err.message, "danger");
      } finally {
        exportAllBtn.disabled = false;
      }
    });

    replayBtn.addEventListener("click", () => {
      try { localStorage.removeItem("onboardingSeen"); } catch (err) {}
      window.location.href = "splash.html";
    });

    logoutBtn.addEventListener("click", async () => {
      await auth.signOut();
      window.location.href = "index.html";
    });

    deleteBtn.addEventListener("click", deleteAccount);
  });

  async function deleteAccount() {
    if (!confirm(
      "Delete your account and all your notes?\n\n" +
      "This cannot be undone."
    )) return;

    try {
      // Delete the user's own notes first. Notes shared *with* them belong to
      // someone else and are deliberately left alone.
      const snap = await db.collection("notes").where("userId", "==", user.uid).get();

      // Firestore batches cap at 500 writes, so chunk them.
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = db.batch();
        docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      await db.collection("users").doc(user.uid).delete().catch(() => {});
      await user.delete();

      showToast("Account deleted", "Sorry to see you go.", "ok");
      setTimeout(() => (window.location.href = "index.html"), 900);
    } catch (err) {
      // Firebase requires a recent sign-in before deleting an account.
      if (err.code === "auth/requires-recent-login") {
        showToast(
          "Please sign in again",
          "For safety, Firebase needs a fresh login before deleting an account.",
          "warn"
        );
        setTimeout(async () => {
          await auth.signOut();
          window.location.href = "index.html";
        }, 2200);
        return;
      }
      showToast("Could not delete account", err.message, "danger");
    }
  }
})();
