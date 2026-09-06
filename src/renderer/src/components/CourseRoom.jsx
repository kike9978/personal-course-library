import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import LessonTree, { flattenLessons } from './LessonTree'
import LessonPlayer from './LessonPlayer'
import Loader from './Loader'

function CourseRoom({ course, onBack, onOpenExplorer, onProgressChange }) {
  const coursePath = course.path
  const [tree, setTree] = useState(null)
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPath, setSelectedPath] = useState(null)

  const applyProgress = useCallback(
    (next) => {
      setProgress(next)
      onProgressChange?.(coursePath, next)
    },
    [coursePath, onProgressChange]
  )

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
        applyProgress(courseProgress)

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
    [coursePath, applyProgress]
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
    const lessonProg = progress.lessons?.[selectedPath]
    if (lessonProg?.completed) return 0
    if (progress.lastLessonRelativePath === selectedPath) {
      return progress.lastPositionSec || 0
    }
    return lessonProg?.positionSec || 0
  }, [progress, selectedPath])

  const selectedCompleted = Boolean(progress?.lessons?.[selectedPath]?.completed)

  const handleSelectLesson = (lesson) => {
    setSelectedPath(lesson.relativePath)
  }

  const handleProgress = useCallback(
    async (update) => {
      try {
        const next = await window.api.setLessonProgress(coursePath, {
          relativePath: update.relativePath,
          title: update.title,
          positionSec: update.positionSec,
          durationSec: update.durationSec,
          completed: update.completed,
          setAsLast: true
        })
        applyProgress(next)

        // Keep catalog "En curso" in sync when learning starts / finishes
        if (next.status === 'in_progress' && !course.isInProcess) {
          window.api.updateCourseProperty(coursePath, 'isInProcess', true).catch(() => {})
        } else if (next.status === 'completed' && course.isInProcess) {
          window.api.updateCourseProperty(coursePath, 'isInProcess', false).catch(() => {})
        }
      } catch (err) {
        console.error('Failed to save progress', err)
      }
    },
    [coursePath, course.isInProcess, applyProgress]
  )

  const toggleLessonComplete = useCallback(
    async (lesson, completed) => {
      if (!lesson?.relativePath) return
      try {
        const next = await window.api.setLessonProgress(coursePath, {
          relativePath: lesson.relativePath,
          title: lesson.title,
          completed,
          setAsLast: true
        })
        applyProgress(next)
        toast.success(completed ? 'Lección completada' : 'Lección reabierta')
      } catch (err) {
        toast.error(err.message || 'No se pudo actualizar')
      }
    },
    [coursePath, applyProgress]
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
      } else if (e.key.toLowerCase() === 'm' && selectedLesson) {
        e.preventDefault()
        toggleLessonComplete(selectedLesson, !selectedCompleted)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, flatLessons, onBack, selectedLesson, selectedCompleted, toggleLessonComplete])

  const emptyPlayable = !loading && tree && tree.summary?.playableCount === 0
  const percent = progress?.percent ?? 0

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
          {progress ? (
            <span className="count-badge" title={`${progress.completedCount}/${progress.playableCount}`}>
              {percent}% · {progress.completedCount}/{progress.playableCount || '—'}
            </span>
          ) : tree?.summary ? (
            <span className="count-badge">
              {tree.summary.playableCount} lecciones
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

      {progress && progress.playableCount > 0 ? (
        <div className="course-room__progress" aria-hidden="true">
          <div className="course-room__progress-bar" style={{ width: `${percent}%` }} />
        </div>
      ) : null}

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
              onToggleLessonComplete={toggleLessonComplete}
              progressByLesson={progress?.lessons || {}}
            />
          </aside>
          <main className="course-room__main">
            <LessonPlayer
              coursePath={coursePath}
              lesson={selectedLesson}
              initialPositionSec={initialPositionSec}
              isCompleted={selectedCompleted}
              onProgress={handleProgress}
              onToggleComplete={(completed) =>
                selectedLesson && toggleLessonComplete(selectedLesson, completed)
              }
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
