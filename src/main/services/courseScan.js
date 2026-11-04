import fsSync from 'fs'
import path from 'path'
import { getLibraryPath, isLibraryPathValid } from './config.js'
import { scanCourseAt } from './courseOutline.js'

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

/**
 * Scan a course folder into nested sections that follow its folders.
 */
export async function scanCourse(courseDir) {
  const { courseName, courseRoot } = resolveCourseRoot(courseDir)
  return scanCourseAt(courseRoot, courseName)
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
