# Development Plan: Connected Study, then Progress

**App:** Catálogo de cursos (personal-course-library)  
**Date:** 2026-10-30  
**Status:** Proposed  
**Goal:** Make a note taken while watching show up on the project, and make the project point back at that moment. After that interface is in place, record honest progress and move the learning store to SQLite without giving up a JSON export.

The course room, library, playlists, and kanban already exist. This plan does not rebuild them. An older plan, [course-room-and-learning-loop.md](course-room-and-learning-loop.md), described the room when it was still missing. Treat that file as history.

---

## 1. What we are optimizing for

A study session should resume: the lesson, the time actually spent, and a note that still points at that moment. Projects are the practice. Notes are the memory. They should be the same object seen from the lesson, the project, and the board.

Catalog facts stay in `courseProps.json` in the course folder (title, academia, instructor, programs, themes, rating, description, hide, in progress). Learning state stays in the app data directory. Media stays in the course folder. An export of learning state is a JSON snapshot, the same shape as today’s `learning-store.json`, even after SQLite is the live copy.

Leave out of this plan: remote folders (Drive, SFTP, S3), level ladders, a color per course, and a built-in language model. Descriptions and playlist briefs stay copy-and-paste.

---

## 2. Current gaps

| Area | Today | Gap |
|------|--------|-----|
| Project text | `project.notes` is a textarea on the project form and a snippet on the kanban card | Separate from findings. Topics, timestamps, and the graph never see it |
| Note anchor | One anchor is a project **or** a lesson time. `normalizeAnchor` clears the lesson when `projectId` is set | A finding can hold several anchors, but the UI cannot pin one note to both the moment and the project |
| Lesson | Tree, player, study panel | No row for the section’s project. No “next lesson” label. A timestamp in another lesson jumps immediately |
| Board | Status columns, course filter, search | Card does not show section, note count, or topics. Status is a dropdown on the project and a column on the board |
| Resume | Continue rail of courses, last lesson title on the card | The card leads with the course, not the lesson, section, and time left |
| Progress | Position, duration, completed, percent as a lesson count | No seconds actually played, no day log, no progress page. `isIncomplete` is stored and unused |
| Playback | HTML5 video for the extensions the scanner lists | Chromium often cannot decode the file. No cached playable copy |
| Store | One `learning-store.json`, rewritten on each save | Main window and the annotations window can write it at the same time. Search glues every note into one string per course |

---

## 3. Phases

UX and UI come first. Phases 1 and 2 change screens. They use the learning store that already exists, plus one rule so a finding can carry two anchors. Phases 3 and later add records, a database, and playback.

### Phase 1 — Projects and notes feel like one object

**Value:** A thought written during a lesson is on the project when you sit down to make the thing, and the project opens the moment you learned it.

**Store rule.** A finding may have two anchors: one `{ lessonRelativePath, timeSec }` and one `{ projectId }`. Stop clearing the lesson fields when a second anchor is the project. One anchor is still either a moment or a project, not both at once.

**Lesson, side panel**

- Composer is one row: **Escribe una nota en 12:04**.
- If the current section has one project, show a chip **También en «Nombre»**. It starts on when that project is En curso. Off saves the note only on the lesson.
- If the section has several projects, the chip opens a short menu. Nothing is attached until the user picks a name.
- After a successful save, a line **Guardada en el proyecto** with **Deshacer**. A failed save leaves the text in the editor.
- The saved card shows the time as **Ir a 12:04** and the project name as a second button.
- Under the lesson title, one bar when the section has a project: status chip (Por hacer / En curso / Hecho) and the project name. Choosing the name opens the project in the center. The video stays mounted.

**Project panel**

- Title, then a two-line brief (the existing `project.notes` field) with placeholder **Qué estás haciendo**.
- Status as the same three chips, not a dropdown. Section name beside them.
- **Lecciones de esta sección:** title, a small arc of position / duration, **Seguir** on the last played lesson. Choosing a row returns to the player.
- **Notas:** the same cards as the side panel. A time seeks. Empty, with a lesson in the section: **Anotar en la lección**, which opens the player and the composer with the project chip on.
- **Abrir carpeta** stays a ghost button. A missing folder is one sentence under it.

**Board**

- Card: title, **Curso · sección**, one line of the brief, note count, topic chips. The column already states the status, so the card does not repeat it. A coral edge on En curso is enough while dragging.
- The card opens the project. If the latest note has a time, **12:04** is a separate button and seeks.
- Filters: course, search, topic chips (same topics as Anotaciones).
- Empty column: **Suelta aquí**. Empty board: **Crea un proyecto desde un curso**, which returns to the library.

**Back.** From a note or lesson opened out of a project, **←** returns to that project. From a project opened out of the board, **←** returns to the board. This extends the return path the room already keeps for Anotaciones, Proyectos, and Listas.

**Done when**

- A note saved on a lesson with the chip on appears on that project and on its kanban card.
- Choosing the time on the card or the project seeks that second and Back returns to where you came from.
- Changing status on the lesson bar, the project chips, or a column updates the other two.
- The brief is the only free text on the project form. Findings are the notes.

### Phase 2 — Course room and library UX

These are screen changes on data the app already stores. Do them after Phase 1 so the room is not rebuilt twice.

**Resume.** One home card leads with the lesson title, “Lección N de M · sección”, and hours still unfinished once durations exist. The continue rail stays behind it. The primary action opens that lesson.

**Player.** **Next** names the following lesson. Autoplay of the next lesson stops as soon as the user presses play. A timestamp that belongs to another lesson asks first, names that lesson, and says the current position will be saved. Save the outgoing lesson’s position before the switch, when the room hides, and when it unmounts.

**Outline.** Sections start collapsed. The section that contains the playing lesson opens. Its header shows a ring, lessons done, and duration. Each row has the position arc from Phase 1. A favorite control waits for Phase 3. Until then, do not add a heart that has nowhere to persist.

**PDF.** Opening a PDF pauses the video and covers the player. **Abrir en explorador** stays on that overlay. Closing it returns to the same lesson, still paused.

**Jump.** Ctrl+F remains the library filter. `/` or Ctrl+K opens a palette grouped as Cursos, then Lecciones. Enter opens the lesson. Escape closes. An empty library filter result has **Mostrar todo**, which clears the query and the chips together.

**Done when**

- Home resume names the lesson and opens it.
- A cross-lesson timestamp does not switch until the user confirms.
- A PDF does not unload the lesson.
- The palette opens a lesson from anywhere in the library.

### Phase 3 — Progress and the metadata you already have

Still the JSON learning store. SQLite comes after the records have a shape.

**New learning records**, included in the JSON export:

- Seconds the video actually advanced. Seeking does not add watch time. `positionSec` stays the resume point. `durationSec` stays the length.
- A day log row when the user plays or completes a lesson. Opening the room does not write a day.
- A favorite flag on a lesson.

**Progress page.** Hours watched (seconds played). Hours finished (sum of `durationSec` on completed lessons, shown once those durations exist). A year heatmap from the day log. Completion grouped by program and by theme. Percent complete stays a lesson count.

**Catalog.** Surface `isIncomplete` as a badge and a filter. It is already in `courseProps.json`. Lesson display names live in the learning store, keyed by course folder and relative path, and replace the filename in the tree. A rescan still finds the file. Clearing the override restores the filename.

**UI follow-through.** The favorite is the hover-and-focus control on the lesson row from Phase 2. The home resume card can show time left from durations.

**Done when**

- Watch time ignores seeks.
- The heatmap only marks days with playback or a completion.
- Incomplete courses can be filtered.
- A renamed lesson label survives a rescan, and the file name returns when the label is cleared.

### Phase 4 — SQLite, same export

Replace `learning-store.json` as the live copy. Keep the public snapshot as JSON of the same document the app already writes (progress, findings, topics, projects, playlists, playlist intent, day log, favorites, display names).

- `better-sqlite3` in the main process only. WAL mode. File at `userData/learning.db`.
- `learningStore.js` is the only module that touches the database. IPC names stay the same.
- Course folders, `courseProps.json`, covers, and `note-attachments/` stay files.
- First launch imports the existing JSON and leaves that file as a backup.
- FTS5 on finding title and body replaces `getNotesSearchByCourse`.
- Export and import run inside one read or write transaction so the annotations window cannot change a row halfway through.
- Copying `learning.db` is a backup, not the export.

**Done when**

- The Phase 1–3 screens behave as before.
- Export produces a JSON file that import can load on another machine.
- Two windows can save a note and a project without clobbering each other.

### Phase 5 — Playback cache

When Chromium cannot play a file, prepare a seekable copy in the app cache, keyed by path, size, and modification time. The course folder stays read-only. Progress and notes stay on the original path. Cap the cache (about 10 GB) and drop the least recently played copies. Show preparation status in the player. Cancelling a lesson cancels its prepare.

**Done when** a file the scanner lists and Chromium cannot decode still plays, and deleting the cache does not delete progress or notes.

### Phase 6 — Later, in this order

1. **Caption pane.** Show the attached `.srt` / `.vtt` beside the player. Choosing a line seeks. The same text can feed the existing copy-and-paste description and playlist briefs.
2. **Frame in the note.** Grab the current frame into the note, linked to that second.
3. **Review queue.** Schedule existing pins (a card points at a finding and a timestamp). Export them with the learning snapshot. Do this only after the day log exists.
4. **Language and year** on `courseProps.json`, only when you want those filters.
5. **Playlist resume.** A list opens the next unfinished lesson in the next unfinished course. A course card on the board shows a mark when that course has a project En curso. The list stays a path of courses.

---

## 4. What stays put

- Playlist board, nesting, and the copy-and-paste list builder.
- Knowledge graph, topics, and the annotations window.
- `courseProps.json` as the catalog. Do not copy title, instructor, or description into the database.
- Explorer as the fallback for archives and project files, one click away, never the primary action in the room.

---

## 5. Suggested order of work

| Phase | Kind | Depends on |
|-------|------|------------|
| 1 | UX / UI | Two-anchor rule |
| 2 | UX / UI | Phase 1 back-stack and note cards, so the room is touched once |
| 3 | Records + one page | Phases 1–2, so favorites and the resume card have a place to land |
| 4 | Store | Phase 3 record shapes, so the migration runs once |
| 5 | Playback | Independent of 1–4, but after the player UX in Phase 2 so the status line has a home |
| 6 | Later | Phase 3 for the review queue. The rest can follow Phase 5 |
