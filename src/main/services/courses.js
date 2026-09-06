import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { shell } from 'electron'
import { getLibraryPath, isLibraryPathValid } from './config.js'
import { resolveCourseFile } from './courseScan.js'

const COVER_FORMATS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']
const READ_CONCURRENCY = 12

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
    try {
      const data = await getCourse(courseDir)
      return {
        path: courseDir,
        ...data,
        hasCover: Boolean(findCoverImagePathSync(courseDir))
      }
    } catch {
      return {
        path: courseDir,
        title: courseDir,
        institution: '',
        programs: [],
        instructor: '',
        isInProcess: false,
        error: true
      }
    }
  })

  return courses.filter(Boolean)
}

export async function updateCourseProperty(courseDir, property, value) {
  const filePath = coursePropsPath(courseDir)
  const raw = await fs.readFile(filePath, 'utf8')
  const data = JSON.parse(raw)
  data[property] = value
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
  invalidateCache(courseDir)
  return data
}

export async function updateCourse(courseDir, updates) {
  const filePath = coursePropsPath(courseDir)
  const raw = await fs.readFile(filePath, 'utf8')
  const data = { ...JSON.parse(raw), ...updates }
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

    // Case-insensitive / alternate naming fallback (Cover-Image.PNG, cover.jpg, etc.)
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
  // Query param avoids path encoding issues with spaces/special chars on Windows
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

/**
 * Open a file inside a course with the OS default app.
 */
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

/**
 * Reveal a course file in the system file manager.
 */
export async function revealCourseFile(courseDir, relativePath) {
  const absolute = resolveCourseFile(courseDir, relativePath)
  if (!fsSync.existsSync(absolute)) {
    throw new Error('Archivo no encontrado')
  }
  shell.showItemInFolder(absolute)
  return true
}

/** Open an absolute folder/file path (used for virtual project links). */
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

/** Reveal an absolute path in the file manager. */
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
