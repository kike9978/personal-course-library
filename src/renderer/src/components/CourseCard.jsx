import { useState, useEffect, useRef } from 'react'
import { getCoverFallback, absoluteAssetUrl } from '../utils/images'
import { InstitutionMark } from './InstitutionMark'
import CoursePickBox from './CoursePickBox'
import ExcitementGauge from './ExcitementGauge'
import brandMark from '../assets/img/brand-mark.svg'
import { FolderOpen, ImagePlus, Pencil, Play } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { cn } from '../ui/cn'
import { coverErrorText, saveCoverFromTransfer, transferMayHoldImage } from '../utils/coverDrop'
import { badgeAccent, badgeSuccess, badgeTheme, badgeWarn } from '../ui/classes'

const ribbon =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold tracking-[0.04em] uppercase backdrop-blur-md'
const ribbonProgress = 'border-transparent bg-teal/90 text-white'
const ribbonRecent = 'border-transparent bg-ink/70 text-white'
const ribbonAdd =
  'hidden cursor-pointer border-white/60 bg-white/85 text-ink group-hover:inline-flex group-focus-within:inline-flex hover:bg-white'
const cardAction = cn(
  'grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-white/90 text-ink shadow-card backdrop-blur-md',
  'transition-[background-color,color,transform] duration-150 ease-pop hover:bg-coral hover:text-white active:scale-95 [&_svg]:size-3.5'
)

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
  const [coverDrop, setCoverDrop] = useState('')

  const coverDropHandlers = {
    onDragEnter: (e) => {
      if (coverDrop === 'saving' || !transferMayHoldImage(e.dataTransfer)) return
      e.preventDefault()
      setCoverDrop('over')
    },
    onDragOver: (e) => {
      if (coverDrop === 'saving' || !transferMayHoldImage(e.dataTransfer)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      if (coverDrop !== 'over') setCoverDrop('over')
    },
    onDragLeave: (e) => {
      if (e.currentTarget.contains(e.relatedTarget)) return
      if (coverDrop === 'over') setCoverDrop('')
    },
    onDrop: async (e) => {
      if (coverDrop === 'saving' || !transferMayHoldImage(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      setCoverDrop('saving')
      try {
        await saveCoverFromTransfer(coursePath, e.dataTransfer)
        toast.success(hasCover ? 'Portada reemplazada' : 'Portada guardada')
      } catch (err) {
        toast.error(coverErrorText(err, 'No se pudo usar esa imagen'))
      } finally {
        setCoverDrop('')
      }
    }
  }

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
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-ink/8 bg-surface text-left shadow-card outline-none transition-[transform,box-shadow,border-color] duration-200 ease-pop [content-visibility:auto] [contain-intrinsic-size:360px] focus-visible:shadow-[var(--shadow-ring-soft),var(--shadow-lift)]',
        !isSelected && 'hover:-translate-y-0.5 hover:border-ink/12 hover:shadow-lift',
        isSelected && 'shadow-[var(--shadow-ring),var(--shadow-lift)]',
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
      <div className="relative aspect-[16/10] overflow-hidden bg-cream-deep" {...coverDropHandlers}>
        {coverDrop ? (
          <div className="pointer-events-none absolute inset-0 z-[4] grid place-items-center border-2 border-dashed border-coral bg-cream/95 text-center text-sm font-semibold text-coral-deep backdrop-blur-[2px]">
            {coverDrop === 'saving'
              ? 'Guardando…'
              : hasCover
                ? 'Suelta para reemplazar la portada'
                : 'Suelta para usarla de portada'}
          </div>
        ) : null}
        {hasCover ? (
          <img
            className="block h-full w-full object-cover transition-transform duration-500 ease-pop group-hover:scale-[1.03]"
            src={coverSrc}
            alt=""
            draggable={false}
            onError={onCoverError}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_30%,rgba(232,69,112,0.08),transparent_50%),radial-gradient(circle_at_70%_70%,rgba(61,122,122,0.08),transparent_45%),var(--color-cream-deep)] text-ink-soft">
            <img
              className="!h-7 !w-7 max-h-7 max-w-7 object-contain opacity-55 transition-opacity group-hover:opacity-0"
              src={brandMark}
              alt=""
              width={28}
              height={28}
              draggable={false}
            />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100">
              <ImagePlus className="size-5" aria-hidden="true" />
              Arrastra una portada aquí
            </span>
          </div>
        )}

        <CoursePickBox
          className={cn(
            'absolute bottom-2 left-2 z-[3] transition-opacity duration-150',
            !isPicked && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          )}
          checked={isPicked}
          label={`Seleccionar ${courseTitle || coursePath}`}
          onPick={(pick) => onTogglePick?.(course, pick)}
        />

        <div className="absolute top-2.5 right-[7.2rem] left-2.5 z-[2] flex flex-wrap items-start gap-1">
          <button
            type="button"
            className={cn(ribbon, isInProcess ? cn(ribbonProgress, 'cursor-pointer') : ribbonAdd)}
            onMouseDown={stopCardEvent}
            onClick={toggleInProcess}
            title={isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
          >
            {isInProcess ? 'En curso' : '+ En curso'}
          </button>
          {isRecentlyViewed ? <span className={cn(ribbon, ribbonRecent)}>Reciente</span> : null}
        </div>

        <div className="absolute top-2 right-2 z-[3] flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 group-focus-visible:opacity-100">
          <button
            type="button"
            className={cardAction}
            onMouseDown={stopCardEvent}
            onClick={handleOpenCourse}
            title="Abrir curso"
            aria-label="Abrir curso"
          >
            <Play className="fill-current" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cardAction}
            onMouseDown={stopCardEvent}
            onClick={handleOpenFolder}
            title="Abrir en explorador"
            aria-label="Abrir en explorador"
          >
            <FolderOpen aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cardAction}
            onMouseDown={stopCardEvent}
            onClick={handleEdit}
            title="Editar"
            aria-label="Editar"
          >
            <Pencil aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <h3
          className="m-0 line-clamp-2 font-display text-md leading-snug font-semibold tracking-tight"
          title={courseTitle}
        >
          {courseTitle}
        </h3>
       
        <div className="flex min-h-6 items-center gap-2">
          <InstitutionMark institution={institution} />
          {typeof course.rate === 'number' && course.rate > 0 ? (
            <span className="text-xs tracking-[0.05em] text-coral" title={`${course.rate}/5`}>
              {'★'.repeat(course.rate)}
            </span>
          ) : null}
          <ExcitementGauge
            coursePath={coursePath}
            value={course.learning?.excitement || 0}
            onError={onError}
          />
          {showLearningMeta &&
          course.learning?.percent > 0 &&
          course.learning.playableCount > 0 ? (
            <span className="ml-auto text-xs font-semibold text-teal tabular-nums">{course.learning.percent}%</span>
          ) : null}
        </div>
        {showLearningMeta && course.learning?.playableCount > 0 && course.learning.percent > 0 ? (
          <div className="h-1 overflow-hidden rounded-full bg-ink/8" aria-hidden="true">
            <div
              className="h-full rounded-[inherit] bg-teal"
              style={{ width: `${Math.min(100, course.learning.percent || 0)}%` }}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1 empty:hidden">
          {course.isNew ? <span className={badgeSuccess}>Nuevo</span> : null}
          {course.missingProps ? <span className={badgeWarn}>Sin props</span> : null}
          {(programs || []).slice(0, 3).map((program, index) => (
            <span key={`${program}-${index}`} className={badgeAccent}>
              {program}
            </span>
          ))}
          {(course.theme || []).slice(0, 2).map((theme, index) => (
            <span key={`theme-${theme}-${index}`} className={badgeTheme}>
              {theme}
            </span>
          ))}
          {course.learning?.status === 'completed' ? (
            <span className={badgeSuccess}>Completado</span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default CourseCard
