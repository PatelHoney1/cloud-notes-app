// Home screen: greeting, counts, search, and the Notes / Folders tabs.

(function () {
  "use strict";

  let allNotes = [];
  let currentUser = null;

  const els = {};

  document.addEventListener("DOMContentLoaded", async () => {
    els.greeting = document.getElementById("greeting");
    els.userName = document.getElementById("userName");
    els.noteCount = document.getElementById("noteCount");
    els.dueCount = document.getElementById("dueCount");
    els.search = document.getElementById("searchInput");
    els.notesList = document.getElementById("notesList");
    els.foldersList = document.getElementById("foldersList");
    els.notesPanel = document.getElementById("notesPanel");
    els.foldersPanel = document.getElementById("foldersPanel");
    els.tabNotes = document.getElementById("tabNotes");
    els.tabFolders = document.getElementById("tabFolders");

    els.greeting.textContent = greeting();
    showSkeleton();

    currentUser = await requireAuth();
    els.userName.textContent = displayName(currentUser);

    els.tabNotes.addEventListener("click", () => switchTab("notes"));
    els.tabFolders.addEventListener("click", () => switchTab("folders"));
    els.search.addEventListener("input", renderNotes);

    await refresh();
    startReminderLoop(currentUser.uid);
  });

  function showSkeleton() {
    els.notesList.innerHTML = Array.from({ length: 3 })
      .map(() => '<div class="skeleton skeleton-card mb-2"></div>')
      .join("");
  }

  async function refresh() {
    try {
      allNotes = await loadAllNotes(currentUser.uid);
    } catch (err) {
      els.notesList.innerHTML =
        '<div class="empty-state"><span class="empty-state-icon">⚠️</span>' +
        esc(err.message) +
        "</div>";
      return;
    }
    renderCounts();
    renderNotes();
    renderFolders();
  }

  function renderCounts() {
    const n = allNotes.length;
    els.noteCount.textContent = n === 1 ? "1 note" : n + " notes";

    const now = Date.now();
    const due = allNotes.filter((note) => {
      if (!note.dueDate) return false;
      const d = note.dueDate.toDate ? note.dueDate.toDate() : new Date(note.dueDate);
      return d.getTime() - now < 24 * 60 * 60 * 1000;
    }).length;

    els.dueCount.hidden = due === 0;
    els.dueCount.textContent = due === 1 ? "1 due" : due + " due";
  }

  function switchTab(which) {
    const notes = which === "notes";
    els.tabNotes.classList.toggle("active", notes);
    els.tabFolders.classList.toggle("active", !notes);
    els.notesPanel.hidden = !notes;
    els.foldersPanel.hidden = notes;
  }

  function excerpt(note) {
    // Strip the most common Markdown marks for a cleaner one-line preview.
    return (note.content || "")
      .replace(/^#+\s*/gm, "")
      .replace(/[*_`>]/g, "")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/^\s*[-*]\s\[( |x|X)\]\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function renderNotes() {
    const list = searchNotes(allNotes, els.search.value);

    if (!list.length) {
      els.notesList.innerHTML =
        '<div class="empty-state"><span class="empty-state-icon">🔍</span>' +
        (els.search.value ? "No notes match that search." : "No notes yet — add your first one.") +
        "</div>";
      return;
    }

    els.notesList.innerHTML = list.map(noteTileHtml).join("");
  }

  function noteTileHtml(note) {
    const stats = checklistStats(note.content);
    const isOwner = note.userId === currentUser.uid;
    const text = excerpt(note);

    const badges = [];
    if (note.folder) badges.push('<span class="badge bg-secondary">' + esc(note.folder) + "</span>");
    (note.tags || []).slice(0, 2).forEach((t) =>
      badges.push('<span class="badge bg-secondary">' + esc(t) + "</span>")
    );
    if (!isOwner) badges.push('<span class="badge shared-badge">Shared</span>');

    return `
      <a class="note-tile" href="editor.html?id=${encodeURIComponent(note.id)}"
         style="background:${esc(note.color || "#ffffff")};">
        ${note.pinned ? '<span class="pin-flag">📌</span>' : ""}
        <p class="note-tile-title">
          ${note.emoji ? "<span>" + esc(note.emoji) + "</span>" : ""}
          <span>${esc(note.title || "(No title)")}</span>
        </p>
        ${text ? '<p class="note-tile-excerpt">' + esc(text) + "</p>" : ""}
        ${progressBarHtml(stats)}
        <div class="note-tile-meta">
          ${esc(timeAgoSafe(note.updatedAt))}${badges.length ? " · " : ""}${badges.join(" ")}
          ${getDueBadgeSafe(note.dueDate)}
        </div>
      </a>`;
  }

  // notes-render.js is not loaded on this page, so these are local equivalents.
  function timeAgoSafe(val) {
    if (!val) return "";
    const d = val.toDate ? val.toDate() : new Date(val);
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return Math.floor(hrs / 24) + "d ago";
  }

  function getDueBadgeSafe(val) {
    if (!val) return "";
    const d = val.toDate ? val.toDate() : new Date(val);
    const diff = d.getTime() - Date.now();
    if (diff < 0) return ' <span class="badge bg-danger">Overdue</span>';
    if (diff < 24 * 60 * 60 * 1000) return ' <span class="badge bg-warning">Due soon</span>';
    return "";
  }

  function renderFolders() {
    const folders = folderSummary(allNotes);

    if (!folders.length) {
      els.foldersList.innerHTML =
        '<div class="empty-state"><span class="empty-state-icon">📁</span>' +
        "No folders yet. Give a note a folder name when you write it." +
        "</div>";
      return;
    }

    els.foldersList.innerHTML = folders.map((f) => `
      <a class="folder-tile" href="folder.html?name=${encodeURIComponent(f.name)}">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <div class="folder-tile-name">📁 ${esc(f.name)}</div>
            <div class="folder-tile-count">${f.count} note${f.count === 1 ? "" : "s"}</div>
          </div>
          ${f.total ? '<span class="np-progress-label">' + f.pct + "%</span>" : ""}
        </div>
        ${f.total ? `<div class="np-progress mt-2"><div class="np-progress-fill" style="width:${f.pct}%"></div></div>` : ""}
      </a>`).join("");
  }
})();
