import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import AnnotationsWorkspace from './AnnotationsWorkspace'
import { collectCourseFacets } from '../utils/courseFilters'

function noteInCourse(item, coursePath) {
  if (!coursePath) return true
  return (
    item.coursePath === coursePath ||
    (item.anchors || []).some((anchor) => anchor.coursePath === coursePath)
  )
}

function LibraryStudyView({
  courses,
  onNavigate,
  onOpenCourse,
  onBack = null,
  initialCoursePath = '',
  initialSelectedId = null
}) {
  const [items, setItems] = useState([])
  const [topics, setTopics] = useState([])
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const [courseFilter, setCourseFilter] = useState(initialCoursePath || '')
  const [loading, setLoading] = useState(true)

  const catalogKey = useMemo(
    () => [...courses.map((course) => course.path)].sort().join('\0'),
    [courses]
  )
  const catalogKeyRef = useRef(null)

  const titleByPath = useMemo(() => {
    const map = {}
    courses.forEach((c) => {
      map[c.path] = c.title || c.path
    })
    return map
  }, [courses])

  const programs = useMemo(() => collectCourseFacets(courses).programs, [courses])

  const refresh = async () => {
    const [list, topicList] = await Promise.all([
      window.api.listAllNotes(),
      window.api.listTopics()
    ])
    setItems(list || [])
    setTopics(topicList || [])
    return list || []
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const scopedTo = courseFilter
    refresh()
      .then((list) => {
        if (cancelled) return
        if (initialSelectedId) {
          const match = list.find(
            (item) =>
              item.id === initialSelectedId.id &&
              (item.coursePath || null) === (initialSelectedId.coursePath || null)
          )
          if (match) {
            setSelectedId({ id: match.id, coursePath: match.coursePath || null })
            return
          }
        }
        const scoped = scopedTo ? list.filter((item) => noteInCourse(item, scopedTo)) : list
        if (scoped[0]) {
          setSelectedId({ id: scoped[0].id, coursePath: scoped[0].coursePath })
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
    // Restore the note from this visit only. A later open starts a new mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (catalogKeyRef.current === null) {
      catalogKeyRef.current = catalogKey
      return
    }
    if (catalogKeyRef.current === catalogKey) return
    catalogKeyRef.current = catalogKey
    refresh().catch(() => {})
  }, [catalogKey])

  useEffect(() => {
    const unsub = window.api.onNotesChanged?.(() => {
      refresh().catch(() => {})
    })
    return () => unsub?.()
  }, [])

  const coursesWithNotes = useMemo(() => {
    const paths = new Set()
    for (const note of items) {
      if (note.coursePath) paths.add(note.coursePath)
      for (const anchor of note.anchors || []) {
        if (anchor.coursePath) paths.add(anchor.coursePath)
      }
    }
    return courses
      .filter((c) => paths.has(c.path))
      .sort((a, b) =>
        (a.title || a.path).localeCompare(b.title || b.path, undefined, { sensitivity: 'base' })
      )
  }, [courses, items])

  const visibleItems = useMemo(() => {
    if (!courseFilter) return items
    return items.filter((item) => noteInCourse(item, courseFilter))
  }, [items, courseFilter])

  useEffect(() => {
    if (loading || !selectedId) return
    const stillVisible = visibleItems.some(
      (a) => a.id === selectedId.id && a.coursePath === selectedId.coursePath
    )
    if (!stillVisible) {
      setSelectedId(
        visibleItems[0] ? { id: visibleItems[0].id, coursePath: visibleItems[0].coursePath } : null
      )
    }
  }, [visibleItems, selectedId, loading])

  const handleCreate = async () => {
    setCourseFilter('')
    await window.api.upsertNote(null, { title: '', body: '', anchors: [] })
    const all = await refresh()
    const created = [...all].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0]
    if (created) setSelectedId({ id: created.id, coursePath: created.coursePath || null })
  }

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
    onOpenCourse(
      course,
      {
        lessonRelativePath: item.lessonRelativePath || null,
        timeSec: item.timeSec ?? null,
        projectId: item.projectId || null
      },
      {
        note:
          selectedId ||
          (item?.id ? { id: item.id, coursePath: item.coursePath || null } : null),
        courseFilter
      }
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <AnnotationsWorkspace
        title="Anotaciones"
        subtitle={courseFilter ? titleByPath[courseFilter] || courseFilter : 'Toda la biblioteca'}
        navActive="annotations"
        onNavigate={onNavigate}
        onBack={onBack}
        courseFilter={{
          id: 'annotations-course-filter',
          value: courseFilter,
          onChange: setCourseFilter,
          options: coursesWithNotes.map((course) => ({
            value: course.path,
            label: course.title || course.path
          }))
        }}
        annotations={visibleItems}
        selectedId={selectedId}
        onSelect={(item) => {
          if (
            courseFilter &&
            item.coursePath !== courseFilter &&
            !(item.anchors || []).some((anchor) => anchor.coursePath === courseFilter)
          ) {
            setCourseFilter('')
          }
          setSelectedId({ id: item.id, coursePath: item.coursePath })
        }}
        onCreate={handleCreate}
        onSave={handleSave}
        onDelete={handleDelete}
        onJump={handleJump}
        onOpenDecks={() => onNavigate?.('flashcards')}
        onOpenPopOut={() => {
          window.api
            .openAnnotationsWindow(courseFilter ? { coursePath: courseFilter } : {})
            .catch((err) => {
              toast.error(err.message || 'No se pudo abrir la ventana')
            })
        }}
        courseColumn
        courseTitleByPath={titleByPath}
        loading={loading}
        topics={topics}
        programs={programs}
        corpus={items}
        onUpsertTopic={async (topic) => {
          const saved = await window.api.upsertTopic(topic)
          setTopics(await window.api.listTopics())
          return saved
        }}
        onDeleteTopic={async (topicId) => {
          setTopics(await window.api.deleteTopic(topicId))
        }}
      />
    </div>
  )
}

export default LibraryStudyView
