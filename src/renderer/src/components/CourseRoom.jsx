import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import LessonTree, { flattenLessons } from './LessonTree'
import LessonPlayer from './LessonPlayer'
import Loader from './Loader'

function CourseRoom({ course, onBack, onOpenExplorer }) {
  const coursePath = course.path
  const [tree, setTree] = useState(null)
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPath, setSelectedPath] = useState(null)

  const load = useCallback(
    async (force = false) => {
      setLoading(true)
      setError(null)
      try {
        const [scanned, courseProgress] = await Promise.all([
          window.api.scanCourse(coursePath, force),
          window.api.getCourseProgress(coursePath)
        ])
        setTree(scanned)
        setProgress(courseProgress)

        const flat = flattenLessons(scanned.sections)
        const last = courseProgress?.lastLessonRelativePath
        const lastExists = flat.some((l) => l.relativePath === last)
        if (lastExists) {
          setSelectedPath(last)
        } else if (flat[0]) {
          setSelectedPath(flat[0].relativePath)
        } else {
          setSelectedPath(null)
        }
      } catch (err) {
        console.error(err)
        setError(err.message || 'No se pudo escanear el curso')
        setTree(null)
      } finally {
        setLoading(false)
      }
    },
    [coursePath]
  )

  useEffect(() => {
    load(false)
  }, [load])

  const flatLessons = useMemo(() => flattenLessons(tree?.sections), [tree])

  const selectedLesson = useMemo(() => {
    if (!selectedPath) return null
    return flatLessons.find((l) => l.relativePath === selectedPath) || null
  }, [flatLessons, selectedPath])

  const selectedIndex = useMemo(() => {
    if (!selectedPath) return -1
    return flatLessons.findIndex((l) => l.relativePath === selectedPath)
  }, [flatLessons, selectedPath])

  const initialPositionSec = useMemo(() => {
    if (!selectedPath || !progress) return 0
    if (progress.lastLessonRelativePath === selectedPath) {
      return progress.lastPositionSec || 0
    }
    return progress.lessons?.[selectedPath]?.positionSec || 0
  }, [progress, selectedPath])

  const handleSelectLesson = (lesson) => {
    setSelectedPath(lesson.relativePath)
  }

  const handleProgress = useCallback(
    async (update) => {
      try {
        const next = await window.api.setLessonProgress(coursePath, {
          relativePath: update.relativePath,
          positionSec: update.positionSec,
          completed: update.completed,
          setAsLast: true
        })
        setProgress(next)
      } catch (err) {
        console.error('Failed to save progress', err)
      }
    },
    [coursePath]
  )

  const goPrev = () => {
    if (selectedIndex > 0) {
      setSelectedPath(flatLessons[selectedIndex - 1].relativePath)
    }
  }

  const goNext = () => {
    if (selectedIndex >= 0 && selectedIndex < flatLessons.length - 1) {
      setSelectedPath(flatLessons[selectedIndex + 1].relativePath)
    }
  }

  const handleOpenExplorer = async () => {
    try {
      if (onOpenExplorer) {
        await onOpenExplorer(course)
      } else {
        await window.api.openCourseFolder(coursePath)
      }
    } catch (err) {
      toast.error(err.message || 'No se pudo abrir la carpeta')
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack?.()
      } else if (e.key === '[') {
        e.preventDefault()
        goPrev()
      } else if (e.key === ']') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, flatLessons, onBack])

  const emptyPlayable = !loading && tree && tree.summary?.playableCount === 0

  return (
    <div className="course-room">
      <header className="course-room__header">
        <button type="button" className="icon-btn icon-btn--ghost" onClick={onBack}>
          ← Biblioteca
        </button>
        <div className="course-room__heading">
          <h1 title={course.title}>{course.title}</h1>
          {course.institution ? <span>{course.institution}</span> : null}
        </div>
        <div className="course-room__actions">
          {tree?.summary ? (
            <span className="count-badge">
              {tree.summary.playableCount} lecciones
              {tree.summary.sectionCount
                ? ` · ${tree.summary.sectionCount} secciones`
                : ''}
            </span>
          ) : null}
          <button
            type="button"
            className="icon-btn icon-btn--ghost"
            onClick={() => load(true)}
            disabled={loading}
          >
            Rescanear
          </button>
          <button type="button" className="icon-btn icon-btn--ghost" onClick={handleOpenExplorer}>
            Abrir en explorador
          </button>
        </div>
      </header>

      {loading && !tree ? (
        <div className="loader-container">
          <Loader />
        </div>
      ) : error ? (
        <div className="course-room__empty">
          <h2>No se pudo abrir el curso</h2>
          <p>{error}</p>
          <button type="button" className="icon-btn" onClick={handleOpenExplorer}>
            Abrir en explorador
          </button>
        </div>
      ) : emptyPlayable ? (
        <div className="course-room__empty">
          <h2>No hay lecciones reproducibles</h2>
          <p>
            Este curso no tiene videos o audio que la app pueda reproducir. Puedes abrir la carpeta
            en el explorador.
          </p>
          <button type="button" className="icon-btn" onClick={handleOpenExplorer}>
            Abrir en explorador
          </button>
        </div>
      ) : (
        <div className="course-room__body">
          <aside className="course-room__sidebar">
            <LessonTree
              sections={tree?.sections || []}
              courseResources={tree?.courseResources || []}
              selectedPath={selectedPath}
              onSelectLesson={handleSelectLesson}
              progressByLesson={progress?.lessons || {}}
            />
          </aside>
          <main className="course-room__main">
            <LessonPlayer
              coursePath={coursePath}
              lesson={selectedLesson}
              initialPositionSec={initialPositionSec}
              onProgress={handleProgress}
              onPrev={goPrev}
              onNext={goNext}
              hasPrev={selectedIndex > 0}
              hasNext={selectedIndex >= 0 && selectedIndex < flatLessons.length - 1}
              onEnded={() => {
                if (selectedIndex >= 0 && selectedIndex < flatLessons.length - 1) {
                  goNext()
                }
              }}
            />
          </main>
        </div>
      )}
    </div>
  )
}

export default CourseRoom
