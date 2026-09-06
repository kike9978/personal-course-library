# Development Plan: Course Room & Learning Loop

**App:** Catálogo de cursos (personal-course-library)  
**Date:** 2026-09-06  
**Status:** Proposed  
**Goal:** Evolve from a folder launcher into a local-first learning app where browsing, watching, noting, and resuming happen in-app — with OS Explorer as a deliberate fallback.

---

## 1. Current state

Electron + React catalog over a user-selected courses folder.

| Capability | Status |
|------------|--------|
| Library browse (cards / list) | Done |
| Search, academia / programa filters, sort | Done |
| `isInProcess` + Continuar aprendiendo rail | Done |
| Metadata edit (`courseProps.json`) | Done |
| Cover images + institution logos | Done |
| Folder watcher + refresh | Done |
| **Open course folder in OS** | Primary action today |
| In-course content browser | Missing |
| Playback / resume | Missing |
| Notes / bookmarks | Missing |
| Lesson-level progress | Missing |

Unused fields already written by `jsonGenerator.js`: `theme`, `isIncomplete`, `rate`.

**Primary friction:** the main CTA dumps users into Explorer with no “where was I?” and no reason to stay in the app.

---

## 2. Product principles

1. **Stay in-app by default.** Course Room is the main path; Explorer is secondary.
2. **Files stay on disk.** Reference media in place; never copy the library.
3. **Progress and notes are first-class.** They survive reopen and make Continue Watching real.
4. **Creative-course aware.** Videos + PDFs + project files (PSD/ZIP) — open what we can; hand off the rest to the OS.
5. **Local-first / no accounts.** Learning state lives on the machine next to (or indexed from) the library.

---

## 3. Target experience

### Library (keep, lightly reshape)

- Primary card/row action: **Abrir curso** → Course Room.
- **Abrir en explorador** demoted (overflow / ghost button / detail menu).
- Continue rail resumes **last lesson + timestamp**, not only a boolean flag.
- Optional later: progress ring on cards, ratings/themes filters.

### Course Room (new)

```
┌──────────────┬────────────────────────────┬─────────────────┐
│ Sections &   │ Player / document preview  │ Notes &         │
│ lessons tree │                            │ bookmarks       │
│              │ Resources for this lesson  │                 │
└──────────────┴────────────────────────────┴─────────────────┘
```

- Left: smart-scanned tree (sections, lessons, resources, completion).
- Center: in-app viewer (video first; PDF/image next).
- Right: timestamped notes + bookmarks for the active lesson/course.
- Header actions: back to library, mark status, **Abrir en explorador** (fallback), edit metadata.

### Explorer fallback (explicit)

Keep `openCourseFolder` / `shell.openPath` for:

- Unsupported types (PSD, ZIP, complex project packs).
- “Open containing folder” / reveal in file manager.
- Courses with no playable media yet.
- Power users who prefer the OS for a one-off.

UI rule: never the primary button in Course Room; always one click away.

---

## 4. Architecture overview

### Main process (new / extended)

| Module | Responsibility |
|--------|----------------|
| `services/courses.js` | Existing catalog + open folder (keep) |
| `services/courseScan.js` | Scan course dir → sections / lessons / resources |
| `services/learningStore.js` | Progress, notes, bookmarks persistence |
| Media protocol | Extend `course-media://` (or sibling) to stream lesson files safely |

### Preload API (additions)

- `scanCourse(coursePath)` → tree
- `getLessonMediaUrl(coursePath, relativePath)`
- `getProgress` / `setProgress`
- `listNotes` / `upsertNote` / `deleteNote`
- `listBookmarks` / `upsertBookmark` / `deleteBookmark`
- `listProjects` / `upsertProject` / `deleteProject`
- `pickProjectFolder` / `openProjectFolder` — link + open external project dir
- `createVirtualCourse` / `updateCourseRecord` / `deleteVirtualCourse`
- `listSyllabus` / `upsertSyllabusNode` / `reorderSyllabus` / `importSyllabusFromFolder`
- `openCourseFolder` — **keep** as fallback
- Optional: `openPath` / `showItemInFolder` for a single resource

### Renderer

- Route or view state: `library` | `courseRoom` | `courseMaker`
- New components: `CourseRoom`, `LessonTree`, `LessonPlayer`, `NotesPanel`, `BookmarksList`, `ProjectItemEditor`, `CourseMakerWizard`, `SyllabusEditor`
- Library CTAs updated; detail panel either becomes entry ramp or is removed in favor of Room

### Persistence recommendation

Prefer **SQLite** (e.g. `better-sqlite3`) in `userData` for progress/notes/bookmarks/projects:

- Queryable global Notes / Bookmarks views
- Safer concurrent updates than giant JSON
- Can key lessons by **relative path + optional content hash** so renames are recoverable later

Lightweight alternative for Phase A only: per-course `.learning.json` sidecar — migrate to SQLite by Phase C if starting simple.

Do **not** dump long notes into `courseProps.json` (keep that for catalog metadata).

---

## 5. Data model (learning layer)

```text
LessonRef
  coursePath          # basename under library
  relativePath        # path inside course folder
  contentHash?        # optional, rename-safe later
  sectionTitle?
  title
  kind                # video | audio | pdf | image | other
  durationSec?

Progress
  lessonRef
  positionSec
  completed           # boolean
  lastOpenedAt

Note
  id
  coursePath
  lessonRelativePath?
  timeSec?            # null = course-level journal note
  body                # markdown
  updatedAt

Bookmark
  id
  coursePath
  lessonRelativePath
  timeSec?            # null = whole-lesson pin
  label?
  color?
  createdAt

ProjectItem                        # virtual; NOT derived from disk scan
  id
  coursePath
  title                            # user-defined, e.g. "Snowboard girl – final"
  notes?                           # short description / goals (markdown ok)
  linkedFolderPath                 # absolute path to project folder (may be outside course)
  linkedFolderValid?               # computed: exists + isDirectory
  anchorSectionId?                 # optional: pin under a scanned section in the tree UI
  sortIndex                        # user order among virtual projects
  status                           # not_started | in_progress | completed
  createdAt
  updatedAt
```

**Scanned lessons vs virtual projects:** the Course Room tree is a **merge** of (1) filesystem scan results and (2) user-created `ProjectItem` rows. Projects never appear/disappear because of rescan. Rescan only refreshes disk-backed lessons/resources.

Catalog fields to activate over time:

- `rate` — star rating in edit + sort/filter
- `theme` — tags in edit + filter chips
- Status beyond boolean: `not_started` | `in_progress` | `completed` | `paused` (map from / replace `isInProcess` + `isIncomplete`)

---

## 6. Phased delivery

### Phase A — Course Room shell + in-app video (P0)

**Outcome:** Opening a course no longer means leaving the app.

- [x] Course Room view with back navigation
- [x] `courseScan`: map folders → sections; media files → lessons; attach nearby resources
- [x] Natural sort; strip numeric prefixes / extensions from titles
- [x] Lesson tree UI with selection
- [x] Stream/play video via privileged protocol + `<video>`
- [x] Persist last lesson + `positionSec`; restore on reopen
- [x] Prev / next lesson; basic playback rate
- [x] Primary CTA on cards: Abrir curso
- [x] **Abrir en explorador** as secondary / overflow
- [x] Empty tree state: “No hay lecciones reproducibles” + fallback open folder

**Out of scope:** notes UI, PDF viewer, global search of lesson titles (nice if cheap).

**Exit criteria:** User can open a multi-folder video course, watch, quit, reopen, and resume the same lesson/time without using Explorer.

---

### Phase B — Real progress + Continue Watching (P0)

**Outcome:** Library hub reflects learning, not just a flag.

- [x] Per-lesson completed toggle (manual + auto ~90–95% watched)
- [x] Course % complete derived from lessons
- [x] Status lifecycle: not started / in progress / completed (wire `isIncomplete` if useful)
- [x] Continue rail: last lesson title + progress; click resumes Room at position
- [x] Sort: recently opened / most progress
- [x] Optional progress indicator on cards

**Exit criteria:** Continue Watching always lands on the correct lesson and timestamp.

---

### Phase C — Notes & bookmarks (P1, “fun” core)

**Outcome:** Sticky reason to use the app daily.

- [ ] Timestamped notes (create at current player time; click seeks)
- [ ] Markdown body (simple textarea first; preview optional)
- [ ] Lesson bookmarks + moment bookmarks (label/color optional)
- [ ] Notes panel in Course Room
- [ ] Keyboard: `N` note, `B` bookmark, `M` mark complete
- [ ] Course-level scratchpad / journal (note with `timeSec = null`)
- [ ] Global Notes page (list + search across courses)
- [ ] Global Bookmarks page

**Exit criteria:** User can leave a note at 4:12, find it later from library or Room, and jump back to that moment.

---

### Phase D — Resources & documents (P1)

**Outcome:** Creative courses (PDF + project files) work without constant Explorer trips.

- [ ] Attach PDFs/images/archives to sections/lessons in the tree
- [ ] Inline PDF and image preview
- [ ] “Abrir externamente” / reveal in folder for PSD, ZIP, unknown types
- [ ] Optional subtitle track load (`.srt` / `.vtt`) in player

**Exit criteria:** Typical course with videos + PDF handouts is usable entirely in-app; project files hand off cleanly.

---

### Phase D2 — Virtual project items (P1)

**Outcome:** Users can track hands-on work (Blender files, storyboards, practice pieces) as first-class course items without forcing those folders into the course download structure.

Creative courses often keep **watching** material under `_All Courses/…` and **making** material somewhere else (`Proyectos/`, Desktop, another drive). Virtual projects bridge that.

#### Concept

- A **Project item** is a loose/virtual node in the Course Room tree.
- Decoupled from scan: creating/editing/deleting it does not move or rename course files.
- User picks (or pastes) a **linked folder** anywhere on disk; primary action opens that folder in Explorer (or reveals it).
- Optionally pin under a scanned section (e.g. under `06. Making a Girl…`) or keep in a synthetic **Proyectos** group at the top/bottom of the tree.
- Can have status, short notes, and later notes scoped to `projectId` (same Notes system).

#### UX

- Tree action: **+ Proyecto** (course-level or “add under this section”).
- Form: title (required), linked folder (folder picker), optional notes, optional section anchor, status.
- Selecting a project in the tree: center panel shows project card (path, validity, notes) — not the video player.
- Primary CTA: **Abrir carpeta del proyecto**.
- Secondary: change link, unlink (keep item), delete item, reveal in Explorer if path broken.
- Broken link state: path missing → warn + “Volver a vincular”.
- Library optional later: badge “N proyectos” on course card.

#### Why not only use scanned `Materials/` / ZIP?

- `Materials` and `Archive.zip` are **course assets**, not the user’s working files.
- Project location is often **outside** the course tree (and should stay there).
- Users may want multiple projects per course (iterations, assignments) with no matching folder names inside the download.

#### Implementation notes

- Persist in learning store (SQLite), keyed by `coursePath` + `id`.
- `linkedFolderPath` is absolute; validate on open / on Course Room enter.
- Security: opening a linked folder uses shell open/reveal APIs (same family as Explorer fallback). Do **not** stream arbitrary project paths through the media protocol in v1 — projects are open-external only.
- Tree merge API: `getCourseTree(coursePath)` → `{ sections, lessons, resources, projects }`.
- Do not require the linked folder to live under the library root.

- [ ] `ProjectItem` CRUD in learning store + IPC
- [ ] Folder picker for link; open/reveal linked folder
- [ ] Merge virtual projects into LessonTree (synthetic **Proyectos** section + optional section anchor)
- [ ] Project detail panel in Course Room (no player)
- [ ] Status + short notes on project
- [ ] Broken-link detection and re-link flow
- [ ] Optional: notes attached to `projectId` (extend Note model: `projectId?`)

**Exit criteria:** From a Coloso/Alive-style course, user can add “Mi práctica final”, link `D:\Proyectos\Snowboard`, open that folder from the tree, and the item survives rescans of the course download folder.

---

### Phase E — Catalog intelligence (P2)

**Outcome:** Finding and organizing matches a larger library.

- [ ] Expose `rate` and `theme` in edit modal + filters/search
- [ ] Search instructor, programs, themes, and note text
- [ ] Surface courses missing `courseProps` (don’t silent-filter forever)
- [ ] In-app generate/repair `courseProps` (port CLI)
- [ ] Learning paths / tracks (ordered course sets) — optional
- [ ] Favorites + “New” badge from folder mtime

**Exit criteria:** Metadata and search cover how users actually look for creative courses.

---

### Phase E2 — Virtual Course Maker (P2)

**Outcome:** Users can author their own courses inside the app — not only annotate downloaded ones — with assistive tools so setup is faster than hand-building folders + `courseProps.json`.

Downloaded courses stay scan-first. **Virtual (or hybrid) courses** are user-owned curricula assembled from links, virtual nodes, and optional disk roots. Projects (D2) are one item type inside any course; the maker creates the **course shell and syllabus**.

#### Why

- Personal curricula (“Blender fundamentals remix”, “Storyboard practice path”) that don’t exist as a single download folder.
- Practice-only courses that are mostly projects + notes, little or no video.
- Soft reorganization: keep messy Alive!/Coloso trees on disk, present a cleaner syllabus via virtual sections/lessons that **link** to real files.
- Onboarding: create a proper catalog entry without leaving the app or running the CLI generator.

#### Course kinds (library)

| Kind | Source of truth | Tree |
|------|-----------------|------|
| **Disk course** | Folder under library + scan | Scan ∪ projects ∪ optional virtual overlays |
| **Virtual course** | Learning store only (no required library folder) | 100% authored nodes (sections, linked lessons, projects, notes) |
| **Hybrid course** | Optional root folder + authored overlay | Scan ∪ user syllabus (hide/reorder/add) |

v1 can ship **Disk + Virtual**; Hybrid overlay (hide/reorder scanned lessons) can follow.

#### Virtual syllabus node types

Reuse and extend the tree model:

- **Section** (virtual) — titled group, ordered
- **Linked lesson** — points at a file anywhere (video/pdf/…); play if protocol allows or open external
- **Linked folder lesson** — open folder (same behavior as project open)
- **Project item** — same as D2
- **Note / text lesson** — markdown body only (checklist, brief, assignment) with no file
- **Separator / milestone** — optional soft divider (“Week 2”, “Entrega”)

Disk-scanned lessons remain `kind` from extension; virtual nodes carry `origin: 'virtual'`.

#### Assistive tools (maker UX)

Goal: reduce friction vs raw Finder + JSON.

1. **New course wizard**
   - Title, academia, instructor, programs/themes, cover (pick image or generate placeholder).
   - Choose kind: Virtual / from existing folder (register disk course + optional generate `courseProps`).
2. **Structure assistants**
   - **From folder:** pick any folder → propose sections/lessons via the same generic scanner → user confirms import as *links* (no copy) into the virtual syllabus.
   - **From existing course:** “Duplicar como virtual” / “Remix” — copy metadata + optionally deep-link the same media paths into a new virtual course.
   - **Blank practice course:** template with Proyectos section + journal note lesson.
   - **Quick add:** multi-select files → append as linked lessons under current section.
3. **Syllabus editor**
   - Drag-reorder sections/lessons; indent/outdent; rename display titles without renaming disk files.
   - Bulk “pretty title” (strip `01-02-` prefixes for display).
   - Attach/replace linked path; broken-link repair (same as projects).
4. **Metadata helpers**
   - Parse `Academia - Título` from a folder name (same rules as `jsonGenerator`).
   - Suggest programs from title keywords (existing heuristic list).
   - Optional: create real library subfolder + `courseProps.json` + cover for users who want a disk anchor.

#### Data model additions

```text
CourseRecord                      # extends catalog beyond pure disk basename
  id                              # stable id (disk courses may use basename as id)
  kind                            # disk | virtual | hybrid
  title, institution, instructor, programs, themes, rate, …
  libraryFolderName?              # set for disk/hybrid under library root
  coverPath?                      # absolute or library-relative
  createdAt, updatedAt

SyllabusNode
  id
  courseId
  parentId?                       # section nesting
  type                            # section | linked_lesson | linked_folder | project | text | milestone
  title
  sortIndex
  linkedPath?                     # file or folder absolute path
  body?                           # markdown for text lessons
  status?
  hidden?                         # hybrid: hide a scanned node from UI
```

Disk courses can keep using basename + `courseProps.json` initially; virtual courses live entirely in the learning store (and appear in the library grid like any other course).

#### Library UX

- Header / empty actions: **+ Nuevo curso** → wizard.
- Virtual courses badged (“Virtual” / “Remix”) so they’re distinct from downloads.
- Same Course Room, Continue, notes, bookmarks — progress keys off `courseId` + node id (not only relative scan paths).
- Delete virtual course = delete store rows (confirm); does **not** delete linked media on disk.
- Optional export: write a folder + `courseProps` + `syllabus.json` for backup/portability (later).

#### Security

- Linked lesson playback: allow media protocol only for paths the user explicitly added (allowlist per course) **or** restrict in-app play to files under library root and open-external otherwise. Prefer allowlist of linked paths for virtual courses.
- Never delete or move user files from the maker UI in v1 (link/unlink only).

#### Scope checklist

- [ ] `CourseRecord` + `SyllabusNode` in learning store
- [ ] Library: create virtual course wizard (metadata + blank syllabus)
- [ ] Syllabus editor: sections, linked lessons/folders, text lessons, reorder
- [ ] Assist: import structure from picked folder (scan → confirm → link)
- [ ] Assist: remix/duplicate from existing disk course
- [ ] Assist: blank “practice” template (projects + journal)
- [ ] Cover picker; metadata parse from folder name
- [ ] Course Room works for virtual courses (tree from syllabus, not scan)
- [ ] Progress / notes / bookmarks keyed by syllabus node id
- [ ] Badge + delete virtual course without touching disk media
- [ ] (Later) Hybrid hide/reorder overlay on scanned courses
- [ ] (Later) Export syllabus + optional disk folder scaffold

**Exit criteria:** User can create “Mi ruta de storyboard”, add sections, link two videos from different course folders, add a text assignment and a project folder link, then resume/notes work like a normal course — without reorganizing `_All Courses`.

**Out of scope for E2:** AI-generated curricula, downloading from platforms, editing/moving original course files.

---

### Phase F — Delight & polish (P2/P3)

- [ ] Completion celebration
- [ ] Light activity: weekly minutes / streak (after playback is trustworthy)
- [ ] Optional focus timer
- [ ] Slimmer library header; demote redundant stats strip
- [ ] Full Spanish copy (including native dialogs where possible)
- [ ] Keyboard cheat sheet
- [ ] Auto cover from first video frame when no `cover-image`

---

## 7. UX / IA changes by surface

| Surface | Change |
|---------|--------|
| Library cards / rows | Primary: Abrir curso. Folder icon secondary. |
| Detail panel | Prefer navigate to Room; or slim entry with Resume + Explorer fallback. |
| Continue hub | Show lesson subtitle + %; resume into Room. |
| Course Room | New primary workspace. |
| Lesson tree | Disk scan **plus** virtual project items (synthetic Proyectos / section pins). |
| Project item | Card + open linked folder; not a media lesson. |
| Course Maker | Wizard + syllabus editor for virtual/hybrid courses; assist import/remix/templates. |
| Edit modal | Catalog only; notes live in Room. |
| Setup / empty | Document expected folder shape; offer generate `courseProps` **or** create virtual course. |

### Suggested shortcuts (Course Room)

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `[` / `]` | Prev / next lesson |
| `N` | Note at current time |
| `B` | Bookmark moment |
| `M` | Toggle lesson complete |
| `Esc` | Back to library (or close panel) |

---

## 8. Folder scan strategy: generic, not per-course

### Decision

**Do not write per-course or per-academy parsers.** Real libraries are too inconsistent (see examples below). Build one **generic recursive scanner** with small, composable heuristics, then let the UI + Explorer fallback absorb edge cases.

Trying to “fix” Alive!-style duplicates or Coloso bracket titles with special cases will never cover the next weird download. Prefer:

1. Discover everything playable / openable.
2. Group into a readable tree with natural sort.
3. Attach obvious sidecars (same basename).
4. Hide junk / app metadata.
5. Offer **Abrir en explorador** when the tree is messy or a file isn’t previewable.

Optional later (Phase E+): a one-click “layout hint” override per course (`flat` | `folders-as-sections` | `manual`) — still not academy-specific code.

**Virtual projects are out of band:** user-created project items (Phase D2) are merged into the tree after scan. They are never inferred from `Materials/`, ZIPs, or folder names — only from the learning store + a linked path the user chooses.

**Virtual courses are also out of band:** Phase E2 Course Maker authors full syllabi (sections, linked lessons, text, projects) in the store. The generic scanner remains the tool for *discovering* disk layouts; the maker *curates* and can call the scanner as an assist (“import from folder”) without requiring files to live under a single course directory.

### Real layouts observed in this library

| Course pattern | Shape | Scanner implication |
|----------------|-------|---------------------|
| **ArtOfSteveAhn** | Named session folders (`Introduction`, `Session 1 - …`); videos inside; root has `Archive.zip`, `References.rtf`, `courseProps`, cover | Folders with media → sections. Root non-media → course-level resources. Huge ZIP → external / resource, not a “lesson”. |
| **Alive!** | Mix of `02`…`08`, `Chapter-01`…, `chapter-02`, `Bonus-*`, `Subtitles`; **and** loose `03-*.mp4` at course root; subtitles often in nested `Subtitles/` folders | Must handle **root lessons + section folders in the same course**. Don’t assume one layout. Treat `Subtitles` as resource bucket (match by basename to videos when possible). Tolerate duplicate-looking chapter numbering without merging magic. |
| **Coloso** | Clean `01. Title` section folders; `Materials/`; root junk `.txt`; inside section: `NN. [tag] title.mp4` + matching `.srt` | Classic folder-as-section. Sidecar `.srt` next to video. `Materials` = resources section (or course resources), not video lessons. |

### Generic algorithm (Phase A)

```text
scanCourse(root):
  ignore app/junk names (courseProps.json, cover-image.*, .DS_Store,
    Thumbs.db, desktop.ini, downloadpirate*.txt, …)

  for each entry (natural-sorted):
    if directory:
      if looksLikeResourceOnlyDir(name):   # Subtitles, Materials, Resources, Assets, Project Files, Rigs, …
        collect as course/section resources (recurse for files)
      else:
        create section from folder title
        recurse: media → lessons; other files → resources on that section
        nested dirs: either flatten one level into same section OR nested subsections
          (start with: one level of subsections max, or flatten deep video paths into section)
    if file:
      if media → lesson in synthetic section "Inicio" / "Raíz" (or current section)
      if subtitle/doc/image → try attach to lesson with same basename; else course resource
      if archive/other → course resource (external open)

  sort sections & lessons with natural compare (Session 2 < Session 10, 01. < 02.)
  strip display titles: drop extension; optionally soft-strip leading "01-02-" / "24-1." for UI label only
    (keep relativePath as identity — never rename on disk)
```

### Heuristics (keep few and boring)

| Heuristic | Rule |
|-----------|------|
| **Section** | Directory that contains (directly or nested) at least one media file, and is not a resource-only name. |
| **Resource-only dir names** | Case-insensitive match/contains: `subtitle`, `subs`, `materials`, `resources`, `assets`, `project`, `rig`, `reference`, `references`, `exercise`, `files`. |
| **Root media** | Allowed. Goes under a synthetic section so Alive!-style loose files still appear. |
| **Sidecar attach** | Same directory, same basename, different ext (`.srt`, `.vtt`, `.pdf`, `.txt`). Also search sibling `Subtitles/` for same basename. |
| **Ignore as lessons** | App metadata, covers, tiny `.txt` warez/readme junk list, empty dirs. |
| **Archives** | `zip`/`rar`/`7z` → resource with “Abrir externamente”, never auto-extract. |
| **Title pretty-print** | Display-only: remove extension; collapse `01-02-Name` → `Name` (keep number in sort key). Do not rewrite files. |
| **No duplicate merging** | If both `03/` and `Chapter-03/` exist, show both. User can ignore one; don’t invent merge logic in v1. |
| **Depth** | Recurse fully for discovery; present at most **section → lesson** (flatten deeper video paths into the nearest section) to keep the UI simple. |

### What we explicitly will *not* do (v1)

- Parsers named after academies (Coloso, Alive, ArtOfSteveAhn, …).
- Auto-detecting “which Chapter folder is the real one” when duplicates exist.
- Requiring users to reorganize folders before the app works.
- Treating ZIP contents as an in-app curriculum without an explicit extract action later.

### UX when the tree is ugly

- Show scan summary: “12 secciones · 48 videos · 12 subtítulos · 3 recursos”.
- Messy courses still play: flat list / search within course.
- Per-file **Abrir en explorador** / reveal.
- Optional “Marcar carpeta como recursos” later — still generic.

Show import/scan summary on first open with a **Rescanear** action.

---

## 9. Security & Electron notes

- Keep `contextIsolation` + sandbox; no Node in renderer.
- Media protocol must resolve **only** under the configured library path + course basename (path traversal guards).
- Prefer streaming file reads over exposing raw `file://` to the renderer.
- Large libraries: scan on enter Course Room (cache tree); don’t rescan entire library recursively on every startup unless asked.
- Watcher today is non-recursive at library root — fine for catalog; Course Room can rescan on focus or manual refresh.

---

## 10. Testing plan (per phase)

**Phase A/B** (use real library shapes as fixtures)

- **ArtOfSteveAhn-like:** named session folders + root ZIP/RTF + cover/`courseProps`
- **Alive!-like:** mixed `Chapter-*` / numeric folders + loose root `03-*.mp4` + nested `Subtitles/`
- **Coloso-like:** `01. Title` sections + beside-video `.srt` + `Materials/` + junk root `.txt`
- Spaces / Unicode / long paths (Windows `E:\…`)
- Resume after force-quit mid-playback
- Missing file after rename → graceful error + rescan
- Explorer fallback still opens correct directory / file

**Phase C**

- Note seek accuracy; delete/edit note; notes for course without current lesson
- Bookmarks list filtering

**Phase D**

- PDF open; PSD offers external open; subtitle display if present

---

## 11. Success metrics (qualitative)

- Explorer opens drop for day-to-day watching.
- Continue Watching is trusted (correct lesson/time).
- At least some courses accumulate notes/bookmarks within normal use.
- Unsupported assets still feel handled (clear external open), not broken.

---

## 12. Non-goals (near term)

- Downloading from Udemy / Hotmart / etc.
- Cloud sync or multi-user accounts
- Full PDF highlight suite before timestamped video notes exist
- Anki / spaced repetition / knowledge graph
- Mobile apps

---

## 13. Suggested implementation order (engineering)

1. Learning store skeleton + IPC  
2. Course scanner + tree API  
3. Course Room route/layout + lesson list  
4. Media protocol + video player + progress write  
5. Library CTA / Continue hub wiring  
6. Notes + bookmarks IPC + panel  
7. PDF/resource preview + external open  
8. Virtual project items (CRUD + tree merge + linked folder)  
9. Catalog metadata (`rate` / `theme`) + search expansion  
10. Virtual Course Maker (wizard + syllabus editor + import/remix assists)  
11. Polish  

---

## 14. Open decisions

| Topic | Options | Recommendation |
|-------|---------|----------------|
| Learning DB | SQLite vs per-course JSON | SQLite by Phase C; JSON OK for A spike |
| Detail panel | Keep vs replace with Room | Replace navigation with Room; keep slim summary optional |
| Autoplay next | On by default vs setting | Setting, default on |
| Completion threshold | 90% vs 95% vs manual only | Auto at ~95% + manual toggle |
| Hashing for rename-safety | Phase A vs later | Later; relative path first |
| Folder layout handling | Per-course parsers vs one generic scanner | **Generic scanner + heuristics** (see §8); no academy-specific code |
| Deep nesting presentation | Full tree vs flatten to section→lesson | Flatten deep videos into nearest section for v1 |
| Duplicate/overlapping folders (Alive!) | Auto-merge vs show both | Show both; no merge magic in v1 |
| User project / practice work | Only scan Materials/ZIP vs virtual project items | **Virtual ProjectItem** with linked folder (Phase D2); scan stays read-only |
| Project link location | Must be inside course vs anywhere on disk | **Anywhere**; open via Explorer, not media protocol |
| Custom curricula | Learning paths only vs full virtual courses | **Virtual Course Maker** (Phase E2); paths can wrap courses later |
| Virtual media playback | Library-root only vs allowlisted linked paths | Allowlist paths user added; else open external |
| Maker file ops | Link-only vs copy into library folder | **Link-only** in v1; optional disk scaffold later |

---

## 15. Reference competitors (patterns to borrow)

- **Deskemy** — folder parse, resume, continue watching, bookmarks, local SQLite  
- **Ckourse** — timestamped notes, bookmarks page, progress bars  
- **OfflineU / Local Course Player** — section tree, mixed media, home continue  
- **OmniGet** — timestamp notes + PDF side-by-side (aspirational for Phase D)

---

## Summary

Ship **Course Room + in-app video + resume** first so Explorer becomes optional. Then lock in **lesson progress / Continue Watching**. Then add **notes and bookmarks** as the sticky learning layer. Expand to **PDFs/resources**, then **virtual project items** inside courses. Add **catalog intelligence**, then a **Virtual Course Maker** (wizard + syllabus editor + folder import/remix assists) so users can build practice paths and remixed curricula without reorganizing disk downloads. Keep **Abrir en explorador** forever as the escape hatch for course files, linked projects, and edge cases.
