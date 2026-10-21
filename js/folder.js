// Folder detail: aggregate checklist progress plus a timeline of the notes
// in this folder, newest first.

(function () {
  "use strict";

  let folderNotes = [];
  let folder = "";

  document.addEventListener("DOMContentLoaded", async () => {
    folder = new URLSearchParams(location.search).get("name") || UNFILED;

    const nameEl = document.getElementById("folderName");
    const subEl = document.getElementById("folderSub");
    const pctEl = document.getElementById("folderPct");
    const fillEl = document.getElementById("folderFill");
    const timeline = document.getElementById("timeline");

    nameEl.textContent = folder;
    timeline.innerHTML =
      '<div class="skeleton skeleton-line" style="width:70%"></div>' +
      '<div class="skeleton skeleton-line" style="width:90%"></div>' +
      '<div class="skeleton skeleton-line" style="width:55%"></div>';

    const user = await requireAuth();

    let all = [];
    try {
      all = await loadAllNotes(user.uid);
    } catch (err) {
      timeline.innerHTML =
        '<div class="empty-state"><span class="empty-state-icon">⚠️</span>' +
        esc(err.message) + "</div>";
      return;
    }

    folderNotes = all.filter((n) => folderNameOf(n) === folder);

    subEl.textContent =
      folderNotes.length === 1 ? "1 note" : folderNotes.length + " notes";

    let done = 0;
    let total = 0;
    folderNotes.forEach((n) => {
      const s = checklistStats(n.content);
      done += s.done;
      total += s.total;
    });

    const pct = total ? Math.round((done / total) * 100) : 0;
    pctEl.textContent = total ? pct + "%" : "—";
    // Set after a tick so the width animates from zero rather than jumping.
    requestAnimationFrame(() => { fillEl.style.width = pct + "%"; });

    renderTimeline(timeline);

    document.getElementById("exportFolderBtn").addEventListener("click", () => {
      if (!folderNotes.length) {
        showToast("Nothing to export", "This folder is empty.", "warn");
        return;
      }
      exportAllTxt(folderNotes);
      showToast("Exported", folderNotes.length + " note(s) saved as .txt", "ok");
    });

    startReminderLoop(user.uid);
  });

  function renderTimeline(host) {
    if (!folderNotes.length) {
      host.innerHTML =
        '<div class="empty-state"><span class="empty-state-icon">📂</span>' +
        "No notes in this folder yet.</div>";
      return;
    }

    host.innerHTML = folderNotes.map((n) => {
      const s = checklistStats(n.content);
      const complete = s.total > 0 && s.done === s.total;
      const when = n.updatedAt && n.updatedAt.toDate
        ? n.updatedAt.toDate().toLocaleDateString()
        : "";

      return `
        <div class="timeline-item ${complete ? "done" : ""}">
          <a class="note-tile" href="editor.html?id=${encodeURIComponent(n.id)}"
             style="background:${esc(n.color || "#ffffff")};">
            ${n.pinned ? '<span class="pin-flag">📌</span>' : ""}
            <p class="note-tile-title">
              ${n.emoji ? "<span>" + esc(n.emoji) + "</span>" : ""}
              <span>${esc(n.title || "(No title)")}</span>
            </p>
            ${progressBarHtml(s)}
            <div class="note-tile-meta">${esc(when)}</div>
          </a>
        </div>`;
    }).join("");
  }
})();
