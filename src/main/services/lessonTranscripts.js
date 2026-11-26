/**
 * Read lesson subtitle files as timed cues, for flashcard briefs.
 */

import fs from 'fs/promises'
import path from 'path'
import { resolveCourseFile } from './courseScan.js'
import { parseSubtitles } from '../../shared/subtitleText.js'

const MAX_BYTES = 3 * 1024 * 1024
const SUBTITLE_EXT_RE = /\.(srt|vtt)$/i

/**
 * @param {string} coursePath library folder name of the course
 * @param {{ lessonPath: string, subtitlePath: string }[]} items
 * @returns {Promise<{ lessonPath: string, cues: object[], error?: string }[]>}
 */
export async function readLessonTranscripts(coursePath, items) {
  const out = []
  for (const item of Array.isArray(items) ? items : []) {
    const lessonPath = String(item?.lessonPath || '')
    const subtitlePath = String(item?.subtitlePath || '')
    if (!SUBTITLE_EXT_RE.test(path.extname(subtitlePath))) {
      out.push({ lessonPath, cues: [], error: 'No es un subtítulo' })
      continue
    }
    try {
      const absolute = resolveCourseFile(coursePath, subtitlePath)
      const stat = await fs.stat(absolute)
      if (!stat.isFile() || stat.size > MAX_BYTES) {
        out.push({ lessonPath, cues: [], error: 'Subtítulo demasiado grande' })
        continue
      }
      const raw = await fs.readFile(absolute, 'utf8')
      out.push({ lessonPath, cues: parseSubtitles(raw) })
    } catch (error) {
      out.push({ lessonPath, cues: [], error: error.message })
    }
  }
  return out
}
