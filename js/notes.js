// Attachments are stored inline as base64 inside the note document (no Firebase Storage /
// billing plan required), so they're bound tightly under Firestore's 1MB document cap.
const MAX_ATTACHMENT_BYTES = 350 * 1024;       // per file, before base64 overhead
const MAX_TOTAL_ATTACHMENT_BYTES = 900 * 1024; // leaves headroom under the 1MB doc limit

// ========== NOTES PAGE (notes.html) ==========
// Relies on helpers from notes-render.js and the global auth/db from firebase-config.js
function setupNotesPage() {
  const noteIdInput        = document.getElementById("noteId");
  const titleInput         = document.getElementById("noteTitle");
  const contentInput       = document.getElementById("noteContent");
  const tagsInput          = document.getElementById("noteTags");
  const dueDateInput       = document.getElementById("noteDueDate");
  const attachmentsInput   = document.getElementById("noteAttachments");
  const attachmentListEl   = document.getElementById("attachmentList");
  const micBtn             = document.getElementById("micBtn");
  const saveBtn            = document.getElementById("saveNoteBtn");
  const clearBtn           = document.getElementById("clearFormBtn");
  const notesList          = document.getElementById("notesList");
  const noteMsg            = document.getElementById("noteMsg");
  const logoutBtn          = document.getElementById("logoutBtn");
  const searchInput        = document.getElementById("searchInput");
  const themeToggle        = document.getElementById("themeToggle");

  const historyModalEl     = document.getElementById("historyModal");
  const historyModalTitle  = document.getElementById("historyModalTitle");
  const historyModalBody   = document.getElementById("historyModalBody");

  const shareModalEl       = document.getElementById("shareModal");
  const shareModalTitle    = document.getElementById("shareModalTitle");
  const shareModalExisting = document.getElementById("shareModalExisting");
  const shareEmailInput    = document.getElementById("shareEmailInput");
  const shareModalMsg      = document.getElementById("shareModalMsg");
  const shareSubmitBtn     = document.getElementById("shareSubmitBtn");

  let selectedColor      = "#ffffff";
  let selectedEmoji      = "";
  let currentAttachments = [];
  let allNotes            = [];
  let currentUserId       = null;
  const notifiedNoteIds  = new Set();
  const speechSupported  = "speechSynthesis" in window;

  // ----- Dark mode helpers -----
  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }

  const savedTheme = localStorage.getItem("theme") || "light";
  applyTheme(savedTheme);
  if (themeToggle && savedTheme === "dark") {
    themeToggle.checked = true;
  }

  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      const newTheme = themeToggle.checked ? "dark" : "light";
      applyTheme(newTheme);
      localStorage.setItem("theme", newTheme);
    });
  }

  // ----- Color picker -----
  const colorCircles = document.querySelectorAll(".color-circle");

  colorCircles.forEach(circle => {
    circle.addEventListener("click", () => {
      selectedColor = circle.dataset.color;
      colorCircles.forEach(c => c.classList.remove("selected"));
      circle.classList.add("selected");
    });
  });

  // ----- Emoji picker -----
  const emojiOptions = document.querySelectorAll(".emoji-option");

  emojiOptions.forEach(el => {
    el.addEventListener("click", () => {
      selectedEmoji = el.dataset.emoji;
      emojiOptions.forEach(e => e.classList.remove("selected"));
      el.classList.add("selected");
    });
  });

  // ----- Voice notes (Web Speech API) -----
  if (micBtn) {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      micBtn.disabled = true;
      micBtn.title = "Voice input isn't supported in this browser";
      const micStatus = document.getElementById("micStatus");
      if (micStatus) {
        micStatus.style.display = "block";
        micStatus.textContent = "🎤 Voice input isn't supported in this browser — try Chrome or Edge.";
      }
    } else {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      let recognizing = false;

      recognition.onstart = () => {
        noteMsg.style.color = "blue";
        noteMsg.textContent = "Listening...";
      };

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        contentInput.value = contentInput.value
          ? `${contentInput.value} ${transcript}`
          : transcript;
      };

      // Without this, permission/network failures fail completely silently —
      // the button just looks "stuck" with no explanation.
      recognition.onerror = (event) => {
        const messages = {
          "not-allowed": "Microphone access is blocked. Allow microphone permission for this site in your browser settings and try again.",
          "service-not-allowed": "Microphone access is blocked. Allow microphone permission for this site in your browser settings and try again.",
          "no-speech": "No speech detected — try again.",
          "audio-capture": "No microphone was found on this device.",
          "network": "Network error while transcribing — check your internet connection."
        };
        noteMsg.style.color = "red";
        noteMsg.textContent = messages[event.error] || `Voice input error: ${event.error}`;
      };

      recognition.onend = () => {
        recognizing = false;
        micBtn.classList.remove("btn-danger", "btn-live-pulse");
        micBtn.classList.add("btn-outline-secondary");
        if (noteMsg.textContent === "Listening...") {
          noteMsg.textContent = "";
        }
      };

      micBtn.addEventListener("click", () => {
        if (recognizing) {
          recognition.stop();
          return;
        }
        try {
          recognition.start();
          recognizing = true;
          micBtn.classList.remove("btn-outline-secondary");
          micBtn.classList.add("btn-danger", "btn-live-pulse");
        } catch (err) {
          noteMsg.style.color = "red";
          noteMsg.textContent = `Could not start voice input: ${err.message}`;
        }
      });
    }
  }

  // ----- Attachment list (edit-panel preview) -----
  function renderAttachmentList() {
    if (!attachmentListEl) return;
    if (!currentAttachments.length) {
      attachmentListEl.innerHTML = "";
      return;
    }

    attachmentListEl.innerHTML = currentAttachments
      .map((a, i) => `<span class="badge bg-light text-dark border me-1 mb-1">${a.name} <a href="#" data-idx="${i}" class="removeAttachment text-danger text-decoration-none">&times;</a></span>`)
      .join("");

    attachmentListEl.querySelectorAll(".removeAttachment").forEach(el => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const idx = Number(e.target.dataset.idx);
        currentAttachments.splice(idx, 1);
        renderAttachmentList();
      });
    });
  }

  // ----- Auth guard + initial load -----
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "index.html";
    } else {
      currentUserId = user.uid;
      loadNotes(currentUserId);
    }
  });

  // ----- Save / update note -----
  saveBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    const title   = titleInput.value.trim();
    const content = contentInput.value.trim();
    const tagsStr = tagsInput ? tagsInput.value.trim() : "";
    const tagsArr = tagsStr
      ? tagsStr.split(",").map(t => t.trim()).filter(t => t.length > 0)
      : [];
    const dueDateVal = dueDateInput && dueDateInput.value ? new Date(dueDateInput.value) : null;

    if (!title && !content) {
      noteMsg.style.color = "red";
      noteMsg.textContent = "Note cannot be empty!";
      return;
    }

    const noteId = noteIdInput.value;
    saveBtn.disabled = true;
    noteMsg.style.color = "blue";
    noteMsg.textContent = "Saving...";

    try {
      const attachments = [...currentAttachments];
      const files = attachmentsInput && attachmentsInput.files ? Array.from(attachmentsInput.files) : [];

      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(`"${file.name}" is ${Math.round(file.size / 1024)}KB — attachments are limited to ${Math.round(MAX_ATTACHMENT_BYTES / 1024)}KB each since they're stored directly in the note.`);
        }
        const dataUrl = await readFileAsDataUrl(file);
        attachments.push({ name: file.name, type: file.type, size: file.size, dataUrl });
      }

      const estimatedBytes = attachments.reduce((sum, a) => sum + (a.dataUrl ? a.dataUrl.length * 0.75 : 0), 0);
      if (estimatedBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new Error(`These attachments are too large combined (Firestore notes are capped at 1MB total). Remove one and try again.`);
      }

      if (noteId) {
        await snapshotBeforeUpdate(noteId);
        await db.collection("notes").doc(noteId).update({
          title,
          content,
          tags: tagsArr,
          color: selectedColor,
          emoji: selectedEmoji,
          dueDate: dueDateVal,
          attachments,
          updatedAt: new Date()
        });
        noteMsg.style.color = "green";
        noteMsg.textContent = "Note updated!";
      } else {
        await db.collection("notes").add({
          userId: user.uid,
          ownerEmail: user.email,
          title,
          content,
          tags: tagsArr,
          color: selectedColor,
          emoji: selectedEmoji,
          dueDate: dueDateVal,
          attachments,
          sharedWith: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });
        noteMsg.style.color = "green";
        noteMsg.textContent = "Note added!";
      }

      clearForm();
      loadNotes(user.uid);
    } catch (error) {
      noteMsg.style.color = "red";
      noteMsg.textContent = error.message;
    } finally {
      saveBtn.disabled = false;
    }
  });

  // ----- Clear form -----
  clearBtn.addEventListener("click", () => {
    clearForm();
    noteMsg.textContent = "";
  });

  function clearForm() {
    noteIdInput.value  = "";
    titleInput.value   = "";
    contentInput.value = "";
    if (tagsInput) tagsInput.value = "";
    if (dueDateInput) dueDateInput.value = "";
    if (attachmentsInput) attachmentsInput.value = "";

    selectedColor = "#ffffff";
    selectedEmoji = "";
    currentAttachments = [];
    renderAttachmentList();

    colorCircles.forEach(c => c.classList.remove("selected"));
    const defaultCircle = document.querySelector('.color-circle[data-color="#ffffff"]');
    if (defaultCircle) defaultCircle.classList.add("selected");

    emojiOptions.forEach(e => e.classList.remove("selected"));
    const defaultEmoji = document.querySelector('.emoji-option[data-emoji=""]');
    if (defaultEmoji) defaultEmoji.classList.add("selected");
  }

  // ----- Populate form for editing (used by Edit button + note-links) -----
  function populateEditForm(note) {
    noteIdInput.value  = note.id;
    titleInput.value   = note.title || "";
    contentInput.value = note.content || "";
    if (tagsInput) tagsInput.value = (note.tags || []).join(", ");
    if (dueDateInput) dueDateInput.value = note.dueDate ? toDatetimeLocal(note.dueDate) : "";
    if (attachmentsInput) attachmentsInput.value = "";

    selectedColor = note.color || "#ffffff";
    colorCircles.forEach(circle => {
      circle.classList.remove("selected");
      if (circle.dataset.color === selectedColor) circle.classList.add("selected");
    });

    selectedEmoji = note.emoji || "";
    emojiOptions.forEach(el => {
      el.classList.remove("selected");
      if (el.dataset.emoji === selectedEmoji) el.classList.add("selected");
    });

    currentAttachments = note.attachments ? [...note.attachments] : [];
    renderAttachmentList();

    noteMsg.style.color = "blue";
    noteMsg.textContent = "Editing existing note...";
  }

  // ----- Logout -----
  logoutBtn.addEventListener("click", async () => {
    await auth.signOut();
    window.location.href = "index.html";
  });

  // ----- Reminders (in-tab browser notifications) -----
  function checkReminders(notes) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return;

    notes.forEach(note => {
      if (!note.dueDate || notifiedNoteIds.has(note.id)) return;
      const due = note.dueDate.toDate ? note.dueDate.toDate().getTime() : new Date(note.dueDate).getTime();
      const diff = due - Date.now();

      if (diff > 0 && diff < 60 * 60 * 1000) {
        new Notification(`Note due soon: ${note.title || "Untitled"}`, {
          body: (note.content || "").slice(0, 100)
        });
        notifiedNoteIds.add(note.id);
      }
    });
  }

  // ----- Load from Firestore (own notes + notes shared with you) -----
  async function loadNotes(userId) {
    notesList.innerHTML = "<p>Loading...</p>";

    try {
      const ownedSnap = await db.collection("notes")
        .where("userId", "==", userId)
        .orderBy("updatedAt", "desc")
        .get();

      const sharedSnap = await db.collection("notes")
        .where("sharedWith", "array-contains", userId)
        .orderBy("updatedAt", "desc")
        .get();

      const map = new Map();
      ownedSnap.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
      sharedSnap.forEach(doc => {
        if (!map.has(doc.id)) map.set(doc.id, { id: doc.id, ...doc.data() });
      });

      allNotes = Array.from(map.values()).sort((a, b) => {
        const at = a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0;
        const bt = b.updatedAt && b.updatedAt.toMillis ? b.updatedAt.toMillis() : 0;
        return bt - at;
      });

      renderNotes(allNotes);
      checkReminders(allNotes);
    } catch (error) {
      notesList.innerHTML = `<p class="text-danger">${error.message}</p>`;
    }
  }

  // ----- Render notes (used by load + search) -----
  function renderNotes(list) {
    stopReadingAloud(); // the list is about to be rebuilt, so any read-aloud button ref would go stale

    if (!list.length) {
      notesList.innerHTML = "<p>No notes found.</p>";
      return;
    }

    notesList.innerHTML = "";

    list.forEach((note) => {
      const card = document.createElement("div");
      card.className = "col-md-6";
      card.dataset.noteId = note.id;

      const isOwner = note.userId === currentUserId;

      const tagsHtml = note.tags && note.tags.length
        ? `<p class="mb-1 small">
             ${note.tags.map(t => `<span class="badge bg-secondary me-1">${t}</span>`).join("")}
           </p>`
        : "";

      const sharedBadge = !isOwner
        ? `<span class="badge shared-badge ms-1">Shared by ${note.ownerEmail || "someone"}</span>`
        : (note.sharedWith && note.sharedWith.length
            ? `<span class="badge bg-secondary ms-1">Shared with ${note.sharedWith.length}</span>`
            : "");

      const emojiHtml = note.emoji ? `<span class="me-1">${note.emoji}</span>` : "";
      const dueBadge  = getDueBadge(note.dueDate);
      const metaHtml  = `<p class="text-muted mb-1 note-meta">${timeAgo(note.updatedAt)} &middot; ${wordCount(note.content)} words</p>`;
      const renderedContent = renderNoteContent(note.content || "");
      const attachmentsHtml = renderAttachments(note.attachments);

      card.innerHTML = `
        <div class="card note-card shadow-sm h-100" style="background:${note.color || "#ffffff"};">
          <div class="card-body">
            <h6 class="card-title mb-1">${emojiHtml}${note.title || "(No title)"}${dueBadge}${sharedBadge}</h6>
            ${tagsHtml}
            ${metaHtml}
            <div class="card-text small mb-0 note-content">${renderedContent}</div>
            ${attachmentsHtml}
          </div>
          <div class="card-footer d-flex justify-content-between flex-wrap gap-1">
            <button class="btn btn-sm btn-outline-primary editBtn">Edit</button>
            <button class="btn btn-sm btn-outline-secondary readBtn"${speechSupported ? "" : ' disabled title="Not supported in this browser"'}>🔊 Read</button>
            <button class="btn btn-sm btn-outline-secondary historyBtn">History</button>
            ${isOwner ? `<button class="btn btn-sm btn-outline-success shareBtn">Share</button>` : ""}
            ${isOwner ? `<button class="btn btn-sm btn-outline-danger deleteBtn">Delete</button>` : ""}
          </div>
        </div>
      `;

      // Enable checklist checkboxes (marked renders them disabled by default)
      card.querySelectorAll('.note-content input[type="checkbox"]').forEach(cb => {
        cb.disabled = false;
      });

      card.querySelector(".editBtn").addEventListener("click", () => populateEditForm(note));
      card.querySelector(".historyBtn").addEventListener("click", () => showHistoryModal(note));

      const readBtnEl = card.querySelector(".readBtn");
      if (readBtnEl && speechSupported) {
        readBtnEl.addEventListener("click", (e) => readNoteAloud(note, e.currentTarget));
      }

      const shareBtnEl = card.querySelector(".shareBtn");
      if (shareBtnEl) shareBtnEl.addEventListener("click", () => showShareModal(note));

      const deleteBtnEl = card.querySelector(".deleteBtn");
      if (deleteBtnEl) {
        deleteBtnEl.addEventListener("click", async () => {
          if (confirm("Delete this note?")) {
            await db.collection("notes").doc(note.id).delete();
            loadNotes(currentUserId);
          }
        });
      }

      notesList.appendChild(card);
    });
  }

  // ----- Checklist toggling (event delegation, since checkbox markup comes from marked) -----
  notesList.addEventListener("change", async (e) => {
    if (!e.target.matches('.note-content input[type="checkbox"]')) return;

    const card = e.target.closest("[data-note-id]");
    if (!card) return;

    const note = allNotes.find(n => n.id === card.dataset.noteId);
    if (!note) return;

    const checkboxes = Array.from(card.querySelectorAll('.note-content input[type="checkbox"]'));
    const idx = checkboxes.indexOf(e.target);

    const lines = (note.content || "").split("\n");
    let count = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*[-*]\s\[( |x|X)\]/.test(lines[i])) {
        count++;
        if (count === idx) {
          lines[i] = lines[i].replace(/\[( |x|X)\]/, e.target.checked ? "[x]" : "[ ]");
          break;
        }
      }
    }

    const newContent = lines.join("\n");
    await snapshotBeforeUpdate(note.id);
    await db.collection("notes").doc(note.id).update({ content: newContent, updatedAt: new Date() });
    note.content = newContent;
  });

  // ----- Note-link ([[Title]]) clicks -----
  notesList.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#note-link:"]');
    if (!link) return;
    e.preventDefault();

    const title = decodeURIComponent(link.getAttribute("href").slice("#note-link:".length));
    const match = allNotes.find(n => (n.title || "").toLowerCase() === title.toLowerCase());

    if (match) {
      populateEditForm(match);
      noteMsg.style.color = "blue";
      noteMsg.textContent = `Opened "${match.title}" for editing.`;
    } else {
      noteMsg.style.color = "red";
      noteMsg.textContent = `Note "${title}" not found.`;
    }
  });

  // ----- History modal -----
  async function showHistoryModal(note) {
    historyModalTitle.textContent = `History — ${note.title || "(No title)"}`;
    historyModalBody.innerHTML = "Loading...";
    const modal = new bootstrap.Modal(historyModalEl);
    modal.show();

    const snap = await db.collection("notes").doc(note.id).collection("history").orderBy("savedAt", "desc").get();

    if (snap.empty) {
      historyModalBody.innerHTML = `<p class="text-muted small">No earlier versions yet — history is recorded from your next edit onward.</p>`;
      return;
    }

    historyModalBody.innerHTML = snap.docs.map(d => {
      const h = d.data();
      const when = timeAgo(h.savedAt);
      const preview = (h.content || "").slice(0, 120);
      return `
        <div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="fw-bold small">${h.title || "(No title)"} <span class="text-muted fw-normal">(${when})</span></div>
            <div class="small text-muted">${preview}</div>
          </div>
          <button class="btn btn-sm btn-outline-primary restoreBtn" data-id="${d.id}">Restore</button>
        </div>
      `;
    }).join("");

    historyModalBody.querySelectorAll(".restoreBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const histDoc = await db.collection("notes").doc(note.id).collection("history").doc(btn.dataset.id).get();
        if (!histDoc.exists) return;
        const h = histDoc.data();

        await snapshotBeforeUpdate(note.id);
        await db.collection("notes").doc(note.id).update({
          title: h.title || "",
          content: h.content || "",
          tags: h.tags || [],
          color: h.color || "#ffffff",
          emoji: h.emoji || "",
          updatedAt: new Date()
        });

        modal.hide();
        loadNotes(currentUserId);
      });
    });
  }

  // ----- Share modal -----
  function showShareModal(note) {
    shareModalTitle.textContent = `Share — ${note.title || "(No title)"}`;
    shareEmailInput.value = "";
    shareModalMsg.textContent = "";
    shareModalMsg.className = "small mt-2";

    shareModalExisting.innerHTML = note.sharedWith && note.sharedWith.length
      ? `<p class="small text-muted mb-2">Currently shared with ${note.sharedWith.length} user(s).</p>`
      : `<p class="small text-muted mb-2">Not shared yet.</p>`;

    const modal = new bootstrap.Modal(shareModalEl);
    modal.show();

    shareSubmitBtn.onclick = async () => {
      const email = shareEmailInput.value.trim();
      if (!email) return;

      shareSubmitBtn.disabled = true;
      try {
        const usersSnap = await db.collection("users").where("email", "==", email).limit(1).get();

        if (usersSnap.empty) {
          shareModalMsg.className = "small text-danger mt-2";
          shareModalMsg.textContent = "No account found with that email.";
          return;
        }

        const targetUid = usersSnap.docs[0].id;
        if (targetUid === currentUserId) {
          shareModalMsg.className = "small text-danger mt-2";
          shareModalMsg.textContent = "You can't share a note with yourself.";
          return;
        }

        await db.collection("notes").doc(note.id).update({
          sharedWith: firebase.firestore.FieldValue.arrayUnion(targetUid)
        });

        shareModalMsg.className = "small text-success mt-2";
        shareModalMsg.textContent = "Shared!";
        loadNotes(currentUserId);
      } catch (error) {
        shareModalMsg.className = "small text-danger mt-2";
        shareModalMsg.textContent = error.message;
      } finally {
        shareSubmitBtn.disabled = false;
      }
    };
  }

  // ----- Search -----
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase();

      if (!q) {
        renderNotes(allNotes);
        return;
      }

      const filtered = allNotes.filter(note => {
        const title   = (note.title || "").toLowerCase();
        const content = (note.content || "").toLowerCase();
        const tagsStr = (note.tags || []).join(" ").toLowerCase();
        return (
          title.includes(q) ||
          content.includes(q) ||
          tagsStr.includes(q)
        );
      });

      renderNotes(filtered);
    });
  }
}
