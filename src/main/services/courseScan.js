import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { getLibraryPath, isLibraryPathValid } from './config.js'

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg'])
const DOC_EXTS = new Set(['.pdf', '.html', '.htm', '.txt', '.md', '.rtf'])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const SUBTITLE_EXTS = new Set(['.srt', '.vtt'])
const ARCHIVE_EXTS = new Set(['.zip', '.rar', '.7z'])

const IGNORE_NAMES = new Set([
  'courseprops.json',
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  'node_modules',
  '__macosx'
])

const RESOURCE_DIR_RE =
  /subtitle|subs|materials?|resources?|assets?|projects?|files?|rigs?|references?|exercises?/i

const COVER_RE = /^cover(-?image)?\.(png|jpe?g|webp|gif|svg)$/i
const JUNK_TXT_RE = /downloadpirate|torrent|readme\.nfo/i

function requireLibraryPath() {
  const libraryPath = getLibraryPath()
  if (!isLibraryPathValid(libraryPath)) {
    throw new Error('Library path is not configured or is invalid')
  }
  return libraryPath
}

export function resolveCourseRoot(courseDir) {
  const libraryPath = requireLibraryPath()
  const safeName = path.basename(courseDir)
  const full = path.join(libraryPath, safeName)
  const courseRoot = path.resolve(full)
  const libraryResolved = path.resolve(libraryPath)
  const rel = path.relative(libraryResolved, courseRoot)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid course path')
  }
  if (!fsSync.existsSync(courseRoot) || !fsSync.statSync(courseRoot).isDirectory()) {
    throw new Error(`Course folder not found: ${safeName}`)
  }
  return { libraryPath, courseName: safeName, courseRoot }
}

/** Ensure relativePath stays inside course root; returns absolute path. */
export function resolveCourseFile(courseDir, relativePath) {
  const { courseRoot } = resolveCourseRoot(courseDir)
  const normalized = path.normalize(String(relativePath || '').replace(/^([/\\])+/, ''))
  const absolute = path.resolve(courseRoot, normalized)
  const rel = path.relative(courseRoot, absolute)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes course folder')
  }
  return absolute
}

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

function shouldIgnoreName(name) {
  const lower = name.toLowerCase()
  if (IGNORE_NAMES.has(lower)) return true
  if (name.startsWith('.')) return true
  if (COVER_RE.test(name)) return true
  if (JUNK_TXT_RE.test(name)) return true
  return false
}

function isResourceDirName(name) {
  return RESOURCE_DIR_RE.test(name)
}

function extOf(name) {
  return path.extname(name).toLowerCase()
}

function classifyFile(name) {
  const ext = extOf(name)
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (SUBTITLE_EXTS.has(ext)) return 'subtitle'
  if (DOC_EXTS.has(ext)) return 'doc'
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (ARCHIVE_EXTS.has(ext)) return 'archive'
  return 'other'
}

function prettyTitle(filename) {
  const base = path.basename(filename, path.extname(filename))
  return (
    base
      .replace(/^[\[\(]?\d+[\]\)]?[.\-_\s]+/g, '')
      .replace(/^(\d+[.\-_])+/g, '')
      .replace(/\s+/g, ' ')
      .trim() || base
  )
}

function toPosixRelative(courseRoot, absolutePath) {
  return path.relative(courseRoot, absolutePath).split(path.sep).join('/')
}

async function listSortedEntries(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => !shouldIgnoreName(e.name))
    .sort((a, b) => naturalCompare(a.name, b.name))
}

function makeResource(courseRoot, absolutePath, kind) {
  return {
    relativePath: toPosixRelative(courseRoot, absolutePath),
    title: prettyTitle(path.basename(absolutePath)),
    kind,
    name: path.basename(absolutePath)
  }
}

function makeLesson(courseRoot, absolutePath, kind, sectionId) {
  return {
    id: toPosixRelative(courseRoot, absolutePath),
    relativePath: toPosixRelative(courseRoot, absolutePath),
    title: prettyTitle(path.basename(absolutePath)),
    kind,
    sectionId,
    resources: []
  }
}

function attachSidecars(lessons, resourceFiles) {
  const byBase = new Map()
  for (const lesson of lessons) {
    const base = path.basename(lesson.relativePath, path.extname(lesson.relativePath)).toLowerCase()
    byBase.set(base, lesson)
  }

  const leftovers = []
  for (const res of resourceFiles) {
    const base = path.basename(res.relativePath, path.extname(res.relativePath)).toLowerCase()
    const lesson = byBase.get(base)
    if (lesson && (res.kind === 'subtitle' || res.kind === 'doc' || res.kind === 'image')) {
      lesson.resources.push(res)
    } else {
      leftovers.push(res)
    }
  }
  return leftovers
}

/**
 * Recursively collect media under a directory, flattening into one section's lessons.
 * Nested folders only contribute title prefix for resources; videos flatten into section.
 */
async function collectUnderDir(courseRoot, absDir, sectionId, lessons, resources, depth = 0) {
  const entries = await listSortedEntries(absDir)

  for (const entry of entries) {
    const abs = path.join(absDir, entry.name)
    if (entry.isDirectory()) {
      if (isResourceDirName(entry.name)) {
        await collectResourceDir(courseRoot, abs, resources)
      } else {
        await collectUnderDir(courseRoot, abs, sectionId, lessons, resources, depth + 1)
      }
      continue
    }
    if (!entry.isFile()) continue

    const kind = classifyFile(entry.name)
    if (kind === 'video' || kind === 'audio') {
      lessons.push(makeLesson(courseRoot, abs, kind, sectionId))
    } else if (kind !== 'other' || ARCHIVE_EXTS.has(extOf(entry.name))) {
      resources.push(makeResource(courseRoot, abs, kind === 'other' ? 'archive' : kind))
    } else {
      resources.push(makeResource(courseRoot, abs, 'other'))
    }
  }
}

async function collectResourceDir(courseRoot, absDir, resources) {
  const entries = await listSortedEntries(absDir)
  for (const entry of entries) {
    const abs = path.join(absDir, entry.name)
    if (entry.isDirectory()) {
      await collectResourceDir(courseRoot, abs, resources)
      continue
    }
    if (!entry.isFile()) continue
    const kind = classifyFile(entry.name)
    resources.push(makeResource(courseRoot, abs, kind))
  }
}

/**
 * Scan a course folder into sections / lessons / resources.
 */
export async function scanCourse(courseDir) {
  const { courseName, courseRoot } = resolveCourseRoot(courseDir)
  const sections = []
  const rootLessons = []
  const rootResources = []
  const allLessons = []

  const entries = await listSortedEntries(courseRoot)

  for (const entry of entries) {
    const abs = path.join(courseRoot, entry.name)

    if (entry.isDirectory()) {
      if (isResourceDirName(entry.name)) {
        await collectResourceDir(courseRoot, abs, rootResources)
        continue
      }

      const sectionId = toPosixRelative(courseRoot, abs)
      const sectionLessons = []
      const sectionResources = []
      await collectUnderDir(courseRoot, abs, sectionId, sectionLessons, sectionResources)

      // If folder has no media, treat as resources-only (still show if it has files)
      if (sectionLessons.length === 0) {
        rootResources.push(...sectionResources)
        // Also list nested files as course resources already done
        continue
      }

      const leftover = attachSidecars(sectionLessons, sectionResources)
      sections.push({
        id: sectionId,
        title: prettyTitle(entry.name) || entry.name,
        relativePath: sectionId,
        lessons: sectionLessons,
        resources: leftover
      })
      allLessons.push(...sectionLessons)
      continue
    }

    if (!entry.isFile()) continue

    const kind = classifyFile(entry.name)
    if (kind === 'video' || kind === 'audio') {
      rootLessons.push(makeLesson(courseRoot, abs, kind, '__root__'))
    } else {
      rootResources.push(
        makeResource(courseRoot, abs, kind === 'other' ? classifyFile(entry.name) : kind)
      )
    }
  }

  if (rootLessons.length) {
    sections.unshift({
      id: '__root__',
      title: 'Inicio',
      relativePath: '',
      lessons: rootLessons,
      resources: []
    })
    allLessons.unshift(...rootLessons)
  }

  // Attach sidecars by basename across the whole course, keep leftovers as course resources
  const courseResources = attachSidecars(allLessons, rootResources)

  const playableCount = allLessons.filter((l) => l.kind === 'video' || l.kind === 'audio').length

  return {
    coursePath: courseName,
    scannedAt: Date.now(),
    sections,
    courseResources,
    summary: {
      sectionCount: sections.length,
      lessonCount: allLessons.length,
      playableCount,
      resourceCount:
        courseResources.length +
        sections.reduce((n, s) => n + (s.resources?.length || 0), 0) +
        allLessons.reduce((n, l) => n + (l.resources?.length || 0), 0)
    },
    flatLessons: allLessons
  }
}

export function getLessonMime(relativePath) {
  const ext = path.extname(relativePath).toLowerCase()
  const map = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.vtt': 'text/vtt; charset=utf-8',
    '.srt': 'application/x-subrip',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed'
  }
  return map[ext] || 'application/octet-stream'
}

/** Convert SRT cue timestamps to WebVTT (comma → dot) and wrap header. */
export function srtToWebVtt(srtText) {
  const body = String(srtText || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
  const converted = body.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return `WEBVTT\n\n${converted}\n`
}

export function isPreviewableResource(kind, relativePath) {
  const ext = path.extname(relativePath || '').toLowerCase()
  if (kind === 'image') return true
  if (kind === 'doc' && ['.pdf', '.html', '.htm', '.txt', '.md'].includes(ext)) return true
  if (kind === 'subtitle') return true
  return false
}
