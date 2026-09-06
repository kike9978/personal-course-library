import { useEffect, useRef, useState, useCallback } from 'react'

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
const COMPLETE_RATIO = 0.95

function LessonPlayer({
  coursePath,
  lesson,
  initialPositionSec = 0,
  isCompleted = false,
  onProgress,
  onEnded,
  onPrev,
  onNext,
  onToggleComplete,
  hasPrev,
  hasNext
}) {
  const videoRef = useRef(null)
  const [src, setSrc] = useState(null)
  const [rate, setRate] = useState(1)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const saveTimer = useRef(null)
  const restoredFor = useRef(null)
  const autoCompletedFor = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (!lesson?.relativePath || !coursePath) {
      setSrc(null)
      return undefined
    }

    setLoading(true)
    setError(null)
    setSrc(null)
    restoredFor.current = null
    autoCompletedFor.current = null

    window.api
      .getLessonMediaUrl(coursePath, lesson.relativePath)
      .then((url) => {
        if (!cancelled) {
          setSrc(url)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'No se pudo cargar la lección')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [coursePath, lesson?.relativePath])

  const persist = useCallback(
    (positionSec, extra = {}) => {
      if (!lesson?.relativePath || !coursePath) return
      const el = videoRef.current
      onProgress?.({
        relativePath: lesson.relativePath,
        title: lesson.title,
        positionSec,
        durationSec: el && Number.isFinite(el.duration) ? el.duration : undefined,
        ...extra
      })
    },
    [coursePath, lesson?.relativePath, lesson?.title, onProgress]
  )

  const scheduleSave = useCallback(() => {
    const el = videoRef.current
    if (!el || !Number.isFinite(el.currentTime)) return

    if (
      !isCompleted &&
      Number.isFinite(el.duration) &&
      el.duration > 0 &&
      el.currentTime / el.duration >= COMPLETE_RATIO &&
      autoCompletedFor.current !== lesson?.relativePath
    ) {
      autoCompletedFor.current = lesson.relativePath
      persist(el.currentTime, { completed: true })
      return
    }

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      persist(el.currentTime)
    }, 800)
  }, [persist, isCompleted, lesson?.relativePath])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const el = videoRef.current
      if (el && lesson?.relativePath && Number.isFinite(el.currentTime)) {
        persist(el.currentTime)
      }
    }
  }, [lesson?.relativePath, persist])

  const handleLoadedMetadata = () => {
    const el = videoRef.current
    if (!el || !lesson?.relativePath) return
    if (restoredFor.current === lesson.relativePath) return
    restoredFor.current = lesson.relativePath
    const target = Math.max(0, Number(initialPositionSec) || 0)
    // Don't resume at end if completed — start near end is ok; if completed skip to 0 or leave
    if (!isCompleted && target > 1 && target < (el.duration || Infinity) - 1) {
      el.currentTime = target
    }
    el.playbackRate = rate
  }

  const cycleRate = () => {
    const idx = RATES.indexOf(rate)
    const next = RATES[(idx + 1) % RATES.length]
    setRate(next)
    if (videoRef.current) videoRef.current.playbackRate = next
  }

  if (!lesson) {
    return (
      <div className="lesson-player lesson-player--empty">
        <p>Selecciona una lección para reproducir.</p>
      </div>
    )
  }

  return (
    <div className="lesson-player">
      <div className="lesson-player__header">
        <h2 className="lesson-player__title" title={lesson.relativePath}>
          {lesson.title}
        </h2>
        <div className="lesson-player__controls">
          <button type="button" className="icon-btn icon-btn--ghost" onClick={onPrev} disabled={!hasPrev}>
            Anterior
          </button>
          <button type="button" className="icon-btn icon-btn--ghost" onClick={onNext} disabled={!hasNext}>
            Siguiente
          </button>
          <button
            type="button"
            className={`icon-btn ${isCompleted ? 'icon-btn--teal' : 'icon-btn--ghost'}`}
            onClick={() => onToggleComplete?.(!isCompleted)}
            title="Marcar completada (M)"
          >
            {isCompleted ? 'Completada' : 'Completar'}
          </button>
          <button type="button" className="icon-btn icon-btn--ghost" onClick={cycleRate} title="Velocidad">
            {rate}×
          </button>
        </div>
      </div>

      <div className="lesson-player__stage">
        {loading ? <div className="lesson-player__status">Cargando…</div> : null}
        {error ? <div className="lesson-player__status lesson-player__status--error">{error}</div> : null}
        {src ? (
          <video
            key={src}
            ref={videoRef}
            className="lesson-player__video"
            src={src}
            controls
            autoPlay
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={scheduleSave}
            onPause={scheduleSave}
            onSeeked={scheduleSave}
            onEnded={() => {
              const el = videoRef.current
              persist(el?.duration || el?.currentTime || 0, { completed: true })
              onEnded?.(lesson)
            }}
            onError={() => setError('Error al reproducir el archivo')}
          />
        ) : null}
      </div>
    </div>
  )
}

export default LessonPlayer
