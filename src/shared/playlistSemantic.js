/**
 * Local similarity over course text. No model and no network call.
 * A neighborhood is a short ordered list the board can save as a lista.
 */

const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'your',
  'you',
  'into',
  'that',
  'this',
  'how',
  'los',
  'las',
  'una',
  'uno',
  'del',
  'para',
  'con',
  'por',
  'como',
  'que',
  'course',
  'courses',
  'tutorial',
  'intro',
  'introduction',
  'fundamentals',
  'learn',
  'learning',
  'beginner',
  'beginners',
  'masterclass',
  'training',
  'basic',
  'complete',
  'curso',
  'cursos'
])

export const NEIGHBOR_LIMIT = 8
const MIN_SCORE = 0.12

function fact(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fold(value) {
  return fact(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export function tokens(text) {
  return fold(text)
    .split(/[^a-z0-9+#]+/)
    .filter((token) => {
      if (!token || STOP.has(token)) return false
      if (/\d/.test(token)) return token.length >= 2
      return token.length >= 3
    })
}

export function courseDocument(course) {
  const summary = fact(course?.description?.summary)
  const outcomes = Array.isArray(course?.description?.outcomes)
    ? course.description.outcomes.map(fact).filter(Boolean).join(' ')
    : ''
  return [
    course?.path,
    course?.path,
    course?.title,
    course?.institution,
    ...(Array.isArray(course?.programs) ? course.programs : []),
    ...(Array.isArray(course?.theme) ? course.theme : []),
    summary,
    summary,
    outcomes
  ]
    .map(fact)
    .filter(Boolean)
    .join('\n')
}

export function termVector(text) {
  const counts = new Map()
  for (const token of tokens(text)) {
    counts.set(token, (counts.get(token) || 0) + 1)
  }
  return counts
}

function idfWeights(vectors) {
  const df = new Map()
  const total = vectors.length || 1
  for (const vector of vectors) {
    for (const term of vector.keys()) df.set(term, (df.get(term) || 0) + 1)
  }
  const weights = new Map()
  for (const [term, count] of df) {
    weights.set(term, Math.log((total + 1) / (count + 1)) + 1)
  }
  return weights
}

function applyIdf(vector, weights) {
  const next = new Map()
  for (const [term, count] of vector) {
    next.set(term, count * (weights.get(term) ?? 1))
  }
  return next
}

function addVectors(left, right) {
  const next = new Map(left)
  for (const [term, weight] of right) next.set(term, (next.get(term) || 0) + weight)
  return next
}

export function cosine(left, right) {
  if (!left?.size || !right?.size) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (const [term, weight] of left) {
    leftNorm += weight * weight
    if (right.has(term)) dot += weight * right.get(term)
  }
  for (const weight of right.values()) rightNorm += weight * weight
  if (!leftNorm || !rightNorm || dot <= 0) return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function sharedTitle(courses) {
  if (!courses.length) return 'Cursos parecidos'
  if (courses.length === 1) return fact(courses[0].title) || fact(courses[0].path) || 'Cursos parecidos'
  const df = new Map()
  for (const course of courses) {
    for (const term of new Set(tokens(courseDocument(course)))) {
      df.set(term, (df.get(term) || 0) + 1)
    }
  }
  const floor = Math.min(2, courses.length)
  const ranked = [...df.entries()]
    .filter(([, count]) => count >= floor)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
  const words = ranked.slice(0, 2).map(([term]) => term.charAt(0).toUpperCase() + term.slice(1))
  return words.join(' · ') || 'Cursos parecidos'
}

/**
 * Courses nearest a sentence, a seed course, or both.
 * The seed stays first. `exclude` paths are left out, including the seed.
 */
export function semanticNeighborhood(
  courses,
  { query = '', seedPath = '', exclude = [], limit = NEIGHBOR_LIMIT } = {}
) {
  const list = (Array.isArray(courses) ? courses : []).filter((course) => fact(course?.path))
  const blocked = new Set((Array.isArray(exclude) ? exclude : []).map((item) => fact(item)))
  const empty = { title: '', courses: [] }
  if (!list.length) return empty

  const docs = list.map((course) => ({ course, vector: termVector(courseDocument(course)) }))
  const weights = idfWeights(docs.map((doc) => doc.vector))
  const weighted = docs.map((doc) => ({
    course: doc.course,
    vector: applyIdf(doc.vector, weights)
  }))

  const seed = fact(seedPath)
  const seedDoc = seed ? weighted.find((doc) => doc.course.path === seed) : null
  let queryVector = seedDoc && !blocked.has(seed) ? seedDoc.vector : null
  const asked = fact(query)
  if (asked) {
    const askedVector = applyIdf(termVector(asked), weights)
    queryVector = queryVector ? addVectors(queryVector, askedVector) : askedVector
  }
  if (!queryVector?.size) return empty

  const ranked = weighted
    .filter((doc) => doc.course.path !== seed && !blocked.has(doc.course.path))
    .map((doc) => ({ course: doc.course, score: cosine(queryVector, doc.vector) }))
    .filter((row) => row.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        fact(a.course.title || a.course.path).localeCompare(fact(b.course.title || b.course.path))
    )

  const cap = Math.max(1, Math.min(NEIGHBOR_LIMIT, Number(limit) || NEIGHBOR_LIMIT))
  const picked = ranked.slice(0, cap).map((row) => row.course)
  if (seedDoc && !blocked.has(seed)) {
    picked.unshift(seedDoc.course)
    if (picked.length > cap) picked.length = cap
  }
  if (!picked.length) return empty
  return { title: sharedTitle(picked).slice(0, 120), courses: picked }
}

/**
 * Split a short list into steps when the courses share more than one subject.
 * Fewer than four courses, or one subject, stays a single step.
 */
export function clusterCourses(courses) {
  const list = (Array.isArray(courses) ? courses : []).filter((course) => fact(course?.path))
  if (list.length < 4) return [{ title: sharedTitle(list).slice(0, 120), courses: list }]

  const docs = list.map((course) => ({ course, terms: new Set(tokens(courseDocument(course))) }))
  const df = new Map()
  for (const doc of docs) {
    for (const term of doc.terms) df.set(term, (df.get(term) || 0) + 1)
  }
  const groups = new Map()
  for (const doc of docs) {
    const distinctive = [...doc.terms]
      .filter((term) => {
        const count = df.get(term) || 0
        return count >= 2 && count < list.length
      })
      .sort((a, b) => df.get(a) - df.get(b) || b.length - a.length || a.localeCompare(b))
    const key = distinctive[0] || ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(doc.course)
  }

  const keyed = [...groups.entries()].filter(([key]) => key)
  if (keyed.length < 2) return [{ title: sharedTitle(list).slice(0, 120), courses: list }]
  keyed.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const leftovers = groups.get('') || []
  if (leftovers.length) keyed[0][1].push(...leftovers)
  return keyed.slice(0, 4).map(([term, group]) => ({
    title: (term.charAt(0).toUpperCase() + term.slice(1)).slice(0, 120),
    courses: group
  }))
}
