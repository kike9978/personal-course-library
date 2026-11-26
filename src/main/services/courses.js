import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { shell } from 'electron'
import { writeFileAtomic } from './atomicFile.js'
import { getLibraryPath, isLibraryPathValid } from './config.js'
import { resolveCourseFile } from './courseScan.js'
import { storedDescription } from '../../shared/courseDescription.js'
import { isCourseHidden } from '../../shared/courseHide.js'

const COVER_FORMATS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']
const READ_CONCURRENCY = 12
export const NEW_COURSE_MS = 14 * 24 * 60 * 60 * 1000

export const PROGRAM_SUGGESTIONS = [
  'Photoshop',
  'Cinema4D',
  'Illustrator',
  'After Effects',
  'Blender',
  'Maya',
  'DaVinci Resolve',
  'ZBrush',
  'VS Code'
]

export const THEME_SUGGESTIONS = [
  'Character',
  'Environment',
  'Concept art',
  'Animation',
  'Lighting',
  'Storyboard',
  'UI',
  'VFX',
  'Modeling',
  'Texturing'
]

const courseCache = new Map()
// Folder name -> { path, at }. Short-lived so a cover dropped in by hand still shows up soon.
const coverPathCache = new Map()
const COVER_CACHE_MS = 30000
let hiddenPathCache = null

function requireLibraryPath() {
  const libraryPath = getLibraryPath()
  if (!isLibraryPathValid(libraryPath)) {
    throw new Error('Library path is not configured or is invalid')
  }
  return libraryPath
}

function coursePropsPath(courseDir) {
  const libraryPath = requireLibraryPath()
  const safeName = path.basename(courseDir)
  return path.join(libraryPath, safeName, 'courseProps.json')
}

function courseFolderPath(courseDir) {
  const libraryPath = requireLibraryPath()
  return path.join(libraryPath, path.basename(courseDir))
}

let titleMapCache = null
let titleMapLibrary = ''

/**
 * Keep the library-wide hidden set and title map in step with one course's props, so an
 * edit does not force a re-read of every courseProps.json in the library.
 */
function rememberProps(courseDir, data) {
  const name = path.basename(String(courseDir || ''))
  if (!name || !data) return
  if (hiddenPathCache) {
    if (isCourseHidden(data)) hiddenPathCache.add(name)
    else hiddenPathCache.delete(name)
  }
  if (titleMapCache) {
    const title = String(data.title || '').trim()
    if (title) titleMapCache[name] = title
    else delete titleMapCache[name]
  }
}

/** One course (props are then passed to rememberProps), or the whole library when called bare. */
function invalidateCache(courseDir) {
  if (!courseDir) {
    hiddenPathCache = null
    titleMapCache = null
    titleMapLibrary = ''
  }
  if (courseDir) {
    courseCache.delete(courseDir)
    courseCache.delete(path.basename(String(courseDir)))
    coverPathCache.delete(path.basename(String(courseDir)))
  } else {
    courseCache.clear()
    coverPathCache.clear()
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length)
  let index = 0

  async function worker() {
    while (index < items.length) {
      const current = index++
      results[current] = await mapper(items[current], current)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

function suggestProgramsFromName(folderName) {
  return PROGRAM_SUGGESTIONS.filter((program) =>
    String(folderName || '')
      .toLowerCase()
      .includes(program.toLowerCase())
  )
}

/** Defaults from folder name: `Academia - Título`. */
export function buildCoursePropsFromFolderName(folderName) {
  const name = path.basename(String(folderName || ''))
  const parts = name.split(' - ')
  return {
    title: (parts[1] || name).trim(),
    programs: suggestProgramsFromName(name),
    theme: [],
    institution: (parts[0] && parts.length > 1 ? parts[0] : '').trim(),
    instructor: '',
    isIncomplete: false,
    isInProcess: false,
    hide: false,
    rate: 0,
    description: null
  }
}

function normalizeThemes(data) {
  if (Array.isArray(data?.theme)) {
    return data.theme
      .map(String)
      .map((t) => t.trim())
      .filter(Boolean)
  }
  if (Array.isArray(data?.themes)) {
    return data.themes
      .map(String)
      .map((t) => t.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeRate(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(5, Math.round(n)))
}

function normalizeCourseRecord(courseDir, data, meta = {}) {
  const theme = normalizeThemes(data)
  const rate = normalizeRate(data?.rate)
  const folderMtimeMs = meta.folderMtimeMs ?? null
  return {
    path: courseDir,
    title: data?.title || courseDir,
    institution: data?.institution || '',
    instructor: data?.instructor || '',
    programs: Array.isArray(data?.programs) ? data.programs.filter(Boolean) : [],
    theme,
    rate,
    isInProcess: Boolean(data?.isInProcess),
    isIncomplete: Boolean(data?.isIncomplete),
    hide: isCourseHidden(data),
    description: storedDescription(data?.description),
    hasCover: Boolean(meta.hasCover),
    hasProps: meta.hasProps !== false,
    missingProps: Boolean(meta.missingProps),
    folderMtimeMs,
    folderBirthtimeMs: meta.folderBirthtimeMs ?? null,
    isNew: typeof folderMtimeMs === 'number' && Date.now() - folderMtimeMs < NEW_COURSE_MS
  }
}

function folderTimesSync(courseDir) {
  try {
    const stat = fsSync.statSync(courseFolderPath(courseDir))
    const birth = stat.birthtimeMs
    return {
      folderMtimeMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : null,
      folderBirthtimeMs: typeof birth === 'number' && birth > 86400000 ? birth : null
    }
  } catch {
    return { folderMtimeMs: null, folderBirthtimeMs: null }
  }
}

function folderMtimeMsSync(courseDir) {
  return folderTimesSync(courseDir).folderMtimeMs
}

/** Folder names whose courseProps.json has `hide: true`. */
export function hiddenCoursePathSet() {
  if (hiddenPathCache) return hiddenPathCache
  const hidden = new Set()
  hiddenPathCache = hidden
  const libraryPath = getLibraryPath()
  if (!isLibraryPathValid(libraryPath)) return hidden
  let entries
  try {
    entries = fsSync.readdirSync(libraryPath, { withFileTypes: true })
  } catch {
    return hidden
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Missing or unreadable props stay in the catalog.
    const data = readCoursePropsCached(entry.name)
    if (data && isCourseHidden(data)) hidden.add(entry.name)
  }
  return hidden
}

/** Folder name → title from courseProps.json. Missing files fall back later. */
export function readCourseTitleMap() {
  let libraryPath
  try {
    libraryPath = requireLibraryPath()
  } catch {
    return {}
  }
  if (titleMapCache && titleMapLibrary === libraryPath) return titleMapCache
  let entries = []
  try {
    entries = fsSync.readdirSync(libraryPath, { withFileTypes: true })
  } catch {
    return {}
  }
  const titles = {}
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = fsSync.readFileSync(
        path.join(libraryPath, entry.name, 'courseProps.json'),
        'utf8'
      )
      const title = String(JSON.parse(raw)?.title || '').trim()
      if (title) titles[entry.name] = title
    } catch {
      // The folder name is the title when this course has no props yet.
    }
  }
  titleMapCache = titles
  titleMapLibrary = libraryPath
  return titleMapCache
}

export async function listCourseDirs() {
  const libraryPath = requireLibraryPath()
  const entries = await fs.readdir(libraryPath, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

export async function getCourse(courseDir) {
  if (courseCache.has(courseDir)) {
    return courseCache.get(courseDir)
  }

  const filePath = coursePropsPath(courseDir)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const data = JSON.parse(raw)
    courseCache.set(courseDir, data)
    return data
  } catch (error) {
    throw new Error(`Failed to read course data for ${courseDir}: ${error.message}`)
  }
}

/**
 * courseProps.json contents from the shared cache, read from disk only on a miss.
 * Null when the course has no readable props. Callers must not mutate the result.
 */
export function readCoursePropsCached(courseDir) {
  const name = path.basename(String(courseDir || ''))
  if (!name) return null
  if (courseCache.has(name)) return courseCache.get(name)
  const libraryPath = getLibraryPath()
  if (!libraryPath) return null
  try {
    const data = JSON.parse(
      fsSync.readFileSync(path.join(libraryPath, name, 'courseProps.json'), 'utf8')
    )
    courseCache.set(name, data)
    return data
  } catch {
    return null
  }
}

/** Fresh catalog record, including whether a cover file is present. */
export async function loadCourseRecord(courseDir) {
  const name = path.basename(String(courseDir || '').trim())
  if (!name || name === '.' || name === '..') {
    throw new Error('Carpeta de curso no encontrada')
  }
  const folder = courseFolderPath(name)
  if (!fsSync.existsSync(folder) || !fsSync.statSync(folder).isDirectory()) {
    throw new Error('Carpeta de curso no encontrada')
  }

  invalidateCache(name)
  const times = folderTimesSync(name)
  const hasCover = Boolean(findCoverImagePathSync(name))
  const filePath = coursePropsPath(name)
  let data = buildCoursePropsFromFolderName(name)
  let hasProps = false
  if (fsSync.existsSync(filePath)) {
    try {
      data = await getCourse(name)
      hasProps = true
      rememberProps(name, data)
    } catch {
      data = buildCoursePropsFromFolderName(name)
    }
  }

  return normalizeCourseRecord(name, data, {
    ...times,
    hasCover,
    hasProps,
    missingProps: !hasProps
  })
}

export async function listCourses({ includeHidden = false } = {}) {
  const dirs = await listCourseDirs()
  const courses = await mapWithConcurrency(dirs, READ_CONCURRENCY, async (courseDir) => {
    const { hasCover, ...times } = await readCourseFolderInfo(courseDir)
    try {
      const data = await getCourse(courseDir)
      return normalizeCourseRecord(courseDir, data, {
        ...times,
        hasCover,
        hasProps: true,
        missingProps: false
      })
    } catch {
      return normalizeCourseRecord(courseDir, buildCoursePropsFromFolderName(courseDir), {
        ...times,
        hasCover,
        hasProps: false,
        missingProps: true
      })
    }
  })

  const listed = courses.filter(Boolean)
  if (includeHidden) return listed
  return listed.filter((course) => !isCourseHidden(course))
}

/**
 * Create courseProps.json from folder name heuristics.
 * @param {string} courseDir
 * @param {{ overwrite?: boolean }} [opts]
 */
export async function generateCourseProps(courseDir, opts = {}) {
  const { overwrite = false } = opts
  const filePath = coursePropsPath(courseDir)
  const folder = courseFolderPath(courseDir)
  if (!fsSync.existsSync(folder) || !fsSync.statSync(folder).isDirectory()) {
    throw new Error('Carpeta de curso no encontrada')
  }

  if (!overwrite && fsSync.existsSync(filePath)) {
    invalidateCache(courseDir)
    const data = await getCourse(courseDir)
    rememberProps(courseDir, data)
    return normalizeCourseRecord(courseDir, data, {
      folderMtimeMs: folderMtimeMsSync(courseDir),
      hasCover: Boolean(findCoverImagePathSync(courseDir)),
      hasProps: true,
      missingProps: false
    })
  }

  const data = buildCoursePropsFromFolderName(courseDir)
  await writeFileAtomic(filePath, JSON.stringify(data, null, 2))
  invalidateCache(courseDir)
  rememberProps(courseDir, data)
  return normalizeCourseRecord(courseDir, data, {
    folderMtimeMs: folderMtimeMsSync(courseDir),
    hasCover: Boolean(findCoverImagePathSync(courseDir)),
    hasProps: true,
    missingProps: false
  })
}

/**
 * Ensure required keys exist without wiping user fields.
 */
export async function repairCourseProps(courseDir) {
  const filePath = coursePropsPath(courseDir)
  const defaults = buildCoursePropsFromFolderName(courseDir)
  let existing = {}
  if (fsSync.existsSync(filePath)) {
    try {
      existing = JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch {
      existing = {}
    }
  }

  const theme = normalizeThemes(existing)
  const data = {
    ...defaults,
    ...existing,
    title: existing.title || defaults.title,
    institution: existing.institution ?? defaults.institution,
    instructor: existing.instructor ?? '',
    programs: Array.isArray(existing.programs) ? existing.programs : defaults.programs,
    theme,
    rate: normalizeRate(existing.rate ?? defaults.rate),
    isIncomplete: Boolean(existing.isIncomplete),
    isInProcess: Boolean(existing.isInProcess),
    hide: existing.hide === true,
    description: storedDescription(existing.description)
  }
  delete data.themes

  await writeFileAtomic(filePath, JSON.stringify(data, null, 2))
  invalidateCache(courseDir)
  rememberProps(courseDir, data)
  return normalizeCourseRecord(courseDir, data, {
    folderMtimeMs: folderMtimeMsSync(courseDir),
    hasCover: Boolean(findCoverImagePathSync(courseDir)),
    hasProps: true,
    missingProps: false
  })
}

/**
 * Generate props for specific folders that lack courseProps.json.
 * Skips paths that already have props or are not directories.
 * @param {string[]} courseDirs
 */
export async function generateCoursePropsBatch(courseDirs = []) {
  const unique = [
    ...new Set(
      (Array.isArray(courseDirs) ? courseDirs : [])
        .map((d) => path.basename(String(d || '').trim()))
        .filter(Boolean)
    )
  ]
  const created = []
  for (const courseDir of unique) {
    const filePath = coursePropsPath(courseDir)
    if (fsSync.existsSync(filePath)) continue
    const folder = courseFolderPath(courseDir)
    if (!fsSync.existsSync(folder) || !fsSync.statSync(folder).isDirectory()) continue
    created.push(await generateCourseProps(courseDir))
  }
  return { createdCount: created.length, courses: created }
}

/** Generate props for every folder that lacks courseProps.json. */
export async function generateMissingCourseProps() {
  const dirs = await listCourseDirs()
  const missing = dirs.filter((courseDir) => !fsSync.existsSync(coursePropsPath(courseDir)))
  return generateCoursePropsBatch(missing)
}

function sanitizeUpdates(updates = {}) {
  const next = { ...updates }
  if (next.theme !== undefined || next.themes !== undefined) {
    next.theme = normalizeThemes({ theme: next.theme ?? next.themes })
    delete next.themes
  }
  if (next.rate !== undefined) {
    next.rate = normalizeRate(next.rate)
  }
  if (next.programs !== undefined && !Array.isArray(next.programs)) {
    next.programs = []
  }
  if (Object.prototype.hasOwnProperty.call(next, 'description')) {
    next.description = storedDescription(next.description)
  }
  if (Object.prototype.hasOwnProperty.call(next, 'hide')) {
    next.hide = next.hide === true
  }
  return next
}

export async function updateCourseProperty(courseDir, property, value) {
  return updateCourse(courseDir, { [property]: value })
}

export async function updateCourse(courseDir, updates) {
  const filePath = coursePropsPath(courseDir)
  const folder = courseFolderPath(courseDir)
  if (!fsSync.existsSync(folder)) {
    throw new Error('Carpeta de curso no encontrada')
  }

  let existing = {}
  if (fsSync.existsSync(filePath)) {
    try {
      existing = JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch {
      existing = buildCoursePropsFromFolderName(courseDir)
    }
  } else {
    existing = buildCoursePropsFromFolderName(courseDir)
  }

  const data = sanitizeUpdates({ ...existing, ...updates })
  if (!Array.isArray(data.theme)) data.theme = normalizeThemes(data)
  data.rate = normalizeRate(data.rate)
  data.description = storedDescription(data.description)
  delete data.themes

  await writeFileAtomic(filePath, JSON.stringify(data, null, 2))
  invalidateCache(courseDir)
  rememberProps(courseDir, data)
  return data
}

/** Cover file name in a folder listing, or null. Exact `cover-image.<ext>` names win. */
function pickCoverName(entries) {
  const names = new Set(entries)
  for (const format of COVER_FORMATS) {
    if (names.has(`cover-image.${format}`)) return `cover-image.${format}`
  }
  return (
    entries.find((name) => {
      const lower = name.toLowerCase()
      return (
        COVER_FORMATS.some((ext) => lower === `cover-image.${ext}`) ||
        lower === 'cover-image' ||
        /^cover[-_.]?image\.(png|jpe?g|webp|gif|svg)$/i.test(name) ||
        /^cover\.(png|jpe?g|webp|gif|svg)$/i.test(name)
      )
    }) || null
  )
}

function rememberCover(name, coverPath) {
  coverPathCache.set(name, { path: coverPath, at: Date.now() })
}

function cachedCover(name) {
  const hit = coverPathCache.get(name)
  if (!hit || Date.now() - hit.at > COVER_CACHE_MS) return undefined
  return hit.path
}

function findCoverImagePathSync(courseDir) {
  const name = path.basename(String(courseDir || ''))
  if (!name) return null
  const cached = cachedCover(name)
  if (cached !== undefined) return cached
  let coverPath = null
  try {
    const libraryPath = getLibraryPath()
    if (libraryPath) {
      const courseFolder = path.join(libraryPath, name)
      const match = pickCoverName(fsSync.readdirSync(courseFolder))
      if (match) coverPath = path.join(courseFolder, match)
    }
  } catch {
    coverPath = null
  }
  rememberCover(name, coverPath)
  return coverPath
}

/** Folder times and cover in two async calls, so a library scan does not block the main process. */
async function readCourseFolderInfo(courseDir) {
  const name = path.basename(String(courseDir || ''))
  const folder = courseFolderPath(name)
  const [stat, entries] = await Promise.all([
    fs.stat(folder).catch(() => null),
    fs.readdir(folder).catch(() => [])
  ])
  const birth = stat?.birthtimeMs
  const match = pickCoverName(entries)
  const coverPath = match ? path.join(folder, match) : null
  rememberCover(name, coverPath)
  return {
    folderMtimeMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : null,
    folderBirthtimeMs: typeof birth === 'number' && birth > 86400000 ? birth : null,
    hasCover: Boolean(coverPath)
  }
}

export function findCoverImagePath(courseDir) {
  return findCoverImagePathSync(courseDir)
}

/**
 * The URL carries the file's modified time: it changes when the cover does, and stays the
 * same otherwise so the browser can reuse its cached copy (the protocol allows an hour).
 */
export function getCoverImageUrl(courseDir) {
  const coverPath = findCoverImagePathSync(courseDir)
  if (!coverPath) return null
  let stamp = 0
  try {
    stamp = Math.round(fsSync.statSync(coverPath).mtimeMs)
  } catch {
    return null
  }
  const course = encodeURIComponent(path.basename(courseDir))
  return `course-media://cover/?course=${course}&t=${stamp}`
}

export async function openCourseFolder(courseDir) {
  const libraryPath = requireLibraryPath()
  const fullPath = path.join(libraryPath, path.basename(courseDir))
  if (!fsSync.existsSync(fullPath)) {
    throw new Error(`Course folder not found: ${fullPath}`)
  }
  const result = await shell.openPath(fullPath)
  if (result) {
    throw new Error(result)
  }
  return true
}

export async function openCourseFile(courseDir, relativePath) {
  const absolute = resolveCourseFile(courseDir, relativePath)
  if (!fsSync.existsSync(absolute) || !fsSync.statSync(absolute).isFile()) {
    throw new Error('Archivo no encontrado')
  }
  const result = await shell.openPath(absolute)
  if (result) {
    throw new Error(result)
  }
  return true
}

export async function revealCourseFile(courseDir, relativePath) {
  const absolute = resolveCourseFile(courseDir, relativePath)
  if (!fsSync.existsSync(absolute)) {
    throw new Error('Archivo no encontrado')
  }
  shell.showItemInFolder(absolute)
  return true
}

export async function openAbsolutePath(targetPath) {
  const absolute = path.resolve(String(targetPath || ''))
  if (!fsSync.existsSync(absolute)) {
    throw new Error('Ruta no encontrada')
  }
  const result = await shell.openPath(absolute)
  if (result) {
    throw new Error(result)
  }
  return true
}

export function revealAbsolutePath(targetPath) {
  const absolute = path.resolve(String(targetPath || ''))
  if (!fsSync.existsSync(absolute)) {
    throw new Error('Ruta no encontrada')
  }
  shell.showItemInFolder(absolute)
  return true
}

export function clearCourseCache() {
  invalidateCache()
}
