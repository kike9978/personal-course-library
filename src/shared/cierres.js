const MAX_TITLE = 200
const MAX_BODY = 8000
const MAX_COMMENT = 4000

function cleanText(value, max) {
  const text = String(value || '')
    .replaceAll(String.fromCharCode(0), '')
    .trim()
  if (text.length > max) return text.slice(0, max)
  return text
}

/** Folder name used as the course key everywhere else in the learning store. */
export function cierreCourseKey(coursePath) {
  const raw = String(coursePath || '')
    .trim()
    .replace(/[/\\]+$/, '')
  if (!raw) return null
  const base = raw.split(/[/\\]/).pop()
  return base || null
}

export function normalizeLessonPath(value) {
  if (value == null || value === '') return null
  const text = String(value).trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!text || text.split('/').some((part) => part === '..' || part === '')) return null
  return text
}

export function cierreSubjectKey(subject) {
  const coursePath = cierreCourseKey(subject?.coursePath)
  if (!coursePath) return null
  if (subject?.projectId) return `${coursePath}\0project\0${subject.projectId}`
  const lesson = normalizeLessonPath(subject?.lessonRelativePath)
  if (lesson) return `${coursePath}\0lesson\0${lesson}`
  return null
}

export function findCierreForSubject(cierres, subject) {
  const coursePath = cierreCourseKey(subject?.coursePath)
  if (!coursePath) return null
  if (subject?.projectId) {
    return (
      (cierres || []).find(
        (item) => item.coursePath === coursePath && item.projectId === subject.projectId
      ) || null
    )
  }
  const lesson = normalizeLessonPath(subject?.lessonRelativePath)
  if (!lesson) return null
  return (
    (cierres || []).find(
      (item) =>
        item.coursePath === coursePath && !item.projectId && item.lessonRelativePath === lesson
    ) || null
  )
}

/**
 * Fields the user writes. Identity, dates, favorite, and comments stay in the store.
 * A project cierre may also remember the lesson it was anchored to.
 */
export function normalizeCierreInput(payload = {}, existing = null) {
  const coursePath = cierreCourseKey(payload.coursePath ?? existing?.coursePath)
  if (!coursePath) throw new Error('El cierre necesita un curso')

  const projectIdRaw = payload.projectId !== undefined ? payload.projectId : existing?.projectId
  const projectId = projectIdRaw ? String(projectIdRaw) : null
  const lessonRelativePath = normalizeLessonPath(
    payload.lessonRelativePath !== undefined
      ? payload.lessonRelativePath
      : existing?.lessonRelativePath
  )
  if (!projectId && !lessonRelativePath) {
    throw new Error('El cierre tiene que salir de un proyecto o una lección')
  }

  const title = cleanText(payload.title ?? existing?.title, MAX_TITLE)
  if (!title) throw new Error('Escribe qué entregaste')
  const learned = cleanText(payload.learned ?? existing?.learned, MAX_BODY)
  if (!learned) throw new Error('Escribe qué aprendiste')
  const differently = cleanText(payload.differently ?? existing?.differently, MAX_BODY)

  const sectionIdRaw = payload.sectionId !== undefined ? payload.sectionId : existing?.sectionId
  const sectionId = sectionIdRaw ? String(sectionIdRaw).slice(0, 200) : null
  const sectionTitle = cleanText(
    payload.sectionTitle !== undefined ? payload.sectionTitle : existing?.sectionTitle,
    MAX_TITLE
  )
  const lessonTitle = cleanText(
    payload.lessonTitle !== undefined ? payload.lessonTitle : existing?.lessonTitle,
    MAX_TITLE
  )
  const projectTitle = cleanText(
    payload.projectTitle !== undefined ? payload.projectTitle : existing?.projectTitle,
    MAX_TITLE
  )

  let coverUrl = null
  const coverRaw = payload.coverUrl !== undefined ? payload.coverUrl : existing?.coverUrl
  if (coverRaw) {
    const url = String(coverRaw).trim()
    if (url.startsWith('course-media://note/')) coverUrl = url
  }

  return {
    coursePath,
    sectionId,
    sectionTitle: sectionTitle || null,
    projectId,
    projectTitle: projectTitle || null,
    lessonRelativePath,
    lessonTitle: lessonTitle || null,
    title,
    learned,
    differently,
    coverUrl
  }
}

export function normalizeCommentBody(body) {
  const text = cleanText(body, MAX_COMMENT)
  if (!text) throw new Error('El seguimiento está vacío')
  return text
}

/** Nested course sections for the left rail. Root files are not their own week. */
export function flattenOutline(sections, trail = []) {
  const rows = []
  for (const section of sections || []) {
    if (!section?.id || section.id === '__root__') {
      if (section?.sections?.length) rows.push(...flattenOutline(section.sections, trail))
      continue
    }
    const title = section.title || 'Sección'
    const label = [...trail, title].join(' / ')
    rows.push({ id: section.id, title, label })
    if (section.sections?.length) rows.push(...flattenOutline(section.sections, [...trail, title]))
  }
  return rows
}
