// Shared, closure-free helpers used by notes.js to render note content and metadata.
// Kept separate from notes.js so they're easy to unit-test or reuse later.

// Turns Markdown + [[Note Title]] wiki-links into sanitized HTML
function renderNoteContent(rawContent) {
  const withLinks = (rawContent || "").replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
    const cleanTitle = title.trim();
    return `[${cleanTitle}](#note-link:${encodeURIComponent(cleanTitle)})`;
  });

  const html = marked.parse(withLinks, { breaks: true, gfm: true });
  return DOMPurify.sanitize(html);
}

function timeAgo(dateVal) {
  if (!dateVal) return "";
  const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function wordCount(content) {
  return (content || "").trim().split(/\s+/).filter(Boolean).length;
}

function getDueBadge(dueDateVal) {
  if (!dueDateVal) return "";
  const due = dueDateVal.toDate ? dueDateVal.toDate() : new Date(dueDateVal);
  const diffMs = due.getTime() - Date.now();

  if (diffMs < 0) return `<span class="badge bg-danger ms-1">Overdue</span>`;
  if (diffMs < 24 * 60 * 60 * 1000) return `<span class="badge bg-warning text-dark ms-1">Due soon</span>`;
  return `<span class="badge bg-info text-dark ms-1">Due ${due.toLocaleString()}</span>`;
}

function toDatetimeLocal(dateVal) {
  const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Attachments are stored inline as base64 data URLs (no paid Storage plan required),
// so rendering just points straight at the data URL rather than a hosted file URL.
function renderAttachments(attachments) {
  if (!attachments || !attachments.length) return "";
  const items = attachments.map((a) => {
    if (a.type && a.type.startsWith("image/")) {
      return `<a href="${a.dataUrl}" download="${a.name}"><img src="${a.dataUrl}" class="attachment-thumb" alt="${a.name}"></a>`;
    }
    return `<a href="${a.dataUrl}" download="${a.name}" class="small d-block">📎 ${a.name}</a>`;
  });
  return `<div class="attachments mt-2 d-flex flex-wrap gap-2">${items.join("")}</div>`;
}

// ----- Read note aloud (Text-to-Speech via SpeechSynthesis) -----
let _activeReadBtn = null;

function stopReadingAloud() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (_activeReadBtn) {
    _activeReadBtn.textContent = "🔊 Read";
    _activeReadBtn.classList.remove("btn-danger", "btn-live-pulse");
    _activeReadBtn.classList.add("btn-outline-secondary");
  }
  _activeReadBtn = null;
}

function readNoteAloud(note, btn) {
  if (!("speechSynthesis" in window)) return;

  // Clicking the note that's already being read acts as a stop button
  if (_activeReadBtn === btn) {
    stopReadingAloud();
    return;
  }

  stopReadingAloud(); // only one note reads aloud at a time

  const temp = document.createElement("div");
  temp.innerHTML = renderNoteContent(note.content || "");
  const plainText = (temp.textContent || "").trim();

  const utterance = new SpeechSynthesisUtterance(
    `${note.title || "Untitled note"}. ${plainText || "This note has no content."}`
  );
  utterance.onend = stopReadingAloud;
  utterance.onerror = stopReadingAloud;

  _activeReadBtn = btn;
  btn.textContent = "⏹ Stop";
  btn.classList.remove("btn-outline-secondary");
  btn.classList.add("btn-danger", "btn-live-pulse");

  window.speechSynthesis.speak(utterance);
}

// Reads a File into a base64 data URL for inline storage in a Firestore document
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(`Could not read "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

// Snapshot the current state of a note into its history subcollection before overwriting it
async function snapshotBeforeUpdate(noteId) {
  const doc = await db.collection("notes").doc(noteId).get();
  if (!doc.exists) return;
  const data = doc.data();

  await db.collection("notes").doc(noteId).collection("history").add({
    title: data.title || "",
    content: data.content || "",
    tags: data.tags || [],
    color: data.color || "#ffffff",
    emoji: data.emoji || "",
    savedAt: new Date()
  });
}
