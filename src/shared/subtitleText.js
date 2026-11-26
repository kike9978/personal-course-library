/**
 * Subtitles (.srt / .vtt) as plain transcript text with clock marks, so a brief
 * can quote what the lesson says and a card can point back to a moment.
 */

import { formatClock } from './flashcardCards.js'

const TIME_RE =
  /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/

function seconds(h, m, s, ms) {
  return Number(h || 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms || 0) / 1000
}

function cleanLine(line) {
  return String(line || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Cues in time order: `{ start, end, text }` in seconds.
 * Repeated lines from rolling captions are dropped.
 */
export function parseSubtitles(raw) {
  const blocks = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
  const cues = []
  let previous = ''
  for (const block of blocks) {
    const lines = block.split('\n')
    const at = lines.findIndex((line) => TIME_RE.test(line))
    if (at < 0) continue
    const m = TIME_RE.exec(lines[at])
    const text = lines
      .slice(at + 1)
      .map(cleanLine)
      .filter(Boolean)
      .filter((line) => line !== previous)
      .join(' ')
      .trim()
    if (!text) continue
    previous =
      lines
        .slice(at + 1)
        .map(cleanLine)
        .filter(Boolean)
        .pop() || previous
    cues.push({
      start: seconds(m[1], m[2], m[3], m[4]),
      end: seconds(m[5], m[6], m[7], m[8]),
      text
    })
  }
  return cues.sort((a, b) => a.start - b.start)
}

/**
 * Transcript in chunks of at most `maxChars`, each with a clock mark every
 * `markEvery` seconds: "[12:30] words …".
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function transcriptChunks(cues, { maxChars = 12000, markEvery = 30 } = {}) {
  const chunks = []
  let current = null
  let lastMark = -Infinity
  for (const cue of cues || []) {
    const mark = cue.start - lastMark >= markEvery ? `[${formatClock(cue.start)}] ` : ''
    const piece = `${mark}${cue.text}`
    if (current && current.text.length + piece.length + 1 > maxChars) {
      chunks.push(current)
      current = null
    }
    if (!current) {
      const opener = mark ? piece : `[${formatClock(cue.start)}] ${cue.text}`
      current = { start: cue.start, end: cue.end, text: opener }
      lastMark = cue.start
      continue
    }
    if (mark) lastMark = cue.start
    current.text += ` ${piece}`
    current.end = cue.end
  }
  if (current) chunks.push(current)
  return chunks
}
