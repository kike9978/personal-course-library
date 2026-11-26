# Development Plan: Fuentes (saved links)

**App:** Catálogo de cursos (personal-course-library)  
**Date:** 2026-11-26  
**Status:** Phases 1–2 built (2026-11-26). Phases 3–6 proposed.  
**Goal:** Let a YouTube video, an article, or an Instagram post become a place in the knowledge base, the same way a lesson is. Notes taken on a link are ordinary findings. They carry topics, show up in Anotaciones and the graph, sync to Notion, and feed flashcards.

---

## 1. What we are optimizing for

Useful things turn up outside courses: a 6-minute breakdown on YouTube, a thread of reference images on Instagram, or a blog post that explains a technique better than a course does. Today those links end up in browser bookmarks or chat messages and never meet the notes they belong with.

A saved link is **not a small course**. It has no folder, no outline, and no lessons. It is a **source**: one URL with some metadata, which findings can point at. That keeps the model small and reuses everything findings already have.

Rules:

- Sources live in the learning store (app data), next to `findings` and `topics`. Nothing is written to the course library folder. `courseProps.json` stays for real courses only.
- A source is worth keeping once it has at least one finding. Adding a link should take seconds. Processing it into the knowledge base is a separate step.
- No API keys are required for the core flow. Metadata fetching fails softly and the user can always type a title.
- **No sign-in by default.** Out of the box the app never asks for a YouTube, Instagram, or any other account, and never stores one. Content is shown through public embeds, a saved copy, or a capture made from the browser where the user is already signed in. The one exception is an opt-in Instagram sign-in for the viewer (Phase 2b), which the user turns on and can remove at any time.
- **Sources and courses stay apart.** Sources are grouped in their own collections inside the Fuentes view. They never appear in Listas, the course board, or the library grid, and courses never appear in a collection. Shared code is fine. Shared screens and shared records are not.

Leave out of this plan: downloading videos, multi-user sharing, and automatic summaries by a language model.

---

## 2. Current state

| Area | Today | Gap |
|------|--------|-----|
| Findings | `store.findings`, each with `anchors[]` | `normalizeAnchor` (`src/shared/knowledgeGraph.js`) knows only course/lesson/time and project |
| Places | `placeLabel` in `notionSync.js` names a lesson or a project | No label for a URL |
| Navigation | Biblioteca, Anotaciones, Proyectos, Cierres, Listas, Tarjetas | No home for links |
| Player | HTML5 video for local files, timestamp node seeks the lesson | Cannot seek a remote video |
| Transcripts | `lessonTranscripts.js` reads `.srt` / `.vtt` next to lessons | Nothing for remote media |

---

## 3. Data model

### Source record

New top-level array `store.sources`, added by `ensureKnowledge` the same way `topics` and `findings` are. Store version goes to 7.

```js
{
  id,                       // makeId()
  url,                      // canonical URL (see below)
  kind,                     // 'youtube' | 'instagram' | 'article' | 'other'
  title,                    // fetched or typed
  author,                   // channel, account, or byline
  siteName,                 // "YouTube", "Instagram", og:site_name
  thumbnail,                // remote URL, cached to userData/source-thumbs/<id>.<ext>
  durationSec,              // YouTube only, when known
  publishedAt,              // when known
  topicIds: [],
  status,                   // 'inbox' | 'kept' | 'archived'
  snapshot: null,           // Phase 3: { text, capturedAt } for articles / transcripts
  addedAt,
  updatedAt
}
```

**Canonical URL.** Strip tracking parameters (`utm_*`, `si`, `igsh`, `fbclid`). Normalize `youtu.be/<id>`, `youtube.com/shorts/<id>` and `youtube.com/watch?v=<id>` to one form, and keep `t=` as a separate start time, not part of the identity. Adding a URL that already exists opens the existing source instead of creating a duplicate.

### Source anchor

`normalizeAnchor` learns a third kind:

```js
{ sourceId, sourceTitle, timeSec }   // timeSec only for kind 'youtube', else null
```

The rule matches the project anchor: when `sourceId` is set, the course and lesson fields are cleared. A finding may still carry several anchors, so one note can sit on a YouTube moment **and** a project.

Places that must learn the new kind:

- `normalizeAnchor`, `projectFinding` (`src/shared/knowledgeGraph.js`)
- `placeLabel`, `anchorFromNotion`, `anchorsToText` (`src/main/services/notionSync.js`)
- The graph builder: a source is a node like a course, linked to its findings and topics
- Anotaciones grouping (`src/renderer/src/utils/annotationGroups.js`): a **Fuentes** group beside courses
- Flashcard scope (`src/renderer/src/components/flashcards/scopeSources.js`)

Deleting a source asks first and names how many findings point at it. Those findings keep their text and lose only that anchor. This matches how deleting a project works.

### Collection record

New top-level array `store.sourceCollections`. It is kept separate from `store.playlists` on purpose, so playlist code, the course board, and playlist sync can never pick up a source by accident.

```js
{
  id,
  title,
  description,              // short brief, same role as a playlist brief
  layout,                   // 'list' (ordered, like a YouTube playlist) | 'board' (masonry, like a Pinterest board)
  cover,                    // sourceId whose thumbnail is the cover, or null for a mosaic of the first four
  items: [                  // ordered. Order matters in 'list' and is the manual arrangement in 'board'
    { sourceId, note, addedAt }   // note: optional one-line caption for why it is here
  ],
  smart: null,              // Phase 4: saved rule, see below
  createdAt,
  updatedAt
}
```

A source can be in several collections. Removing a source from a collection never deletes the source. Deleting a source removes it from every collection.

---

## 4. Metadata fetching (main process)

New service `src/main/services/sourceMeta.js`, exposed over IPC as `sources:resolve(url)`. It returns the fields above, plus `ok: false` with a reason when it fails. Network calls use the main process `net` module with a 8 s timeout and a generic User-Agent.

| Kind | How | Notes |
|------|-----|-------|
| YouTube | `https://www.youtube.com/oembed?url=<url>&format=json` | Title, channel, thumbnail. No key. Duration is not in oEmbed: read it from the embedded player once it loads (Phase 2) and store it |
| Article / other | GET the page, read `og:title`, `og:image`, `og:site_name`, `article:author`, `article:published_time`, falling back to `<title>` | Read only the first ~512 KB. Ignore pages that are not `text/html` |
| Instagram | Try `og:` tags from the public page, then the public embed page (`/p/<id>/embed/captioned/`) for caption, author and image | Often blocked or a login wall. On failure keep the URL and kind, title becomes «Publicación de Instagram», and the user can edit it or attach a screenshot |

Thumbnails are cached to disk so the grid works offline and does not hit remote hosts on every render.

---

## 5. Phases

### Phase 1 — Save a link, write a finding on it

**Value:** A link found anywhere lands in the app in one paste, and a note about it joins the knowledge base.

**Adding**

- **Fuentes** in AppNav, between Anotaciones and Proyectos (lucide `Link2`).
- Top of the view: one field **Pega un enlace**. Enter resolves, shows a preview card (thumbnail, title, author, kind icon), and saves to the inbox. Title and author are editable inline.
- Pasting a URL anywhere in the Fuentes view (not inside an input) does the same.
- A duplicate URL opens the existing source and briefly highlights it.

**Grid**

- Cards: thumbnail, kind icon (`Youtube`, `Instagram`, `FileText`, `Globe`), title, author · site, finding count, topic chips.
- Filters: **Bandeja / Guardadas / Archivadas** as segmented chips, kind, topic, search over title and author.
- Empty inbox: **Nada pendiente**. Empty library: **Pega un enlace de YouTube, un artículo o una publicación**.

**Source panel**

- Opens beside the grid. Header: title, author, **Abrir enlace** (opens in the system browser via `shell.openExternal`), status chips.
- **Notas:** the same finding cards and composer used in the study side panel. Saving the first finding moves the source from Bandeja to Guardadas, and the panel says so with **Deshacer**.
- Topics: same chip autocomplete as notes.

**Done when**

- Pasting a YouTube or article URL creates a source with a fetched title and thumbnail. An Instagram URL creates a source even when nothing could be fetched.
- A finding written on a source appears in Anotaciones under Fuentes, carries its topics, and shows its source as the place.
- The source and its findings survive restart and appear in the JSON export.
- Notion sync pushes a finding with a source anchor and shows the source title as its place. Pulling it back does not drop the anchor.

### Phase 2 — See the content in the app, without signing in

**Value:** Watch, look at, or read a source next to its notes, without switching to the browser and without logging in anywhere. Notes on a video work like notes on a lesson: **Ir a 4:12** jumps to that second.

**One viewer, one renderer per kind.** The source panel gets a viewer area above the notes, the same split as the course room. Each kind picks the best way to show content that needs no account. When nothing works, it falls back to the next row down.

| Kind | First choice | Fallback | Last resort |
|------|--------------|----------|-------------|
| YouTube | IFrame Player API on `youtube-nocookie.com` | — | Thumbnail + **Abrir enlace** (embedding disabled by the uploader) |
| Instagram post / reel | Public embed page `instagram.com/p/<id>/embed/captioned/` in a sandboxed frame | Captured copy (Phase 6 extension, or **Adjuntar captura**) shown in the app's own image/video viewer | Thumbnail + caption from metadata + **Abrir enlace** |
| Instagram story | Captured copy only (stories expire after 24 h and have no public embed) | — | **Abrir enlace** |
| Article | Reader view of the saved copy (Phase 3), rendered by the app with its own typography | Live page in a sandboxed `<webview>` | **Abrir enlace** |
| Other | Live page in a sandboxed `<webview>` | — | **Abrir enlace** |

**YouTube**

- Composer reads **Escribe una nota en 4:12** using the player's current time. The timestamp node seeks the embedded player.
- Remember the last position per source (same idea as `lastPositionSec` on courses), and read `durationSec` from the player.
- A `t=` in the pasted URL becomes the start position the first time the source is opened.

**Instagram**

- Public posts and reels from public accounts render through the embed page without an account. That page is what Instagram serves to websites that embed a post, so it is the supported no-login path.
- Private accounts, age-restricted posts, and stories cannot be shown without a session. For those, the viewer shows the captured copy if there is one. Otherwise it says **Esta publicación necesita iniciar sesión en Instagram. Guárdala desde el navegador con la extensión para verla aquí.** and offers **Adjuntar captura**.
- Carousels: the embed handles paging. Captured carousels show as a strip in the app's viewer (reuse `CierreImageViewer`).
- **Spike result (2026-11-26, Electron 33):**
  - A public reel (`/reel/C08-b3uM0U9/embed/captioned/`) loads in a fresh in-memory session with no Instagram cookies: video, account, caption, and likes. A removed or invented code shows Instagram's "link may be broken" page. A carousel was not tested.
  - The first load sometimes fails with `ERR_FAILED`. A second load works, so the viewer has **Reintentar**.
  - YouTube's embed shows **Error 153** with no referrer. With `httpreferrer="https://www.youtube-nocookie.com/"` on the webview it plays, with no cookies set.
  - Instagram's `og:title` is localized ("… en Instagram: …"), so the title parser accepts any language.

**Isolation for anything remote**

- Remote content never loads in the main renderer. Embeds and pages run in a `<webview>` (or frame) with its own session partition, `partition="sources"` (not persisted), so no cookies are kept between runs and nothing is shared with the app.
- `nodeIntegration` off, `contextIsolation` on, no preload in that partition. `webviewTag` is enabled only for the Fuentes window, and the main process rejects `will-attach-webview` for any other origin or preferences.
- Popups and navigation away from the source's host open in the system browser (`setWindowOpenHandler`, `will-navigate`).
- The renderer CSP in `src/renderer/index.html` gains `frame-src` for `https://www.youtube-nocookie.com` and `https://www.instagram.com` only.
- Login walls are not worked around inside the webview. If a page redirects to a login screen, the viewer stops and shows the fallback for that kind.

**Graph.** The knowledge graph shows sources as nodes. Choosing one opens the source panel.

**Considered and not chosen: anonymous Instagram viewers.** Third-party "anonymous story viewer" sites fetch Instagram content through their own accounts or scrapers and show it without a login. They are left out because:

- **Privacy.** Every saved link and every view would go to an unknown third party, which breaks the rule that requests go straight to the link's host.
- **Reliability.** These sites break, change domains, and fill pages with ads and redirects. The plan would depend on something with no stable interface.
- **Terms.** They work by scraping against Instagram's terms. Building the app on top of them puts the feature at the mercy of that cat-and-mouse game.
- **Not needed for most of the value.** Public posts already work through the embed. Stories and private posts are better handled by capturing them once, in the browser where the user is already signed in (Phase 6). That gives a permanent copy, while a story viewer only works until the story expires.

If a later need appears that only such a service can meet, add it as an explicit, off-by-default setting that names the service and warns that links are sent to it. Do not add it silently.

**Done when**

- A note saved at 4:12 shows **Ir a 4:12**, and choosing it from Anotaciones opens the source and seeks there.
- Closing and reopening a source resumes where it stopped.
- A public Instagram post and reel play in the panel with no Instagram cookies in the app's sessions.
- A story or private post shows its captured copy, or the sign-in message and **Adjuntar captura**, never a login form.
- A link inside any embed opens in the system browser, not inside the app.

### Phase 2b — Optional Instagram sign-in for the viewer

**Value:** Reels with licensed music, stories, and posts from private accounts the user follows play inside the app, the same way they do on instagram.com.

**Why it is needed.** Instagram's public embed leaves the video out of reels with licensed music. It sends only the cover and **Watch on Instagram**. Checked on 2026-11-26: `reel/DfCoEVFg4dN` (original audio) embeds with its video, and `reel/DfTDB71oXxu` (audio "Mbrr · Pupa Chow") embeds with no `<video>` at all. Stories and private posts have no embed. Only a signed-in session gets the video. Third-party apps that play these reels use their own accounts on their servers, Instagram's undocumented endpoints, or the user's login. Of those, only the user's own login keeps links private and doesn't depend on endpoints Instagram can change at any time.

**Rules**

- **Off by default.** Turned on only from the viewer's message or from the app settings, with a sentence saying what is stored and where.
- **The user's own account, entered on Instagram's own login page.** The app never sees or stores the password: Instagram's page sets its cookies in the session, like any browser. No API keys, no app registered with Meta.
- **A separate, persistent session used only for Instagram:** `partition="persist:instagram"`. The YouTube and article viewers stay on the in-memory `sources` session and never see these cookies. The main app window never sees them either.
- **Same isolation as Phase 2.** No Node, no preload, sandboxed, permissions denied except fullscreen, downloads blocked, links to other sites open in the system browser.
- **Nothing beyond what a browser does.** The app shows Instagram's pages. It does not call Instagram's private API, download video files, or read the feed. Metadata fetching (section 4) stays anonymous and does not use this session.
- **Easy to undo.** **Cerrar sesión de Instagram** clears the partition (`session.clearStorageData()`) and switches the viewer back to public embeds.

**Flow**

1. A reel shows the Phase 2 message "Instagram no deja reproducir este reel fuera de su app…". Below it, a second button **Iniciar sesión en Instagram** appears next to **Abrir enlace**.
2. A confirmation dialog explains: the session is kept in this app's data folder, it is used only to view Instagram links in Fuentes, and it can be closed from settings. Accept → a small window opens `https://www.instagram.com/accounts/login/` in the `persist:instagram` partition. Login pages are allowed in that window only.
3. When the window lands back on instagram.com logged in (a `sessionid` cookie exists in the partition), it closes and the viewer reloads.
4. Signed in, Instagram links load the full page (`instagram.com/reel/<code>/`, `/p/<code>/`, `/stories/<user>/<id>/`) instead of the embed. The page is trimmed with injected CSS that hides navigation and suggestions, so the post fills the viewer. If the trim breaks after an Instagram change, the full page still works.
5. If the session expires and Instagram redirects to login, the viewer shows **Tu sesión de Instagram caducó** with **Iniciar sesión otra vez**, never a login form inside the viewer itself.

**Settings**

- A **Fuentes** section in the app settings: **Instagram: sesión iniciada / sin sesión**, **Cerrar sesión de Instagram**, and one line on what it means.
- The viewer footer's "Sin iniciar sesión · nada se guarda" becomes **Sesión de Instagram activa** while signed in, so the state is never hidden.

**Main process changes**

- `sourceViewer.js`: accept `persist:instagram` in `will-attach-webview` only for Instagram URLs, and only when the setting is on. Configure that session's permission and download handlers like `sources`.
- `isLoginUrl` stays as is for the viewer. The login window is the only place that allows `accounts/login` and `challenge` pages.
- New IPC: `instagram-session-status`, `instagram-sign-in` (opens the login window), `instagram-sign-out` (clears the partition).

**Risks**

- **Account checks.** Instagram may ask for a challenge (code by email or SMS) on a new device. The login window must show those pages too.
- **Terms.** This is ordinary browsing with the user's own account, which the terms allow. Automated access is what they forbid, so this phase must stay manual: no background fetching with the session.
- **Shared machines.** The cookies stay in the app's data folder until signed out. The settings sentence says so.

**Done when**

- With the setting off, nothing changes from Phase 2, and the `persist:instagram` partition has no cookies.
- After signing in, `reel/DfTDB71oXxu` plays in the viewer, and a story link from a followed account shows the story.
- The YouTube and article viewers still run in the in-memory session and have no Instagram cookies.
- **Cerrar sesión de Instagram** removes the cookies, and the same reel goes back to the cover and the message.
- An expired session shows the message and the sign-in button, never a login form in the viewer.

### Phase 3 — Keep a copy, reach the rest of the app

**Value:** A link that dies or a post that is deleted does not take the context with it, and sources take part in study.

- **Guardar copia** on articles: extract readable text (a small Readability-style pass in the main process) into `snapshot`. Show it in the panel with a note that it is a copy.
- YouTube captions: fetch the transcript when the video has one and show it as a caption pane where choosing a line seeks. This shares UI with the caption pane in the connected-study plan (Phase 6.1).
- Instagram: **Adjuntar captura** stores an image with the source using the existing note attachment storage.
- Flashcards: sources appear in the scope picker. A card made from a timestamped finding links back to that moment.
- A link-check action marks sources whose URL now returns 404 or 410, without deleting them.

**Done when**

- An article with a saved copy is still readable with the network off.
- A flashcard deck can be scoped to one source or to a topic that mixes courses and sources. This is the one place they meet, because a deck is built from findings, not from courses or sources.

### Phase 4 — Collections

**Value:** Related links stay together. Examples: a run of YouTube videos to watch in order, or a board of Instagram references for a project.

**Where they live.** Inside Fuentes, as a second tab beside the grid: **Fuentes / Colecciones**. Not in Listas. The Listas board, `PlaylistBuilder`, and `PlaylistCanvas` stay course-only.

**Two layouts, one record**

- **Lista** (YouTube playlist). Numbered rows with thumbnail, title, author, and duration. Drag to reorder. **Reproducir** opens the first unwatched YouTube item in the source panel. When a video ends, the panel offers the next one. Total duration is shown in the header when it is known.
- **Tablero** (Pinterest board). Masonry grid of thumbnails at their natural aspect ratio. Instagram posts and article images carry most of these boards. The optional caption shows under the card. Drag to rearrange.
- One toggle in the header switches layout. The items stay the same.

**Adding to a collection**

- **Guardar en…** on any source card and in the source panel opens a short menu of collections, with **Nueva colección** at the bottom. Same pattern as `LinkProjectMenu`.
- Multi-select in the Fuentes grid, then **Guardar en…**, adds several at once.
- Dropping a source card onto a collection in the sidebar adds it.
- The paste field accepts a collection as context. Pasting while a collection is open adds the new source to it.

**Collection page**

- Header: cover mosaic, title, description, count, total duration for Lista.
- Filter by kind and topic inside the collection.
- **Notas de la colección:** every finding anchored to any source in it, newest first. This is the "what did I learn from this board" view.

**Done when**

- A source can be in two collections, reordered in one without affecting the other.
- Switching a collection between Lista and Tablero keeps the order and the captions.
- Nothing in Listas, the library, or the course board changes or lists a source.

### Phase 5 — Smart builder for collections

**Value:** The same help the Listas builder gives with courses, but over sources: suggest groups, find similar links, and round-trip a brief through an outside assistant.

**Reuse the engine, not the screen.** Today the Listas builder has two parts:

1. Local similarity in `src/shared/playlistSemantic.js`: `courseDocument`, `termVector`, `cosine`, `semanticNeighborhood`, `clusterCourses`. No model and no network.
2. Copy-and-paste briefs in `src/shared/playlistBrief.js` and `briefRoundtrip.js`: build a brief, paste the answer back, parse it into lists.

For sources:

- Make the similarity functions generic over "an item with a document". Add `sourceDocument(source)` that joins the title, author, site, topic titles, caption text, and the first lines of its findings (and the saved snapshot, when there is one). `courseDocument` stays as it is. This is a refactor of `playlistSemantic.js` with its existing tests kept green, plus new tests for sources.
- Add `src/shared/collectionBrief.js` with `buildCollectionBrief` / `parseCollectionBrief`. It follows the same format ideas as the playlist brief, but rows are source URLs or ids, not course folders. Use a separate `kind` for `useBriefRoundtrip` (`'collections'`) so a pending course brief and a pending source brief never collide.
- New `CollectionBuilder.jsx` inside Fuentes. It borrows the layout and classes of `PlaylistBuilder` but reads and writes only `sources` and `sourceCollections`.

**What the builder offers**

- **Agrupar la bandeja:** cluster unfiled sources and propose collections with suggested titles. Accept, rename, or drop each one.
- **Parecidas:** from a source or a collection, show the nearest sources not yet in it, with **Añadir**.
- **Brief:** copy a brief of selected sources to the clipboard, paste the assistant's answer back, review the proposed collections and placements, then apply.

**Smart collections (rule-based).** Optional `smart` field on a collection: `{ topicIds, kinds, status, addedWithinDays, text }`. A smart collection fills itself from those filters and updates when sources change. Manual items can still be pinned on top. **Convertir en fija** freezes the current result into a normal collection.

**Done when**

- Clustering an inbox of 30 mixed links proposes groups without touching any course data.
- A brief made from sources can only produce collections. Pasting a course brief into the collection builder is rejected with a clear message, and the reverse also fails.
- A smart collection for topic X and kind YouTube shows a newly added matching video without manual action.

### Phase 6 — Chrome extension

**Value:** Save the page you are on without leaving the browser. On YouTube, save the exact second and a first note in the same step.

**How the extension reaches the app.** Three options were considered:

| Option | Works when the app is closed | Setup | Verdict |
|--------|------------------------------|-------|---------|
| Native messaging host | Yes, Chrome starts the host | A host manifest written to a per-OS, per-browser location at install. Awkward under WSL | Not now |
| Custom protocol (`courselib://save?…`) | Yes, the OS launches the app | `app.setAsDefaultProtocolClient` plus `protocols` in `electron-builder.yml` | **Fallback** |
| Local HTTP server on `127.0.0.1` | No | Pairing once with a token | **Primary** |

**Primary: loopback server.**

- The main process starts a small HTTP server on `127.0.0.1` only, on a fixed port with a fallback range (for example 47321–47325). It does not listen on any other interface.
- Routes:
  - `GET /v1/ping` returns `{ app, version, paired }`
  - `POST /v1/sources` takes `{ url, title, author, thumbnail, kind, timeSec, selection, note, collectionId, snapshotHtml? }` and returns the created or existing source
  - `GET /v1/collections` returns ids and titles for the **Guardar en…** picker
  - `GET /v1/topics` returns topic ids and titles for the topic chips
- **Pairing.** **Conectar extensión** in the app settings shows a 6-digit code. The extension sends it once to `POST /v1/pair` and receives a long random token. It keeps the token in `chrome.storage.local` and sends it as a header on every call. Requests without a valid token are rejected. **Desconectar** in the app revokes the token.
- **Origin check.** Accept only requests whose `Origin` is the extension's `chrome-extension://<id>`. Send no wildcard CORS headers. A web page must never be able to add sources or read collections.
- Everything goes through the same `sources:resolve` and source store code as a paste in the app, including duplicate detection.

**Fallback: protocol link.** When `ping` fails because the app is closed, the extension opens `courselib://save?url=…&t=…&title=…`. The OS launches the app, the app shows a confirmation card in Fuentes, and nothing is saved until the user accepts. The confirmation step is there because any web page can open that link, not just the extension. The app needs `app.requestSingleInstanceLock()` and a `second-instance` handler so a link reaches the running window instead of starting a second copy. Today `src/main/index.js` has neither.

**Extension (Manifest V3)**

- New folder `extension/` in this repo, with its own small build. It has no shared runtime with the Electron app, apart from copying the URL helpers in `src/shared` (canonical URL, kind detection).
- Permissions: `activeTab`, `storage`, `contextMenus`, plus host permission for `http://127.0.0.1/*`. No `<all_urls>` and no content script on every page.
- **Popup** (toolbar button, shortcut Alt+Shift+S):
  - Preview of the current tab: title, thumbnail, kind icon. Title is editable.
  - On YouTube: **Guardar en 4:12** with the current time read from the page's video element, using `chrome.scripting.executeScript` on that tab only.
  - Selected text on the page becomes a quote in the first note.
  - One-line note field, topic chips, **Guardar en…** collection picker. The last collection used is remembered.
  - **Guardar** saves to Bandeja, or straight to Guardadas when a note was written.
  - States: **Guardado** with **Abrir en la app** (uses the protocol link), **Ya estaba guardado** (shows when it was added), and **La app no está abierta** (offers the protocol fallback).
- **Context menu:** **Guardar enlace en Fuentes** on any link or image. For example, right-click a post in an Instagram feed without opening it.
- **Page copy (optional, Phase 3 tie-in):** a checkbox **Guardar copia del texto** sends the page HTML so the app can extract the snapshot. Pages that need a login, such as Instagram, can be captured this way because the browser already has the session. Off by default.
- **Capture media (Instagram):** on an Instagram post, reel, or story, **Guardar con captura** saves the visible image(s) or a screenshot of the tab (`chrome.tabs.captureVisibleTab`) with the source. This is how stories and private posts become viewable in the app without the app ever signing in (Phase 2). Downloading the reel's video file is out of scope; a screenshot plus the link is enough to recognize it.

**Distribution.** Load unpacked from `extension/dist` while this is personal. Publishing to the Chrome Web Store is a separate decision and needs a privacy page. The same build should load in Edge and Brave without changes.

**Done when**

- With the app open and paired, saving a YouTube tab from the popup creates a source with a finding at the current second, and the app updates live without a reload.
- Saving the same URL twice reports **Ya estaba guardado**.
- A page script calling `fetch('http://127.0.0.1:<port>/v1/sources', …)` is rejected.
- With the app closed, the popup's fallback launches the app and shows the confirmation card.

---

## 6. Risks and open questions

- **Instagram** is the least reliable. Public embeds cover public posts with original audio. The optional sign-in (Phase 2b) covers licensed-music reels, stories and private posts for users who turn it on. Captures from the extension cover the rest. The plan accepts a URL-only source as a normal outcome rather than building a workaround that breaks next month, which is why anonymous viewer services are not used (Phase 2).
- **Embed changes.** If Instagram starts requiring a login for the embed page, the viewer falls back to captures and metadata. The Phase 2 spike result should be re-checked when an Electron upgrade lands.
- **SQLite move.** The connected-study plan moves the learning store to SQLite in Phase 4. `sources` and `sourceCollections` (with an items join table) become their own tables, separate from playlists, and source anchors fit the anchor table it introduces. If that migration lands first, add them to it rather than to the JSON shape.
- **Quick capture outside the app.** Phase 6 covers Chrome. A global shortcut that reads the clipboard would also help for links that arrive in chat apps. Leave that until Phase 6 shows how much capture still happens outside the browser.
- **Mobile.** Instagram links are mostly found on a phone. Neither the app nor the extension reaches the phone. A later option is a share target that writes to a synced inbox file. That is out of scope here.
- **Privacy.** Metadata requests go straight to the link's host from the user's machine, with nothing else attached. Do not route them through any third-party service.

---

## 7. Suggested order of work

| Phase | Kind | Depends on |
|-------|------|------------|
| 1 | Store + view | Source anchor in `normalizeAnchor` and Notion places |
| 2 | In-app viewer | Phase 1 source panel. Instagram embed spike first. CSP and webview isolation. Captured copies need Phase 3 or 6 |
| 2b | Optional Instagram sign-in | Phase 2 viewer and its isolation rules. Independent of Phases 3–6 |
| 3 | Copies + flashcards | Phase 2 for transcripts |
| 4 | Collections | Phase 1 only. Can start right after Phase 1 if grouping matters more than the player |
| 5 | Smart builder | Phase 4 records. Refactor of `playlistSemantic.js` with its tests kept green |
| 6 | Chrome extension | Phase 1 for saving. Phase 4 for the collection picker and Phase 2 for opening at a time. The loopback server and pairing can be built right after Phase 1 |
