import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { cierreSubjectKey, findCierreForSubject, flattenOutline } from '../../../shared/cierres.js'
import { btnGhost, btnPrimary, fieldControl, fieldLabel } from '../ui/classes'
import { askConfirm } from '../utils/askConfirm'

const dismissed = new Set()

export function dismissCierrePrompt(subject) {
  const key = cierreSubjectKey(subject)
  if (key) dismissed.add(key)
}

export async function shouldOfferCierre(subject) {
  const key = cierreSubjectKey(subject)
  if (!key || dismissed.has(key)) return false
  try {
    const list = await window.api.listCierres()
    return !findCierreForSubject(list, subject)
  } catch {
    return false
  }
}

/** Ask before the cierre form when a project just became done. */
export async function suggestProjectCierre(subject) {
  if (!(await shouldOfferCierre(subject))) return false
  const name = subject?.projectTitle || subject?.title || 'Este proyecto'
  const yes = await askConfirm({
    title: 'Proyecto hecho',
    message: `«${name}» ya está hecho. ¿Le das un cierre con lo que entregaste y lo que aprendiste?`,
    confirmLabel: 'Dar cierre',
    cancelLabel: 'Ahora no'
  })
  if (!yes) dismissCierrePrompt(subject)
  return yes
}

const field = 'flex flex-col gap-[0.35rem] text-xs font-semibold tracking-[0.02em] text-ink-soft'

function courseTitle(courses, coursePath) {
  return courses.find((course) => course.path === coursePath)?.title || coursePath
}

/**
 * Publish or edit one cierre.
 * `picker` lists finished projects and completed lessons when nothing is preselected.
 */
function CierreComposer({ open, initial = null, picker = false, courses = [], onClose, onSaved }) {
  const [subject, setSubject] = useState(null)
  const [title, setTitle] = useState('')
  const [learned, setLearned] = useState('')
  const [differently, setDifferently] = useState('')
  const [coverUrl, setCoverUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState([])
  const [existing, setExisting] = useState([])
  const [lessonCourse, setLessonCourse] = useState('')
  const [lessons, setLessons] = useState([])
  const [lessonsLoading, setLessonsLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const preset = initial?.projectId || initial?.lessonRelativePath ? initial : null
    setSubject(preset)
    setTitle(initial?.title || '')
    setLearned(initial?.learned || '')
    setDifferently(initial?.differently || '')
    setCoverUrl(initial?.coverUrl || null)
    setLessonCourse('')
    setLessons([])
  }, [open, initial])

  useEffect(() => {
    if (!open || !picker || subject) return
    let cancel = false
    Promise.all([window.api.listAllProjects(), window.api.listCierres()])
      .then(([projectList, cierreList]) => {
        if (cancel) return
        setProjects(projectList || [])
        setExisting(cierreList || [])
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [open, picker, subject])

  useEffect(() => {
    if (!open || !lessonCourse) {
      setLessons([])
      return
    }
    let cancel = false
    setLessonsLoading(true)
    Promise.all([
      window.api.scanCourse(lessonCourse),
      window.api.getCourseProgress(lessonCourse),
      window.api.listCierres()
    ])
      .then(([tree, progress, cierreList]) => {
        if (cancel) return
        const outline = flattenOutline(tree?.sections)
        const sectionById = new Map(outline.map((row) => [row.id, row]))
        const rows = []
        const walk = (sections) => {
          for (const section of sections || []) {
            for (const lesson of section.lessons || []) {
              if (!progress?.lessons?.[lesson.relativePath]?.completed) continue
              const anchor =
                section.id && section.id !== '__root__'
                  ? sectionById.get(section.id) || {
                      id: section.id,
                      title: section.title
                    }
                  : null
              rows.push({
                coursePath: lessonCourse,
                lessonRelativePath: lesson.relativePath,
                lessonTitle: lesson.title || lesson.name,
                title: lesson.title || lesson.name || '',
                sectionId: anchor?.id || null,
                sectionTitle: anchor?.title || null
              })
            }
            walk(section.sections)
          }
        }
        walk(tree?.sections)
        setExisting(cierreList || [])
        setLessons(rows)
      })
      .catch(() => {
        if (!cancel) setLessons([])
      })
      .finally(() => {
        if (!cancel) setLessonsLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [open, lessonCourse])

  const pendingProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.status === 'done' &&
          !findCierreForSubject(existing, { coursePath: project.coursePath, projectId: project.id })
      ),
    [projects, existing]
  )

  const pendingLessons = useMemo(
    () =>
      lessons.filter(
        (lesson) =>
          !findCierreForSubject(existing, {
            coursePath: lesson.coursePath,
            lessonRelativePath: lesson.lessonRelativePath
          })
      ),
    [lessons, existing]
  )

  if (!open) return null

  const choose = (next) => {
    setSubject(next)
    setTitle(next.title || next.projectTitle || next.lessonTitle || '')
    setLearned(next.learned || '')
    setDifferently(next.differently || '')
    setCoverUrl(next.coverUrl || null)
  }

  const pickCover = async () => {
    try {
      const result = await window.api.pickNoteImage()
      if (result?.canceled || !result?.url) {
        if (result?.error) toast.error(result.error)
        return
      }
      setCoverUrl(result.url)
    } catch (err) {
      toast.error(err.message || 'No se pudo adjuntar la imagen')
    }
  }

  const publish = async () => {
    if (!subject) return
    setSaving(true)
    try {
      const saved = await window.api.upsertCierre({
        id: subject.id,
        coursePath: subject.coursePath,
        sectionId: subject.sectionId || null,
        sectionTitle: subject.sectionTitle || null,
        projectId: subject.projectId || null,
        projectTitle: subject.projectTitle || null,
        lessonRelativePath: subject.lessonRelativePath || null,
        lessonTitle: subject.lessonTitle || null,
        title,
        learned,
        differently,
        coverUrl
      })
      toast.success(subject.id ? 'Cierre actualizado' : 'Cierre publicado')
      onSaved?.(saved)
      onClose?.(false)
    } catch (err) {
      toast.error(err.message || 'No se pudo publicar')
    } finally {
      setSaving(false)
    }
  }

  const skip = () => {
    if (!subject?.id) dismissCierrePrompt(subject || initial)
    onClose?.(true)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(23,21,28,0.45)] p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="cierre-composer-title"
        className="flex max-h-[min(640px,calc(100vh-4rem))] w-full max-w-[560px] flex-col gap-4 overflow-auto rounded-lg border border-ink/10 bg-cream px-5 py-4 text-ink shadow-panel"
        onSubmit={(event) => {
          event.preventDefault()
          void publish()
        }}
      >
        <header>
          <h2
            id="cierre-composer-title"
            className="m-0 font-display text-xl font-bold tracking-[-0.02em]"
          >
            {subject?.id ? 'Editar cierre' : 'Publicar cierre'}
          </h2>
          <p className="m-0 mt-1 text-sm leading-snug text-ink-soft">
            {subject
              ? `${courseTitle(courses, subject.coursePath)}${
                  subject.sectionTitle ? ` · ${subject.sectionTitle}` : ''
                }`
              : 'Elige un proyecto hecho o una lección completada.'}
          </p>
        </header>

        {!subject && picker ? (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
                Proyectos hechos
              </h3>
              {pendingProjects.length === 0 ? (
                <p className="m-0 text-sm text-ink-soft">
                  No hay proyectos hechos sin cierre.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {pendingProjects.map((project) => (
                    <li key={`${project.coursePath}:${project.id}`}>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer flex-col items-start rounded-md border border-ink/10 bg-surface px-3 py-2 text-left hover:border-coral/40"
                        onClick={() =>
                          choose({
                            coursePath: project.coursePath,
                            projectId: project.id,
                            projectTitle: project.title,
                            sectionId: project.sectionId || null,
                            sectionTitle: null,
                            lessonRelativePath: project.fileRelativePath || null,
                            title: project.title || ''
                          })
                        }
                      >
                        <span className="font-semibold">{project.title}</span>
                        <span className="text-xs text-ink-soft">
                          {courseTitle(courses, project.coursePath)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
                Lecciones completadas
              </h3>
              <label className={field}>
                Curso
                <select
                  className={fieldControl}
                  value={lessonCourse}
                  onChange={(event) => setLessonCourse(event.target.value)}
                >
                  <option value="">Elegir curso</option>
                  {courses.map((course) => (
                    <option key={course.path} value={course.path}>
                      {course.title || course.path}
                    </option>
                  ))}
                </select>
              </label>
              {lessonsLoading ? (
                <p className="m-0 text-sm text-ink-soft">Buscando lecciones…</p>
              ) : lessonCourse && pendingLessons.length === 0 ? (
                <p className="m-0 text-sm text-ink-soft">
                  Este curso no tiene lecciones completadas sin cierre.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {pendingLessons.map((lesson) => (
                    <li key={lesson.lessonRelativePath}>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer flex-col items-start rounded-md border border-ink/10 bg-surface px-3 py-2 text-left hover:border-coral/40"
                        onClick={() => choose(lesson)}
                      >
                        <span className="font-semibold">{lesson.lessonTitle}</span>
                        {lesson.sectionTitle ? (
                          <span className="text-xs text-ink-soft">
                            {lesson.sectionTitle}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="flex justify-end">
              <button type="button" className={btnGhost} onClick={skip}>
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className={field}>
              <span className={fieldLabel}>Qué entregué</span>
              <input
                className={fieldControl}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label className={field}>
              <span className={fieldLabel}>Qué aprendí</span>
              <textarea
                className={`${fieldControl} min-h-[6.5rem] resize-y leading-snug`}
                value={learned}
                onChange={(event) => setLearned(event.target.value)}
                required
              />
            </label>
            <label className={field}>
              <span className={fieldLabel}>Qué haría distinto</span>
              <textarea
                className={`${fieldControl} min-h-[4.5rem] resize-y leading-snug`}
                value={differently}
                onChange={(event) => setDifferently(event.target.value)}
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="button" className={btnGhost} onClick={() => void pickCover()}>
                {coverUrl ? 'Cambiar imagen' : 'Añadir imagen'}
              </button>
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt=""
                  className="h-14 w-20 rounded-sm border border-ink/10 object-cover"
                />
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={skip}>
                {subject?.id ? 'Cancelar' : 'Ahora no'}
              </button>
              <button type="submit" className={btnPrimary} disabled={saving}>
                {subject?.id ? 'Guardar' : 'Publicar'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

export default CierreComposer
