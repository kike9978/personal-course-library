import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { getCoverFallback, absoluteAssetUrl } from '../utils/images'
import { InstitutionMark } from './InstitutionMark'
import CourseDescription from './CourseDescription'
import brandMark from '../assets/img/brand-mark.svg'

function CourseOutline({ course, onOpenLesson }) {
  const [outline, setOutline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const currentRef = useRef(null)
  const currentPath = course.learning?.lastLessonRelativePath || ''

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

  const sections = (outline?.sections || []).filter((section) => section.lessons?.length)
  const lessonCount = sections.reduce((count, section) => count + section.lessons.length, 0)
  const showSectionTitles =
    sections.length > 1 || (sections.length === 1 && sections[0].id !== '__root__')

  return (
    <section className="detail-outline" aria-label="Temario">
      <div className="detail-outline__head">
        <h3>Temario</h3>
        {lessonCount > 0 ? <span>{lessonCount}</span> : null}
      </div>
      {loading ? <p className="detail-outline__note">Cargando temario…</p> : null}
      {!loading && error ? <p className="detail-outline__note">{error}</p> : null}
      {!loading && !error && lessonCount === 0 ? (
        <p className="detail-outline__note">Este curso no tiene lecciones.</p>
      ) : null}
      {sections.map((section) => (
        <div key={section.id} className="detail-outline__section">
          {showSectionTitles ? (
            <h4 className="detail-outline__section-title" title={section.title}>
              {section.title}
            </h4>
          ) : null}
          <ol className="detail-outline__list">
            {section.lessons.map((lesson, index) => {
              const done = Boolean(course.learning?.lessons?.[lesson.relativePath]?.completed)
              const current = lesson.relativePath === currentPath
              const status = [done ? 'completada' : '', current ? 'última' : '']
                .filter(Boolean)
                .join(', ')
              return (
                <li key={lesson.relativePath}>
                  <button
                    type="button"
                    ref={current ? currentRef : null}
                    className={`detail-outline__lesson${done ? ' is-done' : ''}${
                      current ? ' is-current' : ''
                    }`}
                    aria-current={current ? 'true' : undefined}
                    aria-label={status ? `${lesson.title}, ${status}` : lesson.title}
                    title={lesson.title}
                    onClick={() => onOpenLesson(lesson)}
                  >
                    <span className="detail-outline__mark" aria-hidden="true">
                      {done ? '✓' : index + 1}
                    </span>
                    <span className="detail-outline__label">{lesson.title}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
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
  onSearchCover
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
    <aside className="detail-panel" aria-label="Detalle del curso">
      <div className="detail-panel__cover">
        <button
          type="button"
          className="card-action detail-panel__close"
          onClick={onClose}
          title="Cerrar"
          aria-label="Cerrar panel"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
        {course.hasCover ? (
          <img
            src={coverImg}
            alt=""
            onError={(e) => {
              e.currentTarget.src = brandMark
            }}
          />
        ) : (
          <div className="cover-placeholder">
            <img src={brandMark} alt="" width={28} height={28} />
          </div>
        )}
      </div>

      <div className="detail-panel__body">
        <div className="detail-identity">
          <h2 className="detail-panel__title">{course.title}</h2>
          {course.institution ? (
            <div className="detail-identity__academy">
              <InstitutionMark institution={course.institution} nameClassName="institution-name" />
            </div>
          ) : null}
        </div>

        <section className="detail-resume" aria-label="Continuar">
          {hasStatus ? (
            <div className="detail-resume__status">
              {course.isInProcess ? (
                <span className="status-ribbon status-ribbon--inline">En curso</span>
              ) : null}
              {course.learning?.status === 'completed' ? (
                <span className="badge badge--done">Completado</span>
              ) : null}
              {course.learning?.isRecentlyViewed ? (
                <span className="status-ribbon status-ribbon--inline status-ribbon--recent">
                  Reciente
                </span>
              ) : null}
              {course.isNew ? <span className="badge badge--new">Nuevo</span> : null}
              {course.missingProps ? <span className="badge badge--warn">Sin props</span> : null}
              {showIdle ? <span className="detail-resume__idle">Sin empezar</span> : null}
            </div>
          ) : null}

          {showProgress ? (
            <div className="detail-resume__meter">
              <div
                className="detail-resume__track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Progreso del curso"
              >
                <div className="detail-resume__fill" style={{ width: `${percent}%` }} />
              </div>
              <span className="detail-resume__percent">{percent}%</span>
            </div>
          ) : null}

          {course.learning?.lastLessonTitle ? (
            <p className="detail-resume__lesson">
              <span>Última lección</span>
              <strong title={course.learning.lastLessonTitle}>
                {course.learning.lastLessonTitle}
              </strong>
            </p>
          ) : null}

          <button type="button" className="icon-btn detail-resume__open" onClick={handleOpenCourse}>
            Abrir curso
          </button>
        </section>

        <CourseDescription course={course} />

        <CourseOutline course={course} onOpenLesson={handleOpenLesson} />

        <section className="detail-catalog" aria-label="Ficha del curso">
          {hasCatalog ? (
            <dl className="detail-catalog__list">
              {course.instructor ? (
                <div className="detail-catalog__row">
                  <dt>Instructor</dt>
                  <dd>{course.instructor}</dd>
                </div>
              ) : null}
              {programs.length ? (
                <div className="detail-catalog__row detail-catalog__row--chips">
                  <dt>Programas</dt>
                  <dd className="chips-container">
                    {programs.map((program, index) => (
                      <span key={`${program}-${index}`} className="badge badge--programs">
                        {program}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {themes.length ? (
                <div className="detail-catalog__row detail-catalog__row--chips">
                  <dt>Temas</dt>
                  <dd className="chips-container">
                    {themes.map((theme, index) => (
                      <span key={`${theme}-${index}`} className="badge badge--theme">
                        {theme}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {hasRating ? (
                <div className="detail-catalog__row">
                  <dt>Valoración</dt>
                  <dd>
                    <span className="detail-catalog__stars" aria-label={`${course.rate} de 5`}>
                      <span aria-hidden="true">{'★'.repeat(course.rate)}</span>
                      <span className="is-empty" aria-hidden="true">
                        {'☆'.repeat(5 - course.rate)}
                      </span>
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <div className="detail-catalog__empty">
              <span>Sin ficha</span>
              <button type="button" className="detail-util" onClick={() => onEdit(course)}>
                Editar detalles
              </button>
            </div>
          )}
          {onGenerateProps ? (
            <button
              type="button"
              className="detail-util detail-util--accent"
              onClick={onGenerateProps}
            >
              Generar propiedades
            </button>
          ) : null}
        </section>
      </div>

      <div className="detail-utils">
        {onSearchCover ? (
          <button type="button" className="detail-util" onClick={() => onSearchCover(course)}>
            {course.hasCover ? 'Cambiar portada' : 'Buscar portada'}
          </button>
        ) : null}
        <button type="button" className="detail-util" onClick={handleToggle}>
          {course.isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
        </button>
        {hasCatalog ? (
          <button type="button" className="detail-util" onClick={() => onEdit(course)}>
            Editar detalles
          </button>
        ) : null}
        <button type="button" className="detail-util" onClick={handleOpenFolder}>
          Abrir en explorador
        </button>
      </div>
    </aside>
  )
}

export default CourseDetailPanel
