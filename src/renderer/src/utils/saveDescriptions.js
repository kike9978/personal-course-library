/** Save parsed description rows. Each row is written on its own course only. */
export async function saveParsedDescriptions(items) {
  const rows = Array.isArray(items) ? items : []
  if (typeof window.api.saveCourseDescriptionBatch === 'function') {
    const result = await window.api.saveCourseDescriptionBatch(
      rows.map((item) => ({ coursePath: item.path, payload: item.raw }))
    )
    return {
      savedCount: result?.savedCount || 0,
      savedPaths: result?.savedPaths || [],
      skips: Array.isArray(result?.skips) ? result.skips : []
    }
  }
  if (typeof window.api.updateCourse !== 'function') {
    throw new Error('Reinicia la app para guardar descripciones.')
  }
  const savedPaths = []
  const skips = []
  for (const item of rows) {
    try {
      await window.api.updateCourse(item.path, {
        description: { ...item.description, updatedAt: new Date().toISOString() }
      })
      savedPaths.push(item.path)
    } catch (err) {
      skips.push({
        path: item.path,
        title: item.title,
        reason: err?.message || 'No se pudo escribir courseProps.json.'
      })
    }
  }
  return { savedCount: savedPaths.length, savedPaths, skips }
}

export function cleanIpcError(err) {
  return String(err?.message || 'No se pudo guardar.')
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .trim()
}

/** Outline of each course for a description encargo. A course that cannot be read still goes in. */
export async function outlineEntries(courses) {
  return Promise.all(
    (courses || []).map(async (course) => {
      try {
        const outline = await window.api.scanCourse(course.path)
        return { course, outline, outlineUnreadable: false }
      } catch {
        return { course, outline: null, outlineUnreadable: true }
      }
    })
  )
}
