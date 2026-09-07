import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import AnnotationsWorkspace from './AnnotationsWorkspace'
import CourseAnnotationsView from './CourseAnnotationsView'
import Loader from './Loader'

/**
 * Standalone annotations window (Electron secondary BrowserWindow).
 * coursePath set → one course; omitted → whole library.
 */
function AnnotationsPopoutView({ coursePath = null, courses = [] }) {
  const [course, setCourse] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [courseFilter, setCourseFilter] = useState(coursePath || '')

  const titleByPath = useMemo(() => {
    const map = {}
    courses.forEach((c) => {
      map[c.path] = c.title || c.path
    })
    return map
  }, [courses])

  const refreshCourseNotes = useCallback(async () => {
    if (!coursePath) return []
    const list = await window.api.listNotes(coursePath)
    setAnnotations(list || [])
    return list || []
  }, [coursePath])

  const refreshLibraryNotes = useCallback(async () => {
    const list = await window.api.listAllNotes()
    setItems(list || [])
    return list || []
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const boot = async () => {
      if (coursePath) {
        const [courseData] = await Promise.all([
          window.api.getCourse(coursePath).catch(() => null),
          refreshCourseNotes()
        ])
        if (cancelled) return
        setCourse(
          courseData ||
            courses.find((c) => c.path === coursePath) || {
              path: coursePath,
              title: coursePath
            }
        )
      } else {
        const list = await refreshLibraryNotes()
        if (cancelled) return
        if (list[0]) {
          setSelectedId({ id: list[0].id, coursePath: list[0].coursePath })
        }
      }
    }

    boot()
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'No se pudieron cargar las anotaciones')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [coursePath, courses, refreshCourseNotes, refreshLibraryNotes])

  useEffect(() => {
    const unsub = window.api.onNotesChanged?.((payload) => {
      if (coursePath) {
        if (!payload?.coursePath || payload.coursePath === coursePath) {
          refreshCourseNotes().catch(() => {})
        }
        return
      }
      refreshLibraryNotes().catch(() => {})
    })
    return () => unsub?.()
  }, [coursePath, refreshCourseNotes, refreshLibraryNotes])

  const handleJump = useCallback(async (item) => {
    try {
      await window.api.annotationsJump({
        coursePath: item.coursePath || coursePath,
        lessonRelativePath: item.lessonRelativePath || null,
        timeSec: item.timeSec ?? null,
        projectId: item.projectId || null
      })
    } catch (err) {
      toast.error(err.message || 'No se pudo abrir la lección')
    }
  }, [coursePath])

  if (loading) {
    return (
      <div className="annotations-popout annotations-popout--loading">
        <Loader />
      </div>
    )
  }

  if (coursePath) {
    return (
      <div className="annotations-popout">
        <CourseAnnotationsView
          coursePath={coursePath}
          courseTitle={course?.title || coursePath}
          annotations={annotations}
          onChange={setAnnotations}
          onJump={handleJump}
        />
      </div>
    )
  }

  const visibleItems = courseFilter
    ? items.filter((item) => item.coursePath === courseFilter)
    : items

  return (
    <div className="annotations-popout">
      <div className="annotations-popout__filter">
        <label htmlFor="popout-course-filter">Curso</label>
        <select
          id="popout-course-filter"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
        >
          <option value="">Todos</option>
          {courses
            .filter((c) => items.some((n) => n.coursePath === c.path))
            .map((c) => (
              <option key={c.path} value={c.path}>
                {c.title || c.path}
              </option>
            ))}
        </select>
      </div>
      <AnnotationsWorkspace
        title="Anotaciones"
        subtitle={courseFilter ? titleByPath[courseFilter] || courseFilter : 'Toda la biblioteca'}
        annotations={visibleItems}
        selectedId={selectedId}
        onSelect={(item) => setSelectedId({ id: item.id, coursePath: item.coursePath })}
        onSave={async (item, payload) => {
          await window.api.upsertNote(item.coursePath, { id: item.id, ...payload })
          const all = await refreshLibraryNotes()
          const still = all.find((a) => a.id === item.id && a.coursePath === item.coursePath)
          if (still) setSelectedId({ id: still.id, coursePath: still.coursePath })
        }}
        onDelete={async (item) => {
          if (!window.confirm('¿Borrar esta anotación?')) return
          try {
            await window.api.deleteNote(item.coursePath, item.id)
            const all = await refreshLibraryNotes()
            const scoped = courseFilter ? all.filter((a) => a.coursePath === courseFilter) : all
            setSelectedId(
              scoped[0] ? { id: scoped[0].id, coursePath: scoped[0].coursePath } : null
            )
            toast.success('Eliminada')
          } catch (err) {
            toast.error(err.message || 'Error')
          }
        }}
        onJump={handleJump}
        courseColumn
        courseTitleByPath={titleByPath}
      />
    </div>
  )
}

export default AnnotationsPopoutView
