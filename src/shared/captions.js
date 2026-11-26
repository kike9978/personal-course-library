/**
 * YouTube captions for Fuentes (Phase 3). The embedded player fetches them itself (with a
 * token only it can make); the main process reads that response and these helpers turn it
 * into timed lines.
 */

const MAX_CUES = 20_000

/** Language, auto-generated flag and video id from a /api/timedtext request url. */
export function timedtextInfo(url) {
  try {
    const parsed = new URL(String(url || ''))
    if (!/\/api\/timedtext$/.test(parsed.pathname)) return null
    return {
      videoId: parsed.searchParams.get('v') || '',
      lang: parsed.searchParams.get('tlang') || parsed.searchParams.get('lang') || '',
      // `caps=asr` is on every request (a player capability); only `kind=asr` marks an automatic track.
      auto: parsed.searchParams.get('kind') === 'asr'
    }
  } catch {
    return null
  }
}

/**
 * Lines from YouTube's json3 caption format. Auto-generated tracks arrive word by word in
 * several events per line; events that only carry a line break are dropped, and repeated
 * text at the same start is merged.
 */
export function parseJson3(text) {
  let data
  try {
    data = JSON.parse(String(text || ''))
  } catch {
    return []
  }
  const cues = []
  for (const event of data?.events || []) {
    if (!Array.isArray(event?.segs)) continue
    const line = event.segs
      .map((seg) => String(seg?.utf8 || ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    if (!line) continue
    const start = Math.max(0, Number(event.tStartMs) || 0) / 1000
    const end = start + Math.max(0, Number(event.dDurationMs) || 0) / 1000
    const last = cues[cues.length - 1]
    if (last && Math.abs(last.start - start) < 0.01) {
      if (!last.text.endsWith(line)) last.text = `${last.text} ${line}`.trim()
      last.end = Math.max(last.end, end)
      continue
    }
    cues.push({ start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, text: line })
    if (cues.length >= MAX_CUES) break
  }
  return cues
}

/** The line playing at `sec`, as an index into `cues`, or -1. */
export function cueIndexAt(cues, sec) {
  let low = 0
  let high = (cues?.length || 0) - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (cues[mid].start <= sec) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

/** Pick a caption track: Spanish, then English, then a human-made one, then the first. */
export function pickCaptionTrack(tracks, preferred = ['es', 'en']) {
  const list = Array.isArray(tracks) ? tracks.filter((track) => track?.languageCode) : []
  for (const lang of preferred) {
    const human = list.find((t) => t.languageCode.startsWith(lang) && t.kind !== 'asr')
    if (human) return human
    const auto = list.find((t) => t.languageCode.startsWith(lang))
    if (auto) return auto
  }
  return list.find((t) => t.kind !== 'asr') || list[0] || null
}
