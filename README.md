# 🌥️ Cloud Notes App (NoteSphere)

**A serverless, collaborative notes app with Markdown, checklists, wiki-style linking, version history, voice dictation, read-aloud, reminders, and note sharing — built on Firebase Authentication + Cloud Firestore, no backend server.**

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20JavaScript-blue" />
  <img src="https://img.shields.io/badge/Backend-Firebase-orange" />
  <img src="https://img.shields.io/badge/Database-Firestore-yellow" />
  <img src="https://img.shields.io/badge/Status-Active-brightgreen" />
</p>

---

## ✨ Features

### 🔐 Authentication
- Email/password signup and login as separate pages (`index.html` = login, `signup.html` = signup)
- Each user's notes are private by default, visible only to them (and anyone they explicitly share with)

### 📝 Notes — core
- Create, edit, delete notes, cloud-synced via Firestore
- 5 pastel color labels + an emoji icon per note for quick visual scanning
- Comma-separated tags, shown as badges, included in search
- Live client-side search across title, content, and tags
- Dark mode toggle (persisted in `localStorage`)

### 🖋️ Rich content
- **Markdown rendering** (via `marked.js`, sanitized with `DOMPurify`) — bold, italics, lists, etc.
- **Checklists** — write `- [ ] task` / `- [x] done`, renders as clickable checkboxes that save back to the note
- **Wiki-style note linking** — write `[[Note Title]]` anywhere in a note's content and it renders as a clickable link that opens the matching note for editing
- **Image attachments** — stored inline as base64 directly in the note document (no paid Firebase Storage plan needed). Capped at **350KB per image / 900KB total per note**, since Firestore documents have a 1MB limit

### ⏱️ Reminders & metadata
- Optional due date per note, with **Overdue** / **Due soon** badges
- Optional browser notification when a note is due within the hour (only while the tab is open — no push/service worker)
- Relative "time ago" + live word count shown on every card

### 🕒 Version history
- Every edit snapshots the note's previous state into a `history` subcollection
- "History" button on each note opens a modal to browse and **restore** any past version

### 🎙️ Voice features
- **Dictation** — mic button transcribes speech into the content field (Web Speech API `SpeechRecognition`; Chrome/Edge only, gracefully disabled elsewhere)
- **Read aloud** — every note has a Read/Stop button that speaks the title + content back to you (Web Speech API `SpeechSynthesis`; broader browser support, including Firefox)

### 🤝 Collaboration & sharing
- Share any note with another registered user by email
- Shared notes show up in the recipient's list tagged "Shared by {owner email}"; the owner sees "Shared with N"
- Only the owner can delete a note or manage sharing; both owner and shared users can edit

### 🎨 Design
- Custom light/dark theme built on CSS variables (teal/purple/pink accent palette)
- Animated gradient brand text, floating background color blobs, card entrance animations, and hover/press micro-interactions throughout

---

## 🧠 How it works (architecture)

This is a **pure static frontend** — plain HTML/CSS/vanilla JavaScript, no build step, no bundler, no npm packages required at runtime. All third-party libraries load via CDN `<script>` tags.

```
Browser  ──────────────────────────────────────────────►  Firebase
 │                                                             │
 ├─ Firebase Auth (compat SDK) ─── email/password ───────────► Authentication
 │                                                             │
 ├─ Cloud Firestore (compat SDK) ─── documents/queries ───────► Firestore Database
 │    • users/{uid}                  → email → uid lookup (used for sharing)
 │    • notes/{noteId}                → title, content, tags, color, emoji,
 │                                       dueDate, attachments (base64), sharedWith[]
 │    • notes/{noteId}/history/{id}   → snapshots for version history
 │                                                             │
 ├─ marked.js + DOMPurify (CDN) ─── client-side Markdown render + sanitize
 ├─ Web Speech API (browser-native) ─── SpeechRecognition (dictation)
 │                                       SpeechSynthesis (read aloud)
 └─ Bootstrap 5 (CDN) ─── layout & components
```

There is **no custom backend server** — the browser talks directly to Firebase, and access control is entirely enforced by **Firestore Security Rules** (see below). This is why the rules matter so much: they're the only thing standing between "your notes" and "everyone's notes."

### Page/script map

| Page | Loads | Purpose |
|---|---|---|
| `index.html` | `firebase-config.js`, `auth.js`, `main.js` | Login |
| `signup.html` | `firebase-config.js`, `auth.js`, `main.js` | Account creation |
| `notes.html` | `firebase-config.js`, `notes-render.js`, `notes.js`, `main.js` | Main app |

| JS file | Responsibility |
|---|---|
| `js/firebase-config.js` | Initializes Firebase, exposes global `auth` / `db` |
| `js/auth.js` | Login + signup form handlers |
| `js/notes-render.js` | Pure render/formatting helpers (Markdown, time-ago, due badges, attachments, history snapshotting, read-aloud) |
| `js/notes.js` | All notes-page logic: CRUD, search, modals, sharing, voice, reminders |
| `js/main.js` | Detects which page loaded and calls the right setup function |

---

## 📁 Folder structure

```
cloud-notes-app/
├── css/
│   └── styles.css
├── js/
│   ├── firebase-config.example.js   (template — copy to firebase-config.js)
│   ├── firebase-config.js           (your own config; gitignored)
│   ├── auth.js
│   ├── notes-render.js
│   ├── notes.js
│   └── main.js
├── firestore.rules (security rules — paste into Firebase Console)
├── index.html      (login)
├── signup.html     (signup)
├── notes.html      (main app)
├── .gitignore
├── requirements.txt
└── README.md
```

---

## 🔧 How to run this project locally

### 1. Prerequisites
- A modern browser (**Chrome or Edge recommended** for full voice dictation support; other features work everywhere)
- A way to serve static files over `http(s)` — Firebase Auth does not work from a `file://` URL. Any of:
  - VS Code **Live Server** extension (right-click `notes.html` → "Open with Live Server")
  - `npx serve .`
  - `python -m http.server 5500`
- A free **Firebase project** (Spark plan is enough — no billing/credit card required for anything in this app, since attachments are stored inline instead of using Cloud Storage)

See `requirements.txt` for the full checklist.

### 2. Clone the repository
```bash
git clone <your-repo-url>
cd cloud-notes-app
```

### 3. Set up your Firebase project
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. **Authentication** → Sign-in method → enable **Email/Password**
3. **Firestore Database** → Create database
4. **Project settings** → your web app → copy the config object

### 4. Configure the app
`js/firebase-config.js` is not committed — each person supplies their own Firebase project config.

Copy the template and fill it in:
```bash
cp js/firebase-config.example.js js/firebase-config.js
```
Then open `js/firebase-config.js` and replace the placeholder values with your own project's config.

### 5. Apply Firestore Security Rules
The rules live in [`firestore.rules`](firestore.rules). Copy that file's contents into
Firebase Console → Firestore Database → Rules and click **Publish**.

Since there's no backend server, these rules are the *only* access control in the app — the browser talks straight to Firestore. They enforce:

| | |
|---|---|
| **Read a note** | owner, or a uid listed in `sharedWith` |
| **Create a note** | only as yourself (`userId` and `ownerEmail` must match your token) |
| **Edit a note** | owner freely; a collaborator may change content but *not* `userId`, `ownerEmail`, `sharedWith` or `createdAt` — so they can't re-share it or seize ownership |
| **Delete a note** | owner only |
| **Write history** | anyone who can edit the note (collaborators snapshot on every save too) |
| **Rewrite/delete history** | owner only |
| **`users` lookup** | any signed-in user can resolve one email → uid (needed for sharing), but bulk listing is capped |

### 6. Run it
Start your local server and open `index.html` (or `signup.html` if you don't have an account yet). Sign up, log in, and start creating notes.

---

## ⚠️ Known limitations

- **Attachments**: images only, capped at 350KB each / 900KB total per note (Firestore's 1MB document limit, avoided using paid Cloud Storage)
- **Voice dictation**: Chrome/Edge only (Web Speech API `SpeechRecognition` isn't implemented in Firefox/Safari); the mic button disables itself automatically when unsupported
- **Reminders**: browser notifications only fire while the notes tab is open — there's no service worker/push, so nothing fires if the tab or browser is closed
- **Sharing**: recipients must already have an account (share-by-email looks up an existing user; it doesn't send an invite)

---

## 📌 Possible future enhancements
- Folders/notebooks and pinning
- Trash / soft-delete with restore
- Public read-only share links (no login required to view)
- Export notes to Markdown/PDF
- Push notifications for reminders (would require a service worker + Cloud Functions)
