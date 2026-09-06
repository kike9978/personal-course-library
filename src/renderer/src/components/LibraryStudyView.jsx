import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import AnnotationsWorkspace from './AnnotationsWorkspace'
import AppNav from './AppNav'

function LibraryStudyView({ courses, onNavigate, onOpenCourse }) {
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [courseFilter, setCourseFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const titleByPath = useMemo(() => {
    const map = {}
    courses.forEach((c) => {
      map[c.path] = c.title || c.path
    })
    return map
  }, [courses])

  const refresh = async () => {
    const list = await window.api.listAllNotes()
    setItems(list || [])
    return list || []
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .then((list) => {
        if (!cancelled && list[0]) {
          setSelectedId({ id: list[0].id, coursePath: list[0].coursePath })
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'No se pudo cargar')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const coursesWithNotes = useMemo(() => {
    const paths = new Set(items.map((n) => n.coursePath).filter(Boolean))
    return courses
      .filter((c) => paths.has(c.path))
      .sort((a, b) =>
        (a.title || a.path).localeCompare(b.title || b.path, undefined, { sensitivity: 'base' })
      )
  }, [courses, items])

  const visibleItems = useMemo(() => {
    if (!courseFilter) return items
    return items.filter((item) => item.coursePath === courseFilter)
  }, [items, courseFilter])

  useEffect(() => {
    if (!selectedId) return
    const stillVisible = visibleItems.some(
      (a) => a.id === selectedId.id && a.coursePath === selectedId.coursePath
    )
    if (!stillVisible) {
      setSelectedId(
        visibleItems[0]
          ? { id: visibleItems[0].id, coursePath: visibleItems[0].coursePath }
          : null
      )
    }
  }, [visibleItems, selectedId])

  const handleSave = async (item, payload) => {
    await window.api.upsertNote(item.coursePath, {
      id: item.id,
      ...payload
    })
    const all = await refresh()
    const still = all.find((a) => a.id === item.id && a.coursePath === item.coursePath)
    if (still) setSelectedId({ id: still.id, coursePath: still.coursePath })
  }

  const handleDelete = async (item) => {
    if (!window.confirm('¿Borrar esta anotación?')) return
    try {
      await window.api.deleteNote(item.coursePath, item.id)
      const all = await refresh()
      const scoped = courseFilter ? all.filter((a) => a.coursePath === courseFilter) : all
      setSelectedId(scoped[0] ? { id: scoped[0].id, coursePath: scoped[0].coursePath } : null)
      toast.success('Eliminada')
    } catch (err) {
      toast.error(err.message || 'Error')
    }
  }

  const handleJump = (item) => {
    const course = courses.find((c) => c.path === item.coursePath)
    if (!course) {
      toast.error('Curso no encontrado en la biblioteca')
      return
    }
    onOpenCourse(course, {
      lessonRelativePath: item.lessonRelativePath || null,
      timeSec: item.timeSec ?? null
    })
  }

  return (
    <div className="library-study library-study--workspace">
      <div className="library-study__nav-strip">
        <AppNav active="annotations" onSelect={onNavigate} />
        <div className="chip-select library-study__course-filter">
          <label htmlFor="annotations-course-filter">Curso</label>
          <select
            id="annotations-course-filter"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="">Todos</option>
            {coursesWithNotes.map((course) => (
              <option key={course.path} value={course.path}>
                {course.title || course.path}
              </option>
            ))}
          </select>
        </div>
      </div>
      <AnnotationsWorkspace
        title="Anotaciones"
        subtitle={
          courseFilter
            ? titleByPath[courseFilter] || courseFilter
            : 'Toda la biblioteca'
        }
        annotations={visibleItems}
        selectedId={selectedId}
        onSelect={(item) => setSelectedId({ id: item.id, coursePath: item.coursePath })}
        onSave={handleSave}
        onDelete={handleDelete}
        onJump={handleJump}
        courseColumn
        courseTitleByPath={titleByPath}
        loading={loading}
      />
    </div>
  )
}

export default LibraryStudyView
