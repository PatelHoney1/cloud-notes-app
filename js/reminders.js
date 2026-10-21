// App-wide reminder engine.
//
// Notes carry an optional dueDate. This polls for notes falling due, raises a
// browser notification where permitted and always shows an in-app toast, so
// the reminder is visible even when notifications are blocked.
//
// Scope, stated honestly: this runs only while a tab is open. Delivering a
// reminder to a closed browser needs a push service and a server-side
// scheduler, neither of which exists in a client-only app.

// Five minutes, not one: the due-soon window is an hour wide, so a
// tighter poll buys nothing and costs two full queries each time.
const REMINDER_POLL_MS = 5 * 60 * 1000;
const REMINDER_WINDOW_MS = 60 * 60 * 1000; // "due soon" = within the hour
const NOTIFIED_KEY = "notifiedNoteIds";

function loadNotified() {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (err) {
    return new Set();
  }
}

function saveNotified(set) {
  try {
    // Keep the list bounded; old ids are no longer interesting.
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(Array.from(set).slice(-300)));
  } catch (err) {
    /* private mode or blocked storage — reminders still work this session */
  }
}

function dueMillis(note) {
  if (!note.dueDate) return null;
  const d = note.dueDate.toDate ? note.dueDate.toDate() : new Date(note.dueDate);
  const t = d.getTime();
  return isNaN(t) ? null : t;
}

// ---------------------------------------------------------------- toasts
function ensureToastHost() {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  return host;
}

function showToast(title, body, variant) {
  const host = ensureToastHost();

  const el = document.createElement("div");
  el.className = "app-toast" + (variant ? " app-toast-" + variant : "");

  const strong = document.createElement("strong");
  strong.textContent = title;
  el.appendChild(strong);

  if (body) {
    const p = document.createElement("span");
    p.textContent = body;
    el.appendChild(p);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "app-toast-close";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", () => el.remove());
  el.appendChild(close);

  host.appendChild(el);
  setTimeout(() => el.remove(), 9000);
  return el;
}

// Exposed so any page can raise a toast without importing anything.
window.showToast = showToast;

// ---------------------------------------------------------------- engine
async function notifyDue(note, overdue) {
  const title = overdue
    ? `Overdue: ${note.title || "Untitled note"}`
    : `Due soon: ${note.title || "Untitled note"}`;
  const body = (note.content || "").replace(/\s+/g, " ").slice(0, 120);

  // The in-app toast always shows, whatever happens with system notifications.
  showToast(title, body, overdue ? "danger" : "warn");

  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const url = "editor.html?id=" + encodeURIComponent(note.id);
  const options = {
    body,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: "note-" + note.id,
    renotify: true,
    data: { noteId: note.id, url }
  };

  // Chrome on Android refuses `new Notification()` outright -- it throws
  // "Illegal constructor" and insists on ServiceWorkerRegistration
  // .showNotification(). That is why reminders appeared to do nothing on a
  // phone despite permission being granted. Try the service worker first and
  // keep the direct constructor as the desktop fallback.
  try {
    if ("serviceWorker" in navigator) {
      // navigator.serviceWorker.ready never settles when nothing is
      // registered, so it needs a deadline.
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(() => resolve(null), 2000))
      ]);

      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, options);
        return;
      }
    }
  } catch (err) {
    console.warn("[Cloud Notes] Service-worker notification failed:", err.message);
  }

  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      window.location.href = url;
    };
  } catch (err) {
    // Surface it rather than swallowing it -- a silent miss is the worst
    // possible behaviour for a reminder.
    console.warn("[Cloud Notes] Notification failed:", err.message);
    showToast(
      "Reminder could not be shown",
      "Your browser blocked the notification, but the reminder is above.",
      "danger"
    );
  }
}

function checkReminders(notes) {
  const notified = loadNotified();
  const now = Date.now();
  let changed = false;

  for (const note of notes) {
    const due = dueMillis(note);
    if (due === null) continue;

    const diff = due - now;
    // Fire once for anything already overdue or falling due within the hour.
    if (diff > REMINDER_WINDOW_MS) continue;

    // Keyed by note AND due time, so moving a note's due date re-arms its
    // reminder. Keying by id alone meant a note could only ever notify once,
    // which made the feature look broken as soon as you edited a date.
    const key = note.id + "@" + due;
    if (notified.has(key)) continue;

    notifyDue(note, diff < 0);
    notified.add(key);
    changed = true;
  }

  if (changed) saveNotified(notified);
}

window.checkReminders = checkReminders;

// Permission is requested from a click rather than on load: Chrome ignores
// (and Firefox penalises) permission prompts raised without a user gesture.
function wireReminderPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "default") return;

  const ask = () => {
    Notification.requestPermission().finally(() => {
      document.removeEventListener("click", ask);
    });
  };
  document.addEventListener("click", ask, { once: true });
}

// Starts polling for a signed-in user. Safe to call on any page.
function startReminderLoop(userId) {
  wireReminderPermission();

  const run = async () => {
    try {
      const notes = await loadAllNotes(userId, { maxAgeMs: 4 * 60 * 1000 });
      checkReminders(notes);
    } catch (err) {
      /* offline or rules error — the next tick retries */
    }
  };

  run();
  const timer = setInterval(run, REMINDER_POLL_MS);
  window.addEventListener("beforeunload", () => clearInterval(timer));
  return timer;
}

window.startReminderLoop = startReminderLoop;

// Fires a reminder immediately, so the notification path can be tested
// without waiting for a note to actually fall due.
window.sendTestReminder = function () {
  notifyDue({
    id: "test-" + Date.now(),
    title: "Test reminder",
    content: "If you can see this, reminders are working."
  }, false);
};
