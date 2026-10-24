import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { shell } from 'electron'
import { getLibraryPath, isLibraryPathValid } from './config.js'
import { resolveCourseFile } from './courseScan.js'

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

function invalidateCache(courseDir) {
  if (courseDir) {
    courseCache.delete(courseDir)
  } else {
    courseCache.clear()
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
    rate: 0
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

export async function listCourses() {
  const dirs = await listCourseDirs()
  const courses = await mapWithConcurrency(dirs, READ_CONCURRENCY, async (courseDir) => {
    const times = folderTimesSync(courseDir)
    const hasCover = Boolean(findCoverImagePathSync(courseDir))
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

  return courses.filter(Boolean)
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
    return normalizeCourseRecord(courseDir, data, {
      folderMtimeMs: folderMtimeMsSync(courseDir),
      hasCover: Boolean(findCoverImagePathSync(courseDir)),
      hasProps: true,
      missingProps: false
    })
  }

  const data = buildCoursePropsFromFolderName(courseDir)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
  invalidateCache(courseDir)
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
    isInProcess: Boolean(existing.isInProcess)
  }
  delete data.themes

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
  invalidateCache(courseDir)
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
  delete data.themes

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
  invalidateCache(courseDir)
  return data
}

function findCoverImagePathSync(courseDir) {
  try {
    const libraryPath = getLibraryPath()
    if (!libraryPath) return null

    const courseFolder = path.join(libraryPath, path.basename(courseDir))
    if (!fsSync.existsSync(courseFolder)) return null

    for (const format of COVER_FORMATS) {
      const imagePath = path.join(courseFolder, `cover-image.${format}`)
      if (fsSync.existsSync(imagePath)) {
        return imagePath
      }
    }

    const entries = fsSync.readdirSync(courseFolder)
    const match = entries.find((name) => {
      const lower = name.toLowerCase()
      return (
        COVER_FORMATS.some((ext) => lower === `cover-image.${ext}`) ||
        lower === 'cover-image' ||
        /^cover[-_.]?image\.(png|jpe?g|webp|gif|svg)$/i.test(name) ||
        /^cover\.(png|jpe?g|webp|gif|svg)$/i.test(name)
      )
    })

    if (match) {
      return path.join(courseFolder, match)
    }
  } catch {
    return null
  }

  return null
}

export function findCoverImagePath(courseDir) {
  return findCoverImagePathSync(courseDir)
}

export function getCoverImageUrl(courseDir) {
  if (!findCoverImagePathSync(courseDir)) {
    return null
  }
  const course = encodeURIComponent(path.basename(courseDir))
  return `course-media://cover/?course=${course}&t=${Date.now()}`
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
