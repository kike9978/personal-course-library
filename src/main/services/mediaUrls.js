import path from 'path'

/**
 * Lesson media URL for the renderer (course-media protocol).
 */
export function getLessonMediaUrl(courseDir, relativePath) {
  const course = encodeURIComponent(path.basename(courseDir))
  const file = encodeURIComponent(
    String(relativePath || '')
      .split('\\')
      .join('/')
  )
  return `course-media://lesson/?course=${course}&file=${file}&t=${Date.now()}`
}
