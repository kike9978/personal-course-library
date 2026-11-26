import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Check } from 'lucide-react'
import {
  cierreDraftKey,
  cierreSubjectKey,
  findCierreForSubject,
  flattenOutline,
  MAX_CIERRE_IMAGES,
  normalizeCierreImages
} from '../../../shared/cierres.js'
import { btnCompact, btnGhost, btnPrimary, fieldControl, fieldLabel } from '../ui/classes'
import { cn } from '../ui/cn'
import CierreImagesField from './CierreImagesField'
import { focusLiveElement } from '../utils/askConfirm'

const dismissed = new Set()
const toasted = new Set()

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

/**
 * A project just became done: open the composer straight away.
 * The composer itself carries the celebration and its own «Ahora no».
 */
export async function suggestProjectCierre(subject) {
  return shouldOfferCierre(subject)
}

/**
 * A lesson just became complete: one light toast, the same however it got there.
 * Resolves true when the toast was shown, so callers can skip their own.
 */
export async function offerLessonCierre(subject, onOpen) {
  const key = cierreSubjectKey(subject)
  if (!key || toasted.has(key)) return false
  if (!(await shouldOfferCierre(subject))) return false
  toasted.add(key)
  toast.custom(
    (t) => (
      <div className="flex items-center gap-3 rounded-md border border-ink/8 bg-surface py-2 pr-2 pl-3 text-sm font-medium text-ink shadow-panel">
        <span className="grid size-6 place-items-center rounded-full bg-teal-tint text-teal">
          <Check size={14} aria-hidden="true" />
        </span>
        <span>Lección completada</span>
        <button
          type="button"
          className={cn(btnPrimary, btnCompact, 'h-8 px-3')}
          onClick={() => {
            toast.dismiss(t.id)
            onOpen?.(subject)
          }}
        >
          Dar cierre
        </button>
      </div>
    ),
    { duration: 7000 }
  )
  return true
}

const LEARNED_PROMPTS = [
  'La idea que más me costó fue…',
  'Ahora entiendo por qué…',
  'Lo que me llevo de esto es…',
  'Antes pensaba que… y ahora sé que…'
]

const DIFFERENTLY_PROMPTS = [
  'Si empezara de nuevo, yo…',
  'La próxima vez probaría…',
  'Me habría ahorrado tiempo si…'
]

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

const DRAFT_PREFIX = 'cierre-draft:'
const EMPTY = { title: '', learned: '', differently: '', coverUrl: null, images: [] }

function readDraft(key) {
  if (!key) return null
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key)
    if (!raw) return null
    const draft = { ...EMPTY, ...JSON.parse(raw) }
    return { ...draft, ...normalizeCierreImages(draft.images, draft.coverUrl) }
  } catch {
    return null
  }
}

function writeDraft(key, fields, baseline) {
  if (!key) return
  try {
    if (!changed(fields, baseline)) localStorage.removeItem(DRAFT_PREFIX + key)
    else localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(fields))
  } catch {
    // Storage full or unavailable: the form still works, it just won't survive a close.
  }
}

function clearDraft(key) {
  if (!key) return
  try {
    localStorage.removeItem(DRAFT_PREFIX + key)
  } catch {
    // ignore
  }
}

/** What the form shows before any draft: saved values for an edit, the project name for a project. */
function startingFields(subject) {
  if (subject?.id) {
    return {
      title: subject.title || '',
      learned: subject.learned || '',
      differently: subject.differently || '',
      ...normalizeCierreImages(subject.images, subject.coverUrl)
    }
  }
  return { ...EMPTY, title: subject?.projectId ? subject.projectTitle || subject.title || '' : '' }
}

/** True when the user wrote something beyond what the form started with. */
function changed(fields, baseline) {
  return ['title', 'learned', 'differently', 'coverUrl', 'images'].some(
    (name) => String(fields[name] || '').trim() !== String(baseline[name] || '').trim()
  )
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

/** Save pasted or dropped image files as note attachments; returns their urls. */
async function saveImageFiles(files) {
  const urls = []
  for (const file of files) {
    if (!String(file?.type || '').startsWith('image/')) continue
    const saved = await window.api.saveNoteImage({
      dataBase64: await readAsBase64(file),
      mimeType: file.type,
      fileName: file.name
    })
    if (saved?.ok && saved.url) urls.push(saved.url)
  }
  return urls
}

function imageFiles(list) {
  return [...(list || [])].filter((file) => String(file?.type || '').startsWith('image/'))
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
  const [fields, setFields] = useState(EMPTY)
  const [restored, setRestored] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imagesBusy, setImagesBusy] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [projects, setProjects] = useState([])
  const [existing, setExisting] = useState([])
  const [lessonCourse, setLessonCourse] = useState('')
  const [lessons, setLessons] = useState([])
  const [lessonsLoading, setLessonsLoading] = useState(false)
  const formRef = useRef(null)
  const titleRef = useRef(null)
  const learnedRef = useRef(null)
  const returnFocusRef = useRef(null)
  const fieldsRef = useRef(EMPTY)
  fieldsRef.current = fields
  const prompts = useMemo(
    () => ({ learned: pick(LEARNED_PROMPTS), differently: pick(DIFFERENTLY_PROMPTS) }),
    // A fresh prompt each time the composer opens.
    [open]
  )

  const load = (next) => {
    setSubject(next)
    if (!next) {
      setFields(EMPTY)
      setRestored(false)
      return
    }
    const draft = readDraft(cierreDraftKey(next))
    setFields(draft || startingFields(next))
    setRestored(Boolean(draft))
  }

  useEffect(() => {
    if (!open) return
    const preset = initial?.projectId || initial?.lessonRelativePath ? initial : null
    load(preset)
    setLessonCourse('')
    setLessons([])
  }, [open, initial])

  // Remember where focus was, and hand it back when the composer closes.
  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement
    return () => {
      const back = returnFocusRef.current
      if (back?.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true })
      else focusLiveElement(document, { force: true })
    }
  }, [open])

  // Land on the first field that still needs writing.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      if (!subject) {
        formRef.current?.querySelector('button, select')?.focus()
        return
      }
      const target = titleRef.current?.value.trim() ? learnedRef.current : titleRef.current
      target?.focus()
      if (target && typeof target.value === 'string') {
        target.setSelectionRange(target.value.length, target.value.length)
      }
    })
    return () => cancelAnimationFrame(frame)
    // Only when the subject changes, not on every keystroke.
  }, [open, subject])

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

  const draftKey = cierreDraftKey(subject)

  const edit = (patch) => {
    setFields((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }
      writeDraft(draftKey, next, startingFields(subject))
      return next
    })
  }

  const discardDraft = () => {
    clearDraft(draftKey)
    setFields(startingFields(subject))
    setRestored(false)
  }

  const setGallery = ({ images, coverUrl }) => edit(normalizeCierreImages(images, coverUrl))

  const addImages = (urls) => {
    if (!urls.length) return
    const room = MAX_CIERRE_IMAGES - fieldsRef.current.images.length
    if (urls.length > room) {
      toast(`Caben ${MAX_CIERRE_IMAGES} imágenes por cierre`, { icon: '🖼️' })
    }
    edit((prev) => normalizeCierreImages([...prev.images, ...urls], prev.coverUrl))
  }

  const pickImages = async () => {
    try {
      const result = await window.api.pickNoteImages()
      if (result?.errors?.length) toast.error(result.errors[0])
      if (result?.canceled) return
      addImages((result?.images || []).map((image) => image.url).filter(Boolean))
    } catch (err) {
      toast.error(err.message || 'No se pudieron adjuntar las imágenes')
    }
  }

  const addFiles = async (files) => {
    if (!files.length) return
    setImagesBusy(true)
    try {
      addImages(await saveImageFiles(files))
    } catch (err) {
      toast.error(err.message || 'No se pudieron adjuntar las imágenes')
    } finally {
      setImagesBusy(false)
    }
  }

  const acceptsFiles = (event) =>
    Boolean(subject) && [...(event.dataTransfer?.types || [])].includes('Files')

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
        title: fields.title,
        learned: fields.learned,
        differently: fields.differently,
        coverUrl: fields.coverUrl,
        images: fields.images
      })
      clearDraft(draftKey)
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
    // Browsing the picker is not a «no» to that subject.
    if (!picker && !subject?.id) dismissCierrePrompt(subject || initial)
    if (subject && changed(fields, startingFields(subject)))
      toast('Guardé tu borrador', { icon: '📝' })
    onClose?.(true)
  }

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      skip()
      return
    }
    if (event.key !== 'Tab' || !formRef.current) return
    const focusables = [
      ...formRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      )
    ]
    if (!focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const isNew = subject && !subject.id
  const heading = subject?.id
    ? 'Editar cierre'
    : isNew && subject.projectId
      ? '¡Proyecto hecho!'
      : isNew
        ? 'Dar cierre'
        : 'Publicar cierre'
  const where = subject
    ? [
        courseTitle(courses, subject.coursePath),
        subject.projectId ? null : subject.lessonTitle,
        subject.sectionTitle
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(23,21,28,0.45)] p-4"
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) skip()
      }}
    >
      <form
        ref={formRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cierre-composer-title"
        className={cn(
          'relative flex max-h-[min(720px,calc(100vh-4rem))] w-full max-w-[620px] flex-col gap-4 overflow-auto rounded-lg border border-ink/10 bg-cream px-5 pt-4 text-ink shadow-panel',
          dropActive && 'ring-2 ring-coral'
        )}
        onPaste={(event) => {
          if (!subject) return
          const files = imageFiles(event.clipboardData?.files)
          if (!files.length) return
          event.preventDefault()
          void addFiles(files)
        }}
        onDragOver={(event) => {
          if (!acceptsFiles(event)) return
          event.preventDefault()
          setDropActive(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false)
        }}
        onDrop={(event) => {
          if (!acceptsFiles(event)) return
          event.preventDefault()
          setDropActive(false)
          void addFiles(imageFiles(event.dataTransfer.files))
        }}
        onSubmit={(event) => {
          event.preventDefault()
          void publish()
        }}
      >
        <header>
          {picker && isNew ? (
            <button
              type="button"
              className="mb-1 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs font-medium text-ink-soft hover:text-ink"
              onClick={() => load(null)}
            >
              <ArrowLeft size={13} aria-hidden="true" />
              Elegir otro
            </button>
          ) : null}
          <h2
            id="cierre-composer-title"
            className="m-0 font-display text-xl font-bold tracking-[-0.02em]"
          >
            {heading}
          </h2>
          <p className="m-0 mt-1 text-sm leading-snug text-ink-soft">
            {!subject
              ? 'Elige un proyecto hecho o una lección completada.'
              : isNew
                ? `${where}. Cuéntale a tu yo del futuro qué te llevas.`
                : where}
          </p>
          {restored ? (
            <p className="m-0 mt-2 flex items-center gap-2 rounded-sm bg-teal-tint/60 px-2.5 py-1.5 text-xs text-ink">
              <span className="flex-1">Recuperé tu borrador.</span>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-teal hover:underline"
                onClick={discardDraft}
              >
                Empezar de cero
              </button>
            </p>
          ) : null}
        </header>

        {!subject && picker ? (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
                Proyectos hechos
              </h3>
              {pendingProjects.length === 0 ? (
                <p className="m-0 text-sm text-ink-soft">No hay proyectos hechos sin cierre.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {pendingProjects.map((project) => (
                    <li key={`${project.coursePath}:${project.id}`}>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer flex-col items-start rounded-md border border-ink/10 bg-surface px-3 py-2 text-left hover:border-coral/40"
                        onClick={() =>
                          load({
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
                        onClick={() => load(lesson)}
                      >
                        <span className="font-semibold">{lesson.lessonTitle}</span>
                        {lesson.sectionTitle ? (
                          <span className="text-xs text-ink-soft">{lesson.sectionTitle}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="flex justify-end pb-4">
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
                ref={titleRef}
                className={fieldControl}
                value={fields.title}
                placeholder={
                  subject?.projectId
                    ? 'Ej.: La app de tareas, con login y despliegue'
                    : 'Ej.: Mi propio ejemplo del patrón observer'
                }
                onChange={(event) => edit({ title: event.target.value })}
                required
              />
            </label>
            <label className={field}>
              <span className={fieldLabel}>Qué aprendí</span>
              <textarea
                ref={learnedRef}
                className={`${fieldControl} min-h-[6.5rem] resize-y leading-snug`}
                value={fields.learned}
                placeholder={prompts.learned}
                onChange={(event) => edit({ learned: event.target.value })}
                required
              />
            </label>
            <label className={field}>
              <span className={fieldLabel}>
                Qué haría distinto <span className="font-normal text-ink-faint">(opcional)</span>
              </span>
              <textarea
                className={`${fieldControl} min-h-[4.5rem] resize-y leading-snug`}
                value={fields.differently}
                placeholder={prompts.differently}
                onChange={(event) => edit({ differently: event.target.value })}
              />
            </label>
            <CierreImagesField
              images={fields.images}
              coverUrl={fields.coverUrl}
              busy={imagesBusy}
              onAdd={() => void pickImages()}
              onChange={setGallery}
            />
            <div className="sticky bottom-0 -mx-5 mt-auto flex justify-end gap-2 border-t border-ink/8 bg-cream px-5 py-3">
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
