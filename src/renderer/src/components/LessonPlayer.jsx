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
import LinkProjectMenu from './LinkProjectMenu'
import { isTransportStream, transportPlaylistUrl, useTransportStream } from './useTransportStream'

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
const COMPLETE_RATIO = 0.95
const FRAME_MAX_EDGE = 1600
const SUBTITLE_PREF_KEY = 'pcl-subtitle-lang'

function readSubtitlePref() {
  try {
    const raw = localStorage.getItem(SUBTITLE_PREF_KEY)
    if (!raw) return { enabled: true, lang: 'ko', label: '' }
    const parsed = JSON.parse(raw)
    return {
      enabled: parsed.enabled !== false,
      lang: typeof parsed.lang === 'string' ? parsed.lang : 'ko',
      label: typeof parsed.label === 'string' ? parsed.label : ''
    }
  } catch {
    return { enabled: true, lang: 'ko', label: '' }
  }
}

function writeSubtitlePref(pref) {
  try {
    localStorage.setItem(SUBTITLE_PREF_KEY, JSON.stringify(pref))
  } catch {
    // Preference is optional when storage is blocked.
  }
}

function pickSubtitleTrack(tracks, pref) {
  if (!pref.enabled || !tracks.length) return null
  if (pref.label) {
    const byLabel = tracks.find(
      (track) => track.label === pref.label && (!pref.lang || track.lang === pref.lang)
    )
    if (byLabel) return byLabel
  }
  if (pref.lang) {
    const byLang = tracks.find((track) => track.lang === pref.lang)
    if (byLang) return byLang
  }
  return tracks.find((track) => track.lang === 'ko') || tracks[0]
}

function subtitleOptionLabel(track, tracks) {
  const label = track.label || track.lang || track.name
  const key = track.label || track.lang || ''
  const shared = tracks.filter((item) => (item.label || item.lang || '') === key).length > 1
  return shared ? `${label} · ${track.name}` : label
}

function frameFromVideo(video) {
  const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight))
  const width = Math.max(1, Math.round(video.videoWidth * scale))
  const height = Math.max(1, Math.round(video.videoHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('No se pudo leer el fotograma')
  ctx.drawImage(video, 0, 0, width, height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  const comma = dataUrl.indexOf(',')
  if (comma < 0 || dataUrl.length < 32) throw new Error('No se pudo leer el fotograma')
  return {
    dataBase64: dataUrl.slice(comma + 1),
    mimeType: 'image/jpeg',
    timeSec: video.currentTime
  }
}

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
    hasNext,
    projects = [],
    linkSectionId = null,
    linkSectionTitle = '',
    onToggleProjectLink,
    onToggleSectionLink,
    onCreateProject
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
  const [subtitleSources, setSubtitleSources] = useState([])
  const [subPref, setSubPref] = useState(readSubtitlePref)
  const [subsMenuOpen, setSubsMenuOpen] = useState(false)
  const subsMenuRef = useRef(null)
  const saveTimer = useRef(null)
  const restoredFor = useRef(null)
  const autoCompletedFor = useRef(null)
  const seekOverride = useRef(null)
  const volumeBeforeMute = useRef(1)
  const scrubbingRef = useRef(false)
  const [scrubbing, setScrubbing] = useState(false)
  const scrubXRef = useRef(null)
  const scrubDragRef = useRef(false)
  /** Target of an in-flight media seek. Time updates behind this target are ignored. */
  const seekHoldRef = useRef(null)

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => {
      const el = videoRef.current
      if (!el || !Number.isFinite(el.currentTime)) return 0
      return el.currentTime
    },
    seekTo: (sec, opts = {}) => {
      const el = videoRef.current
      const target = Math.max(0, Number(sec) || 0)
      const resume = opts.resume !== false
      if (el && Number.isFinite(el.duration) && el.duration > 0) {
        el.currentTime = Math.min(target, Math.max(0, el.duration - 0.25))
        setCurrentTime(el.currentTime)
        if (resume) el.play?.().catch(() => {})
        else el.pause()
      } else {
        seekOverride.current = target
      }
    },
    pause: () => {
      videoRef.current?.pause()
    },
    getVideoElement: () => videoRef.current,
    captureCurrentFrame: async () => {
      const el = videoRef.current
      if (!el || el.readyState < 2 || !el.videoWidth || !el.videoHeight) {
        throw new Error('El video aún no está listo')
      }
      const wasPlaying = !el.paused
      const timeSec = el.currentTime
      try {
        try {
          return frameFromVideo(el)
        } catch {
          const rect = el.getBoundingClientRect()
          if (!window.api?.captureWindowRegion || rect.width < 2 || rect.height < 2) {
            throw new Error('No se pudo capturar el fotograma')
          }
          const shot = await window.api.captureWindowRegion({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          })
          if (!shot?.ok || !shot.dataBase64) {
            throw new Error(shot?.error || 'No se pudo capturar el fotograma')
          }
          return {
            dataBase64: shot.dataBase64,
            mimeType: shot.mimeType || 'image/png',
            timeSec
          }
        }
      } finally {
        if (wasPlaying) {
          const resume = () => {
            if (el.paused) el.play?.().catch(() => {})
          }
          resume()
          requestAnimationFrame(resume)
        }
      }
    }
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
    setSubsMenuOpen(false)
    restoredFor.current = null
    autoCompletedFor.current = null

    window.api
      .getLessonMediaUrl(coursePath, lesson.relativePath)
      .then((url) => {
        if (!cancelled) {
          setSrc(url)
          if (!isTransportStream(lesson.relativePath)) setLoading(false)
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

  const activeSubtitle = useMemo(
    () => pickSubtitleTrack(subtitleSources, subPref),
    [subtitleSources, subPref]
  )

  useEffect(() => {
    let cancelled = false
    setSubtitleSources([])
    if (!coursePath || !subtitleTracks.length) return undefined

    Promise.all(
      subtitleTracks.map(async (track) => {
        try {
          const url = await window.api.getLessonMediaUrl(coursePath, track.relativePath)
          return { ...track, url }
        } catch {
          return null
        }
      })
    ).then((sources) => {
      if (!cancelled) setSubtitleSources(sources.filter(Boolean))
    })

    return () => {
      cancelled = true
    }
  }, [coursePath, subtitleTracks])

  const syncSubtitleMode = useCallback(() => {
    const el = videoRef.current
    if (!el?.textTracks) return
    for (let i = 0; i < el.textTracks.length; i += 1) {
      const source = subtitleSources[i]
      const show = Boolean(subPref.enabled && activeSubtitle && source?.url === activeSubtitle.url)
      el.textTracks[i].mode = show ? 'showing' : 'disabled'
    }
  }, [activeSubtitle, subPref.enabled, subtitleSources])

  useEffect(() => {
    const el = videoRef.current
    syncSubtitleMode()
    if (!el?.textTracks) return undefined
    const onAdd = () => syncSubtitleMode()
    el.textTracks.addEventListener('addtrack', onAdd)
    return () => el.textTracks.removeEventListener('addtrack', onAdd)
  }, [syncSubtitleMode, src, playing])

  useEffect(() => {
    if (!subsMenuOpen) return undefined
    const onPointer = (event) => {
      if (!subsMenuRef.current?.contains(event.target)) setSubsMenuOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setSubsMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [subsMenuOpen])

  const chooseSubtitle = useCallback((track) => {
    setSubPref((prev) => {
      const next = track
        ? { enabled: true, lang: track.lang || '', label: track.label || '' }
        : { ...prev, enabled: false }
      writeSubtitlePref(next)
      return next
    })
    setSubsMenuOpen(false)
  }, [])

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
    if (scrubbingRef.current) return
    const hold = seekHoldRef.current
    if (hold != null) {
      // While the decoder is still catching up, currentTime can report the old
      // position. Painting that pulls the bar back and looks like a stutter.
      if (el.seeking && Math.abs(el.currentTime - hold) > 0.35) return
      seekHoldRef.current = null
    }
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

  const timeFromClientX = useCallback((clientX) => {
    const el = videoRef.current
    const track = trackRef.current
    if (!el || !track || !Number.isFinite(el.duration) || el.duration <= 0) return null
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * el.duration
  }, [])

  const showTime = useCallback(
    (next) => {
      setCurrentTime(next)
      onTimeTick?.(next)
    },
    [onTimeTick]
  )

  const commitSeek = useCallback(
    (next, { persistNow = false } = {}) => {
      const el = videoRef.current
      if (!el || next == null) return
      const mediaTime = Number.isFinite(el.currentTime) ? el.currentTime : next
      const baseline = seekHoldRef.current ?? mediaTime
      // Assigning currentTime always restarts a seek, even to the same instant.
      // A click used to assign it on press and again on release, which hiccups playback.
      if (Math.abs(baseline - next) >= 0.08) {
        seekHoldRef.current = next
        el.currentTime = next
      }
      showTime(next)
      if (persistNow) persist(next)
    },
    [persist, showTime]
  )

  const onTrackPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return
    if (e.target.closest?.('.playhead__mark')) return
    const next = timeFromClientX(e.clientX)
    if (next == null) return
    e.preventDefault()
    scrubbingRef.current = true
    scrubDragRef.current = false
    scrubXRef.current = e.clientX
    setScrubbing(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    commitSeek(next)
  }

  const onTrackPointerMove = (e) => {
    if (!scrubbingRef.current) return
    const originX = scrubXRef.current
    if (!scrubDragRef.current && originX != null && Math.abs(e.clientX - originX) < 6) return
    scrubDragRef.current = true
    const next = timeFromClientX(e.clientX)
    if (next == null) return
    showTime(next)
  }

  const finishScrub = (e) => {
    if (!scrubbingRef.current) return
    const dragged = scrubDragRef.current
    scrubbingRef.current = false
    scrubDragRef.current = false
    setScrubbing(false)
    const next = timeFromClientX(e.clientX)
    if (next == null) return
    if (!dragged) {
      persist(seekHoldRef.current ?? next)
      return
    }
    commitSeek(next, { persistNow: true })
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
        setSubsMenuOpen(false)
        setSubPref((prev) => {
          const next = { ...prev, enabled: !prev.enabled }
          writeSubtitlePref(next)
          return next
        })
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
      .sort((a, b) => a.pct - b.pct || a.timeSec - b.timeSec)
  }, [timelineMarks, lesson?.relativePath, duration])

  const stackedMarks = useMemo(() => {
    const out = []
    let cluster = []
    const flush = () => {
      cluster.forEach((mark, index) => out.push({ ...mark, stack: index }))
      cluster = []
    }
    for (const mark of marksOnLesson) {
      if (cluster.length && mark.pct - cluster[0].pct > 1.5) flush()
      cluster.push(mark)
    }
    flush()
    return out
  }, [marksOnLesson])

  const transport = isTransportStream(lesson?.relativePath)
  useTransportStream(videoRef, transport ? transportPlaylistUrl(src) : null, {
    onReady: () => setLoading(false),
    onError: (message) => {
      setError(message)
      setLoading(false)
    }
  })

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
      <div className={`lesson-player__media${isFullscreen ? ' is-fullscreen' : ''}`} ref={stageRef}>
        <div className="lesson-player__header">
          <h2 className="lesson-player__title" title={lesson.relativePath}>
            {lesson.title}
          </h2>
          {onToggleProjectLink ? (
            <LinkProjectMenu
              projects={projects}
              activePath={lesson.relativePath}
              sectionId={linkSectionId}
              sectionTitle={linkSectionTitle}
              onToggleFile={onToggleProjectLink}
              onToggleSection={onToggleSectionLink}
              onCreate={onCreateProject}
            />
          ) : null}
        </div>
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
              src={transport ? undefined : src}
              autoPlay={!transport}
              crossOrigin="anonymous"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={scheduleSave}
              onPlay={() => setPlaying(true)}
              onPause={() => {
                setPlaying(false)
                scheduleSave()
              }}
              onSeeked={() => {
                seekHoldRef.current = null
                scheduleSave()
              }}
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onEnded={() => {
                const el = videoRef.current
                persist(el?.duration || el?.currentTime || 0, { completed: true })
                setPlaying(false)
                onEnded?.(lesson)
              }}
              onError={() => {
                if (transport) return
                setError('Error al reproducir el archivo')
              }}
            >
              {subtitleSources.map((track) => (
                <track
                  key={track.url}
                  kind="subtitles"
                  srcLang={track.lang || 'und'}
                  label={track.label || track.name}
                  src={track.url}
                  default={Boolean(subPref.enabled && activeSubtitle?.url === track.url)}
                />
              ))}
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
          <button
            type="button"
            className="playhead__icon-btn"
            onClick={onPrev}
            disabled={!hasPrev}
            aria-label="Lección anterior"
            title="Lección anterior ([)"
          >
            ‹
          </button>
          <button
            type="button"
            className="playhead__icon-btn"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Lección siguiente"
            title="Lección siguiente (])"
          >
            ›
          </button>

          <span className="playhead__time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div
            className={`playhead__track${scrubbing ? ' is-scrubbing' : ''}`}
            ref={trackRef}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration || 0)}
            aria-valuenow={Math.floor(currentTime || 0)}
            aria-orientation="horizontal"
            aria-label="Posición"
            aria-keyshortcuts="ArrowLeft ArrowRight"
            tabIndex={0}
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={finishScrub}
            onPointerCancel={finishScrub}
          >
            <div className="playhead__fill" style={{ width: `${progressPct}%` }} />
            <div className="playhead__thumb" style={{ left: `${progressPct}%` }} />

            {stackedMarks.map((mark) => (
              <button
                key={`${mark.kind}-${mark.id}`}
                type="button"
                className={`playhead__mark playhead__mark--${mark.kind} is-${mark.color || 'coral'}`}
                style={{
                  left: `${mark.pct}%`,
                  transform: `translateY(${mark.stack * -8}px) rotate(45deg)`,
                  zIndex: 2 + mark.stack
                }}
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

          <button
            type="button"
            className="playhead__icon-btn"
            onClick={cycleRate}
            title="Velocidad (, .)"
          >
            {rate}×
          </button>
          <button
            type="button"
            className={`playhead__icon-btn${isCompleted ? ' is-done' : ''}`}
            onClick={() => onToggleComplete?.(!isCompleted)}
            title={isCompleted ? 'Completada (M)' : 'Marcar completada (M)'}
            aria-pressed={isCompleted}
          >
            {isCompleted ? '✓' : '○'}
          </button>
          {subtitleTracks.length > 0 ? (
            <div className="playhead__subs" ref={subsMenuRef}>
              <button
                type="button"
                className={`playhead__icon-btn${subPref.enabled && activeSubtitle ? ' is-done' : ''}`}
                onClick={() => setSubsMenuOpen((open) => !open)}
                title={
                  subPref.enabled && activeSubtitle
                    ? `${subtitleOptionLabel(activeSubtitle, subtitleSources)} (C)`
                    : 'Subtítulos (C)'
                }
                aria-pressed={Boolean(subPref.enabled && activeSubtitle)}
                aria-expanded={subsMenuOpen}
                aria-haspopup="menu"
              >
                {subPref.enabled && activeSubtitle?.lang
                  ? activeSubtitle.lang.split('-')[0].toUpperCase()
                  : 'CC'}
              </button>
              {subsMenuOpen ? (
                <div className="playhead__subs-menu" role="menu">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={!subPref.enabled}
                    className={`playhead__subs-option${!subPref.enabled ? ' is-active' : ''}`}
                    onClick={() => chooseSubtitle(null)}
                  >
                    Sin subtítulos
                  </button>
                  {subtitleSources.map((track) => {
                    const selected = subPref.enabled && activeSubtitle?.url === track.url
                    return (
                      <button
                        key={track.relativePath}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className={`playhead__subs-option${selected ? ' is-active' : ''}`}
                        onClick={() => chooseSubtitle(track)}
                      >
                        {subtitleOptionLabel(track, subtitleSources)}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

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
