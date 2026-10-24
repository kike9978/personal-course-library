import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo
} from 'react'
import { formatTime } from './StudySidePanel'

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
const COMPLETE_RATIO = 0.95

const LessonPlayer = forwardRef(function LessonPlayer(
  {
    coursePath,
    lesson,
    initialPositionSec = 0,
    isCompleted = false,
    timelineMarks = [],
    onProgress,
    onEnded,
    onPrev,
    onNext,
    onToggleComplete,
    onMarkClick,
    onTimeTick,
    hasPrev,
    hasNext
  },
  ref
) {
  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const stageRef = useRef(null)
  const [src, setSrc] = useState(null)
  const [rate, setRate] = useState(1)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [hoverMark, setHoverMark] = useState(null)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [subtitleUrl, setSubtitleUrl] = useState(null)
  const [subsEnabled, setSubsEnabled] = useState(true)
  const saveTimer = useRef(null)
  const restoredFor = useRef(null)
  const autoCompletedFor = useRef(null)
  const seekOverride = useRef(null)
  const volumeBeforeMute = useRef(1)

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => {
      const el = videoRef.current
      if (!el || !Number.isFinite(el.currentTime)) return 0
      return el.currentTime
    },
    seekTo: (sec) => {
      const el = videoRef.current
      const target = Math.max(0, Number(sec) || 0)
      if (el && Number.isFinite(el.duration) && el.duration > 0) {
        el.currentTime = Math.min(target, Math.max(0, el.duration - 0.25))
        setCurrentTime(el.currentTime)
        el.play?.().catch(() => {})
      } else {
        seekOverride.current = target
      }
    },
    getVideoElement: () => videoRef.current
  }))

  useEffect(() => {
    let cancelled = false
    if (!lesson?.relativePath || !coursePath) {
      setSrc(null)
      return undefined
    }

    setLoading(true)
    setError(null)
    setSrc(null)
    setCurrentTime(0)
    setDuration(0)
    setPlaying(false)
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

  const subtitleTracks = useMemo(() => {
    return (lesson?.resources || []).filter((r) => r.kind === 'subtitle')
  }, [lesson?.resources])

  useEffect(() => {
    let cancelled = false
    setSubtitleUrl(null)
    if (!coursePath || !subtitleTracks.length) return undefined

    const preferred =
      subtitleTracks.find((t) => /\.vtt$/i.test(t.name || t.relativePath)) || subtitleTracks[0]

    window.api
      .getLessonMediaUrl(coursePath, preferred.relativePath)
      .then((url) => {
        if (!cancelled) setSubtitleUrl(url)
      })
      .catch(() => {
        if (!cancelled) setSubtitleUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [coursePath, subtitleTracks])

  useEffect(() => {
    const el = videoRef.current
    if (!el?.textTracks) return
    for (let i = 0; i < el.textTracks.length; i += 1) {
      el.textTracks[i].mode = subsEnabled && subtitleUrl ? 'showing' : 'hidden'
    }
  }, [subsEnabled, subtitleUrl, src, playing])

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
    setCurrentTime(el.currentTime)
    if (Number.isFinite(el.duration)) setDuration(el.duration)
    onTimeTick?.(el.currentTime)

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
  }, [persist, isCompleted, lesson?.relativePath, onTimeTick])

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
    el.playbackRate = rate
    setDuration(el.duration || 0)

    if (seekOverride.current != null) {
      const target = seekOverride.current
      seekOverride.current = null
      if (target > 0 && target < (el.duration || Infinity) - 0.25) {
        el.currentTime = target
        setCurrentTime(target)
      }
      restoredFor.current = lesson.relativePath
      return
    }

    if (restoredFor.current === lesson.relativePath) return
    restoredFor.current = lesson.relativePath
    const target = Math.max(0, Number(initialPositionSec) || 0)
    if (!isCompleted && target > 1 && target < (el.duration || Infinity) - 1) {
      el.currentTime = target
      setCurrentTime(target)
    }
  }

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }, [])

  const seekFromClientX = (clientX) => {
    const el = videoRef.current
    const track = trackRef.current
    if (!el || !track || !duration) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    el.currentTime = ratio * duration
    setCurrentTime(el.currentTime)
    persist(el.currentTime)
  }

  const seekBy = useCallback((deltaSec) => {
    const el = videoRef.current
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return
    el.currentTime = Math.min(el.duration, Math.max(0, el.currentTime + deltaSec))
    setCurrentTime(el.currentTime)
  }, [])

  const seekToSec = useCallback((sec) => {
    const el = videoRef.current
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return
    el.currentTime = Math.min(Math.max(0, el.duration - 0.05), Math.max(0, sec))
    setCurrentTime(el.currentTime)
  }, [])

  const applyRate = useCallback((next) => {
    setRate(next)
    if (videoRef.current) videoRef.current.playbackRate = next
  }, [])

  const stepRate = useCallback(
    (direction) => {
      const idx = RATES.indexOf(rate)
      const safe = idx >= 0 ? idx : RATES.indexOf(1)
      applyRate(RATES[(safe + direction + RATES.length) % RATES.length])
    },
    [applyRate, rate]
  )

  const cycleRate = () => stepRate(1)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.volume = muted ? 0 : volume
    el.muted = muted
  }, [volume, muted, src])

  useEffect(() => {
    const onFs = () => {
      const stage = stageRef.current
      setIsFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === stage))
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const volumeRef = useRef(volume)
  const mutedRef = useRef(muted)
  volumeRef.current = volume
  mutedRef.current = muted

  const handleVolumeChange = useCallback((value) => {
    const next = Math.min(1, Math.max(0, Number(value)))
    volumeRef.current = next
    setVolume(next)
    if (next > 0) {
      volumeBeforeMute.current = next
      mutedRef.current = false
      setMuted(false)
    } else {
      mutedRef.current = true
      setMuted(true)
    }
  }, [])

  const toggleMute = useCallback(() => {
    if (mutedRef.current || volumeRef.current === 0) {
      const restore = volumeBeforeMute.current > 0 ? volumeBeforeMute.current : 1
      volumeRef.current = restore
      mutedRef.current = false
      setVolume(restore)
      setMuted(false)
    } else {
      volumeBeforeMute.current = volumeRef.current
      mutedRef.current = true
      setMuted(true)
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const shell = stageRef.current
    if (!shell) return
    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen()
      } else {
        await shell.requestFullscreen()
      }
    } catch (err) {
      console.error(err)
    }
  }, [])

  const bumpVolume = useCallback(
    (delta) => {
      const base = mutedRef.current ? 0 : volumeRef.current
      handleVolumeChange(Math.round((base + delta) * 20) / 20)
    },
    [handleVolumeChange]
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (
        target?.isContentEditable ||
        target?.closest?.('[contenteditable="true"], .note-editor')
      ) {
        return
      }
      if (!videoRef.current) return

      const key = e.key
      const lower = key.toLowerCase()
      const onControl = Boolean(target?.closest?.('button, a, [role="button"]'))

      if (key === ' ' || lower === 'k') {
        if (e.repeat || onControl) return
        e.preventDefault()
        togglePlay()
        return
      }
      if (key === 'ArrowLeft' || lower === 'j') {
        e.preventDefault()
        seekBy(key === 'ArrowLeft' && !e.shiftKey ? -5 : -10)
        return
      }
      if (key === 'ArrowRight' || lower === 'l') {
        e.preventDefault()
        seekBy(key === 'ArrowRight' && !e.shiftKey ? 5 : 10)
        return
      }
      if (key === 'ArrowUp' || key === 'AudioVolumeUp') {
        e.preventDefault()
        bumpVolume(0.05)
        return
      }
      if (key === 'ArrowDown' || key === 'AudioVolumeDown') {
        e.preventDefault()
        bumpVolume(-0.05)
        return
      }
      if (lower === 's' || key === 'AudioVolumeMute') {
        if (e.repeat) return
        e.preventDefault()
        toggleMute()
        return
      }
      if (lower === 'f' || key === 'MediaPlayPause') {
        if (e.repeat) return
        e.preventDefault()
        if (lower === 'f') toggleFullscreen()
        else togglePlay()
        return
      }
      if (lower === 'c') {
        if (e.repeat || !subtitleTracks.length) return
        e.preventDefault()
        setSubsEnabled((v) => !v)
        return
      }
      if (key === 'Home') {
        if (e.repeat) return
        e.preventDefault()
        seekToSec(0)
        return
      }
      if (key === 'End') {
        if (e.repeat) return
        e.preventDefault()
        const dur = videoRef.current?.duration
        if (Number.isFinite(dur)) seekToSec(dur)
        return
      }
      if (/^[0-9]$/.test(key)) {
        if (e.repeat) return
        e.preventDefault()
        const dur = videoRef.current?.duration
        if (Number.isFinite(dur)) seekToSec((Number(key) / 10) * dur)
        return
      }
      if (key === ',' || key === '<') {
        if (e.repeat) return
        e.preventDefault()
        stepRate(-1)
        return
      }
      if (key === '.' || key === '>') {
        if (e.repeat) return
        e.preventDefault()
        stepRate(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    bumpVolume,
    seekBy,
    seekToSec,
    stepRate,
    subtitleTracks.length,
    toggleFullscreen,
    toggleMute,
    togglePlay
  ])

  const marksOnLesson = useMemo(() => {
    if (!lesson?.relativePath || !duration) return []
    return (timelineMarks || [])
      .filter(
        (m) =>
          m.lessonRelativePath === lesson.relativePath &&
          typeof m.timeSec === 'number' &&
          m.timeSec >= 0
      )
      .map((m) => ({
        ...m,
        pct: Math.min(100, Math.max(0, (m.timeSec / duration) * 100))
      }))
  }, [timelineMarks, lesson?.relativePath, duration])

  if (!lesson) {
    return (
      <div className="lesson-player lesson-player--empty">
        <p>Selecciona una lección para reproducir.</p>
      </div>
    )
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const volumeLabel = muted || volume === 0 ? 'Mute' : volume < 0.4 ? 'Vol·' : 'Vol'

  return (
    <div className="lesson-player">
      <div className="lesson-player__header">
        <h2 className="lesson-player__title" title={lesson.relativePath}>
          {lesson.title}
        </h2>
        <div className="lesson-player__controls">
          <button
            type="button"
            className="icon-btn icon-btn--ghost"
            onClick={onPrev}
            disabled={!hasPrev}
          >
            Anterior
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--ghost"
            onClick={onNext}
            disabled={!hasNext}
          >
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
          <button
            type="button"
            className="icon-btn icon-btn--ghost"
            onClick={cycleRate}
            title="Velocidad (, .)"
          >
            {rate}×
          </button>
          {subtitleTracks.length > 0 ? (
            <button
              type="button"
              className={`icon-btn ${subsEnabled ? 'icon-btn--teal' : 'icon-btn--ghost'}`}
              onClick={() => setSubsEnabled((v) => !v)}
              title={subsEnabled ? 'Ocultar subtítulos (C)' : 'Subtítulos (C)'}
            >
              CC
            </button>
          ) : null}
        </div>
      </div>

      <div className={`lesson-player__media${isFullscreen ? ' is-fullscreen' : ''}`} ref={stageRef}>
        <div className="lesson-player__stage">
          {loading ? <div className="lesson-player__status">Cargando…</div> : null}
          {error ? (
            <div className="lesson-player__status lesson-player__status--error">{error}</div>
          ) : null}
          {src ? (
            <video
              key={src}
              ref={videoRef}
              className="lesson-player__video"
              src={src}
              autoPlay
              crossOrigin="anonymous"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={scheduleSave}
              onPlay={() => setPlaying(true)}
              onPause={() => {
                setPlaying(false)
                scheduleSave()
              }}
              onSeeked={scheduleSave}
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onEnded={() => {
                const el = videoRef.current
                persist(el?.duration || el?.currentTime || 0, { completed: true })
                setPlaying(false)
                onEnded?.(lesson)
              }}
              onError={() => setError('Error al reproducir el archivo')}
            >
              {subtitleUrl && subsEnabled ? (
                <track
                  key={subtitleUrl}
                  kind="subtitles"
                  srcLang="es"
                  label="Subtítulos"
                  src={subtitleUrl}
                  default
                />
              ) : null}
            </video>
          ) : null}
        </div>

        <div className="playhead">
          <button
            type="button"
            className="playhead__play"
            onClick={togglePlay}
            aria-label={playing ? 'Pausar' : 'Reproducir'}
            title={playing ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
          >
            {playing ? '❚❚' : '▶'}
          </button>

          <span className="playhead__time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div
            className="playhead__track"
            ref={trackRef}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration || 0)}
            aria-valuenow={Math.floor(currentTime || 0)}
            aria-label="Posición"
            aria-keyshortcuts="ArrowLeft ArrowRight"
            tabIndex={0}
            onClick={(e) => seekFromClientX(e.clientX)}
          >
            <div className="playhead__fill" style={{ width: `${progressPct}%` }} />
            <div className="playhead__thumb" style={{ left: `${progressPct}%` }} />

            {marksOnLesson.map((mark) => (
              <button
                key={`${mark.kind}-${mark.id}`}
                type="button"
                className={`playhead__mark playhead__mark--${mark.kind} is-${mark.color || 'coral'}`}
                style={{ left: `${mark.pct}%` }}
                title={mark.title || formatTime(mark.timeSec)}
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkClick?.(mark)
                }}
                onMouseEnter={() => setHoverMark(mark)}
                onMouseLeave={() => setHoverMark(null)}
              />
            ))}

            {hoverMark ? (
              <div className="playhead__tooltip" style={{ left: `${hoverMark.pct}%` }}>
                <strong>{formatTime(hoverMark.timeSec)}</strong>
                <span>Anotación</span>
                {hoverMark.title ? <em>{hoverMark.title}</em> : null}
              </div>
            ) : null}
          </div>

          <div className="playhead__volume">
            <button
              type="button"
              className="playhead__icon-btn"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? 'Activar sonido' : 'Silenciar'}
              title={
                muted || volume === 0
                  ? 'Activar sonido (S)'
                  : 'Silenciar (S). Flechas arriba y abajo cambian el volumen'
              }
            >
              {volumeLabel}
            </button>
            <input
              type="range"
              className="playhead__volume-slider"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => handleVolumeChange(e.target.value)}
              aria-label="Volumen"
            />
          </div>

          <button
            type="button"
            className="playhead__icon-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            title={isFullscreen ? 'Salir de pantalla completa (F o Esc)' : 'Pantalla completa (F)'}
          >
            {isFullscreen ? 'Salir' : 'Pantalla'}
          </button>
        </div>
      </div>
    </div>
  )
})

export default LessonPlayer
