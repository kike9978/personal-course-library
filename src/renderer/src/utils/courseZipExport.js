import { useCallback, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

export function useCourseZipExport() {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [job, setJob] = useState(null)
  const exportingRef = useRef(false)

  const run = useCallback(async (coursePaths, meta = {}) => {
    const paths = Array.isArray(coursePaths) ? coursePaths.filter(Boolean) : []
    if (!paths.length) return null
    if (exportingRef.current) {
      toast('Ya hay una exportación en curso')
      return null
    }
    if (typeof window.api?.exportCoursesZip !== 'function') {
      toast.error('Reinicia la app para exportar ZIP.')
      return null
    }
    exportingRef.current = true
    setJob({
      count: paths.length,
      listCount: Number(meta.listCount) || 0
    })
    setExporting(true)
    setProgress(null)
    const off = window.api.onCourseZipProgress?.((payload) => setProgress(payload))
    try {
      const result = await window.api.exportCoursesZip(paths)
      if (result?.canceled) {
        toast('Exportación cancelada')
        return result
      }
      if (!result?.ok) throw new Error(result?.error || 'No se pudo exportar')
      const n = result.count || paths.length
      const skipped = result.skipped?.length || 0
      toast.success(
        skipped
          ? `${n} ${n === 1 ? 'curso' : 'cursos'} en el ZIP. ${skipped} no se encontraron.`
          : `${n} ${n === 1 ? 'curso' : 'cursos'} en el ZIP`
      )
      return result
    } catch (err) {
      toast.error(err.message || 'No se pudo exportar')
      return null
    } finally {
      off?.()
      exportingRef.current = false
      setExporting(false)
      setProgress(null)
      setJob(null)
    }
  }, [])

  const cancel = useCallback(() => {
    window.api?.cancelCourseZip?.()
  }, [])

  return {
    exporting,
    progress,
    count: job?.count || 0,
    listCount: job?.listCount || 0,
    run,
    cancel
  }
}
