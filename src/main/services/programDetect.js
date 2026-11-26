import { resolveCourseRoot } from './courseScan.js'
import { scanCourseAt } from './courseOutline.js'
import { listCourses } from './courses.js'
import { programVocabulary } from '../../shared/coursePrograms.js'
import { detectProgramsBatch, outlineDigest } from '../../shared/programDetect.js'

const SCAN_CONCURRENCY = 4

/**
 * Detect programs (or traditional media, with `field: 'media'`) for the given course folders
 * without a model.
 * Scans each folder for lessons and project files; the whole library feeds the priors.
 * `onProgress(done, total)` fires after each folder.
 */
export async function detectPrograms(coursePaths, { onProgress, field = 'programs' } = {}) {
  const library = await listCourses()
  const byPath = new Map(library.map((course) => [course.path, course]))
  const vocabulary = programVocabulary(library, [], field)
  const paths = [...new Set((Array.isArray(coursePaths) ? coursePaths : []).map(String))].filter(
    (coursePath) => byPath.has(coursePath)
  )

  const entries = new Array(paths.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < paths.length) {
      const index = next++
      const course = byPath.get(paths[index])
      try {
        const { courseRoot, courseName } = resolveCourseRoot(course.path)
        const outline = await scanCourseAt(courseRoot, courseName)
        entries[index] = { course, digest: outlineDigest(outline) }
      } catch (err) {
        entries[index] = { course, error: err?.message || 'No se pudo leer la carpeta.' }
      }
      done += 1
      onProgress?.(done, paths.length)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, paths.length) }, () => worker())
  )

  // `field` is echoed so the window can tell it is talking to a main process that knows it.
  return { ...detectProgramsBatch(entries, { library, vocabulary, field }), field }
}
