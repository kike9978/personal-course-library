export const CATALOG_CAP = 80
export const PLAYLIST_CAP = 8
export const PLAYLIST_COURSE_CAP = 24

const PREAMBLE = `Eres un guía de estudio. Responde SOLO con JSON (sin introducción). Lo pegaré de vuelta en el catálogo.
Usa únicamente los ids de curso de la lista. No inventes un curso. No marques nada como terminado.`

const STATUS_RANK = { in_progress: 0, not_started: 1, completed: 2 }

export function courseIdOf(value) {
  const text = String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
  if (!text) return ''
  const parts = text.split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

function clip(value, max) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function knownSet(knownIds) {
  const set = new Set()
  for (const id of knownIds || []) {
    const key = courseIdOf(id)
    if (key) set.add(key)
  }
  return set
}

function keepKnownIds(ids, known) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = courseIdOf(raw)
    if (!id || !known.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= PLAYLIST_COURSE_CAP) break
  }
  return out
}

/**
 * First JSON object in raw text or a ```json fence.
 * @param {string} raw
 */
export function extractJsonValue(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] ?? text).trim()
  const attempts = [body]
  const brace = body.indexOf('{')
  if (brace >= 0) {
    const end = body.lastIndexOf('}')
    if (end > brace) attempts.push(body.slice(brace, end + 1))
  }
  for (const chunk of attempts) {
    try {
      const value = JSON.parse(chunk)
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
    } catch {
      /* try the next slice */
    }
  }
  return null
}

function courseStatus(course, progress) {
  const fromProgress = progress?.status
  if (
    fromProgress === 'in_progress' ||
    fromProgress === 'completed' ||
    fromProgress === 'not_started'
  ) {
    if (fromProgress === 'not_started' && course?.isInProcess) return 'in_progress'
    return fromProgress
  }
  return course?.isInProcess ? 'in_progress' : 'not_started'
}

/**
 * @param {Array<Record<string, unknown>>} courses
 * @param {Record<string, { status?: string, percent?: number, lastLessonTitle?: string }>} [progressById]
 */
export function buildCatalogSnapshot(courses = [], progressById = {}) {
  const rows = []
  for (const course of courses || []) {
    if (!course) continue
    const id = courseIdOf(course.path || course.id)
    if (!id) continue
    const progress = progressById[id] || course.learning || {}
    const themes = Array.isArray(course.theme)
      ? course.theme
      : Array.isArray(course.themes)
        ? course.themes
        : []
    rows.push({
      id,
      title: clip(course.title || id, 160) || id,
      institution: clip(course.institution, 120),
      instructor: clip(course.instructor, 120),
      programs: (Array.isArray(course.programs) ? course.programs : [])
        .map((item) => clip(item, 80))
        .filter(Boolean),
      themes: themes.map((item) => clip(item, 80)).filter(Boolean),
      status: courseStatus(course, progress),
      percent:
        typeof progress.percent === 'number' && Number.isFinite(progress.percent)
          ? progress.percent
          : 0,
      lastLesson: clip(progress.lastLessonTitle, 160)
    })
  }
  rows.sort(
    (a, b) =>
      (STATUS_RANK[a.status] ?? 1) - (STATUS_RANK[b.status] ?? 1) ||
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  )
  return {
    listed: rows.slice(0, CATALOG_CAP),
    omittedCount: Math.max(0, rows.length - CATALOG_CAP)
  }
}

export function catalogIds(courses = []) {
  const ids = []
  const seen = new Set()
  for (const course of courses || []) {
    const id = courseIdOf(course?.path || course?.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function formatCatalog(snapshot) {
  const lines = (snapshot?.listed || []).map((row) => {
    const bits = [
      row.id,
      row.title,
      row.institution,
      row.instructor,
      row.programs.length ? row.programs.join(', ') : '',
      row.themes.length ? row.themes.join(', ') : '',
      row.status,
      `${row.percent}%`,
      row.lastLesson
    ].filter(Boolean)
    return `- ${bits.join(' · ')}`
  })
  const omitted =
    snapshot?.omittedCount > 0 ? `\nQuedaron fuera ${snapshot.omittedCount} cursos.` : ''
  return `${lines.join('\n')}${omitted}`
}

function formatInProgress(snapshot) {
  const rows = (snapshot?.listed || []).filter((row) => row.status === 'in_progress')
  if (!rows.length) return '- ninguno'
  return rows
    .map((row) => {
      const lesson = row.lastLesson ? ` · ${row.lastLesson}` : ''
      return `- ${row.title} (${row.id}) · ${row.percent}%${lesson}`
    })
    .join('\n')
}

function formatTopics(snapshot) {
  const counts = new Map()
  for (const row of snapshot?.listed || []) {
    for (const label of [...(row.programs || []), ...(row.themes || [])]) {
      const key = String(label || '').trim()
      if (!key) continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
    .slice(0, 12)
  if (!ranked.length) return '- ninguno marcado'
  return ranked.map(([label, count]) => `- ${label} (${count})`).join('\n')
}

function formatPathChoices(paths) {
  const list = paths || []
  if (!list.length) {
    return '- ninguna. Propón tú de 2 a 4 temas a partir de los temas de arriba y de lo que está en curso.'
  }
  return list
    .map((path) => {
      const count = (path.coursePaths || []).length
      const why = path.why ? ` — ${path.why}` : ''
      return `- ${path.title} (${count} cursos)${why}`
    })
    .join('\n')
}

function formatSummaries(snapshot, briefs = {}) {
  const lines = []
  for (const row of snapshot?.listed || []) {
    const note = briefs[row.id]
    if (!note?.summary) continue
    lines.push(`- ${row.id}: ${note.summary}${note.unverified ? ' (sin verificar)' : ''}`)
  }
  return lines.length ? lines.join('\n') : '- ninguno todavía'
}

export function buildResearchBrief(snapshot) {
  return `${PREAMBLE}

Catálogo
${formatCatalog(snapshot)}

Qué escribir
Busca de qué trata cada curso de la lista. Si puedes consultar la web, úsala. Si no puedes verificar uno, pon unverified en true y un resumen corto a partir del título. No añadas cursos que no estén en la lista.

{"courses":[{"id":"...","summary":"...","unverified":false}]}`
}

export function buildGroupBrief(snapshot, briefs = {}) {
  return `${PREAMBLE}

Catálogo
${formatCatalog(snapshot)}

Resúmenes ya guardados
${formatSummaries(snapshot, briefs)}

Qué escribir
Agrupa cursos de la lista en listas por tema. Como máximo 8 listas, y como máximo 24 cursos en cada una. El título es un rumbo que alguien pueda elegir (por ejemplo iluminación o personajes), no el nombre de una carpeta. Cada lista necesita una frase de por qué va junta. No marques cursos como terminados.

{"playlists":[{"title":"...","why":"...","courseIds":["..."]}]}`
}

export function buildGoalsBrief(snapshot, input = {}) {
  return `${PREAMBLE}

El catálogo es para ti. No se lo leas a la persona y no le pidas que elija cursos, áreas ni temas de la lista.

Catálogo
${formatCatalog(snapshot)}

Temas que ya aparecen
${formatTopics(snapshot)}

En curso. No preguntes cuáles ya empezó. Pon estos títulos en "already".
${formatInProgress(snapshot)}

Listas. Si hay alguna, esas son los caminos que puedes ofrecer.
${formatPathChoices(input.paths)}

Cómo conversar
Tú propones. La persona solo elige o corrige en una frase.

1. Ofrece de 2 a 4 caminos. Cada uno tiene un nombre corto y una frase de para qué sirve. Si hay listas arriba, usa esas. Si no hay, ármalos desde los temas y desde lo que está en curso.
2. La persona elige un camino, o dice en una frase qué quiere en su lugar. No le pidas que nombre cursos.
3. Pregunta el nivel y las horas por semana.
4. Propón tú qué dejar fuera de ese camino: un tema o una lista, no un inventario. Pregunta solo si le parece bien.
5. Cuando esté claro, responde solo con el JSON. "goal" es el camino elegido. "avoid" es lo que propones dejar fuera. "notes" dice por qué ese camino y qué tema o lista usa.

No armes la ruta en esta respuesta.

{"goal":"...","level":"...","hoursPerWeek":0,"already":"...","avoid":"...","notes":"..."}`
}

export function buildCurriculumBrief(snapshot, input = {}) {
  const goals = input.goals
  const goalBlock = goals?.goal
    ? [
        `- Meta: ${goals.goal}`,
        goals.level ? `- Nivel: ${goals.level}` : '',
        goals.hoursPerWeek !== '' && goals.hoursPerWeek != null
          ? `- Horas por semana: ${goals.hoursPerWeek}`
          : '',
        goals.already ? `- Ya empezó: ${goals.already}` : '',
        goals.avoid ? `- Quiere saltar: ${goals.avoid}` : '',
        goals.notes ? `- Notas: ${goals.notes}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    : '- todavía no hay meta guardada'

  const pathLines = (input.paths || []).length
    ? input.paths
        .map((path) => `- ${path.title}: ${(path.coursePaths || []).join(', ') || 'vacía'}`)
        .join('\n')
    : '- ninguna'

  return `${PREAMBLE}

Catálogo
${formatCatalog(snapshot)}

Resúmenes
${formatSummaries(snapshot, input.briefs || {})}

Meta
${goalBlock}

Rutas ya guardadas
${pathLines}

Qué escribir
Una sola ruta para la meta de arriba. Si una lista guardada coincide con esa meta, usa esos cursos primero. Deja fuera lo que dice que quiere saltar. No pidas más cursos. startId es el curso por el que hay que empezar y tiene que estar en courseIds. pace dice cómo usar las horas. No marques lecciones como terminadas.

{"title":"...","why":"...","courseIds":["..."],"startId":"...","pace":"..."}`
}

function readObject(raw) {
  const value = extractJsonValue(raw)
  if (!value) return { error: 'Ese pegado no es JSON válido. No se importó nada.' }
  return { value }
}

export function parseResearchPack(raw, knownIds = []) {
  const parsed = readObject(raw)
  if (parsed.error) return { courses: [], error: parsed.error }
  const rows = parsed.value.courses
  if (!Array.isArray(rows)) {
    return { courses: [], error: 'Ese pegado no tiene cursos. No se importó nada.' }
  }
  const known = knownSet(knownIds)
  const seen = new Set()
  const courses = []
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue
    const id = courseIdOf(item.id)
    const summary = clip(item.summary, 500)
    if (!id || !known.has(id) || !summary || seen.has(id)) continue
    seen.add(id)
    courses.push({ id, summary, unverified: Boolean(item.unverified) })
  }
  if (!courses.length) {
    return { courses: [], error: 'Ese pegado no tiene cursos conocidos. No se importó nada.' }
  }
  return { courses }
}

export function parsePlaylistPack(raw, knownIds = []) {
  const parsed = readObject(raw)
  if (parsed.error) return { playlists: [], error: parsed.error }
  const rows = parsed.value.playlists
  if (!Array.isArray(rows)) {
    return { playlists: [], error: 'Ese pegado no tiene listas. No se importó nada.' }
  }
  const known = knownSet(knownIds)
  const playlists = []
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue
    const title = clip(item.title, 160)
    const courseIds = keepKnownIds(item.courseIds, known)
    if (!title || !courseIds.length) continue
    playlists.push({ title, why: clip(item.why, 400), courseIds })
    if (playlists.length >= PLAYLIST_CAP) break
  }
  if (!playlists.length) {
    return {
      playlists: [],
      error: 'Ese pegado no tiene listas con cursos conocidos. No se importó nada.'
    }
  }
  return { playlists }
}

function hoursValue(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim()
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric) && numeric >= 0 && String(numeric) === trimmed) return numeric
    return clip(trimmed, 40)
  }
  return ''
}

export function parseGoalsPack(raw) {
  const parsed = readObject(raw)
  if (parsed.error) return { error: parsed.error }
  const goal = clip(parsed.value.goal, 300)
  if (!goal) return { error: 'Ese pegado no tiene una meta. No se importó nada.' }
  return {
    goals: {
      goal,
      level: clip(parsed.value.level, 120),
      hoursPerWeek: hoursValue(parsed.value.hoursPerWeek),
      already: clip(parsed.value.already, 400),
      avoid: clip(parsed.value.avoid, 400),
      notes: clip(parsed.value.notes, 400)
    }
  }
}

export function parseCurriculumPack(raw, knownIds = []) {
  const parsed = readObject(raw)
  if (parsed.error) return { error: parsed.error }
  const row = parsed.value
  const title = clip(row.title, 160)
  const known = knownSet(knownIds)
  const courseIds = keepKnownIds(row.courseIds, known)
  const startId = courseIdOf(row.startId)
  if (!title || !courseIds.length) {
    return { error: 'Ese pegado no tiene cursos conocidos. No se importó nada.' }
  }
  if (!startId || !courseIds.includes(startId)) {
    return { error: 'El inicio no está en la ruta. No se importó nada.' }
  }
  return {
    path: {
      title,
      why: clip(row.why, 400),
      courseIds,
      startId,
      pace: clip(row.pace, 240)
    }
  }
}
