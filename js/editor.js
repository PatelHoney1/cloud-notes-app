// Note editor: create or edit a single note, with pin, folder, checklist
// progress, attachments, export, sharing and version history.

(function () {
  "use strict";

  const MAX_ATTACHMENT_BYTES = 350 * 1024;
  const MAX_TOTAL_ATTACHMENT_BYTES = 900 * 1024;

  let user = null;
  let noteId = null;
  let note = null;              // null while creating
  let selectedColor = "#ffffff";
  let selectedEmoji = "";
  let pinned = false;
  let attachments = [];
  const el = {};

  document.addEventListener("DOMContentLoaded", async () => {
    [
      "noteId", "noteTitle", "noteFolder", "noteDueDate", "noteTags",
      "noteContent", "noteAttachments", "attachmentList", "noteMsg",
      "saveNoteBtn", "deleteNoteBtn", "pinBtn", "exportBtn", "shareBtn",
      "historyBtn", "editorHeading", "editorSub", "folderOptions",
      "progressWrap", "progressText", "progressPct", "progressFill",
      "checkItemBtn", "micBtn", "historyModalBody", "shareModalExisting",
      "shareEmailInput", "shareModalMsg", "shareSubmitBtn"
    ].forEach((id) => { el[id] = document.getElementById(id); });

    noteId = new URLSearchParams(location.search).get("id");

    wirePickers();
    wireContent();
    wireActions();

    user = await requireAuth();

    await populateFolderOptions();
    if (noteId) await loadNote();
    updateProgress();
  });

  // ------------------------------------------------------------- pickers
  function wirePickers() {
    document.querySelectorAll(".color-circle").forEach((c) => {
      c.addEventListener("click", () => {
        selectedColor = c.dataset.color;
        document.querySelectorAll(".color-circle").forEach((x) => x.classList.remove("selected"));
        c.classList.add("selected");
      });
    });

    document.querySelectorAll(".emoji-option").forEach((e) => {
      e.addEventListener("click", () => {
        selectedEmoji = e.dataset.emoji;
        document.querySelectorAll(".emoji-option").forEach((x) => x.classList.remove("selected"));
        e.classList.add("selected");
      });
    });
  }

  function wireContent() {
    el.noteContent.addEventListener("input", updateProgress);

    el.checkItemBtn.addEventListener("click", () => {
      const ta = el.noteContent;
      const needsNewline = ta.value && !ta.value.endsWith("\n");
      ta.value += (needsNewline ? "\n" : "") + "- [ ] ";
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
      updateProgress();
    });

    wireDictation();
  }

  function updateProgress() {
    const s = checklistStats(el.noteContent.value);
    el.progressWrap.hidden = s.total === 0;
    if (!s.total) return;
    el.progressText.textContent = `${s.done}/${s.total} done`;
    el.progressPct.textContent = s.pct + "%";
    el.progressFill.style.width = s.pct + "%";
  }

  // ------------------------------------------------------------- dictation
  function wireDictation() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      el.micBtn.disabled = true;
      el.micBtn.title = "Voice input isn't supported in this browser";
      return;
    }

    const recog = new Ctor();
    recog.continuous = true;
    recog.interimResults = false;
    recog.lang = "en-US";
    let on = false;

    recog.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      el.noteContent.value += (el.noteContent.value ? " " : "") + text;
      updateProgress();
    };

    recog.onerror = (event) => {
      const map = {
        "not-allowed": "Microphone access is blocked for this site.",
        "service-not-allowed": "Microphone access is blocked for this site.",
        "no-speech": "No speech detected — try again.",
        "audio-capture": "No microphone found.",
        network: "Network error while transcribing."
      };
      showToast("Dictation", map[event.error] || event.error, "danger");
    };

    recog.onend = () => {
      on = false;
      el.micBtn.classList.remove("btn-danger", "btn-live-pulse");
      el.micBtn.classList.add("btn-outline-secondary");
    };

    el.micBtn.addEventListener("click", () => {
      if (on) { recog.stop(); return; }
      try {
        recog.start();
        on = true;
        el.micBtn.classList.remove("btn-outline-secondary");
        el.micBtn.classList.add("btn-danger", "btn-live-pulse");
      } catch (err) {
        showToast("Dictation", err.message, "danger");
      }
    });
  }

  // ------------------------------------------------------------- loading
  async function populateFolderOptions() {
    try {
      const notes = await loadAllNotes(user.uid);
      const names = Array.from(new Set(
        notes.map((n) => (n.folder || "").trim()).filter(Boolean)
      )).sort();
      el.folderOptions.innerHTML = names
        .map((n) => '<option value="' + esc(n) + '"></option>').join("");
    } catch (err) {
      /* folder suggestions are a convenience; failing is not fatal */
    }
  }

  async function loadNote() {
    try {
      const doc = await db.collection("notes").doc(noteId).get();
      if (!doc.exists) {
        showToast("Not found", "That note no longer exists.", "danger");
        setTimeout(() => (location.href = "home.html"), 1200);
        return;
      }

      note = { id: doc.id, ...doc.data() };
      el.noteId.value = note.id;
      el.noteTitle.value = note.title || "";
      el.noteContent.value = note.content || "";
      el.noteFolder.value = note.folder || "";
      el.noteTags.value = (note.tags || []).join(", ");
      el.noteDueDate.value = note.dueDate ? toDatetimeLocal(note.dueDate) : "";

      selectedColor = note.color || "#ffffff";
      document.querySelectorAll(".color-circle").forEach((c) => {
        c.classList.toggle("selected", c.dataset.color === selectedColor);
      });

      selectedEmoji = note.emoji || "";
      document.querySelectorAll(".emoji-option").forEach((e) => {
        e.classList.toggle("selected", e.dataset.emoji === selectedEmoji);
      });

      pinned = !!note.pinned;
      renderPin();

      attachments = note.attachments ? note.attachments.slice() : [];
      renderAttachments();

      const owner = note.userId === user.uid;
      el.deleteNoteBtn.hidden = !owner;
      el.shareBtn.hidden = !owner;
      el.editorHeading.textContent = note.title || "Untitled";
      el.editorSub.textContent = owner
        ? "Editing your note"
        : "Shared by " + (note.ownerEmail || "someone");
    } catch (err) {
      showToast("Could not open note", err.message, "danger");
    }
  }

  function renderPin() {
    el.pinBtn.style.opacity = pinned ? "1" : "0.45";
    el.pinBtn.title = pinned ? "Unpin this note" : "Pin this note";
  }

  function renderAttachments() {
    if (!attachments.length) { el.attachmentList.innerHTML = ""; return; }

    el.attachmentList.innerHTML = attachments.map((a, i) =>
      '<span class="badge bg-secondary me-1 mb-1">' + esc(a.name) +
      ' <a href="#" data-idx="' + i + '" class="removeAttachment text-white">&times;</a></span>'
    ).join("");

    el.attachmentList.querySelectorAll(".removeAttachment").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        attachments.splice(Number(e.target.dataset.idx), 1);
        renderAttachments();
      });
    });
  }

  // ------------------------------------------------------------- actions
  function wireActions() {
    el.saveNoteBtn.addEventListener("click", save);
    el.deleteNoteBtn.addEventListener("click", remove);

    el.pinBtn.addEventListener("click", () => {
      pinned = !pinned;
      renderPin();
      showToast(pinned ? "Pinned" : "Unpinned", "Save to apply.", "ok");
    });

    el.exportBtn.addEventListener("click", () => {
      exportNoteTxt({
        title: el.noteTitle.value,
        content: el.noteContent.value,
        folder: el.noteFolder.value,
        tags: tagsArray(),
        dueDate: el.noteDueDate.value ? new Date(el.noteDueDate.value) : null
      });
    });

    el.historyBtn.addEventListener("click", openHistory);
    el.shareBtn.addEventListener("click", openShare);
  }

  function tagsArray() {
    return el.noteTags.value.split(",").map((t) => t.trim()).filter(Boolean);
  }

  async function save() {
    const title = el.noteTitle.value.trim();
    const content = el.noteContent.value.trim();

    if (!title && !content) {
      showToast("Nothing to save", "Add a title or some content first.", "danger");
      return;
    }

    el.saveNoteBtn.disabled = true;
    el.noteMsg.textContent = "Saving...";

    try {
      const files = el.noteAttachments.files ? Array.from(el.noteAttachments.files) : [];
      const next = attachments.slice();

      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(
            `"${file.name}" is ${Math.round(file.size / 1024)}KB — the limit is ` +
            `${Math.round(MAX_ATTACHMENT_BYTES / 1024)}KB per image.`);
        }
        next.push({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await readFileAsDataUrl(file)
        });
      }

      const bytes = next.reduce((sum, a) => sum + (a.dataUrl ? a.dataUrl.length * 0.75 : 0), 0);
      if (bytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new Error("Those attachments are too large together — remove one.");
      }

      const payload = {
        title,
        content,
        folder: el.noteFolder.value.trim(),
        tags: tagsArray(),
        color: selectedColor,
        emoji: selectedEmoji,
        pinned,
        dueDate: el.noteDueDate.value ? new Date(el.noteDueDate.value) : null,
        attachments: next,
        updatedAt: new Date()
      };

      if (noteId) {
        await snapshotBeforeUpdate(noteId);
        await db.collection("notes").doc(noteId).update(payload);
      } else {
        const ref = await db.collection("notes").add({
          ...payload,
          userId: user.uid,
          ownerEmail: user.email,
          sharedWith: [],
          createdAt: new Date()
        });
        noteId = ref.id;
        history.replaceState(null, "", "editor.html?id=" + encodeURIComponent(noteId));
      }

      attachments = next;
      el.noteAttachments.value = "";
      renderAttachments();
      el.noteMsg.textContent = "";
      showToast("Saved", "Your note is up to date.", "ok");
      setTimeout(() => (location.href = "home.html"), 700);
    } catch (err) {
      el.noteMsg.textContent = "";
      showToast("Could not save", err.message, "danger");
    } finally {
      el.saveNoteBtn.disabled = false;
    }
  }

  async function remove() {
    if (!noteId) return;
    if (!confirm("Delete this note? This cannot be undone.")) return;
    try {
      await db.collection("notes").doc(noteId).delete();
      showToast("Deleted", "The note is gone.", "ok");
      setTimeout(() => (location.href = "home.html"), 600);
    } catch (err) {
      showToast("Could not delete", err.message, "danger");
    }
  }

  // ------------------------------------------------------------- history
  async function openHistory() {
    if (!noteId) {
      showToast("No history yet", "Save the note first.", "warn");
      return;
    }

    const modal = new bootstrap.Modal(document.getElementById("historyModal"));
    el.historyModalBody.innerHTML = "Loading...";
    modal.show();

    try {
      const snap = await db.collection("notes").doc(noteId)
        .collection("history").orderBy("savedAt", "desc").get();

      if (snap.empty) {
        el.historyModalBody.innerHTML =
          '<p class="small text-muted mb-0">No earlier versions yet — history starts at your next edit.</p>';
        return;
      }

      el.historyModalBody.innerHTML = snap.docs.map((d) => {
        const h = d.data();
        return `
          <div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-start gap-2">
            <div>
              <div class="fw-bold small">${esc(h.title || "(No title)")}
                <span class="text-muted fw-normal">(${esc(timeAgo(h.savedAt))})</span>
              </div>
              <div class="small text-muted">${esc((h.content || "").slice(0, 110))}</div>
            </div>
            <button class="btn btn-sm btn-outline-primary restoreBtn" data-id="${esc(d.id)}">Restore</button>
          </div>`;
      }).join("");

      el.historyModalBody.querySelectorAll(".restoreBtn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const doc = await db.collection("notes").doc(noteId)
            .collection("history").doc(btn.dataset.id).get();
          if (!doc.exists) return;
          const h = doc.data();

          el.noteTitle.value = h.title || "";
          el.noteContent.value = h.content || "";
          el.noteTags.value = (h.tags || []).join(", ");
          selectedColor = h.color || "#ffffff";
          selectedEmoji = h.emoji || "";
          updateProgress();
          modal.hide();
          showToast("Restored", "Review it, then save to keep this version.", "ok");
        });
      });
    } catch (err) {
      el.historyModalBody.innerHTML =
        '<p class="small text-danger mb-0">' + esc(err.message) + "</p>";
    }
  }

  // ------------------------------------------------------------- sharing
  function openShare() {
    if (!noteId || !note) {
      showToast("Save first", "A note must be saved before sharing.", "warn");
      return;
    }

    const modal = new bootstrap.Modal(document.getElementById("shareModal"));
    el.shareEmailInput.value = "";
    el.shareModalMsg.textContent = "";
    el.shareModalExisting.innerHTML = note.sharedWith && note.sharedWith.length
      ? '<p class="small text-muted mb-2">Shared with ' + note.sharedWith.length + " person(s).</p>"
      : '<p class="small text-muted mb-2">Not shared yet.</p>';
    modal.show();

    el.shareSubmitBtn.onclick = async () => {
      const email = el.shareEmailInput.value.trim();
      if (!email) return;

      el.shareSubmitBtn.disabled = true;
      try {
        const snap = await db.collection("users")
          .where("email", "==", email).limit(1).get();

        if (snap.empty) {
          el.shareModalMsg.className = "small text-danger mt-2";
          el.shareModalMsg.textContent = "No account found with that email.";
          return;
        }

        const uid = snap.docs[0].id;
        if (uid === user.uid) {
          el.shareModalMsg.className = "small text-danger mt-2";
          el.shareModalMsg.textContent = "That's your own account.";
          return;
        }

        await db.collection("notes").doc(noteId).update({
          sharedWith: firebase.firestore.FieldValue.arrayUnion(uid)
        });

        note.sharedWith = (note.sharedWith || []).concat(uid);
        el.shareModalMsg.className = "small text-success mt-2";
        el.shareModalMsg.textContent = "Shared.";
        showToast("Shared", email + " can now see this note.", "ok");
      } catch (err) {
        el.shareModalMsg.className = "small text-danger mt-2";
        el.shareModalMsg.textContent = err.message;
      } finally {
        el.shareSubmitBtn.disabled = false;
      }
    };
  }
})();
