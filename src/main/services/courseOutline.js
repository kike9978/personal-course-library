import fs from 'fs/promises'
import path from 'path'
import { countSections, flattenLessons } from '../../shared/courseTree.js'

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

const COVER_RE = /^cover(-?image)?\.(png|jpe?g|webp|gif|svg)$/i
const JUNK_TXT_RE = /downloadpirate|torrent|readme\.nfo/i

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
      .replace(/^[[(]?\d+[\])]?[.\-_\s]+/g, '')
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
    .filter((entry) => !shouldIgnoreName(entry.name))
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

/** Trailing language tag: `.en`, `.eng`, `.en-US`, `.pt_BR`, `.es-419`, `.zh-Hans`. */
const LANG_SUFFIX_RE = /\.([a-z]{2,3})(?:[-_][a-z]{4})?(?:[-_](?:[a-z]{2}|\d{3}))?$/

function fileBase(relativePath) {
  return path.basename(relativePath, path.extname(relativePath)).toLowerCase()
}

function subtitleLesson(byBase, relativePath) {
  const base = fileBase(relativePath)
  const exact = byBase.get(base)
  if (exact) return exact
  const stripped = base.replace(LANG_SUFFIX_RE, '')
  if (stripped !== base) return byBase.get(stripped)
  return undefined
}

function attachSidecars(lessons, resourceFiles) {
  const byBase = new Map()
  for (const lesson of lessons) {
    byBase.set(fileBase(lesson.relativePath), lesson)
  }

  const leftovers = []
  for (const res of resourceFiles) {
    const lesson =
      res.kind === 'subtitle'
        ? subtitleLesson(byBase, res.relativePath)
        : byBase.get(fileBase(res.relativePath))
    if (lesson && (res.kind === 'subtitle' || res.kind === 'doc' || res.kind === 'image')) {
      lesson.resources.push(res)
    } else {
      leftovers.push(res)
    }
  }
  return leftovers
}

function hasPlayable(section) {
  if (
    (section.lessons || []).some((lesson) => lesson.kind === 'video' || lesson.kind === 'audio')
  ) {
    return true
  }
  return (section.sections || []).some(hasPlayable)
}

function collectResourceFiles(section) {
  const files = [...(section.resources || [])]
  for (const child of section.sections || []) {
    files.push(...collectResourceFiles(child))
  }
  return files
}

/**
 * One folder becomes a section when it contains playable media at this level
 * or in a descendant folder. Folders with only documents, images, or archives
 * contribute those files to the nearest playable section.
 */
async function scanFolder(courseRoot, absDir) {
  const sectionId = toPosixRelative(courseRoot, absDir)
  const lessons = []
  const resources = []
  const sections = []
  const entries = await listSortedEntries(absDir)

  for (const entry of entries) {
    const abs = path.join(absDir, entry.name)
    if (entry.isDirectory()) {
      const child = await scanFolder(courseRoot, abs)
      if (hasPlayable(child)) sections.push(child)
      else resources.push(...collectResourceFiles(child))
      continue
    }
    if (!entry.isFile()) continue

    const kind = classifyFile(entry.name)
    if (kind === 'video' || kind === 'audio') {
      lessons.push(makeLesson(courseRoot, abs, kind, sectionId || '__root__'))
    } else if (kind !== 'other' || ARCHIVE_EXTS.has(extOf(entry.name))) {
      resources.push(makeResource(courseRoot, abs, kind === 'other' ? 'archive' : kind))
    } else {
      resources.push(makeResource(courseRoot, abs, 'other'))
    }
  }

  const name = path.basename(absDir)
  return {
    id: sectionId,
    title: prettyTitle(name) || name,
    relativePath: sectionId,
    lessons,
    resources: attachSidecars(lessons, resources),
    sections
  }
}

function countResources(sections, courseResources) {
  let count = courseResources.length
  const walk = (list) => {
    for (const section of list || []) {
      count += section.resources?.length || 0
      for (const lesson of section.lessons || []) count += lesson.resources?.length || 0
      walk(section.sections)
    }
  }
  walk(sections)
  return count
}

/**
 * Scan a course directory into nested sections that follow the folder tree.
 * @param {string} courseRoot absolute course folder
 * @param {string} courseName library folder name stored on the result
 */
export async function scanCourseAt(courseRoot, courseName = path.basename(courseRoot)) {
  const scanned = await scanFolder(courseRoot, courseRoot)
  const sections = []

  if (scanned.lessons.length) {
    for (const lesson of scanned.lessons) lesson.sectionId = '__root__'
    sections.push({
      id: '__root__',
      title: 'Inicio',
      relativePath: '',
      lessons: scanned.lessons,
      resources: [],
      sections: []
    })
  }

  sections.push(...scanned.sections)

  const allLessons = flattenLessons(sections)
  const courseResources = attachSidecars(allLessons, scanned.resources)
  const playableCount = allLessons.filter(
    (lesson) => lesson.kind === 'video' || lesson.kind === 'audio'
  ).length

  return {
    coursePath: courseName,
    scannedAt: Date.now(),
    sections,
    courseResources,
    summary: {
      sectionCount: countSections(sections),
      lessonCount: allLessons.length,
      playableCount,
      resourceCount: countResources(sections, courseResources)
    },
    flatLessons: allLessons
  }
}
