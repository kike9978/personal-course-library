import { buildCoursePropsFromFolderName, getCourse, updateCourse } from './courses.js'
import { normalizeCourseDescription, storedDescription } from '../../shared/courseDescription.js'

async function titleOnDisk(courseDir) {
  try {
    const data = await getCourse(courseDir)
    const title = String(data?.title || '').trim()
    if (title) return title
  } catch {
    // No courseProps yet. The folder name is the title the catalog shows.
  }
  return buildCoursePropsFromFolderName(courseDir).title
}

/**
 * Write description onto courseProps.json. Other catalog fields stay.
 * The course title on disk is the lock. A mismatch writes nothing.
 * Does not change progress or notes.
 */
export async function saveCourseDescription(courseDir, payload) {
  const title = await titleOnDisk(courseDir)
  const normalized = normalizeCourseDescription(payload, title)
  if (!normalized.ok) {
    throw new Error(normalized.error)
  }
  const description = {
    ...normalized.description,
    updatedAt: new Date().toISOString()
  }
  const props = await updateCourse(courseDir, { description })
  return { description: storedDescription(props.description), props }
}

/**
 * Write each prepared description onto its own courseProps.json.
 * Validates every row before the first write. An empty list writes nothing.
 */
export async function saveCourseDescriptionBatch(entries) {
  const list = Array.isArray(entries) ? entries : []
  const prepared = []
  const seen = new Set()

  for (const entry of list) {
    const coursePath = String(entry?.coursePath || '').trim()
    const key = coursePath.toLowerCase()
    if (!coursePath || seen.has(key)) continue
    const title = await titleOnDisk(coursePath)
    const normalized = normalizeCourseDescription(entry?.payload, title)
    if (!normalized.ok) continue
    seen.add(key)
    prepared.push({
      coursePath,
      description: {
        ...normalized.description,
        updatedAt: new Date().toISOString()
      }
    })
  }

  if (!prepared.length) {
    throw new Error('Ese texto no tiene descripciones que guardar. No se guardó nada.')
  }

  const saved = []
  for (const item of prepared) {
    const props = await updateCourse(item.coursePath, { description: item.description })
    saved.push({
      coursePath: item.coursePath,
      description: storedDescription(props.description),
      props
    })
  }
  return saved
}
