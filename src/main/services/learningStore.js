import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { writeFileAtomicSync } from './atomicFile.js'
import { normalizeChildIds, settleNesting } from '../../shared/playlistNest.js'
import {
  playlistForDisplay,
  restoreHiddenCourseWhys,
  retainHiddenCoursePaths,
  visibleFinding
} from '../../shared/courseHide.js'
import { hiddenCoursePathSet } from './courses.js'
import {
  findingFromLegacyNote,
  findingsForCourse,
  findingsForSource,
  normalizeAnchor,
  hashtagTitlesFromBody,
  stripTopicFromMarkdown,
  clearDefaultNoteTitles,
  isDefaultNoteTitle,
  normalizeTopicTitle,
  parseMentions,
  projectFinding,
  sameCourse,
  topicKey
} from '../../shared/knowledgeGraph.js'
import { clampExcitement, viewSession } from '../../shared/notionSync.js'
import { normalizeSource } from '../../shared/sources.js'
import { cardKey, cardType, checkCardFields } from '../../shared/flashcardCards.js'
import {
  cierreCourseKey,
  findCierreForSubject,
  normalizeCierreInput,
  normalizeCommentBody
} from '../../shared/cierres.js'

const STORE_FILE = 'learning-store.json'
const COMPLETE_THRESHOLD = 0.95
const RECENTLY_VIEWED_MS = 14 * 24 * 60 * 60 * 1000

function getStorePath() {
  return path.join(app.getPath('userData'), STORE_FILE)
}

function emptyStore() {
  return {
    version: 6,
    courses: {},
    playlists: [],
    topics: [],
    findings: [],
    sources: [],
    cierres: [],
    decks: []
  }
}

function emptyCourseState() {
  return {
    lastLessonRelativePath: null,
    lastLessonTitle: null,
    lastPositionSec: 0,
    lastOpenedAt: null,
    lastViewedAt: null,
    excitement: 0,
    excitementAt: null,
    playableLessons: [],
    lessons: {},
    notes: [],
    bookmarks: [],
    projects: []
  }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

let noteWriteHook = null
let playlistWriteHook = null
let projectWriteHook = null
let noteWriteSuppress = 0
let storeCache = null
let storeFlushTimer = null
let storeDirty = false
let findingById = new Map()
let findingByPageId = new Map()
let findingIndexStale = true
// Bumped on every write. Note lists are cached per version, so the refetch that follows a
// save (from the notes-changed broadcast) costs a lookup instead of a full sort.
let storeVersion = 0
let noteListCache = { version: -1, hiddenKey: '', lists: new Map() }

const STORE_FLUSH_MS = 2000

/** Main-process listener for saves and deletes. Sync uses this to enqueue work. */
export function setNoteWriteHook(fn) {
  noteWriteHook = typeof fn === 'function' ? fn : null
}

export function setPlaylistWriteHook(fn) {
  playlistWriteHook = typeof fn === 'function' ? fn : null
}

export function setProjectWriteHook(fn) {
  projectWriteHook = typeof fn === 'function' ? fn : null
}

/** Store writes from the sync worker must not enqueue another sync. */
export function withoutNoteWriteHook(fn) {
  noteWriteSuppress += 1
  try {
    return fn()
  } finally {
    noteWriteSuppress -= 1
  }
}

function emitNoteWrite(event) {
  if (noteWriteSuppress > 0 || !noteWriteHook) return
  noteWriteHook(event)
}

function emitPlaylistWrite(event) {
  if (noteWriteSuppress > 0 || !playlistWriteHook) return
  playlistWriteHook(event)
}

function emitProjectWrite(event) {
  if (noteWriteSuppress > 0 || !projectWriteHook) return
  projectWriteHook(event)
}

function ensureArrays(course) {
  if (!Array.isArray(course.notes)) course.notes = []
  if (!Array.isArray(course.bookmarks)) course.bookmarks = []
  if (!Array.isArray(course.projects)) course.projects = []
  if (!Array.isArray(course.playableLessons)) course.playableLessons = []
  if (!course.lessons || typeof course.lessons !== 'object') course.lessons = {}
  migrateBookmarksIntoNotes(course)
  return course
}

/**
 * One-time merge: bookmarks become notes (same thing as timed notes with text).
 */
function migrateBookmarksIntoNotes(course) {
  if (course.bookmarksMigrated || !course.bookmarks?.length) {
    if (!course.bookmarksMigrated && (!course.bookmarks || course.bookmarks.length === 0)) {
      course.bookmarksMigrated = true
    }
    return
  }

  for (const bm of course.bookmarks) {
    const body = String(bm.note || bm.label || '').trim()
    const id = `bm-${bm.id}`
    if (course.notes.some((n) => n.id === id)) continue
    // Skip near-duplicates already saved as notes
    const dup = course.notes.some(
      (n) =>
        n.lessonRelativePath === bm.lessonRelativePath &&
        ((n.timeSec == null && bm.timeSec == null) ||
          (typeof n.timeSec === 'number' &&
            typeof bm.timeSec === 'number' &&
            Math.abs(n.timeSec - bm.timeSec) < 0.5)) &&
        (n.body || '') === body
    )
    if (dup) continue

    course.notes.push({
      id,
      body: body || '',
      lessonRelativePath: bm.lessonRelativePath || null,
      lessonTitle: bm.lessonTitle || null,
      timeSec: typeof bm.timeSec === 'number' ? bm.timeSec : null,
      color: bm.color || null,
      createdAt: bm.createdAt || Date.now(),
      updatedAt: bm.updatedAt || bm.createdAt || Date.now()
    })
  }

  course.bookmarks = []
  course.bookmarksMigrated = true
}

function validTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 86400000 ? value : null
}

/**
 * Stable "date added" for each course. The first time a course is seen, the
 * folder creation time is kept (or its modification time when creation time
 * is unavailable). Later edits do not move that date.
 * @param {Array<{ path: string, folderBirthtimeMs?: number|null, folderMtimeMs?: number|null, isNew?: boolean }>} courses
 * @param {number} [recentMs]
 */
export function withAddedDates(courses, recentMs = RECENTLY_VIEWED_MS) {
  const store = readStore()
  if (!store.addedAt || typeof store.addedAt !== 'object') store.addedAt = {}
  const now = Date.now()
  let dirty = false
  const seen = new Set()

  const next = (courses || []).map((course) => {
    const key = courseKey(course.path)
    seen.add(key)
    let addedAt = validTimestamp(store.addedAt[key])
    if (addedAt == null) {
      addedAt =
        validTimestamp(course.folderBirthtimeMs) || validTimestamp(course.folderMtimeMs) || now
      store.addedAt[key] = addedAt
      dirty = true
    }
    return {
      ...course,
      addedAt,
      isNew: now - addedAt < recentMs
    }
  })

  for (const key of Object.keys(store.addedAt)) {
    if (!seen.has(key)) {
      delete store.addedAt[key]
      dirty = true
    }
  }

  if (dirty) writeStore(store)
  return next
}

function anchorCourseName(coursePath) {
  const parts = String(coursePath || '')
    .split(/[\\/]/)
    .filter(Boolean)
  return parts.pop() || ''
}

let noteCountCache = { version: -1, counts: new Map() }

/**
 * Course folder name -> number of notes anchored there, built in one pass and kept until the
 * next store write. Matches sameCourse: a note counts once per course whatever its anchors.
 */
function noteCountsByCourse(store) {
  if (noteCountCache.version === storeVersion) return noteCountCache.counts
  const counts = new Map()
  for (const finding of store.findings || []) {
    const names = new Set()
    for (const anchor of finding.anchors || []) {
      const name = anchorCourseName(anchor?.coursePath)
      if (name) names.add(name)
    }
    for (const name of names) counts.set(name, (counts.get(name) || 0) + 1)
  }
  noteCountCache = { version: storeVersion, counts }
  return counts
}

function presentCourse(store, key, courseState) {
  const summary = summarizeCourseState(courseState)
  const noteCount = key ? noteCountsByCourse(store).get(anchorCourseName(key)) || 0 : 0
  return { ...summary, noteCount }
}

/**
 * Lift per-course notes into library-level findings and ensure topic storage.
 * Existing note ids and bodies are kept. Each note becomes one anchor.
 */
function ensureKnowledge(store) {
  let dirty = false
  if (!Array.isArray(store.topics)) {
    store.topics = []
    dirty = true
  }
  if (!Array.isArray(store.findings)) {
    store.findings = []
    dirty = true
  }
  const known = new Set(store.findings.map((finding) => finding.id))
  for (const [coursePath, course] of Object.entries(store.courses || {})) {
    ensureArrays(course)
    if (!Array.isArray(course.notes) || course.notes.length === 0) continue
    for (const note of course.notes) {
      let id = note.id || makeId()
      if (known.has(id)) id = makeId()
      known.add(id)
      store.findings.push(findingFromLegacyNote({ ...note, id }, coursePath))
    }
    course.notes = []
    dirty = true
  }
  if (store.version !== 6) {
    store.version = 6
    dirty = true
  }
  return dirty
}

function reindexFindings(store) {
  findingIndexStale = false
  findingById = new Map()
  findingByPageId = new Map()
  for (const finding of store?.findings || []) {
    if (finding?.id) findingById.set(finding.id, finding)
    const pageId = finding?.notion?.pageId
    if (pageId) findingByPageId.set(pageId, finding)
  }
}

/** The id and page maps are rebuilt on first lookup after a write, not on every write. */
function ensureFindingIndex() {
  const store = readStore()
  if (findingIndexStale) reindexFindings(store)
}

/** The live stored finding by id, or null. */
function findingRecord(id) {
  if (!id) return null
  ensureFindingIndex()
  return findingById.get(id) || null
}

function cachedNoteList(cacheKey, hidden, build) {
  const hiddenKey = [...hidden].sort().join('\0')
  if (noteListCache.version !== storeVersion || noteListCache.hiddenKey !== hiddenKey) {
    noteListCache = { version: storeVersion, hiddenKey, lists: new Map() }
  }
  if (!noteListCache.lists.has(cacheKey)) noteListCache.lists.set(cacheKey, build())
  // Callers send lists over IPC or hand them back to the renderer; copy the array so a
  // caller that sorts or filters it cannot change the cached one.
  return [...noteListCache.lists.get(cacheKey)]
}

function persistStore(store) {
  writeFileAtomicSync(getStorePath(), JSON.stringify(store, null, 2))
  storeDirty = false
}

function lastGoodPath(filePath) {
  return `${filePath}.last-good`
}

/** Parsed store, or null when the text is not a store. Read errors (locked file, I/O) throw. */
function parseStoreFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  try {
    const data = JSON.parse(raw)
    return data && typeof data === 'object' && data.courses && typeof data.courses === 'object'
      ? data
      : null
  } catch {
    return null
  }
}

/** Snapshot of the file as it was when this session opened it. */
function keepLastGood(filePath) {
  try {
    fs.copyFileSync(filePath, lastGoodPath(filePath))
  } catch (error) {
    console.warn('Could not keep a copy of the learning store:', error.message)
  }
}

/**
 * The file is there but is not a store (cut short by a crash, edited by hand). Keep it aside
 * so nothing is lost, then start from the last copy that opened cleanly.
 */
function recoverCorruptStore(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const aside = path.join(path.dirname(filePath), `learning-store.corrupt-${stamp}.json`)
  try {
    fs.copyFileSync(filePath, aside)
    console.error(`learning-store.json could not be read; kept it as ${aside}`)
  } catch (error) {
    console.error('learning-store.json could not be read or copied aside:', error.message)
  }
  try {
    const backup = parseStoreFile(lastGoodPath(filePath))
    if (backup) {
      console.warn('Restored the learning store from its last good copy')
      return backup
    }
  } catch {
    // No backup yet.
  }
  return emptyStore()
}

function loadStoreFromDisk() {
  try {
    const filePath = getStorePath()
    if (!fs.existsSync(filePath)) return { store: emptyStore(), ok: true }
    let data = parseStoreFile(filePath)
    let dirty = false
    if (data) {
      keepLastGood(filePath)
    } else {
      data = recoverCorruptStore(filePath)
      dirty = true
    }
    for (const key of ['paths', 'courseBriefs', 'learnerGoals', 'activePathId']) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        delete data[key]
        dirty = true
      }
    }
    if (!Array.isArray(data.playlists)) {
      data.playlists = []
      dirty = true
    }
    if (!Array.isArray(data.cierres)) {
      data.cierres = []
      dirty = true
    }
    if (!Array.isArray(data.decks)) {
      data.decks = []
      dirty = true
    }
    if (!Array.isArray(data.sources)) {
      data.sources = []
      dirty = true
    }
    for (const course of Object.values(data.courses || {})) ensureArrays(course)
    if (ensureKnowledge(data)) dirty = true
    if (clearDefaultNoteTitles(data.findings)) dirty = true
    if (dirty) {
      try {
        persistStore(data)
      } catch (error) {
        // The data is good in memory; the next save writes it.
        storeDirty = true
        console.error('Could not save the upgraded learning store:', error.message)
      }
    }
    return { store: data, ok: true }
  } catch (error) {
    // The file exists but could not be read right now (locked, I/O error). It is left alone.
    console.error('Could not read learning-store.json:', error.message)
    return { store: emptyStore(), ok: false }
  }
}

function readStore() {
  if (!storeCache) {
    const loaded = loadStoreFromDisk()
    if (!loaded.ok) return loaded.store
    storeCache = loaded.store
    findingIndexStale = true
    storeVersion += 1
  }
  return storeCache
}

function flushPending() {
  if (!storeCache || !storeDirty) return
  try {
    persistStore(storeCache)
  } catch (error) {
    console.error('Could not save learning-store.json:', error.message)
  }
}

function writeStore(store, { debounce = false } = {}) {
  // An unread store is an empty stand-in. Saving it would overwrite the real file.
  if (!storeCache) {
    throw new Error(
      'No se pudo leer learning-store.json. Los cambios no se guardaron para no perder tus datos.'
    )
  }
  storeCache = store
  findingIndexStale = true
  storeVersion += 1
  if (!debounce) {
    if (storeFlushTimer) {
      clearTimeout(storeFlushTimer)
      storeFlushTimer = null
    }
    persistStore(store)
    return
  }
  storeDirty = true
  if (storeFlushTimer) return
  storeFlushTimer = setTimeout(() => {
    storeFlushTimer = null
    flushPending()
  }, STORE_FLUSH_MS)
}

/** Changes on every store write. Lets readers cache values derived from the store. */
export function learningStoreVersion() {
  readStore()
  return storeVersion
}

/** Write a pending playback update before quit. */
export function flushLearningStore() {
  if (storeFlushTimer) {
    clearTimeout(storeFlushTimer)
    storeFlushTimer = null
  }
  flushPending()
}

function courseKey(coursePath) {
  if (typeof coursePath !== 'string' || !coursePath) return null
  return path.basename(coursePath)
}

function resolveViewedAt(state) {
  const viewed = state?.lastViewedAt
  const opened = state?.lastOpenedAt
  if (typeof viewed === 'number' && typeof opened === 'number') return Math.max(viewed, opened)
  if (typeof viewed === 'number') return viewed
  if (typeof opened === 'number') return opened
  return null
}

function lessonTitleFromPath(relativePath) {
  const base = path.basename(relativePath || '', path.extname(relativePath || ''))
  return (
    base
      .replace(/^[\[\(]?\d+[\]\)]?[.\-_\s]+/g, '')
      .replace(/^(\d+[.\-_])+/g, '')
      .replace(/\s+/g, ' ')
      .trim() || base
  )
}

/**
 * Derive summary fields from raw course state.
 */
export function summarizeCourseState(courseState) {
  const state = ensureArrays(courseState || emptyCourseState())
  const playable = Array.isArray(state.playableLessons) ? state.playableLessons : []
  const playableCount = playable.length
  const lessonMap = state.lessons || {}

  let completedCount = 0
  if (playableCount > 0) {
    for (const lesson of playable) {
      if (lessonMap[lesson.relativePath]?.completed) completedCount += 1
    }
  } else {
    completedCount = Object.values(lessonMap).filter((l) => l?.completed).length
  }

  const percent =
    playableCount > 0
      ? Math.round((completedCount / playableCount) * 100)
      : completedCount > 0
        ? 100
        : 0

  let status = 'not_started'
  if (playableCount > 0 && completedCount >= playableCount) {
    status = 'completed'
  } else if (state.lastOpenedAt || completedCount > 0 || state.lastLessonRelativePath) {
    status = 'in_progress'
  }

  const lastPath = state.lastLessonRelativePath
  const lastMeta = playable.find((l) => l.relativePath === lastPath)
  const lastLessonTitle =
    state.lastLessonTitle || lastMeta?.title || (lastPath ? lessonTitleFromPath(lastPath) : null)
  const viewedAt = resolveViewedAt(state)

  return {
    ...state,
    excitement: clampExcitement(state.excitement),
    excitementAt: Number(state.excitementAt) || null,
    notes: state.notes,
    bookmarks: state.bookmarks,
    noteCount: state.notes.length,
    bookmarkCount: 0,
    playableCount,
    completedCount,
    percent,
    status,
    lastLessonTitle,
    isRecentlyViewed: typeof viewedAt === 'number' && Date.now() - viewedAt < RECENTLY_VIEWED_MS
  }
}

export function readCourseProgressRecord(coursePath) {
  const key = courseKey(coursePath)
  if (!key) return null
  const course = readStore().courses?.[key]
  return course ? { id: key, ...course } : null
}

export function listCourseProgressRecords() {
  return Object.entries(readStore().courses || {}).map(([id, course]) => ({ id, ...course }))
}

/** Replace the shared progress fields. Playback code keeps calling setLessonProgress. */
export function writeCourseProgress(coursePath, patch = {}) {
  const store = readStore()
  const key = courseKey(coursePath)
  if (!key) return null
  const course = ensureArrays(store.courses[key] || emptyCourseState())
  if (patch.lessons && typeof patch.lessons === 'object') {
    const next = {}
    for (const [relativePath, lesson] of Object.entries(patch.lessons)) {
      if (!relativePath) continue
      next[relativePath] = {
        positionSec: Math.max(0, Number(lesson?.positionSec) || 0),
        durationSec: Math.max(0, Number(lesson?.durationSec) || 0),
        completed: Boolean(lesson?.completed),
        lastOpenedAt: Number(lesson?.lastOpenedAt) || null
      }
      if (!course.playableLessons.some((item) => item.relativePath === relativePath)) {
        course.playableLessons.push({
          relativePath,
          title: lessonTitleFromPath(relativePath)
        })
      }
    }
    course.lessons = next
  }
  if ('lastLessonRelativePath' in patch) {
    course.lastLessonRelativePath = patch.lastLessonRelativePath || null
  }
  if ('lastLessonTitle' in patch) course.lastLessonTitle = patch.lastLessonTitle || null
  if ('lastPositionSec' in patch)
    course.lastPositionSec = Math.max(0, Number(patch.lastPositionSec) || 0)
  if ('lastOpenedAt' in patch) course.lastOpenedAt = Number(patch.lastOpenedAt) || null
  if ('lastViewedAt' in patch) course.lastViewedAt = Number(patch.lastViewedAt) || null
  if ('excitement' in patch) course.excitement = clampExcitement(patch.excitement)
  if ('excitementAt' in patch) {
    course.excitementAt = Math.max(0, Math.round(Number(patch.excitementAt) || 0)) || null
  }
  if ('inProcess' in patch) course.inProcess = Boolean(patch.inProcess)
  if ('notion' in patch) course.notion = patch.notion
  store.courses[key] = course
  writeStore(store)
  return presentCourse(store, key, course)
}

export function getCourseProgress(coursePath) {
  const store = readStore()
  const key = courseKey(coursePath)
  return presentCourse(store, key, store.courses[key] || emptyCourseState())
}

/**
 * Cache playable lesson list from a scan so library % can be computed.
 * @param {string} coursePath
 * @param {{ relativePath: string, title: string }[]} playableLessons
 */
export function setCourseCurriculum(coursePath, playableLessons) {
  const store = readStore()
  const key = courseKey(coursePath)
  const course = store.courses[key] || emptyCourseState()
  course.playableLessons = (playableLessons || []).map((l) => ({
    relativePath: l.relativePath,
    title: l.title || lessonTitleFromPath(l.relativePath)
  }))
  store.courses[key] = course
  writeStore(store)
  return presentCourse(store, key, course)
}

/**
 * Update progress for a lesson and optionally set as last watched.
 * @param {string} coursePath
 * @param {{ relativePath: string, title?: string, positionSec?: number, durationSec?: number, completed?: boolean, setAsLast?: boolean }} update
 */
export function setLessonProgress(coursePath, update) {
  const store = readStore()
  const key = courseKey(coursePath)
  const course = store.courses[key] || emptyCourseState()
  const relativePath = update.relativePath
  if (!relativePath) {
    throw new Error('relativePath is required')
  }

  const existing = course.lessons[relativePath] || {
    positionSec: 0,
    durationSec: 0,
    completed: false,
    lastOpenedAt: null
  }
  const priorCompleted = Boolean(existing.completed)
  const priorPath = course.lastLessonRelativePath || null
  const priorSession = viewSession(course.lastViewedAt)

  let positionSec =
    typeof update.positionSec === 'number' ? Math.max(0, update.positionSec) : existing.positionSec

  let durationSec =
    typeof update.durationSec === 'number' && update.durationSec > 0
      ? update.durationSec
      : existing.durationSec || 0

  let completed = typeof update.completed === 'boolean' ? update.completed : existing.completed

  // Auto-complete near the end
  if (
    !completed &&
    durationSec > 0 &&
    typeof update.positionSec === 'number' &&
    update.positionSec / durationSec >= COMPLETE_THRESHOLD
  ) {
    completed = true
  }

  if (completed && durationSec > 0) {
    positionSec = durationSec
  }

  const title =
    update.title ||
    course.playableLessons?.find((l) => l.relativePath === relativePath)?.title ||
    lessonTitleFromPath(relativePath)

  const next = {
    ...existing,
    positionSec,
    durationSec,
    completed,
    lastOpenedAt: Date.now()
  }

  course.lessons[relativePath] = next

  const now = Date.now()
  course.lastViewedAt = now

  if (update.setAsLast !== false) {
    course.lastLessonRelativePath = relativePath
    course.lastLessonTitle = title
    course.lastPositionSec = next.positionSec
    course.lastOpenedAt = now
  }

  // Files can be checked off without becoming part of the playable curriculum.
  if (update.trackAsPlayable !== false) {
    if (!Array.isArray(course.playableLessons)) course.playableLessons = []
    if (!course.playableLessons.some((l) => l.relativePath === relativePath)) {
      course.playableLessons.push({ relativePath, title })
    }
  }

  store.courses[key] = course
  const immediate =
    Boolean(next.completed) !== priorCompleted ||
    (course.lastLessonRelativePath || null) !== priorPath ||
    viewSession(course.lastViewedAt) !== priorSession
  writeStore(store, { debounce: !immediate })
  return presentCourse(store, key, course)
}

/**
 * Remember that the course was opened, without changing lesson progress.
 * @param {string} coursePath
 */
/** Personal 0–5 excitement. Stored with learning progress, not on the course file. */
export function setCourseExcitement(coursePath, level) {
  const store = readStore()
  if (!courseKey(coursePath)) return null
  const { key, course } = getMutableCourse(store, coursePath)
  course.excitement = clampExcitement(level)
  course.excitementAt = Date.now()
  writeStore(store)
  return presentCourse(store, key, course)
}

export function recordCourseView(coursePath) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  course.lastViewedAt = Date.now()
  writeStore(store)
  return presentCourse(store, courseKey(coursePath), course)
}

export function getLessonProgress(coursePath, relativePath) {
  const course = getCourseProgress(coursePath)
  return (
    course.lessons[relativePath] || {
      positionSec: 0,
      durationSec: 0,
      completed: false,
      lastOpenedAt: null
    }
  )
}

/**
 * Map of course basename -> summarized progress (for library enrichment).
 */
export function getAllCourseProgress() {
  const store = readStore()
  const hidden = hiddenCoursePathSet()
  const out = {}
  for (const [key, value] of Object.entries(store.courses || {})) {
    if (hidden.has(key)) continue
    // The library needs the summary and the per-lesson map, not the full lesson list,
    // projects or sync records: those were most of this payload, sent on every library load.
    // eslint-disable-next-line no-unused-vars
    const { playableLessons, projects, notion, notes, bookmarks, ...summary } = presentCourse(
      store,
      key,
      value
    )
    out[key] = summary
  }
  return out
}

function getMutableCourse(store, coursePath) {
  const key = courseKey(coursePath)
  const course = ensureArrays(store.courses[key] || emptyCourseState())
  store.courses[key] = course
  return { key, course }
}

function topicIndex(store) {
  return new Map((store.topics || []).map((topic) => [topic.id, topic]))
}

function decorateFinding(store, finding, topicsById = topicIndex(store)) {
  const topics = (finding.topicIds || [])
    .map((id) => topicsById.get(id))
    .filter(Boolean)
    .map((topic) => ({ id: topic.id, title: topic.title }))
  if (finding.sourceId) {
    // The anchor keeps the title it was saved with; show the link's current title.
    const source = (store.sources || []).find((item) => item.id === finding.sourceId)
    if (source) return { ...finding, topics, sourceTitle: source.title }
  }
  return { ...finding, topics }
}

function resolveTopicLinks(store, explicitIds, mentions, hashtagTitles = []) {
  const ids = []
  const add = (id) => {
    if (id && !ids.includes(id)) ids.push(id)
  }
  const ensureTitle = (title, preferredId) => {
    const normalized = normalizeTopicTitle(title)
    if (!normalized) return
    let topic = preferredId ? store.topics.find((item) => item.id === preferredId) : null
    if (!topic) topic = store.topics.find((item) => topicKey(item.title) === topicKey(normalized))
    if (!topic) {
      const now = Date.now()
      topic = {
        id: preferredId || makeId(),
        title: normalized,
        aliases: [],
        summary: '',
        createdAt: now,
        updatedAt: now
      }
      store.topics.push(topic)
    }
    add(topic.id)
  }
  for (const id of explicitIds || []) {
    if (store.topics.some((topic) => topic.id === id)) add(id)
  }
  for (const mention of mentions) {
    if (mention.type !== 'topic') continue
    ensureTitle(mention.title || 'Tema', mention.id)
  }
  for (const title of hashtagTitles) ensureTitle(title)
  return ids
}

function anchorFromPayload(payload, coursePath, base = {}) {
  const next = {
    coursePath,
    lessonRelativePath:
      payload.lessonRelativePath !== undefined
        ? payload.lessonRelativePath
        : (base.lessonRelativePath ?? null),
    lessonTitle:
      payload.lessonTitle !== undefined ? payload.lessonTitle : (base.lessonTitle ?? null),
    projectId: payload.projectId !== undefined ? payload.projectId : (base.projectId ?? null),
    projectTitle:
      payload.projectTitle !== undefined ? payload.projectTitle : (base.projectTitle ?? null),
    timeSec:
      payload.timeSec !== undefined
        ? typeof payload.timeSec === 'number'
          ? Math.max(0, payload.timeSec)
          : null
        : (base.timeSec ?? null)
  }
  if (payload.projectId) {
    next.projectId = payload.projectId
    next.projectTitle = payload.projectTitle ?? next.projectTitle ?? null
    next.lessonRelativePath = null
    next.lessonTitle = null
    next.timeSec = null
  } else if (payload.lessonRelativePath !== undefined || payload.timeSec !== undefined) {
    next.projectId = null
    next.projectTitle = null
  }
  return normalizeAnchor(next, coursePath)
}

function targetsTouched(payload) {
  return (
    payload.anchors !== undefined ||
    payload.lessonRelativePath !== undefined ||
    payload.lessonTitle !== undefined ||
    payload.projectId !== undefined ||
    payload.projectTitle !== undefined ||
    payload.timeSec !== undefined
  )
}

export function listNotes(coursePath) {
  const store = readStore()
  const key = courseKey(coursePath)
  const hidden = hiddenCoursePathSet()
  if (!key || hidden.has(key)) return []
  return cachedNoteList(`course:${key}`, hidden, () => {
    const topics = topicIndex(store)
    return findingsForCourse(store.findings, key)
      .map((finding) => {
        const visible = visibleFinding(finding, hidden)
        if (!visible) return null
        return decorateFinding(store, projectFinding(visible, key), topics)
      })
      .filter(Boolean)
      .sort(compareStudyItems)
  })
}

/**
 * Sort: by lesson, then by time ascending; course-wide / no-time items last within group.
 */
function compareStudyItems(a, b) {
  const aLesson = a.lessonRelativePath || ''
  const bLesson = b.lessonRelativePath || ''
  const aProject = a.projectId || ''
  const bProject = b.projectId || ''
  const aIsCourseWide = !aLesson && !aProject && (a.timeSec == null || a.timeSec === undefined)
  const bIsCourseWide = !bLesson && !bProject && (b.timeSec == null || b.timeSec === undefined)

  // Course-wide notes after everything scoped
  if (aIsCourseWide !== bIsCourseWide) return aIsCourseWide ? 1 : -1

  // Project notes after file/lesson notes, grouped by project
  const aIsProject = Boolean(aProject) && !aLesson
  const bIsProject = Boolean(bProject) && !bLesson
  if (aIsProject !== bIsProject) return aIsProject ? 1 : -1
  if (aIsProject && bIsProject) {
    const projectCmp = String(aProject).localeCompare(String(bProject), undefined, {
      sensitivity: 'base'
    })
    if (projectCmp !== 0) return projectCmp
    return (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0)
  }

  const lessonCmp = String(aLesson).localeCompare(String(bLesson), undefined, {
    numeric: true,
    sensitivity: 'base'
  })
  if (lessonCmp !== 0) return lessonCmp

  const aHasTime = typeof a.timeSec === 'number'
  const bHasTime = typeof b.timeSec === 'number'
  if (aHasTime && bHasTime) return a.timeSec - b.timeSec
  // Lesson-level pins (no time) after timed marks in the same lesson
  if (aHasTime && !bHasTime) return -1
  if (!aHasTime && bHasTime) return 1

  return (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0)
}

/** @deprecated Merged into notes. */
export function listBookmarks(coursePath) {
  listNotes(coursePath)
  return []
}

/**
 * @param {string} coursePath
 * @param {{ id?: string, title?: string|null, body?: string, bodyHtml?: string|null, bodyJson?: string|null, lessonRelativePath?: string|null, lessonTitle?: string|null, projectId?: string|null, projectTitle?: string|null, timeSec?: number|null, color?: string|null, topicIds?: string[], anchors?: Array }} payload
 * `body` is markdown (canonical). A finding can carry several anchors and topic ids.
 * Within one anchor, a project target still clears the lesson/time fields.
 */
export function upsertNote(coursePath, payload) {
  const store = readStore()
  const key = courseKey(coursePath)
  if (key) getMutableCourse(store, coursePath)
  const now = Date.now()
  const body = String(payload.body ?? '').trim()
  const rawTitle = payload.title === undefined ? undefined : String(payload.title ?? '').trim()
  const title =
    rawTitle === undefined ? undefined : !rawTitle || isDefaultNoteTitle(rawTitle) ? null : rawTitle
  const bodyHtml =
    payload.bodyHtml === undefined ? undefined : payload.bodyHtml ? String(payload.bodyHtml) : null
  const bodyJson =
    payload.bodyJson === undefined ? undefined : payload.bodyJson ? String(payload.bodyJson) : null

  const applyTopics = (finding, nextBody) => {
    const explicit = payload.topicIds !== undefined ? payload.topicIds : finding.topicIds
    finding.topicIds = resolveTopicLinks(
      store,
      explicit,
      parseMentions(nextBody),
      hashtagTitlesFromBody(nextBody)
    )
  }

  const applyAnchors = (finding) => {
    if (Array.isArray(payload.anchors)) {
      finding.anchors = payload.anchors
        .map((anchor) => normalizeAnchor(anchor, anchor.coursePath || key))
        .filter((anchor) => anchor.coursePath || anchor.sourceId)
      return
    }
    if (!key || !targetsTouched(payload)) return
    const current =
      (finding.anchors || []).find((anchor) => sameCourse(anchor.coursePath, key)) || {}
    const next = anchorFromPayload(payload, key, current)
    const rest = (finding.anchors || []).filter((anchor) => !sameCourse(anchor.coursePath, key))
    finding.anchors = [...rest, next]
  }

  let savedId = payload.id
  if (payload.id) {
    const finding = findingRecord(payload.id)
    if (!finding) throw new Error('Anotación no encontrada')
    if (title !== undefined) finding.title = title
    if (payload.body !== undefined) finding.body = body
    if (bodyHtml !== undefined) finding.bodyHtml = bodyHtml
    if (bodyJson !== undefined) finding.bodyJson = bodyJson
    if (payload.color !== undefined) finding.color = payload.color
    applyAnchors(finding)
    applyTopics(finding, finding.body || '')
    finding.updatedAt = now
  } else {
    const finding = {
      id: makeId(),
      title: title ?? null,
      body,
      bodyHtml: bodyHtml ?? null,
      bodyJson: bodyJson ?? null,
      topicIds: [],
      anchors: [],
      color: payload.color ?? null,
      createdAt: now,
      updatedAt: now
    }
    applyAnchors(finding)
    if (!finding.anchors.length && key) finding.anchors = [normalizeAnchor({}, key)]
    applyTopics(finding, body)
    store.findings.push(finding)
    savedId = finding.id
  }

  keepSourcesWithNotes(store, findingRecord(savedId) || store.findings.find((f) => f.id === savedId))

  // Autosave sends this every pause in typing. Batch the disk write like playback progress;
  // pending writes are flushed on quit.
  writeStore(store, { debounce: true })
  emitNoteWrite({ op: 'upsert', id: savedId })
  return key ? listNotes(coursePath) : listAllNotes()
}

/** A link leaves the Bandeja once a note points at it. */
function keepSourcesWithNotes(store, finding) {
  if (!finding?.body?.trim()) return
  for (const anchor of finding.anchors || []) {
    if (!anchor.sourceId) continue
    const source = (store.sources || []).find((item) => item.id === anchor.sourceId)
    if (source && source.status === 'inbox') {
      source.status = 'kept'
      source.updatedAt = Date.now()
    }
  }
}

export function deleteNote(coursePath, noteId) {
  const store = readStore()
  const removed = (store.findings || []).find((finding) => finding.id === noteId) || null
  store.findings = (store.findings || []).filter((finding) => finding.id !== noteId)
  writeStore(store)
  if (removed) emitNoteWrite({ op: 'delete', finding: structuredClone(removed) })
  return courseKey(coursePath) ? listNotes(coursePath) : listAllNotes()
}

export function listFindingRecords() {
  return structuredClone(readStore().findings || [])
}

/** Live findings for read-only sync scans. Callers must not mutate the records. */
export function readFindingList() {
  return readStore().findings || []
}

export function findFindingRecord(id) {
  ensureFindingIndex()
  return findingById.get(id) || null
}

export function findFindingByPageId(pageId) {
  ensureFindingIndex()
  return findingByPageId.get(pageId) || null
}

export function readFinding(id) {
  const finding = findingRecord(id)
  return finding ? structuredClone(finding) : null
}

/** Apply a mutation to one finding and return the stored copy. Does not enqueue sync. */
export function mutateFinding(id, mutate) {
  const store = readStore()
  const finding = findingRecord(id)
  if (!finding) return null
  mutate(finding)
  writeStore(store)
  return structuredClone(finding)
}

export function forkFinding(sourceId, { title, body } = {}) {
  const store = readStore()
  const source = findingRecord(sourceId)
  if (!source) throw new Error('Anotación no encontrada')
  const copy = {
    id: makeId(),
    title: title === undefined ? source.title : title,
    body: body === undefined ? source.body || '' : body,
    bodyHtml: null,
    bodyJson: null,
    topicIds: [...(source.topicIds || [])],
    anchors: structuredClone(source.anchors || []),
    color: source.color ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  store.findings.push(copy)
  writeStore(store)
  emitNoteWrite({ op: 'upsert', id: copy.id })
  return structuredClone(copy)
}

export function restoreFinding(snapshot) {
  if (!snapshot?.id) throw new Error('Anotación no encontrada')
  const store = readStore()
  const existing = findingRecord(snapshot.id)
  if (existing) {
    Object.assign(existing, structuredClone(snapshot), { id: snapshot.id })
  } else {
    store.findings.push(structuredClone(snapshot))
  }
  writeStore(store)
  emitNoteWrite({ op: 'upsert', id: snapshot.id })
  return snapshot.id
}

export function listTopics() {
  const store = readStore()
  return [...(store.topics || [])].sort((a, b) =>
    String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' })
  )
}

export function upsertTopic(payload = {}) {
  const store = readStore()
  const title = normalizeTopicTitle(payload.title)
  if (!title) throw new Error('El tema necesita un nombre')
  const now = Date.now()
  let topic = payload.id ? store.topics.find((item) => item.id === payload.id) : null
  if (!topic) topic = store.topics.find((item) => topicKey(item.title) === topicKey(title))
  if (topic) {
    topic.title = title
    if (payload.summary !== undefined) topic.summary = String(payload.summary || '')
    if (Array.isArray(payload.aliases)) {
      topic.aliases = payload.aliases.map((alias) => normalizeTopicTitle(alias)).filter(Boolean)
    }
    if (payload.notion !== undefined) topic.notion = payload.notion
    topic.updatedAt = now
  } else {
    topic = {
      id: payload.id || makeId(),
      title,
      aliases: [],
      summary: payload.summary ? String(payload.summary) : '',
      createdAt: now,
      updatedAt: now,
      ...(payload.notion !== undefined ? { notion: payload.notion } : {})
    }
    store.topics.push(topic)
  }
  writeStore(store)
  return topic
}

export function readTopic(id) {
  return readStore().topics?.find((topic) => topic.id === id) || null
}

export function deleteTopic(topicId) {
  const store = readStore()
  const topic = (store.topics || []).find((item) => item.id === topicId) || null
  store.topics = (store.topics || []).filter((item) => item.id !== topicId)
  for (const finding of store.findings || []) {
    finding.topicIds = (finding.topicIds || []).filter((id) => id !== topicId)
    if (topic && finding.body) {
      finding.body = stripTopicFromMarkdown(finding.body, { id: topic.id, title: topic.title })
    }
  }
  writeStore(store)
  return listTopics()
}

/** @deprecated Use upsertNote — bookmarks are notes. */
export function upsertBookmark(coursePath, payload) {
  return upsertNote(coursePath, {
    id: payload.id,
    body: payload.note || payload.label || '',
    lessonRelativePath: payload.lessonRelativePath,
    lessonTitle: payload.lessonTitle,
    timeSec: payload.timeSec,
    color: payload.color
  })
}

/** @deprecated Use deleteNote. */
export function deleteBookmark(coursePath, bookmarkId) {
  return deleteNote(coursePath, bookmarkId)
}

/**
 * Flatten notes/bookmarks across all courses for global pages.
 */
export function listAllNotes() {
  const store = readStore()
  const hidden = hiddenCoursePathSet()
  return cachedNoteList('*', hidden, () => {
    const topics = topicIndex(store)
    return (store.findings || [])
      .map((finding) => {
        const visible = visibleFinding(finding, hidden)
        if (!visible) return null
        return decorateFinding(store, projectFinding(visible), topics)
      })
      .filter(Boolean)
      .sort((a, b) => {
        const courseCmp = String(a.coursePath || '').localeCompare(String(b.coursePath || ''))
        if (courseCmp !== 0) return courseCmp
        return compareStudyItems(a, b)
      })
  })
}

/** @deprecated Bookmarks merged into notes; kept for IPC compat. */
export function listAllBookmarks() {
  return []
}

const PROJECT_STATUSES = new Set(['todo', 'in_progress', 'paused', 'done'])
const PROJECT_HISTORY_LIMIT = 50

function appendStatusHistory(history, status, at) {
  const list = Array.isArray(history) ? history : []
  if (list.length && list[list.length - 1].status === status) return list
  return [...list, { status, at }].slice(-PROJECT_HISTORY_LIMIT)
}

function normalizeSortIndex(value) {
  if (value === null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function linkStatus(linkedFolderPath) {
  // No folder is a valid state: only a linked path that no longer resolves counts as missing.
  if (!linkedFolderPath) {
    return { linkOk: false, linkMissing: false, linkIsFile: false }
  }
  try {
    // One stat per project: this runs for every project each time the board is listed.
    const stat = fs.statSync(linkedFolderPath, { throwIfNoEntry: false })
    if (!stat) {
      return { linkOk: false, linkMissing: true, linkIsFile: false }
    }
    if (stat.isDirectory()) {
      return { linkOk: true, linkMissing: false, linkIsFile: false }
    }
    if (stat.isFile()) {
      return { linkOk: true, linkMissing: false, linkIsFile: true }
    }
    return { linkOk: false, linkMissing: true, linkIsFile: false }
  } catch {
    return { linkOk: false, linkMissing: true, linkIsFile: false }
  }
}

function decorateProject(project) {
  return {
    ...project,
    ...linkStatus(project.linkedFolderPath)
  }
}

export function listProjects(coursePath) {
  const key = courseKey(coursePath)
  if (key && hiddenCoursePathSet().has(key)) return []
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  return [...course.projects]
    .sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    )
    .map(decorateProject)
}

/**
 * Flatten projects across all courses for the global kanban board.
 */
/** Every stored project, including courses hidden from the catalog. */
export function listStoredProjects() {
  const store = readStore()
  const items = []
  for (const [coursePath, value] of Object.entries(store.courses || {})) {
    const key = courseKey(coursePath) || coursePath
    for (const project of value?.projects || []) {
      items.push({ ...project, coursePath: key })
    }
  }
  return items
}

export function readStoredProject(coursePath, projectId) {
  const key = courseKey(coursePath) || String(coursePath || '')
  return (
    listStoredProjects().find(
      (item) => item.id === projectId && (!key || item.coursePath === key)
    ) || null
  )
}

export function listAllProjects() {
  const store = readStore()
  const hidden = hiddenCoursePathSet()
  const items = []
  for (const [coursePath, value] of Object.entries(store.courses || {})) {
    if (hidden.has(coursePath)) continue
    const course = ensureArrays(value)
    for (const project of course.projects) {
      items.push({
        ...decorateProject(project),
        coursePath
      })
    }
  }
  return items.sort((a, b) => {
    const statusOrder = { in_progress: 0, paused: 1, todo: 2, done: 3 }
    const aStatus = statusOrder[a.status] ?? 2
    const bStatus = statusOrder[b.status] ?? 2
    if (aStatus !== bStatus) return aStatus - bStatus
    const updated = (b.updatedAt || 0) - (a.updatedAt || 0)
    if (updated !== 0) return updated
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  })
}

/**
 * @param {string} coursePath
 * @param {{
 *   id?: string,
 *   title?: string,
 *   linkedFolderPath?: string|null,
 *   notes?: string,
 *   status?: 'todo'|'in_progress'|'paused'|'done',
 *   sectionId?: string|null,
 *   fileRelativePath?: string|null
 * }} payload
 */
function normalizeProjectRelativePath(value) {
  if (value == null || value === '') return null
  const text = String(value).trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!text || text.split('/').some((part) => part === '..' || part === '')) return null
  return text
}

export function upsertProject(coursePath, payload) {
  const store = readStore()
  const { key, course } = getMutableCourse(store, coursePath)
  const now = Date.now()
  const title = String(payload.title ?? '').trim()
  if (!payload.id && !title) {
    throw new Error('El proyecto necesita un título')
  }

  const status = PROJECT_STATUSES.has(payload.status) ? payload.status : 'todo'
  let savedId = payload.id || null
  const linkedFolderPath =
    payload.linkedFolderPath === undefined
      ? undefined
      : payload.linkedFolderPath
        ? String(payload.linkedFolderPath).trim() || null
        : null

  const sortIndex =
    payload.sortIndex === undefined ? undefined : normalizeSortIndex(payload.sortIndex)

  if (payload.id) {
    const idx = course.projects.findIndex((p) => p.id === payload.id)
    if (idx === -1) throw new Error('Proyecto no encontrado')
    const current = course.projects[idx]
    const nextStatus = payload.status !== undefined ? status : current.status || 'todo'
    const statusChanged = nextStatus !== (current.status || 'todo')
    let archivedAt = current.archivedAt || null
    if (payload.archived === true) archivedAt = archivedAt || now
    if (payload.archived === false) archivedAt = null
    // Only finished work stays archived; reopening a project brings it back to the board.
    if (nextStatus !== 'done') archivedAt = null
    course.projects[idx] = {
      ...current,
      statusHistory: statusChanged
        ? appendStatusHistory(
            current.statusHistory || [
              { status: current.status || 'todo', at: current.createdAt || now }
            ],
            nextStatus,
            now
          )
        : current.statusHistory,
      archivedAt,
      ...(sortIndex !== undefined ? { sortIndex } : {}),
      title:
        payload.title !== undefined
          ? title || course.projects[idx].title
          : course.projects[idx].title,
      linkedFolderPath:
        linkedFolderPath !== undefined ? linkedFolderPath : course.projects[idx].linkedFolderPath,
      notes:
        payload.notes !== undefined
          ? String(payload.notes || '').trim()
          : course.projects[idx].notes,
      status: payload.status !== undefined ? status : course.projects[idx].status,
      sectionId:
        payload.sectionId !== undefined
          ? payload.sectionId || null
          : course.projects[idx].sectionId,
      fileRelativePath:
        payload.fileRelativePath !== undefined
          ? normalizeProjectRelativePath(payload.fileRelativePath)
          : course.projects[idx].fileRelativePath || null,
      ...(payload.notion !== undefined ? { notion: payload.notion } : {}),
      updatedAt: now
    }
    savedId = course.projects[idx].id
  } else {
    savedId = makeId()
    course.projects.push({
      id: savedId,
      title,
      linkedFolderPath: linkedFolderPath ?? null,
      notes: String(payload.notes || '').trim(),
      status,
      sectionId: payload.sectionId || null,
      fileRelativePath: normalizeProjectRelativePath(payload.fileRelativePath),
      createdAt: now,
      updatedAt: now,
      statusHistory: [{ status, at: now }],
      archivedAt: null,
      ...(sortIndex !== undefined ? { sortIndex } : {}),
      ...(payload.notion !== undefined ? { notion: payload.notion } : {})
    })
  }

  writeStore(store)
  emitProjectWrite({ op: 'upsert', coursePath: key, id: savedId })
  return listProjects(coursePath)
}

export function deleteProject(coursePath, projectId) {
  const store = readStore()
  const { key, course } = getMutableCourse(store, coursePath)
  const removed = course.projects.find((p) => p.id === projectId) || null
  course.projects = course.projects.filter((p) => p.id !== projectId)
  writeStore(store)
  if (removed) {
    emitProjectWrite({ op: 'delete', project: { ...structuredClone(removed), coursePath: key } })
  }
  return listProjects(coursePath)
}

/** Put a project back after Notion wins a delete conflict. */
export function restoreProject(coursePath, project) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  const now = Date.now()
  const existing = course.projects.findIndex((item) => item.id === project.id)
  const next = {
    ...(existing === -1 ? {} : course.projects[existing]),
    ...project,
    id: project.id,
    updatedAt: now
  }
  if (existing === -1) course.projects.push({ ...next, createdAt: project.createdAt || now })
  else course.projects[existing] = next
  writeStore(store)
  emitProjectWrite({ op: 'upsert', coursePath: courseKey(coursePath), id: project.id })
  return next
}

/** Resolve a stored project link for open/reveal (absolute path only if owned by this course). */
export function getProjectLinkedPath(coursePath, projectId) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  const project = course.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('Proyecto no encontrado')
  if (!project.linkedFolderPath) throw new Error('Este proyecto no tiene carpeta vinculada')
  return project.linkedFolderPath
}

/**
 * Lowercased note title+body text keyed by course path — for library search.
 * @returns {Record<string, string>}
 */
export function getNotesSearchByCourse() {
  const store = readStore()
  const hidden = hiddenCoursePathSet()
  const topics = topicIndex(store)
  // Collect pieces per course and join once. Appending to one string and lowercasing it after
  // every note made this grow with the square of a course's note text.
  const parts = new Map()
  for (const key of Object.keys(store.courses || {})) {
    if (!hidden.has(key)) parts.set(key, [])
  }
  for (const finding of store.findings || []) {
    const text = [
      finding.title,
      finding.body,
      ...(finding.topicIds || []).map((id) => topics.get(id)?.title || '')
    ]
      .filter(Boolean)
      .join('\n')
    if (!text) continue
    const keys = new Set(
      (finding.anchors || []).map((anchor) => courseKey(anchor.coursePath)).filter(Boolean)
    )
    for (const key of keys) {
      if (hidden.has(key)) continue
      if (!parts.has(key)) parts.set(key, [])
      parts.get(key).push(text)
    }
  }
  const map = {}
  for (const [key, list] of parts) map[key] = list.join('\n').trim().toLowerCase()
  return map
}

function finiteNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clipText(value, max) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function normalizeCourseWhys(raw, coursePaths) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const notes = {}
  for (const coursePath of coursePaths) {
    const text = clipText(source[coursePath], 180)
    if (text) notes[coursePath] = text
  }
  return notes
}

function normalizePlaylistIntent(input) {
  const source = input && typeof input === 'object' ? input : {}
  const goal = clipText(source.goal, 180)
  const interests = []
  const seen = new Set()
  const raw = Array.isArray(source.interests) ? source.interests : []
  for (const item of raw) {
    const text = clipText(item, 80)
    const key = text.toLowerCase()
    if (text.length < 2 || seen.has(key)) continue
    seen.add(key)
    interests.push(text)
    if (interests.length >= 8) break
  }
  return { goal, interests }
}

function normalizePlaylist(input, existing) {
  const source = input && typeof input === 'object' ? input : {}
  const rawId = String(source.id || existing?.id || '').trim()
  const id = /^[a-zA-Z0-9_-]{1,80}$/.test(rawId) ? rawId : makeId()
  const title =
    String(source.title ?? existing?.title ?? 'Nueva lista')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Nueva lista'
  const position = {
    x: finiteNumber(source.position?.x, existing?.position?.x ?? 48),
    y: finiteNumber(source.position?.y, existing?.position?.y ?? 48)
  }
  const size = {
    width: clampNumber(finiteNumber(source.size?.width, existing?.size?.width ?? 320), 280, 960),
    height: clampNumber(finiteNumber(source.size?.height, existing?.size?.height ?? 220), 140, 8000)
  }
  const rawPaths = Array.isArray(source.coursePaths)
    ? source.coursePaths
    : existing?.coursePaths || []
  const collected = []
  const seen = new Set()
  for (const item of rawPaths) {
    const name = path.basename(String(item || '').trim())
    if (!name || name === '.' || name === '..' || seen.has(name)) continue
    seen.add(name)
    collected.push(name)
  }
  const hidden = hiddenCoursePathSet()
  const coursePaths = retainHiddenCoursePaths(collected, existing?.coursePaths, hidden)
  const why = clipText(source.why !== undefined ? source.why : existing?.why, 280)
  const childIds = normalizeChildIds(
    source.childIds !== undefined ? source.childIds : existing?.childIds,
    id
  )
  const courseWhys = restoreHiddenCourseWhys(
    normalizeCourseWhys(
      source.courseWhys !== undefined ? source.courseWhys : existing?.courseWhys,
      coursePaths
    ),
    existing?.courseWhys,
    hidden
  )
  const now = Date.now()
  const notion = source.notion !== undefined ? source.notion : existing?.notion || null
  return {
    id,
    title,
    why,
    position,
    size,
    coursePaths,
    childIds,
    courseWhys,
    collapsed: Boolean(source.collapsed !== undefined ? source.collapsed : existing?.collapsed),
    createdAt: existing?.createdAt || now,
    updatedAt: source === existing && existing?.updatedAt ? existing.updatedAt : now,
    ...(notion ? { notion } : {})
  }
}

export function getPlaylistIntent() {
  const store = readStore()
  return normalizePlaylistIntent(store.playlistIntent)
}

export function readPlaylistIntentRecord() {
  const store = readStore()
  const intent = normalizePlaylistIntent(store.playlistIntent)
  if (store.playlistIntent?.notion) intent.notion = store.playlistIntent.notion
  return intent
}

export function savePlaylistIntent(payload) {
  const store = readStore()
  const next = normalizePlaylistIntent(payload)
  if (payload?.notion !== undefined) next.notion = payload.notion
  else if (store.playlistIntent?.notion) next.notion = store.playlistIntent.notion
  store.playlistIntent = next
  writeStore(store)
  return normalizePlaylistIntent(next)
}

function playlistsForDisplay(playlists) {
  const hidden = hiddenCoursePathSet()
  if (!hidden.size) return playlists
  return playlists.map((playlist) => playlistForDisplay(playlist, hidden))
}

export function listPlaylistRecords() {
  const store = readStore()
  return settleNesting(
    (store.playlists || []).map((playlist) => normalizePlaylist(playlist, playlist))
  )
}

export function readPlaylist(id) {
  return listPlaylistRecords().find((playlist) => playlist.id === id) || null
}

/** Store a playlist without asking Notion to sync again. */
export function writePlaylistRecord(playlist) {
  const store = readStore()
  if (!Array.isArray(store.playlists)) store.playlists = []
  const existing = store.playlists.find((item) => item.id === playlist?.id)
  const next = normalizePlaylist(playlist, existing)
  if (existing) {
    const index = store.playlists.findIndex((item) => item.id === next.id)
    store.playlists[index] = next
  } else {
    store.playlists.push(next)
  }
  writeStore(store)
  return next
}

export function listPlaylists() {
  const store = readStore()
  return playlistsForDisplay(
    settleNesting((store.playlists || []).map((playlist) => normalizePlaylist(playlist, playlist)))
  )
}

export function upsertPlaylist(payload) {
  const store = readStore()
  if (!Array.isArray(store.playlists)) store.playlists = []
  const existing = store.playlists.find((playlist) => playlist.id === payload?.id)
  const next = normalizePlaylist(payload, existing)
  if (existing && existing.id === next.id) {
    const index = store.playlists.findIndex((playlist) => playlist.id === next.id)
    store.playlists[index] = next
  } else {
    store.playlists.push(next)
  }
  writeStore(store)
  emitPlaylistWrite({ op: 'upsert', id: next.id })
  return playlistForDisplay(next, hiddenCoursePathSet())
}

const DECK_IMAGE_FILE_RE = /^[a-z0-9-]+\.(png|jpe?g|webp|gif|bmp|svg)$/i

function deckCardImage(image) {
  const file = String(image?.file || '').trim()
  if (!DECK_IMAGE_FILE_RE.test(file)) return null
  return {
    file,
    alt: String(image?.alt || '')
      .trim()
      .slice(0, 120)
  }
}

function publicCard(card) {
  return {
    id: card.id,
    type: cardType(card.type),
    noteId: card.noteId || null,
    coursePath: card.coursePath || null,
    lessonPath: card.lessonPath || null,
    lesson: card.lesson || '',
    timeSec: typeof card.timeSec === 'number' ? card.timeSec : null,
    source: card.source || '',
    front: card.front,
    back: card.back || '',
    image: deckCardImage(card.image),
    known: Boolean(card.known)
  }
}

function publicDeck(deck) {
  return {
    id: deck.id,
    title: deck.title || 'Tarjetas',
    createdAt: deck.createdAt || null,
    updatedAt: deck.updatedAt || null,
    ankiSyncedAt: deck.ankiSyncedAt || null,
    cards: (deck.cards || []).map(publicCard)
  }
}

/** A card from the renderer, checked for its type. Null when it does not hold up. */
function storedCard(input) {
  const checked = checkCardFields(input)
  if (!checked.ok) return null
  const noteId = String(input?.noteId || '').trim() || null
  const lessonPath = input?.lessonPath ? String(input.lessonPath) : null
  if (!noteId && !lessonPath) return null
  return {
    id: makeId(),
    ...checked.card,
    noteId,
    coursePath: input?.coursePath ? String(input.coursePath) : null,
    lessonPath,
    lesson: String(input?.lesson || '')
      .trim()
      .slice(0, 160),
    timeSec:
      typeof input?.timeSec === 'number' && input.timeSec >= 0 ? Math.floor(input.timeSec) : null,
    source: String(input?.source || '')
      .trim()
      .slice(0, 240),
    image: deckCardImage(input?.image),
    known: false
  }
}

function findDeck(store, deckId) {
  const deck = (store.decks || []).find((item) => item.id === deckId)
  if (!deck) throw new Error('Mazo no encontrado')
  return deck
}

/** Add cards to a deck. Cards already in it (same text) are left out. */
export function appendDeckCards(deckId, cards) {
  const store = readStore()
  const deck = findDeck(store, deckId)
  const keys = new Set((deck.cards || []).map(cardKey))
  const fresh = []
  for (const input of Array.isArray(cards) ? cards : []) {
    const card = storedCard(input)
    if (!card || keys.has(cardKey(card))) continue
    keys.add(cardKey(card))
    fresh.push(card)
  }
  if (!fresh.length) throw new Error('No hay tarjetas nuevas para este mazo')
  deck.cards = [...(deck.cards || []), ...fresh]
  deck.updatedAt = Date.now()
  writeStore(store)
  return { deck: publicDeck(deck), added: fresh.length }
}

/** Edit a card's text or image. The type stays: Anki keeps one note type per card. */
export function updateDeckCard(deckId, cardId, patch = {}) {
  const store = readStore()
  const deck = findDeck(store, deckId)
  const card = (deck.cards || []).find((item) => item.id === cardId)
  if (!card) throw new Error('Tarjeta no encontrada')
  const checked = checkCardFields({
    type: card.type,
    front: patch.front !== undefined ? patch.front : card.front,
    back: patch.back !== undefined ? patch.back : card.back
  })
  if (!checked.ok) throw new Error(checked.error)
  card.front = checked.card.front
  card.back = checked.card.back
  if (patch.image !== undefined) card.image = deckCardImage(patch.image)
  deck.updatedAt = Date.now()
  writeStore(store)
  return publicDeck(deck)
}

export function deleteDeckCard(deckId, cardId) {
  const store = readStore()
  const deck = findDeck(store, deckId)
  const before = (deck.cards || []).length
  deck.cards = (deck.cards || []).filter((item) => item.id !== cardId)
  if (deck.cards.length !== before) {
    deck.updatedAt = Date.now()
    writeStore(store)
  }
  return publicDeck(deck)
}

export function getDeck(deckId) {
  const deck = (readStore().decks || []).find((item) => item.id === deckId)
  return deck ? publicDeck(deck) : null
}

export function markDeckAnkiSynced(deckId, at = Date.now()) {
  const store = readStore()
  const deck = (store.decks || []).find((item) => item.id === deckId)
  if (!deck) throw new Error('Mazo no encontrado')
  deck.ankiSyncedAt = at
  writeStore(store)
  return publicDeck(deck)
}

export function listDecks() {
  const store = readStore()
  return (store.decks || [])
    .filter((deck) => deck?.id)
    .map(publicDeck)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export function createDeck(payload = {}) {
  const store = readStore()
  if (!Array.isArray(store.decks)) store.decks = []
  const keys = new Set()
  const cards = []
  for (const input of Array.isArray(payload.cards) ? payload.cards : []) {
    const card = storedCard(input)
    if (!card || keys.has(cardKey(card))) continue
    keys.add(cardKey(card))
    cards.push(card)
  }
  if (!cards.length) throw new Error('El mazo no tiene tarjetas')
  const now = Date.now()
  const deck = {
    id: makeId(),
    title: String(payload.title || '').trim() || 'Tarjetas',
    createdAt: now,
    updatedAt: now,
    cards
  }
  store.decks.push(deck)
  writeStore(store)
  return publicDeck(deck)
}

export function deleteDeck(deckId) {
  const store = readStore()
  if (!Array.isArray(store.decks)) store.decks = []
  const id = String(deckId || '')
  const next = store.decks.filter((deck) => deck.id !== id)
  if (next.length !== store.decks.length) {
    store.decks = next
    writeStore(store)
  }
  return { ok: true }
}

export function setDeckCardKnown(deckId, cardId, known) {
  const store = readStore()
  const deck = (store.decks || []).find((item) => item.id === deckId)
  if (!deck) throw new Error('Mazo no encontrado')
  const card = (deck.cards || []).find((item) => item.id === cardId)
  if (!card) throw new Error('Tarjeta no encontrada')
  card.known = Boolean(known)
  deck.updatedAt = Date.now()
  writeStore(store)
  return publicDeck(deck)
}

export function deletePlaylist(playlistId) {
  const store = readStore()
  if (!Array.isArray(store.playlists)) store.playlists = []
  const id = String(playlistId || '')
  const removed = store.playlists.find((playlist) => playlist.id === id) || null
  const parentIds = []
  const next = store.playlists
    .filter((playlist) => playlist.id !== id)
    .map((playlist) => {
      const childIds = (playlist.childIds || []).filter((childId) => childId !== id)
      if (childIds.length !== (playlist.childIds || []).length) parentIds.push(playlist.id)
      return { ...playlist, childIds }
    })
  if (next.length !== store.playlists.length) {
    store.playlists = next
    writeStore(store)
    if (removed) emitPlaylistWrite({ op: 'delete', playlist: removed })
    for (const parentId of parentIds) emitPlaylistWrite({ op: 'upsert', id: parentId })
  }
  return { ok: true }
}

function publicCierre(cierre) {
  const comments = [...(cierre.comments || [])].sort(
    (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
  )
  return {
    ...cierre,
    comments: comments.map((comment) => ({ ...comment }))
  }
}

export function listCierres() {
  const store = readStore()
  const hidden = hiddenCoursePathSet()
  return (store.cierres || [])
    .filter((item) => item?.coursePath && !hidden.has(item.coursePath))
    .map(publicCierre)
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
}

export function upsertCierre(payload = {}) {
  const store = readStore()
  if (!Array.isArray(store.cierres)) store.cierres = []
  const now = Date.now()
  let existing = null
  if (payload.id) {
    existing = store.cierres.find((item) => item.id === payload.id) || null
    if (!existing) throw new Error('Cierre no encontrado')
  } else {
    existing = findCierreForSubject(store.cierres, {
      ...payload,
      coursePath: cierreCourseKey(payload.coursePath)
    })
  }
  const next = normalizeCierreInput(payload, existing)
  if (existing) {
    const saved = {
      ...existing,
      ...next,
      id: existing.id,
      comments: Array.isArray(existing.comments) ? existing.comments : [],
      favorite:
        payload.favorite !== undefined ? Boolean(payload.favorite) : Boolean(existing.favorite),
      publishedAt: existing.publishedAt || now,
      createdAt: existing.createdAt || now,
      updatedAt: now
    }
    const idx = store.cierres.findIndex((item) => item.id === existing.id)
    store.cierres[idx] = saved
    writeStore(store)
    return publicCierre(saved)
  }
  const created = {
    ...next,
    id: makeId(),
    comments: [],
    favorite: Boolean(payload.favorite),
    publishedAt: now,
    createdAt: now,
    updatedAt: now
  }
  store.cierres.push(created)
  writeStore(store)
  return publicCierre(created)
}

export function setCierreFavorite(id, favorite) {
  const store = readStore()
  const item = (store.cierres || []).find((cierre) => cierre.id === id)
  if (!item) throw new Error('Cierre no encontrado')
  item.favorite = Boolean(favorite)
  item.updatedAt = Date.now()
  writeStore(store)
  return publicCierre(item)
}

export function deleteCierre(id) {
  const store = readStore()
  const before = store.cierres?.length || 0
  store.cierres = (store.cierres || []).filter((item) => item.id !== id)
  if (store.cierres.length === before) throw new Error('Cierre no encontrado')
  writeStore(store)
  return { ok: true }
}

export function upsertCierreComment(cierreId, payload = {}) {
  const store = readStore()
  const cierre = (store.cierres || []).find((item) => item.id === cierreId)
  if (!cierre) throw new Error('Cierre no encontrado')
  if (!Array.isArray(cierre.comments)) cierre.comments = []
  const body = normalizeCommentBody(payload.body)
  const now = Date.now()
  if (payload.id) {
    const comment = cierre.comments.find((item) => item.id === payload.id)
    if (!comment) throw new Error('Seguimiento no encontrado')
    comment.body = body
    comment.updatedAt = now
  } else {
    cierre.comments.push({ id: makeId(), body, createdAt: now, updatedAt: now })
  }
  cierre.updatedAt = now
  writeStore(store)
  return publicCierre(cierre)
}

export function deleteCierreComment(cierreId, commentId) {
  const store = readStore()
  const cierre = (store.cierres || []).find((item) => item.id === cierreId)
  if (!cierre) throw new Error('Cierre no encontrado')
  const before = cierre.comments?.length || 0
  cierre.comments = (cierre.comments || []).filter((item) => item.id !== commentId)
  if (cierre.comments.length === before) throw new Error('Seguimiento no encontrado')
  cierre.updatedAt = Date.now()
  writeStore(store)
  return publicCierre(cierre)
}

/** Absolute path to learning-store.json (notes, projects, progress). */
export function getLearningStorePath() {
  return getStorePath()
}

/** Ensure the store file exists on disk, then return its path. */
export function ensureLearningStoreFile() {
  writeStore(readStore())
  return getStorePath()
}

export { COMPLETE_THRESHOLD }

// ---------------------------------------------------------------------------
// Fuentes: saved links. Stored apart from courses and playlists.

function sourceList(store) {
  if (!Array.isArray(store.sources)) store.sources = []
  return store.sources
}

function noteCountsBySource(store) {
  const counts = new Map()
  for (const finding of store.findings || []) {
    const ids = new Set()
    for (const anchor of finding.anchors || []) if (anchor?.sourceId) ids.add(anchor.sourceId)
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1)
  }
  return counts
}

function presentSource(source, counts, topicsById) {
  return {
    ...source,
    noteCount: counts.get(source.id) || 0,
    topics: (source.topicIds || [])
      .map((id) => topicsById.get(id))
      .filter(Boolean)
      .map((topic) => ({ id: topic.id, title: topic.title }))
  }
}

/** Every saved link, newest first, with its note count and topic names. */
export function listSources() {
  const store = readStore()
  const counts = noteCountsBySource(store)
  const topics = topicIndex(store)
  return sourceList(store)
    .map((source) => presentSource(source, counts, topics))
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
}

export function readSource(id) {
  const source = sourceList(readStore()).find((item) => item.id === id)
  return source ? structuredClone(source) : null
}

export function findSourceByUrl(url) {
  if (!url) return null
  const source = sourceList(readStore()).find((item) => item.url === url)
  return source ? structuredClone(source) : null
}

/** Create or update one link. `payload.id` updates; otherwise a new id is made. */
export function upsertSource(payload = {}) {
  const store = readStore()
  const list = sourceList(store)
  const existing = payload.id ? list.find((item) => item.id === payload.id) : null
  if (payload.id && !existing) throw new Error('Fuente no encontrada')
  const next = normalizeSource({ ...payload, id: existing?.id || makeId() }, existing)
  if (!next.url) throw new Error('La fuente necesita un enlace')
  const clash = list.find((item) => item.url === next.url && item.id !== next.id)
  if (clash) throw new Error('Ese enlace ya está guardado')
  if (Array.isArray(payload.topicIds)) {
    next.topicIds = payload.topicIds.filter((id) => store.topics.some((topic) => topic.id === id))
  }
  if (existing) Object.assign(existing, next)
  else list.push(next)
  if (existing && payload.title !== undefined) {
    // Keep the title stored on note anchors in step, so Notion places the note under the new name.
    for (const finding of store.findings || []) {
      for (const anchor of finding.anchors || []) {
        if (anchor.sourceId === next.id) anchor.sourceTitle = next.title
      }
    }
  }
  writeStore(store)
  const counts = noteCountsBySource(store)
  return presentSource(structuredClone(next), counts, topicIndex(store))
}

/**
 * Remove a link. Notes keep their text and lose only the anchor to it.
 * Returns the removed link and how many notes pointed at it.
 */
export function deleteSource(id) {
  const store = readStore()
  const list = sourceList(store)
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return { removed: null, noteCount: 0 }
  const [removed] = list.splice(index, 1)
  const touched = []
  for (const finding of store.findings || []) {
    const before = (finding.anchors || []).length
    finding.anchors = (finding.anchors || []).filter((anchor) => anchor.sourceId !== id)
    if (finding.anchors.length !== before) {
      finding.updatedAt = Date.now()
      touched.push(finding.id)
    }
  }
  writeStore(store)
  for (const findingId of touched) emitNoteWrite({ op: 'upsert', id: findingId })
  return { removed: structuredClone(removed), noteCount: touched.length }
}

/** Notes anchored to one link, oldest first; timed notes in video order. */
export function listSourceNotes(sourceId) {
  const store = readStore()
  const topics = topicIndex(store)
  return findingsForSource(store.findings, sourceId)
    .map((finding) => decorateFinding(store, finding, topics))
    .sort((a, b) => {
      const aT = typeof a.timeSec === 'number' ? a.timeSec : Number.POSITIVE_INFINITY
      const bT = typeof b.timeSec === 'number' ? b.timeSec : Number.POSITIVE_INFINITY
      if (aT !== bT) return aT - bT
      return (a.createdAt || 0) - (b.createdAt || 0)
    })
}
