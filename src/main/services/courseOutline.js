import fs from 'fs/promises'
import path from 'path'
import { countSections, flattenLessons } from '../../shared/courseTree.js'
import { TS_EXTS } from './tsIndex.js'

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', ...TS_EXTS])
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

/** Trailing language tag: `.en`, `_en`, `-ko`, `.en-US`, `.pt_BR`, `.es-419`, `.zh-Hans`. */
const LANG_SUFFIX_RE = /[._-]([a-z]{2,3}(?:[-_][a-z]{4})?(?:[-_](?:[a-z]{2}|\d{3}))?)$/i

const PRIMARY_LANG_NAMES = {
  ar: 'Arabic',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  es: 'Spanish',
  fi: 'Finnish',
  fr: 'French',
  he: 'Hebrew',
  hi: 'Hindi',
  hu: 'Hungarian',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sv: 'Swedish',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  zh: 'Chinese'
}

const FOLDER_LANG_ALIASES = {
  arabic: 'ar',
  chinese: 'zh',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
  english: 'en',
  espanol: 'es',
  español: 'es',
  finnish: 'fi',
  french: 'fr',
  german: 'de',
  greek: 'el',
  hebrew: 'he',
  hindi: 'hi',
  hungarian: 'hu',
  indonesian: 'id',
  italian: 'it',
  japanese: 'ja',
  korean: 'ko',
  korea: 'ko',
  norwegian: 'no',
  polish: 'pl',
  portuguese: 'pt',
  portugues: 'pt',
  português: 'pt',
  romanian: 'ro',
  russian: 'ru',
  spanish: 'es',
  swedish: 'sv',
  thai: 'th',
  turkish: 'tr',
  ukrainian: 'uk',
  vietnamese: 'vi'
}

const GENERIC_SUBTITLE_DIR = /^(subtitles?|subs|captions|closed captions)$/i

function fileBase(relativePath) {
  return path.basename(relativePath, path.extname(relativePath)).toLowerCase()
}

function canonicalLang(raw) {
  const parts = String(raw || '')
    .split(/[-_]/)
    .filter(Boolean)
  if (!parts.length || !/^[a-z]{2,3}$/i.test(parts[0])) return ''
  const primary = parts[0].toLowerCase()
  const rest = []
  for (const part of parts.slice(1)) {
    if (/^\d{3}$/.test(part)) rest.push(part)
    else if (/^[a-z]{4}$/i.test(part)) {
      rest.push(part[0].toUpperCase() + part.slice(1).toLowerCase())
    } else if (/^[a-z]{2}$/i.test(part)) rest.push(part.toUpperCase())
    else return ''
  }
  return [primary, ...rest].join('-')
}

function langLabel(code) {
  const primary = String(code || '').split('-')[0]
  const name = PRIMARY_LANG_NAMES[primary]
  if (!name) return code
  return code === primary ? name : `${name} (${code})`
}

function langFromStem(base) {
  const match = String(base).match(LANG_SUFFIX_RE)
  if (!match) return null
  const code = canonicalLang(match[1])
  if (!code) return null
  const stem = base.slice(0, base.length - match[0].length)
  if (!stem) return null
  return { code, stem, label: langLabel(code) }
}

function langFromFolderName(name) {
  const trimmed = String(name || '').trim()
  if (/^[a-z]{2,3}(?:[-_][a-zA-Z0-9]+)*$/i.test(trimmed)) {
    const code = canonicalLang(trimmed)
    if (code && PRIMARY_LANG_NAMES[code.split('-')[0]]) return { code, label: langLabel(code) }
  }
  const words = trimmed
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-Z\u00C0-\u024f]+/g, ' ')
    .trim()
    .toLowerCase()
  const alias = FOLDER_LANG_ALIASES[words.split(/\s+/)[0]]
  if (!alias) return null
  return { code: alias, label: trimmed }
}

function langFromPath(relativePath) {
  const parts = String(relativePath || '')
    .split('/')
    .slice(0, -1)
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (GENERIC_SUBTITLE_DIR.test(parts[i])) continue
    const found = langFromFolderName(parts[i])
    if (found) return found
  }
  return null
}

function describeSubtitle(resource) {
  if (resource.kind !== 'subtitle') return resource
  const fromFile = langFromStem(fileBase(resource.relativePath))
  const fromFolder = langFromPath(resource.relativePath)
  const lang = fromFile?.code || fromFolder?.code || ''
  const samePrimary =
    fromFile && fromFolder && fromFile.code.split('-')[0] === fromFolder.code.split('-')[0]
  const label =
    samePrimary || !fromFile ? fromFolder?.label || fromFile?.label || '' : fromFile.label
  if (lang) resource.lang = lang
  if (label) resource.label = label
  return resource
}

function leadingLessonNumber(base) {
  const match = String(base).match(/^(\d+)(?=$|[.\-_\s])/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isSafeInteger(value) ? value : null
}

function isSubtitleBucket(relativePath) {
  return String(relativePath || '')
    .split('/')
    .slice(0, -1)
    .some((part) => GENERIC_SUBTITLE_DIR.test(part))
}

/**
 * A bare index (`01`, `01_en`) matches the only lesson with that leading number.
 * Inside a Subtitles folder, a repeated or missing number falls back to lesson order.
 */
function numberedLesson(lessons, stem, relativePath) {
  if (!/^\d+$/.test(stem)) return undefined
  const target = Number(stem)
  const matches = lessons.filter(
    (lesson) => leadingLessonNumber(fileBase(lesson.relativePath)) === target
  )
  if (matches.length === 1) return matches[0]
  if (!isSubtitleBucket(relativePath)) return undefined
  if (target >= 1 && target <= lessons.length) return lessons[target - 1]
  return undefined
}

function subtitleLesson(byBase, lessons, relativePath) {
  const base = fileBase(relativePath)
  const exact = byBase.get(base)
  if (exact) return exact
  const fromFile = langFromStem(base)
  const stem = fromFile?.stem || base
  if (fromFile?.stem) {
    const stripped = byBase.get(fromFile.stem)
    if (stripped) return stripped
  }
  return numberedLesson(lessons, stem, relativePath)
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
        ? subtitleLesson(byBase, lessons, res.relativePath)
        : byBase.get(fileBase(res.relativePath))
    if (lesson && (res.kind === 'subtitle' || res.kind === 'doc' || res.kind === 'image')) {
      lesson.resources.push(describeSubtitle(res))
    } else {
      leftovers.push(describeSubtitle(res))
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
  for (const child of section.resourceSections || []) {
    files.push(...collectResourceFiles(child))
  }
  for (const child of section.sections || []) {
    files.push(...collectResourceFiles(child))
  }
  return files
}

/**
 * A playable folder keeps its media as a section. Resource-only folders inside
 * it are flattened into that section. Resource-only folders at the course root
 * stay nested for Recursos del curso.
 */
function absorbResourceFolders(section) {
  const extra = []
  for (const child of section.resourceSections || []) {
    extra.push(...collectResourceFiles(child))
  }
  delete section.resourceSections
  if (extra.length) {
    const leftovers = attachSidecars(section.lessons || [], extra)
    section.resources = [...(section.resources || []), ...leftovers]
  }
  for (const child of section.sections || []) absorbResourceFolders(child)
}

function pullSidecars(section, lessons) {
  section.resources = attachSidecars(lessons, section.resources || [])
  for (const child of section.resourceSections || []) pullSidecars(child, lessons)
}

/** Public tree: nested folders use `sections`, same shape the lesson tree renders. */
function toResourceSection(section) {
  const children = (section.resourceSections || []).map(toResourceSection).filter(Boolean)
  const resources = section.resources || []
  if (!resources.length && !children.length) return null
  return {
    id: section.id,
    title: section.title,
    relativePath: section.relativePath,
    lessons: [],
    resources,
    sections: children
  }
}

/**
 * One folder becomes a section when it contains playable media at this level
 * or in a descendant folder. The folder title is the directory name on disk.
 * Resource-only child folders are kept on `resourceSections` until the caller
 * decides whether to nest them or fold them into a playable section.
 */
async function scanFolder(courseRoot, absDir) {
  const sectionId = toPosixRelative(courseRoot, absDir)
  const lessons = []
  const resources = []
  const sections = []
  const resourceSections = []
  const entries = await listSortedEntries(absDir)

  for (const entry of entries) {
    const abs = path.join(absDir, entry.name)
    if (entry.isDirectory()) {
      const child = await scanFolder(courseRoot, abs)
      if (hasPlayable(child)) sections.push(child)
      else resourceSections.push(child)
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
    title: name,
    relativePath: sectionId,
    lessons,
    resources: attachSidecars(lessons, resources),
    sections,
    resourceSections
  }
}

function countResources(sections, courseResources, courseResourceSections) {
  let count = courseResources.length
  const walk = (list) => {
    for (const section of list || []) {
      count += section.resources?.length || 0
      for (const lesson of section.lessons || []) count += lesson.resources?.length || 0
      walk(section.sections)
    }
  }
  walk(sections)
  walk(courseResourceSections)
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

  for (const section of scanned.sections) absorbResourceFolders(section)
  sections.push(...scanned.sections)

  const allLessons = flattenLessons(sections)
  const courseResources = attachSidecars(allLessons, scanned.resources)
  const courseResourceSections = []
  for (const section of scanned.resourceSections || []) {
    pullSidecars(section, allLessons)
    const nested = toResourceSection(section)
    if (nested) courseResourceSections.push(nested)
  }
  const playableCount = allLessons.filter(
    (lesson) => lesson.kind === 'video' || lesson.kind === 'audio'
  ).length

  return {
    coursePath: courseName,
    scannedAt: Date.now(),
    sections,
    courseResources,
    courseResourceSections,
    summary: {
      sectionCount: countSections(sections),
      lessonCount: allLessons.length,
      playableCount,
      resourceCount: countResources(sections, courseResources, courseResourceSections)
    },
    flatLessons: allLessons
  }
}
