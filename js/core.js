// Shared data helpers used by the app pages (home, folder, editor, settings).
// Depends on the globals `auth` and `db` from firebase-config.js.

// ---------------------------------------------------------------- escaping
// Note bodies go through marked + DOMPurify, but titles, tags and folder
// names are injected as plain text, so they get escaped rather than parsed.
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------- checklist
// Counts GitHub-style task list items in a note's raw Markdown.
function checklistStats(content) {
  const lines = (content || "").split("\n");
  let total = 0;
  let done = 0;
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s\[( |x|X)\]/);
    if (!m) continue;
    total++;
    if (m[1].toLowerCase() === "x") done++;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function progressBarHtml(stats) {
  if (!stats.total) return "";
  return `
    <div class="mt-2">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <span class="np-progress-label">${stats.done}/${stats.total} done</span>
        <span class="np-progress-label">${stats.pct}%</span>
      </div>
      <div class="np-progress"><div class="np-progress-fill" style="width:${stats.pct}%"></div></div>
    </div>`;
}

// ---------------------------------------------------------------- folders
// Folders are derived from each note's `folder` field rather than stored in a
// collection of their own. That keeps the security rules unchanged and means
// deleting the last note in a folder removes the folder with no cleanup step.
const UNFILED = "Unfiled";

function folderNameOf(note) {
  const f = (note.folder || "").trim();
  return f || UNFILED;
}

function groupByFolder(notes) {
  const map = new Map();
  for (const note of notes) {
    const name = folderNameOf(note);
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(note);
  }
  return map;
}

function folderSummary(notes) {
  const out = [];
  for (const [name, items] of groupByFolder(notes)) {
    let done = 0;
    let total = 0;
    for (const n of items) {
      const s = checklistStats(n.content);
      done += s.done;
      total += s.total;
    }
    out.push({
      name,
      count: items.length,
      done,
      total,
      pct: total ? Math.round((done / total) * 100) : 0
    });
  }
  out.sort((a, b) => {
    if (a.name === UNFILED) return 1;
    if (b.name === UNFILED) return -1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

// ---------------------------------------------------------------- loading
function noteMillis(note) {
  const v = note.updatedAt;
  if (!v) return 0;
  if (v.toMillis) return v.toMillis();
  const d = new Date(v);
  return isNaN(d) ? 0 : d.getTime();
}

// Pinned notes float to the top; everything else is newest first.
function sortNotes(list) {
  return list.slice().sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return noteMillis(b) - noteMillis(a);
  });
}

// Owned notes plus notes shared with this user, de-duplicated.
// Each query is ordered server-side, which is why firestore.indexes.json
// declares a composite index for both.
async function loadAllNotes(userId) {
  const [owned, shared] = await Promise.all([
    db.collection("notes").where("userId", "==", userId)
      .orderBy("updatedAt", "desc").get(),
    db.collection("notes").where("sharedWith", "array-contains", userId)
      .orderBy("updatedAt", "desc").get()
  ]);

  const map = new Map();
  owned.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
  shared.forEach((d) => {
    if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() });
  });

  return sortNotes(Array.from(map.values()));
}

function searchNotes(notes, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) => {
    const hay = [
      n.title || "",
      n.content || "",
      (n.tags || []).join(" "),
      n.folder || ""
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

// ---------------------------------------------------------------- export
function noteToText(note) {
  const lines = [];
  const heading = note.title || "(No title)";
  lines.push(heading);
  lines.push("=".repeat(heading.length));
  if (note.folder) lines.push("Folder: " + note.folder);
  if (note.tags && note.tags.length) lines.push("Tags: " + note.tags.join(", "));
  if (note.dueDate) {
    const d = note.dueDate.toDate ? note.dueDate.toDate() : new Date(note.dueDate);
    lines.push("Due: " + d.toLocaleString());
  }
  lines.push("");
  lines.push(note.content || "");
  return lines.join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeFileName(name) {
  return (name || "note").replace(/[^a-z0-9\-_ ]/gi, "").trim().slice(0, 60) || "note";
}

function exportNoteTxt(note) {
  downloadText(safeFileName(note.title) + ".txt", noteToText(note));
}

function exportAllTxt(notes) {
  const body = notes.map(noteToText).join("\n\n" + "-".repeat(60) + "\n\n");
  downloadText("cloud-notes-export.txt", body);
}

// ---------------------------------------------------------------- misc
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function displayName(user) {
  if (!user) return "there";
  const email = user.email || "";
  const handle = email.split("@")[0] || "there";
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}

// Redirects to the login page unless signed in; returns a promise of the user.
function requireAuth() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged((user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      resolve(user);
    });
  });
}
