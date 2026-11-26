import { outlineForBrief } from '../../../../shared/courseDescription.js'
import {
  numberSources,
  sourcesFromLesson,
  sourcesFromNotes
} from '../../../../shared/flashcardBrief.js'
import { transcriptChunks } from '../../../../shared/subtitleText.js'

const CHUNK_CHARS = 6000

/** Lessons of a scanned course in outline order, with their section title. */
export function lessonsInOrder(tree) {
  const out = []
  const visit = (section, trail) => {
    const title = [...trail, section.title].filter(Boolean).join(' › ')
    for (const lesson of section.lessons || []) out.push({ ...lesson, section: title })
    for (const child of section.sections || []) visit(child, [...trail, section.title])
  }
  for (const section of tree?.sections || []) visit(section, [])
  return out
}

export function subtitlesOf(lesson) {
  return (lesson?.resources || []).filter((res) => res.kind === 'subtitle')
}

/** Subtitle languages across lessons, most common first. */
export function subtitleLanguages(lessons) {
  const counts = new Map()
  for (const lesson of lessons) {
    for (const sub of subtitlesOf(lesson)) {
      const key = sub.lang || ''
      const entry = counts.get(key) || {
        lang: key,
        label: sub.label || key || 'Sin idioma',
        count: 0
      }
      entry.count += 1
      counts.set(key, entry)
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

function pickSubtitle(lesson, lang) {
  const subs = subtitlesOf(lesson)
  return subs.find((sub) => (sub.lang || '') === lang) || subs[0] || null
}

/**
 * Notes and transcript chunks for the chosen lessons, numbered in outline order:
 * for each lesson its notes first (priority), then what the lesson says.
 * Course-wide notes join only when the whole course is chosen.
 */
export async function loadScopeSources({
  coursePath,
  courseTitle,
  tree,
  lessonPaths,
  useNotes,
  useSubtitles,
  lang
}) {
  const lessons = lessonsInOrder(tree).filter((lesson) => lessonPaths.has(lesson.relativePath))
  const allChosen = lessons.length === lessonsInOrder(tree).length

  const notes = useNotes ? (await window.api.listNotes(coursePath)) || [] : []
  const notesByLesson = new Map()
  for (const note of notes) {
    const key = note.lessonRelativePath || ''
    if (!notesByLesson.has(key)) notesByLesson.set(key, [])
    notesByLesson.get(key).push({ ...note, coursePath: note.coursePath || coursePath })
  }

  const transcripts = new Map()
  let missingSubtitles = 0
  if (useSubtitles) {
    const items = []
    for (const lesson of lessons) {
      const sub = pickSubtitle(lesson, lang)
      if (sub) items.push({ lessonPath: lesson.relativePath, subtitlePath: sub.relativePath })
      else missingSubtitles += 1
    }
    const read = items.length ? await window.api.readLessonTranscripts(coursePath, items) : []
    for (const item of read || []) {
      if (item.cues?.length) transcripts.set(item.lessonPath, item.cues)
      else missingSubtitles += 1
    }
  }

  const raw = []
  let emptyNotes = 0
  for (const lesson of lessons) {
    const lessonNotes = (notesByLesson.get(lesson.relativePath) || []).map((note) => ({
      ...note,
      lessonTitle: note.lessonTitle || lesson.title,
      courseTitle
    }))
    const fromNotes = sourcesFromNotes(lessonNotes)
    emptyNotes += fromNotes.empty
    raw.push(...fromNotes.sources)
    const cues = transcripts.get(lesson.relativePath)
    if (cues) {
      raw.push(
        ...sourcesFromLesson({
          coursePath,
          course: courseTitle,
          lessonPath: lesson.relativePath,
          lesson: lesson.title,
          section: lesson.section,
          chunks: transcriptChunks(cues, { maxChars: CHUNK_CHARS })
        })
      )
    }
  }
  if (useNotes && allChosen) {
    const general = sourcesFromNotes(
      (notesByLesson.get('') || []).map((note) => ({ ...note, courseTitle }))
    )
    emptyNotes += general.empty
    raw.push(...general.sources)
  }

  let windows = 0
  let finalList = raw
  if (useNotes && !useSubtitles) {
    const result = await withWindows(raw, { trees: new Map([[coursePath, tree]]), lang })
    finalList = result.list
    windows = result.added
  }

  const packed = outlineForBrief(tree, { maxLessons: 200, maxLessonsPerSection: 60 })
  return {
    windows,
    sources: numberWithWindows(finalList),
    outline: packed.text,
    emptyNotes,
    missingSubtitles: useSubtitles ? missingSubtitles : 0
  }
}

const WINDOW_BEFORE = 40
const WINDOW_AFTER = 80

/** Number sources and point each transcript window at its note's ref. */
function numberWithWindows(raw) {
  const list = numberSources(raw)
  const refByNote = new Map(list.filter((s) => s.noteId).map((s) => [s.noteId, s.ref]))
  return list.map((source) =>
    source.aroundNoteId
      ? { ...source, aroundNote: refByNote.get(source.aroundNoteId) || '' }
      : source
  )
}

/**
 * What the lesson says around each timed note, from its subtitles.
 * A short note ("Wiggle loop") then comes with the explanation the person heard.
 * Returns a map note id → transcript source. Errors leave a note without context.
 */
async function transcriptWindows(noteSources, { trees = new Map(), lang = '' } = {}) {
  const timed = noteSources.filter(
    (source) => source.coursePath && source.lessonPath && typeof source.timeSec === 'number'
  )
  const windows = new Map()
  const byCourse = new Map()
  for (const source of timed) {
    if (!byCourse.has(source.coursePath)) byCourse.set(source.coursePath, [])
    byCourse.get(source.coursePath).push(source)
  }
  for (const [coursePath, list] of byCourse) {
    try {
      const tree = trees.get(coursePath) || (await window.api.scanCourse(coursePath))
      const lessons = new Map(lessonsInOrder(tree).map((lesson) => [lesson.relativePath, lesson]))
      const items = []
      for (const lessonPath of new Set(list.map((source) => source.lessonPath))) {
        const sub = pickSubtitle(lessons.get(lessonPath), lang)
        if (sub) items.push({ lessonPath, subtitlePath: sub.relativePath })
      }
      if (!items.length) continue
      const read = await window.api.readLessonTranscripts(coursePath, items)
      const cuesByLesson = new Map((read || []).map((item) => [item.lessonPath, item.cues || []]))
      for (const source of list) {
        const cues = (cuesByLesson.get(source.lessonPath) || []).filter(
          (cue) =>
            cue.end >= source.timeSec - WINDOW_BEFORE && cue.start <= source.timeSec + WINDOW_AFTER
        )
        if (!cues.length) continue
        const [chunk] = transcriptChunks(cues, { maxChars: 4000 })
        const lesson = lessons.get(source.lessonPath)
        const [windowSource] = sourcesFromLesson({
          coursePath,
          course: source.course,
          lessonPath: source.lessonPath,
          lesson: source.lesson || lesson?.title,
          section: lesson?.section,
          chunks: [chunk]
        })
        windows.set(source.noteId, { ...windowSource, aroundNoteId: source.noteId })
      }
    } catch {
      // No subtitles to add for this course.
    }
  }
  return windows
}

/** Notes, each followed by what its lesson says around the note's time. */
async function withWindows(noteSources, options) {
  const windows = await transcriptWindows(noteSources, options)
  const out = []
  for (const source of noteSources) {
    out.push(source)
    if (windows.has(source.noteId)) out.push(windows.get(source.noteId))
  }
  return { list: out, added: windows.size }
}

/** Sources from notes checked in Annotations, with the transcript around timed notes. */
export async function notesSources(notes) {
  const prepared = sourcesFromNotes(notes)
  let list = prepared.sources
  let windows = 0
  try {
    const result = await withWindows(list, {})
    list = result.list
    windows = result.added
  } catch {
    // Notes alone still make a brief.
  }
  return { sources: numberWithWindows(list), outline: '', emptyNotes: prepared.empty, windows }
}

const LINK_COURSE = 'Fuentes'

/** A note on a saved link, shaped like a lesson note: "Fuentes" is the course, the link the lesson. */
function linkNote(note, sourceTitle) {
  return {
    ...note,
    coursePath: null,
    lessonRelativePath: null,
    courseTitle: LINK_COURSE,
    lessonTitle: note.sourceTitle || sourceTitle || 'Enlace'
  }
}

/**
 * A deck from one saved link (Fuentes): its notes, and its saved YouTube transcript when
 * there is one — whole, or only around timed notes when the notes lead.
 */
export async function loadLinkScopeSources({ sourceId, sourceTitle, useNotes, useTranscript }) {
  const notes = useNotes ? (await window.api.listSourceNotes(sourceId)) || [] : []
  const fromNotes = sourcesFromNotes(notes.map((note) => linkNote(note, sourceTitle)))
  const captions = (await window.api.readSourceCaptions?.(sourceId)) || null
  const cues = captions?.cues || []
  const transcript = (chunks) =>
    sourcesFromLesson({ course: LINK_COURSE, lesson: sourceTitle, chunks })

  const raw = []
  let windows = 0
  for (const source of fromNotes.sources) {
    raw.push(source)
    if (useTranscript || !cues.length || typeof source.timeSec !== 'number') continue
    const around = cues.filter(
      (cue) =>
        cue.end >= source.timeSec - WINDOW_BEFORE && cue.start <= source.timeSec + WINDOW_AFTER
    )
    if (!around.length) continue
    const [windowSource] = transcript(transcriptChunks(around, { maxChars: 4000 }).slice(0, 1))
    if (windowSource) {
      raw.push({ ...windowSource, aroundNoteId: source.noteId })
      windows += 1
    }
  }
  if (useTranscript && cues.length) {
    raw.push(...transcript(transcriptChunks(cues, { maxChars: CHUNK_CHARS })))
  }
  return {
    windows,
    sources: numberWithWindows(raw),
    outline: '',
    emptyNotes: fromNotes.empty,
    missingSubtitles: useTranscript && !cues.length ? 1 : 0
  }
}

/**
 * A deck from one topic: every note that carries it, from courses and saved links alike.
 * This is the one place courses and links meet, because a deck is made of notes.
 */
export async function loadTopicScopeSources({ topicId, courses = [] }) {
  const titles = new Map((courses || []).map((course) => [course.path, course.title]))
  const all = (await window.api.listAllNotes()) || []
  const notes = all
    .filter((note) => (note.topicIds || []).includes(topicId))
    .map((note) =>
      note.sourceId
        ? linkNote(note, note.sourceTitle)
        : { ...note, courseTitle: note.courseTitle || titles.get(note.coursePath) || '' }
    )
  return notesSources(notes)
}
