/** A topic title that can be stored as #title in the note body. */
const HASHTAG_TOKEN = /^[\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*$/u

/** First hashtag in `text`. `{ start, end }` covers the `#` and the tag. */
const HASHTAG_RE = /(^|[^\p{L}\p{N}_])(#[\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/u

/**
 * `#` at the cursor, optionally followed by a tag being typed.
 * Headings (`# Title`) stop matching once the space is typed.
 */
export function hashTrigger(text) {
  const match = /(^|[^\p{L}\p{N}_])(#([\p{L}\p{N}_]{0,75}))$/u.exec(text)
  if (!match) return null
  return {
    leadOffset: match.index + match[1].length,
    matchingString: match[3],
    replaceableString: match[2]
  }
}

export function findHashtagMatch(text) {
  const match = HASHTAG_RE.exec(String(text || ''))
  if (!match) return null
  const start = match.index + match[1].length
  return { start, end: start + match[2].length }
}

/**
 * Leave the hashtag under the caret as plain text so the typeahead can read it.
 * `caret` is `{ nodeText, offset }` when the selection sits in a text node.
 */
export function matchHashtagExceptCaret(text, caret) {
  const match = findHashtagMatch(text)
  if (!match || !caret) return match
  if (caret.nodeText !== text) return match
  if (caret.offset >= match.start && caret.offset <= match.end) return null
  return match
}

export function hashtagToken(title) {
  const token = String(title || '').trim()
  return HASHTAG_TOKEN.test(token) ? token : ''
}

function byQuery(query) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  return (a, b) => {
    const aPrefix = q && a.title.toLowerCase().startsWith(q) ? 0 : 1
    const bPrefix = q && b.title.toLowerCase().startsWith(q) ? 0 : 1
    if (aPrefix !== bPrefix) return aPrefix - bPrefix
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  }
}

/**
 * Topics and every program for the `#` menu, plus "Crear tema" when the query is a new tag.
 * mentionItems: [{ type, id, title }]
 * programs: course program names
 */
export function hashtagMenuItems(mentionItems, query, { canCreate = false, programs = [] } = {}) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  const seen = new Set()
  const topics = []
  for (const item of mentionItems || []) {
    if (item?.type !== 'topic' || !item.id || !item.title) continue
    const title = String(item.title).trim()
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (q && !key.includes(q)) continue
    topics.push({ type: 'topic', id: item.id, title, subtitle: 'Tema' })
  }
  topics.sort(byQuery(q))

  const programRows = []
  const seenPrograms = new Set()
  for (const name of programs || []) {
    const title = String(name || '').trim()
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key) || seenPrograms.has(key)) continue
    seenPrograms.add(key)
    if (q && !key.includes(q)) continue
    programRows.push({ type: 'program', id: `program:${key}`, title, subtitle: 'Programa' })
  }
  programRows.sort(byQuery(q))

  const limited = topics.slice(0, 12)
  const exact =
    q &&
    [...topics, ...programRows].some((item) => item.title.toLowerCase() === q)
  const rows = [...limited, ...programRows]
  if (q && canCreate && !exact && hashtagToken(q)) {
    rows.push({
      type: 'topic',
      id: `new:${q}`,
      title: String(query || '').trim(),
      subtitle: 'Crear tema',
      create: true
    })
  }
  return rows
}
