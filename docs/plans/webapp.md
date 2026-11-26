# Development Plan: Web app (sin biblioteca)

**App:** Catálogo de cursos (personal-course-library)  
**Date:** 2026-11-26  
**Status:** Proposed.  
**Goal:** Use Anotaciones, Fuentes, Tarjetas, Listas, Proyectos and Cierres from a browser, on any computer or the phone, without the course folder and without the desktop app running. Video and the course library stay in the desktop app.

---

## 1. What we are optimizing for

The app can already open without a course folder (commit 3c36796). In that mode every page except Biblioteca works, because notes, links, cards, lists, projects and cierres live in the learning store, not in the folder. A web app is that mode, served over HTTP instead of from Electron.

Rules:

- **One front end.** The web app is the same React code in `src/renderer`, built a second time for the browser. No second UI to maintain. Things the browser cannot do are hidden or replaced, not rewritten.
- **One back end.** The server runs the same services in `src/main/services` and the same rules in `src/shared`. A note saved from the browser goes through `learningStore.js` exactly like one saved in the desktop app.
- **No course folder on the server.** The server never scans courses, plays video or touches `courseProps.json`. Courses appear only as names that notes, projects and cierres point to.
- **Notion is the bridge.** The desktop app and the web server are two installs of the same app. They meet through the Notion sync that already exists, the way two computers would. No new sync protocol.
- **Private by default.** One user, behind a login. Nothing on the server is public, and the server is never the only copy of the data.

Leave out of this plan: video streaming, more than one user, sharing pages with other people, and offline editing in the browser.

---

## 2. Current state

| Area | Today | Gap for the web |
|------|-------|-----------------|
| Front end ↔ back end | `window.api` in `src/preload/index.js`, about 115 `ipcMain.handle` channels in `src/main/index.js` | Browsers have no IPC. Needs HTTP |
| Live updates | 10 `webContents.send` events (`notes-changed`, `sources-changed`, `cierres-changed`, `notion-sync`, …) | Needs server-sent events |
| Services | 9 files import `electron`, mostly for `app.getPath('userData')`. `sourceMeta.js` uses `net`, `courses.js` and `sourceViewer.js` use `shell` | Must run in plain Node |
| Course names | Come from the scanned course list. With no folder, notes show the raw folder path | Needs a course index without the folder |
| Note images | `course-media://note/?file=…` custom scheme (`noteAttachments.js`) | Needs an HTTP route |
| Fuentes viewer | Electron `<webview>` (`SourceViewer.jsx`) on its own session | Browsers have no `<webview>` |
| Dialogs | `dialog.showOpenDialog` / `showSaveDialog` for images, captures, exports, project folders | Needs file inputs and downloads |
| Notion sync | `notionSync.js`, polls every 15 s (60 s in the background) | Course titles fall back to the folder name, and the server would rename course pages in Notion (`notionSync.js` around line 812). Progress would be pushed as empty |
| Anki | AnkiConnect on `localhost` (`ankiSync.js`) | Unreachable from a server online |

---

## 3. Architecture

```
 Browser (phone, other PC)                 Desktop (Electron, unchanged)
 ┌───────────────────────┐                ┌──────────────────────────┐
 │ src/renderer (web)    │                │ src/renderer (Electron)  │
 │ window.api = webApi   │                │ window.api = preload IPC │
 └──────────┬────────────┘                └────────────┬─────────────┘
            │ HTTPS: POST /api/rpc/:channel,           │ IPC
            │ GET /api/events (SSE), /media/note/…     │
 ┌──────────▼────────────┐                ┌────────────▼─────────────┐
 │ server/ (Node)        │                │ src/main                 │
 │ same services, no     │                │ same services, course    │
 │ course folder         │                │ folder, video            │
 │ data/learning-store…  │                │ userData/learning-store… │
 └──────────┬────────────┘                └────────────┬─────────────┘
            └────────────── Notion database ───────────┘
```

### Channel table, not 115 routes

Each IPC channel becomes one entry in a shared table: `channel → handler(args, ctx)`. Electron registers every entry with `ipcMain.handle`. The server serves the entries marked web-safe at `POST /api/rpc/:channel` with a JSON body `{ args: [...] }`. A channel that is not in the web list returns 404, so desktop-only actions can never run on the server by mistake.

The handlers already in `src/main/index.js` move to `src/main/channels/*.js`, grouped as the preload groups them (notes, sources, projects, decks, playlists, cierres, notion). `ctx` carries the platform bits (see Phase 1) and, for Electron, the sending window.

### Channel groups

**Web-ready** (data in the store, no dialog or window):
`get-course-progress`, `get-all-course-progress`, `get-lesson-progress`, `set-course-excitement`, `record-course-view`, notes (`list-notes`, `upsert-note`, `delete-note`, `list-all-notes`, `get-notes-search-by-course`), bookmarks, topics, sources (`list-sources`, `list-source-notes`, `resolve-source`, `add-source`, `update-source`, `refresh-source`, `delete-source`, `set-source-position`, `remove-source-capture`), projects (`list-projects`, `list-all-projects`, `upsert-project`, `delete-project`), decks and cards (including `set-deck-card-known`, `push-deck-to-notion`), playlists and `get/save-playlist-intent`, cierres and comments, `save-note-image`, `save-note-drawing`, `load-note-drawing`, every `get/set/sync/resolve-notion-*` channel.

**Replaced in the browser** (the web build does it without the server, or with an upload or download):

| Channel | Web replacement |
|---------|-----------------|
| `pick-note-image`, `pick-note-images` | `<input type="file" accept="image/*">`, then `save-note-image` with the bytes |
| `add-source-capture` | Same file input, upload to a new `add-source-capture-data` channel |
| `capture-window-region` | Hidden on the web. Paste an image or upload one instead |
| `export-file`, `export-markdown-bundle`, `export-deck-anki` | The server returns the file and the browser downloads it (`Content-Disposition: attachment`) |
| `open-source-url`, `open-project-link` | `window.open(url, '_blank', 'noopener')`. A project link to a local folder shows as text |
| `open-annotations-window` | Opens `/?annotations=<coursePath>` in a new tab |
| `annotations-jump`, `focus-main-window` | `BroadcastChannel('annotations')` between tabs |
| `read-clipboard-text` | `navigator.clipboard.readText()` |

**Desktop-only** (hidden on the web, 404 on the server):
library path and folder pick, `list-courses` and `refresh-courses` (the web build gets the course index instead, see Phase 4), course props and descriptions, covers, `open/reveal-course-*`, `scan-course`, `get-lesson-media-url`, `read-lesson-transcripts`, `export-courses-zip`, `cancel-course-zip`, `reveal-learning-store`, `pick-project-folder`, `reveal-project-link`, `anki-status`, `sync-deck-to-anki`, `get/set-anki-settings`, `open-google-image-search`.

---

## 4. Phases

### Phase 1 — Services without Electron

**Value:** The store, Notion sync and source metadata run in plain Node. Nothing changes for the desktop app.

- New `src/main/platform.js` with `dataDir()`, `openExternal(url)`, `fetchUrl(url, opts)` and `notify(event, payload)`. Electron sets it up at startup from `app.getPath('userData')`, `shell.openExternal`, `net.fetch` and `webContents.send`. The server sets it up from `DATA_DIR`, a no-op, global `fetch` and the SSE hub.
- Replace `import { app } from 'electron'` in `config.js`, `learningStore.js`, `noteAttachments.js`, `notionSync.js`, `courseScan.js` and `ankiSync.js` with `platform.dataDir()`. `sourceMeta.js` moves from `net` to `platform.fetchUrl`. `courses.js` and `sourceViewer.js` keep their Electron imports. They are desktop-only and the server never loads them.
- `hiddenCoursePathSet` (imported by `learningStore.js` from `courses.js`) reads hidden courses from the folder. Move the part the store needs into a function that takes the set as an argument, so the store module no longer imports `courses.js`.
- Move the handlers from `src/main/index.js` into `src/main/channels/` as the channel table, with a `web: true` flag on each web-ready entry. `index.js` loops over the table to register them.

**Done when**

- `node -e "import('./src/main/services/learningStore.js')"` works outside Electron with `DATA_DIR` set.
- `npm test` passes, and the desktop app works exactly as before, including Notion sync and source previews.
- No file loaded by the server imports `electron` (checked by a test that walks the import graph from `server/index.js`).

### Phase 2 — The server

**Value:** The data can be read and changed over HTTPS by one signed-in user.

- New `server/index.js` on Node's `http` module or Hono (small, no framework lock-in). It serves:
  - `POST /api/rpc/:channel` for channels with `web: true`
  - `GET /api/events`, server-sent events carrying the same names as the IPC events (`notes-changed`, `sources-changed`, `notion-sync`, …)
  - `GET /media/note/:file` for note images and drawings (replaces `course-media://note/`), and `GET /media/source/:id/:file` for thumbnails and captures
  - the built web app as static files, with `index.html` for any other path
- **Login.** One password set with `APP_PASSWORD_HASH` (argon2 or scrypt). `POST /api/login` sets an `HttpOnly`, `Secure`, `SameSite=Strict` session cookie that lasts 30 days. Every other `/api` and `/media` route needs it. Five wrong passwords per minute per IP lock the login for 15 minutes.
- **Safety.** No CORS headers. A check that `Origin` matches the server's own host on every `POST`. Upload size limited to 20 MB. `:file` names are checked against the stored name pattern, so a request can never escape the data folder.
- **One writer.** The server is the only process that writes its `DATA_DIR`. `writeFileAtomicSync` already prevents half-written files.
- `npm run server` starts it for local work against a copy of the learning store.

**Done when**

- With a copy of the real `learning-store.json`, `POST /api/rpc/list-all-notes` returns the same notes the desktop app shows.
- Saving a note from one browser tab updates a second tab within a second, through `/api/events`.
- Requests without the cookie, `POST`s with a foreign `Origin`, a desktop-only channel and `GET /media/note/..%2Flearning-store.json` are all rejected.

### Phase 3 — The web build

**Value:** The same pages open in a browser.

- `vite.web.config.js` builds `src/renderer` to `dist-web/`. It sets `import.meta.env.VITE_PLATFORM = 'web'`.
- New `src/renderer/src/platform/webApi.js` fills `window.api` before React starts. Each method either calls `rpc(channel, ...args)`, subscribes to `/api/events` for `on*` methods (returning the same unsubscribe function the preload returns), or does the browser replacement from the table in section 3. Methods for desktop-only channels are left out, so `window.api.scanCourse` is `undefined` on the web.
- New `src/renderer/src/platform/index.js` exports `isWeb` and `can(feature)`. Components check `can('library')`, `can('video')`, `can('anki')`, `can('capture')`, `can('revealFiles')` instead of whether a method exists. Desktop returns `true` for all of them.
- **Navigation.** On the web the Biblioteca tab is replaced by a short page: "La biblioteca y los videos están en la app de escritorio." Opening a course from a note, cierre or project shows the course name and the notes on it, without a player. `courseMissingMessage` gets a web text: "Abre este curso en la app de escritorio".
- **Fuentes viewer.** `SourceViewer.jsx` picks by platform. On the web, YouTube plays in an `<iframe>` from `youtube-nocookie.com` with the same start-second and "Ir a 4:12" seeking (through the IFrame Player API). Public Instagram posts use the `/embed` iframe. Every other link shows the title, thumbnail, captures and **Abrir en una pestaña nueva**, because most sites refuse to load inside an iframe. Instagram sign-in (Phase 2b of Fuentes) is desktop-only.
- **Note editor.** Image buttons use the file input. Pasting and dropping images keep working, since they already go through `save-note-image` with the image data. Excalidraw drawings work as they are.
- **Login page.** A plain password form shown when any `rpc` call returns 401.
- `DesktopShellNotice` stays for Electron and never shows on the web.

**Done when**

- Anotaciones, Fuentes, Tarjetas, Listas, Proyectos and Cierres load in Chrome and in Safari on an iPhone, and every create, edit and delete works.
- No button on the web build calls a method that is not in `webApi.js`, checked by searching the build for `window.api.` names.
- A YouTube link plays from its saved second, and a note's "Ir a 4:12" seeks it.
- The desktop build has no visible change.

### Phase 4 — Courses as names, and a safe Notion bridge

**Value:** Notes on courses show the course's real name on the web, and two installs syncing to the same Notion database do not undo each other.

- **Course index.** The desktop app writes a small list of the courses it knows: `{ path, title, academia, instructor, programs, hidden }`, no media and no lesson files. It goes to Notion as one page (`Kind = course-index`, JSON body), updated after each library scan when it changed. The server reads it on each poll and keeps it in `DATA_DIR/course-index.json`. `list-courses` on the server returns these entries with `remote: true` and no lessons, so `courseTitleByPath`, filters and the Proyectos board show real names.
- **Course pages in Notion.** `courseTitle()` in `notionSync.js` uses the course index when `courseProps.json` cannot be read, and never falls back to the folder name on an install without a library. An install without a library never renames a course page.
- **Progress.** An install without a library only reads progress from Notion. It never sends `progress` rows, so the desktop's progress cannot be overwritten with an empty one. `set-course-excitement` and `record-course-view` stay local to the server.
- **Install id.** Each install writes a random `installId` to `notion-sync.json` and adds it to the hash inputs it already tracks, so a change made by one install and read back by the other is not seen as a conflict.
- **Who polls.** The server polls every 15 s while a browser has `/api/events` open, and every 60 s otherwise. The same `isActive` hook as the desktop.

**Done when**

- A note taken in the desktop app on a course shows on the web, under the course's real name, within a minute.
- A cierre written on the phone shows in the desktop app within a minute.
- After an hour with both installs running and no edits, the Notion database has no new edits and the conflict list is empty in both.
- Course page titles in Notion stay the same after the server's first full sync.
- Turning the desktop app off does not stop the web app from working.

### Phase 5 — Hosting

**Value:** The web app is reachable from anywhere, with HTTPS and backups.

- **Server:** a Hetzner CX22 (about €4/month) or similar Linux VPS. Fly.io with a 1 GB volume is the no-server-admin alternative. Not Vercel or Netlify: they have no disk to keep the JSON store on.
- **Container:** a `Dockerfile` with Node 22, `npm ci --omit=dev`, `dist-web/` and `server/`. `DATA_DIR=/data` on a mounted volume.
- **HTTPS:** Caddy in front, with an automatic certificate for a subdomain you own. Only ports 80 and 443 open.
- **Secrets:** `APP_PASSWORD_HASH`, the Notion token and the database id as environment variables, never in `DATA_DIR`. `set-notion-sync` on the web cannot change the token, only read whether one is set.
- **Backups:** a daily `tar` of `/data` kept for 14 days on the VPS and copied off it (Hetzner Storage Box or a bucket). Notion and the desktop app are a second copy, not the backup.
- **Updates:** `git pull && docker compose up -d --build`. The store's `version` migration runs at startup, as it does in the desktop app.

**Done when**

- The site loads over HTTPS from a phone on mobile data, and the login works.
- Restoring yesterday's backup to a fresh container gives back the same notes.
- A port scan shows only 80 and 443.

### Phase 6 — Later, in this order

1. **Install on the phone.** A web app manifest and icons so it can be added to the home screen, plus a **share target**: sharing a link from Instagram or YouTube on the phone opens **Guardar en Fuentes** with the URL filled. This closes the mobile gap in the Fuentes plan more directly than sharing to Notion (Fuentes Phase 2c).
2. **Chrome extension on the same API.** The Fuentes plan's Phase 6 routes (`/v1/ping`, `/v1/sources`, `/v1/collections`, `/v1/topics`) become channels in the same table. The extension can then save to the desktop app on `127.0.0.1` or to the server, with the same pairing token flow.
3. **Desktop as the server.** For use at home only: Electron starts the same HTTP server, reached through Tailscale, with the library and video included. It is one process writing one store, so no Notion bridge is needed between them.
4. **SQLite.** When the connected-study plan moves the store to SQLite (its Phase 4), the server uses the same module. Nothing in this plan depends on the JSON shape beyond what the services already hide.

---

## 5. What stays put

- The desktop app keeps every feature and the same data folder. The web app is an extra install, not a replacement.
- `learning-store.json`'s shape, the Notion database schema (apart from the `course-index` kind) and the rules in `src/shared` do not change.
- Video, the course folder, covers, zip export and Anki sync stay desktop-only.

---

## 6. Risks and open questions

- **Notion as the only link.** Both installs depend on Notion being reachable and on the sync being correct. Fuentes Phase 2c has not run against a live database yet. Finish and test it before relying on the bridge. If Notion's rate limit (about 3 requests per second) becomes a problem with two installs, poll less often from the server while no browser is open.
- **Conflicts.** Editing the same note on the phone and the desktop within one poll gives a conflict, shown in both installs. That is the same behaviour as two desktops today. Phase 4's install id should stop false conflicts. A real one still needs a choice.
- **Things Notion does not carry.** Note images and drawings are uploaded to Notion pages but not downloaded back (see "Not synced" in Fuentes Phase 2c). An image added on the web shows on the web, and in Notion, but not in the desktop app until that download exists. Decide whether to build it in Phase 4 or accept the gap.
- **Embeds.** YouTube and Instagram can change their embed rules. The web viewer has no `<webview>` fallback, so a blocked embed shows the link card.
- **Security.** The server holds every note and the Notion token. Keep it to one password-protected user, keep the OS updated (`unattended-upgrades`), and do not add public share links without a separate plan.
- **Open question:** use a subdomain you already own, or a free `*.fly.dev` / `*.duckdns.org` name? This affects only Phase 5.

---

## 7. Suggested order of work

| Phase | Kind | Depends on |
|-------|------|------------|
| 1 | Refactor | Nothing. Safe to do first, no visible change |
| 2 | Server | Phase 1 |
| 3 | Web build | Phase 2. Can run against a copy of the store before any hosting |
| 4 | Notion bridge | Phase 2, and Fuentes Phase 2c tested against a live database |
| 5 | Hosting | Phases 3 and 4 |
| 6 | Later | Phase 5. The Chrome extension item can start after Phase 2 |
