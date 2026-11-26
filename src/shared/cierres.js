const MAX_TITLE = 200
const MAX_BODY = 8000
const MAX_COMMENT = 4000
export const MAX_CIERRE_IMAGES = 12

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

/** Where an unpublished draft lives: an edit keys on the cierre, a new one on its subject. */
export function cierreDraftKey(subject) {
  if (subject?.id) return `edit\0${subject.id}`
  return cierreSubjectKey(subject)
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

  const { images, coverUrl } = normalizeCierreImages(
    payload.images !== undefined ? payload.images : existing?.images,
    payload.coverUrl !== undefined ? payload.coverUrl : existing?.coverUrl
  )

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
    coverUrl,
    images
  }
}

function isAttachmentUrl(value) {
  return typeof value === 'string' && value.trim().startsWith('course-media://note/')
}

/**
 * Every picture in a cierre, in the order the user arranged them, plus the main one.
 * The main image always belongs to the list; a lone legacy cover becomes a list of one.
 */
export function normalizeCierreImages(images, coverUrl) {
  const list = []
  const add = (value) => {
    if (!isAttachmentUrl(value)) return
    const url = value.trim()
    if (!list.includes(url) && list.length < MAX_CIERRE_IMAGES) list.push(url)
  }
  if (Array.isArray(images)) images.forEach(add)
  const main = isAttachmentUrl(coverUrl) ? coverUrl.trim() : null
  if (main && !list.includes(main)) {
    list.unshift(main)
    if (list.length > MAX_CIERRE_IMAGES) list.pop()
  }
  return { images: list, coverUrl: main && list.includes(main) ? main : list[0] || null }
}

/** The main image and the rest, for display. Works for cierres saved before galleries. */
export function cierreGallery(item) {
  const { images, coverUrl } = normalizeCierreImages(item?.images, item?.coverUrl)
  return { main: coverUrl, rest: images.filter((url) => url !== coverUrl), all: images }
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
