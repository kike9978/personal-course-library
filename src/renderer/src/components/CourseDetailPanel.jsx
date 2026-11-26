import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { flattenLessons } from '../../../shared/courseTree.js'
import { getCoverFallback, absoluteAssetUrl } from '../utils/images'
import { InstitutionMark } from './InstitutionMark'
import CourseDescription from './CourseDescription'
import ExcitementGauge from './ExcitementGauge'
import brandMark from '../assets/img/brand-mark.svg'
import { cn } from '../ui/cn'
import { X } from 'lucide-react'
import { badgeAccent, badgeSuccess, badgeTheme, badgeWarn, btnCompact, btnGhost, btnPrimary } from '../ui/classes'

const badgeNew = badgeSuccess
const badgeDone = badgeSuccess
const badgePrograms = badgeAccent
const ribbon = cn(badgeSuccess, 'uppercase tracking-[0.04em]')
const ribbonRecent = 'border-chip-programs-border bg-chip-programs text-chip-programs-text'
const detailUtil = cn(btnGhost, btnCompact, 'h-8 flex-[1_1_calc(50%-0.25rem)] text-ink-soft')
const detailUtilAccent = 'basis-full text-teal enabled:hover:bg-chip-status enabled:hover:text-teal'

function formatDuration(sec) {
  const total = Math.round(Number(sec) || 0)
  if (total <= 0) return ''
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`
  if (hours > 0) return `${hours} h`
  if (minutes > 0) return `${minutes} min`
  return `${total} s`
}

function lessonSeconds(lesson, course) {
  const probed = Number(lesson?.durationSec) || 0
  const played = Number(course.learning?.lessons?.[lesson.relativePath]?.durationSec) || 0
  return Math.max(probed, played)
}

function OutlineSections({
  sections,
  depth,
  showSectionTitles,
  course,
  currentPath,
  currentRef,
  onOpenLesson
}) {
  return (sections || []).map((section) => {
    const lessons = section.lessons || []
    const nested = section.sections || []
    if (!lessons.length && !nested.length) return null
    return (
      <div key={section.id} className={cn('flex flex-col gap-[0.2rem]', depth > 0 && 'ml-3')}>
        {showSectionTitles ? (
          <h4
            className="mt-[0.35rem] truncate text-2xs font-semibold tracking-[0.07em] text-ink-soft uppercase"
            title={section.title}
          >
            {section.title}
          </h4>
        ) : null}
        {lessons.length > 0 ? (
          <ol className="m-0 flex list-none flex-col gap-[0.1rem] p-0">
            {lessons.map((lesson, index) => {
              const done = Boolean(course.learning?.lessons?.[lesson.relativePath]?.completed)
              const current = lesson.relativePath === currentPath
              const length = formatDuration(lessonSeconds(lesson, course))
              const status = [done ? 'completada' : '', current ? 'última' : '', length]
                .filter(Boolean)
                .join(', ')
              return (
                <li key={lesson.relativePath}>
                  <button
                    type="button"
                    ref={current ? currentRef : null}
                    className={cn(
                      'flex w-full min-w-0 cursor-pointer items-center gap-[0.45rem] rounded-sm border-0 bg-transparent px-[0.35rem] py-[0.28rem] text-left text-sm leading-[1.3] text-ink hover:bg-surface',
                      current && 'bg-chip-programs'
                    )}
                    aria-current={current ? 'true' : undefined}
                    aria-label={status ? `${lesson.title}, ${status}` : lesson.title}
                    title={lesson.title}
                    onClick={() => onOpenLesson(lesson)}
                  >
                    <span
                      className={cn(
                        'w-5 shrink-0 text-center text-2xs font-semibold text-ink-soft',
                        done && 'text-teal',
                        current && 'text-coral-deep'
                      )}
                      aria-hidden="true"
                    >
                      {done ? '✓' : index + 1}
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate', done && 'text-ink-soft')}>
                      {lesson.title}
                    </span>
                    {length ? (
                      <span className="shrink-0 text-xs font-medium text-ink-soft">
                        {length}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ol>
        ) : null}
        <OutlineSections
          sections={nested}
          depth={depth + 1}
          showSectionTitles={showSectionTitles}
          course={course}
          currentPath={currentPath}
          currentRef={currentRef}
          onOpenLesson={onOpenLesson}
        />
      </div>
    )
  })
}

function CourseOutline({ course, onOpenLesson }) {
  const [outline, setOutline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(true)
  const currentRef = useRef(null)
  const currentPath = course.learning?.lastLessonRelativePath || ''
  const panelId = 'detail-outline-panel'

  useEffect(() => {
    setOpen(true)
  }, [course.path])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.api
      .scanCourse(course.path)
      .then((tree) => {
        if (!cancelled) setOutline(tree)
      })
      .catch((err) => {
        if (!cancelled) {
          setOutline(null)
          setError(err?.message || 'No se pudo leer el temario')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [course.path])

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' })
  }, [outline, currentPath])

  const sections = outline?.sections || []
  const lessons = flattenLessons(sections)
  const lessonCount = lessons.length
  const totalLength = formatDuration(
    lessons.reduce((sum, lesson) => sum + lessonSeconds(lesson, course), 0)
  )
  const showSectionTitles =
    sections.length > 1 || (sections.length === 1 && sections[0].id !== '__root__')

  return (
    <section className="flex flex-col gap-[0.45rem]" aria-label="Temario">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 min-w-0 flex-1">
          <button
            type="button"
            className="group flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent p-0 text-left font-display text-md font-semibold text-ink hover:text-coral-deep focus-visible:rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-focus"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
          >
            Temario
            <svg
              className="h-[0.7rem] w-[0.7rem] shrink-0 text-current transition-transform duration-150 ease-pop group-aria-expanded:rotate-90"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </h3>
        {lessonCount > 0 ? (
          <span className="text-xs font-semibold text-ink-soft">
            {lessonCount}
            {totalLength ? ` · ${totalLength}` : ''}
          </span>
        ) : null}
      </div>
      <div id={panelId} hidden={!open}>
        {loading ? <p className="m-0 text-sm text-ink-soft">Cargando temario…</p> : null}
        {!loading && error ? <p className="m-0 text-sm text-ink-soft">{error}</p> : null}
        {!loading && !error && lessonCount === 0 ? (
          <p className="m-0 text-sm text-ink-soft">Este curso no tiene lecciones.</p>
        ) : null}
        <OutlineSections
          sections={sections}
          depth={0}
          showSectionTitles={showSectionTitles}
          course={course}
          currentPath={currentPath}
          currentRef={currentRef}
          onOpenLesson={onOpenLesson}
        />
      </div>
    </section>
  )
}

function CourseDetailPanel({
  course,
  onClose,
  onEdit,
  onOpenCourse,
  onToggleInProcess,
  onGenerateProps,
  onSearchCover,
  dock = false
}) {
  const fallbackCover = absoluteAssetUrl(getCoverFallback())
  const [coverImg, setCoverImg] = useState(fallbackCover)

  useEffect(() => {
    let cancelled = false
    if (!course.hasCover) {
      setCoverImg(fallbackCover)
      return undefined
    }
    window.api
      .getCoverImageUrl(course.path)
      .then((url) => {
        if (!cancelled && url) setCoverImg(url)
      })
      .catch(() => {
        if (!cancelled) setCoverImg(fallbackCover)
      })
    return () => {
      cancelled = true
    }
  }, [course.path, course.hasCover, course.coverStamp, fallbackCover])

  const handleOpenCourse = () => {
    onOpenCourse?.(course)
  }

  const handleOpenLesson = (lesson) => {
    onOpenCourse?.(course, { lessonRelativePath: lesson.relativePath })
  }

  const handleOpenFolder = async () => {
    try {
      await window.api.openCourseFolder(course.path)
    } catch (error) {
      toast.error(error.message || 'No se pudo abrir la carpeta')
    }
  }

  const handleToggle = async () => {
    try {
      await onToggleInProcess(course, !course.isInProcess)
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar')
    }
  }

  const programs = course.programs || []
  const themes = course.theme || []
  const hasRating = course.rate > 0
  const hasCatalog =
    Boolean(course.instructor) || programs.length > 0 || themes.length > 0 || hasRating
  const showProgress = (course.learning?.playableCount || 0) > 0
  const percent = Math.min(100, Math.max(0, course.learning?.percent || 0))
  const showIdle =
    !showProgress &&
    !course.isInProcess &&
    course.learning?.status !== 'completed' &&
    !course.missingProps &&
    !course.isNew &&
    !course.learning?.isRecentlyViewed
  const hasStatus =
    course.isInProcess ||
    course.learning?.status === 'completed' ||
    course.learning?.isRecentlyViewed ||
    course.isNew ||
    course.missingProps ||
    showIdle

  return (
    <aside
      className={cn(
        'relative z-20 flex h-full min-h-0 w-detail max-w-[40vw] shrink-0 animate-slide-in flex-col self-stretch overflow-hidden border-l border-ink/8 bg-surface motion-reduce:animate-none max-[900px]:max-h-[45vh] max-[900px]:w-full max-[900px]:max-w-none max-[900px]:flex-none max-[900px]:border-t max-[900px]:border-l-0 max-[900px]:border-ink/10',
        dock &&
          'max-w-none flex-none max-[900px]:w-[min(100vw,300px)] max-[900px]:max-w-none max-[900px]:border-t-0 max-[900px]:border-l max-[800px]:!w-full max-[800px]:max-h-[45vh] max-[800px]:border-t max-[800px]:border-l-0'
      )}
      aria-label="Detalle del curso"
    >
      <div className="relative aspect-[16/7] max-h-40 shrink-0 overflow-hidden bg-cream-deep">
        <button
          type="button"
          className="absolute top-2 right-2 z-[2] grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-white/90 text-ink shadow-card backdrop-blur-md transition-colors duration-150 hover:bg-ink hover:text-white"
          onClick={onClose}
          title="Cerrar"
          aria-label="Cerrar panel"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        {course.hasCover ? (
          <img
            className="h-full w-full object-cover"
            src={coverImg}
            alt=""
            onError={(e) => {
              e.currentTarget.src = brandMark
            }}
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pt-4 pb-5">
        <div className="flex flex-col gap-[0.3rem]">
          <h2 className="m-0 font-display text-xl leading-tight font-bold tracking-tight">
            {course.title}
          </h2>
          {course.institution ? (
            <div className="flex min-h-[1.35rem] items-center [&_img]:!max-h-[1.35rem] [&_img]:!max-w-[7.5rem]">
              <InstitutionMark institution={course.institution} />
            </div>
          ) : null}
        </div>

        <section
          className="flex flex-col gap-2.5 rounded-md border border-ink/8 bg-cream p-3.5"
          aria-label="Continuar"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-2xs font-semibold tracking-[0.07em] text-ink-soft uppercase">
              Emoción
            </span>
            <ExcitementGauge
              coursePath={course.path}
              value={course.learning?.excitement || 0}
              size="md"
            />
          </div>

          {hasStatus ? (
            <div className="flex min-h-[1.35rem] flex-wrap items-center gap-[0.35rem]">
              {course.isInProcess ? <span className={ribbon}>En curso</span> : null}
              {course.learning?.status === 'completed' ? (
                <span className={badgeDone}>Completado</span>
              ) : null}
              {course.learning?.isRecentlyViewed ? (
                <span className={cn(ribbon, ribbonRecent)}>Reciente</span>
              ) : null}
              {course.isNew ? <span className={badgeNew}>Nuevo</span> : null}
              {course.missingProps ? <span className={badgeWarn}>Sin props</span> : null}
              {showIdle ? <span className="text-sm text-ink-soft">Sin empezar</span> : null}
            </div>
          ) : null}

          {showProgress ? (
            <div className="flex items-center gap-2">
              <div
                className="h-1 flex-1 overflow-hidden rounded-full bg-ink/8"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Progreso del curso"
              >
                <div
                  className="h-full rounded-[inherit] bg-teal"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-teal">{percent}%</span>
            </div>
          ) : null}

          {course.learning?.lastLessonTitle ? (
            <p className="m-0 flex min-w-0 flex-col gap-[0.1rem]">
              <span className="text-2xs font-semibold tracking-[0.07em] text-ink-soft uppercase">
                Última lección
              </span>
              <strong
                className="line-clamp-2 text-base leading-[1.3] font-semibold"
                title={course.learning.lastLessonTitle}
              >
                {course.learning.lastLessonTitle}
              </strong>
            </p>
          ) : null}

          <button type="button" className={cn(btnPrimary, 'w-full')} onClick={handleOpenCourse}>
            Abrir curso
          </button>
        </section>

        <CourseDescription course={course} />

        <CourseOutline course={course} onOpenLesson={handleOpenLesson} />

        <section className="flex flex-col gap-[0.55rem]" aria-label="Ficha del curso">
          {hasCatalog ? (
            <dl className="m-0 flex flex-col gap-[0.45rem]">
              {course.instructor ? (
                <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-baseline gap-x-2 gap-y-[0.35rem]">
                  <dt className="m-0 pt-[0.15rem] text-2xs font-semibold tracking-[0.07em] text-ink-soft uppercase">
                    Instructor
                  </dt>
                  <dd className="m-0 min-w-0 text-base">{course.instructor}</dd>
                </div>
              ) : null}
              {programs.length ? (
                <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-[0.35rem]">
                  <dt className="m-0 pt-[0.15rem] text-2xs font-semibold tracking-[0.07em] text-ink-soft uppercase">
                    Programas
                  </dt>
                  <dd className="m-0 flex min-w-0 flex-wrap gap-[0.3rem] text-base">
                    {programs.map((program, index) => (
                      <span key={`${program}-${index}`} className={badgePrograms}>
                        {program}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {themes.length ? (
                <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-[0.35rem]">
                  <dt className="m-0 pt-[0.15rem] text-2xs font-semibold tracking-[0.07em] text-ink-soft uppercase">
                    Temas
                  </dt>
                  <dd className="m-0 flex min-w-0 flex-wrap gap-[0.3rem] text-base">
                    {themes.map((theme, index) => (
                      <span key={`${theme}-${index}`} className={badgeTheme}>
                        {theme}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {hasRating ? (
                <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-baseline gap-x-2 gap-y-[0.35rem]">
                  <dt className="m-0 pt-[0.15rem] text-2xs font-semibold tracking-[0.07em] text-ink-soft uppercase">
                    Valoración
                  </dt>
                  <dd className="m-0 min-w-0 text-base">
                    <span
                      className="text-sm tracking-[0.04em] text-coral-deep"
                      aria-label={`${course.rate} de 5`}
                    >
                      <span aria-hidden="true">{'★'.repeat(course.rate)}</span>
                      <span className="text-ink/[0.28]" aria-hidden="true">
                        {'☆'.repeat(5 - course.rate)}
                      </span>
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <div className="flex flex-wrap items-center gap-x-[0.65rem] gap-y-[0.35rem]">
              <span className="text-sm text-ink-soft">Sin ficha</span>
              <button
                type="button"
                className={cn(detailUtil, 'flex-none')}
                onClick={() => onEdit(course)}
              >
                Editar detalles
              </button>
            </div>
          )}
          {onGenerateProps ? (
            <button
              type="button"
              className={cn(detailUtil, detailUtilAccent)}
              onClick={onGenerateProps}
            >
              Generar propiedades
            </button>
          ) : null}
        </section>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-ink/8 bg-cream px-5 py-3">
        {onSearchCover ? (
          <button type="button" className={detailUtil} onClick={() => onSearchCover(course)}>
            {course.hasCover ? 'Cambiar portada' : 'Buscar portada'}
          </button>
        ) : null}
        <button type="button" className={detailUtil} onClick={handleToggle}>
          {course.isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
        </button>
        {hasCatalog ? (
          <button type="button" className={detailUtil} onClick={() => onEdit(course)}>
            Editar detalles
          </button>
        ) : null}
        <button type="button" className={detailUtil} onClick={handleOpenFolder}>
          Abrir en explorador
        </button>
      </div>
    </aside>
  )
}

export default CourseDetailPanel
