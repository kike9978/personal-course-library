import { useState, useEffect, useRef } from 'react'
import { getCoverFallback, absoluteAssetUrl } from '../utils/images'
import { InstitutionMark } from './InstitutionMark'
import CoursePickBox from './CoursePickBox'
import ExcitementGauge from './ExcitementGauge'
import brandMark from '../assets/img/brand-mark.svg'
import { cn } from '../ui/cn'

const badge = 'rounded-full border px-[0.55rem] py-[0.18rem] text-[0.7rem] font-bold'
const badgeNew = cn(badge, 'border-[#1a6b5c] bg-[#d8f3ec] text-[#0f4a40]')
const badgeWarn = cn(badge, 'border-[#a66b1a] bg-[#ffe8c2] text-[#6b4508]')
const badgePrograms = cn(
  badge,
  'border-chip-programs-border bg-chip-programs text-chip-programs-text'
)
const badgeTheme = cn(badge, 'border-[#5a4a7a] bg-[#ece6f7] text-[#3d3258]')
const badgeDone = cn(badge, 'border-chip-status-border bg-chip-status text-chip-status-text')
const ribbon =
  'static rounded-full border border-chip-status-border bg-chip-status px-[0.65rem] py-[0.28rem] text-[0.7rem] font-extrabold tracking-[0.03em] text-chip-status-text uppercase'
const ribbonRecent = 'border-chip-programs-border bg-chip-programs text-chip-programs-text'
const cardAction =
  'grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-ink/10 bg-surface shadow-card hover:bg-coral hover:text-white'

function useCoverImage(coursePath, hasCover, coverStamp) {
  const fallbackCover = absoluteAssetUrl(getCoverFallback())
  const [coverImg, setCoverImg] = useState(fallbackCover)
  const [coverFailed, setCoverFailed] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    setCoverFailed(false)
    if (!hasCover) {
      setCoverImg(fallbackCover)
      return undefined
    }

    let cancelled = false
    const load = () => {
      window.api
        .getCoverImageUrl(coursePath)
        .then((url) => {
          if (!cancelled && url) setCoverImg(url)
        })
        .catch(() => {
          if (!cancelled) setCoverImg(fallbackCover)
        })
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        load()
      },
      { threshold: 0.05, rootMargin: '120px' }
    )

    if (ref.current) observer.observe(ref.current)
    else load()

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [coursePath, hasCover, coverStamp, fallbackCover])

  return {
    ref,
    coverSrc: coverFailed ? fallbackCover : coverImg,
    onCoverError: () => {
      setCoverFailed(true)
      setCoverImg(fallbackCover)
    }
  }
}

function stopCardEvent(e) {
  e.preventDefault()
  e.stopPropagation()
}

function CourseCard({
  course,
  onOpenModalClick,
  onOpenCourse,
  onSelect,
  onToggleInProcess,
  isSelected,
  isPicked = false,
  onTogglePick,
  tabIndex,
  onError,
  showLearningMeta = true
}) {
  const {
    path: coursePath,
    title: courseTitle,
    institution,
    programs = [],
    isInProcess: initialInProcess,
    hasCover
  } = course

  const [isInProcess, setIsInProcess] = useState(Boolean(initialInProcess))
  const isRecentlyViewed = Boolean(course.learning?.isRecentlyViewed)
  const { ref, coverSrc, onCoverError } = useCoverImage(coursePath, hasCover, course.coverStamp)

  useEffect(() => {
    setIsInProcess(Boolean(course.isInProcess))
  }, [course.isInProcess])

  const toggleInProcess = async (e) => {
    stopCardEvent(e)
    const newValue = !isInProcess
    const previous = isInProcess
    setIsInProcess(newValue)
    try {
      if (onToggleInProcess) {
        await onToggleInProcess(course, newValue)
      } else {
        const result = await window.api.updateCourseProperty(coursePath, 'isInProcess', newValue)
        if (!result.success) setIsInProcess(previous)
      }
    } catch (error) {
      setIsInProcess(previous)
      if (onError) onError(error)
    }
  }

  const handleOpenCourse = (e) => {
    stopCardEvent(e)
    if (typeof onOpenCourse === 'function') {
      onOpenCourse(course)
    }
  }

  const handleOpenFolder = (e) => {
    stopCardEvent(e)
    window.api.openCourseFolder(coursePath).catch((error) => {
      if (onError) onError(error)
    })
  }

  const handleEdit = (e) => {
    stopCardEvent(e)
    if (typeof onOpenModalClick === 'function') {
      onOpenModalClick(course)
    }
  }

  const handleSelect = (event) => {
    if (event?.shiftKey || event?.metaKey || event?.ctrlKey) {
      onTogglePick?.(course, { range: Boolean(event.shiftKey) })
      return
    }
    onSelect?.(course)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onOpenCourse?.(course)
    } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      onOpenModalClick?.(course)
    } else if (e.key === ' ') {
      e.preventDefault()
      handleSelect()
    }
  }

  return (
    <article
      ref={ref}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-ink/10 bg-surface text-left shadow-card outline-none transition-[transform,box-shadow] duration-[140ms] ease-pop [content-visibility:auto] [contain-intrinsic-size:360px] focus-visible:-translate-y-0.5 focus-visible:shadow-[0_0_0_2px_rgba(232,69,112,0.4),0_4px_12px_rgba(42,36,56,0.1)]',
        !isSelected && 'hover:-translate-y-0.5 hover:shadow-lift',
        isSelected &&
          '-translate-y-0.5 shadow-[0_0_0_2px_rgba(232,69,112,0.4),0_4px_12px_rgba(42,36,56,0.1)]',
        isPicked && 'outline outline-2 outline-offset-1 outline-coral'
      )}
      onClick={handleSelect}
      onDoubleClick={(e) => {
        e.preventDefault()
        onOpenCourse?.(course)
      }}
      onKeyDown={handleKeyDown}
      tabIndex={tabIndex ?? 0}
      data-course-path={coursePath}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-linear-to-br from-cream-deep to-[#e8d5c4]">
        {hasCover ? (
          <img
            className="block h-full w-full object-cover"
            src={coverSrc}
            alt=""
            onError={onCoverError}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_30%,rgba(232,69,112,0.08),transparent_50%),radial-gradient(circle_at_70%_70%,rgba(61,122,122,0.08),transparent_45%),var(--color-cream-deep)] text-ink-soft">
            <img
              className="!h-7 !w-7 max-h-7 max-w-7 object-contain opacity-55"
              src={brandMark}
              alt=""
              width={28}
              height={28}
            />
          </div>
        )}

        <CoursePickBox
          className="absolute bottom-[0.55rem] left-[0.55rem] z-[3]"
          checked={isPicked}
          label={`Seleccionar ${courseTitle || coursePath}`}
          onPick={(pick) => onTogglePick?.(course, pick)}
        />

        <div className="absolute top-[0.65rem] right-[7.2rem] left-[0.65rem] z-[2] flex flex-wrap items-start gap-[0.35rem]">
          <button
            type="button"
            className={cn(
              ribbon,
              !isInProcess &&
                'hidden border-ink bg-white/90 text-ink-soft group-hover:inline-flex group-focus-within:inline-flex'
            )}
            onMouseDown={stopCardEvent}
            onClick={toggleInProcess}
            title={isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
          >
            {isInProcess ? 'En curso' : '+ En curso'}
          </button>
          {isRecentlyViewed ? <span className={cn(ribbon, ribbonRecent)}>Reciente</span> : null}
        </div>

        <div className="absolute top-[0.55rem] right-[0.55rem] z-[3] flex gap-[0.35rem]">
          <button
            type="button"
            className={cardAction}
            onMouseDown={stopCardEvent}
            onClick={handleOpenCourse}
            title="Abrir curso"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button
            type="button"
            className={cardAction}
            onMouseDown={stopCardEvent}
            onClick={handleOpenFolder}
            title="Abrir en explorador"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
          </button>
          <button
            type="button"
            className={cardAction}
            onMouseDown={stopCardEvent}
            onClick={handleEdit}
            title="Editar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[0.55rem] px-[0.95rem] pt-[0.85rem] pb-4">
        <h3
          className="m-0 line-clamp-2 font-display text-base leading-[1.25] font-extrabold"
          title={courseTitle}
        >
          {courseTitle}
        </h3>
       
        <div className="flex min-h-6 items-center gap-2">
          <InstitutionMark institution={institution} />
          {typeof course.rate === 'number' && course.rate > 0 ? (
            <span className="text-xs tracking-[0.05em] text-coral-deep" title={`${course.rate}/5`}>
              {'★'.repeat(course.rate)}
            </span>
          ) : null}
          <ExcitementGauge
            coursePath={coursePath}
            value={course.learning?.excitement || 0}
            onError={onError}
          />
          {showLearningMeta &&
          typeof course.learning?.percent === 'number' &&
          course.learning.playableCount > 0 ? (
            <span className="ml-auto text-xs font-bold text-teal">{course.learning.percent}%</span>
          ) : null}
        </div>
        {showLearningMeta && course.learning?.playableCount > 0 ? (
          <div className="h-1 overflow-hidden rounded-full bg-ink/[0.08]" aria-hidden="true">
            <div
              className="h-full rounded-[inherit] bg-teal"
              style={{ width: `${Math.min(100, course.learning.percent || 0)}%` }}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-[0.3rem]">
          {course.isNew ? <span className={badgeNew}>Nuevo</span> : null}
          {course.missingProps ? <span className={badgeWarn}>Sin props</span> : null}
          {(programs || []).slice(0, 3).map((program, index) => (
            <span key={`${program}-${index}`} className={badgePrograms}>
              {program}
            </span>
          ))}
          {(course.theme || []).slice(0, 2).map((theme, index) => (
            <span key={`theme-${theme}-${index}`} className={badgeTheme}>
              {theme}
            </span>
          ))}
          {course.learning?.status === 'completed' ? (
            <span className={badgeDone}>Completado</span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default CourseCard
