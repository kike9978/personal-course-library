import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Check, ExternalLink, ImagePlus } from 'lucide-react'
import { cn } from '../ui/cn'
import {
  btnCompact,
  btnGhost,
  btnPrimary,
  fieldControl,
  fieldLabel,
  dialogShell as dialogBase,
  dialogBody,
  dialogLead as sharedDialogLead,
  dialogTitle
} from '../ui/classes'
import {
  coverErrorText,
  coverQueryFor,
  imageFileFromTransfer,
  imageUrlFromTransfer,
  saveCoverFromTransfer
} from '../utils/coverDrop'

const dialogShell = cn(dialogBase, 'max-w-[680px] open:max-h-[calc(100vh-2rem)]')
const dialogForm = cn(dialogBody, 'overflow-auto')
const dialogLead = sharedDialogLead
const emptyNote = 'm-0 p-4 text-center text-base text-ink-soft'
const linkBtn =
  'cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-ink-soft underline decoration-ink/25 underline-offset-2 hover:text-coral-deep disabled:cursor-default disabled:opacity-50'
const AUTO_GOOGLE_KEY = 'cover-queue-auto-google'

function readAutoGoogle() {
  try {
    return localStorage.getItem(AUTO_GOOGLE_KEY) !== '0'
  } catch {
    return true
  }
}

function withIds(candidates) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate, index) => ({
    ...candidate,
    id: `${index}-${candidate.imageUrl || index}`
  }))
}

function isTextField(target) {
  const tag = target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable
}

/**
 * One course at a time: open Google Imágenes, drag the picture in (or paste it), next.
 * The built-in web search stays as "Buscar aquí" for when the browser is not handy.
 */
function CoverSearchModal({ courses = [], onClose }) {
  const dialogRef = useRef(null)
  const closed = useRef(false)
  const searchToken = useRef(0)
  const [index, setIndex] = useState(0)
  const [queryDraft, setQueryDraft] = useState(() => coverQueryFor(courses[0]))
  const [saved, setSaved] = useState(() => new Map())
  const [currentCover, setCurrentCover] = useState('')
  const [view, setView] = useState('drop')
  const [candidates, setCandidates] = useState({ loading: false, list: [], error: '' })
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [autoGoogle, setAutoGoogle] = useState(readAutoGoogle)

  const course = courses[index] || null
  const total = courses.length
  const isQueue = total > 1
  const isLast = index >= total - 1
  const savedPreview = course ? saved.get(course.path) : ''
  const selectedCandidate = candidates.list.find((item) => item.id === selectedId) || null

  const handleClose = useCallback(() => {
    if (closed.current) return
    closed.current = true
    searchToken.current += 1
    const count = saved.size
    if (count) toast.success(count === 1 ? '1 portada guardada' : `${count} portadas guardadas`)
    if (dialogRef.current?.open) dialogRef.current.close()
    onClose?.()
  }, [onClose, saved])

  useEffect(() => {
    const dialog = dialogRef.current
    const frame = requestAnimationFrame(() => {
      if (dialog && !dialog.open) {
        try {
          dialog.showModal()
        } catch (err) {
          console.error('Failed to open cover dialog:', err)
        }
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    let cancelled = false
    setCurrentCover('')
    if (course?.hasCover) {
      window.api
        .getCoverImageUrl(course.path)
        .then((url) => {
          if (!cancelled && url) setCurrentCover(url)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [course?.path, course?.hasCover])

  const openGoogle = async (query) => {
    const q = String(query || '').trim()
    if (!q) return
    try {
      await window.api.openGoogleImageSearch(q)
    } catch (err) {
      toast.error(coverErrorText(err, 'No se pudo abrir el navegador'))
    }
  }

  const goTo = (nextIndex, { google = false } = {}) => {
    const next = courses[nextIndex]
    if (!next) {
      handleClose()
      return
    }
    searchToken.current += 1
    setIndex(nextIndex)
    const nextQuery = coverQueryFor(next)
    setQueryDraft(nextQuery)
    setView('drop')
    setCandidates({ loading: false, list: [], error: '' })
    setSelectedId(null)
    if (google) openGoogle(nextQuery)
  }

  const handleNext = () => {
    if (saving) return
    if (isLast) {
      handleClose()
      return
    }
    goTo(index + 1, { google: autoGoogle })
  }

  const markSaved = async (coursePath) => {
    let url = ''
    try {
      url = (await window.api.getCoverImageUrl(coursePath)) || ''
    } catch {
      url = ''
    }
    if (closed.current) return
    setSaved((prev) => new Map(prev).set(coursePath, url || 'saved'))
  }

  const saveTransfer = async (dataTransfer) => {
    if (!course || saving) return
    setSaving(true)
    try {
      await saveCoverFromTransfer(course.path, dataTransfer)
      await markSaved(course.path)
      setView('drop')
    } catch (err) {
      toast.error(coverErrorText(err, 'No se pudo usar esa imagen'))
    } finally {
      if (!closed.current) setSaving(false)
    }
  }

  const saveRef = useRef(saveTransfer)
  saveRef.current = saveTransfer
  const nextRef = useRef(handleNext)
  nextRef.current = handleNext
  const savedRef = useRef(Boolean(savedPreview))
  savedRef.current = Boolean(savedPreview)

  useEffect(() => {
    let timer
    const onDragOver = (event) => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
      clearTimeout(timer)
      timer = setTimeout(() => setDragOver(false), 120)
    }
    const onDrop = (event) => {
      event.preventDefault()
      clearTimeout(timer)
      setDragOver(false)
      saveRef.current(event.dataTransfer)
    }
    const onPaste = (event) => {
      const data = event.clipboardData
      const file = imageFileFromTransfer(data)
      const url = !file && !isTextField(event.target) ? imageUrlFromTransfer(data) : ''
      if (!file && !url) return
      event.preventDefault()
      saveRef.current(data)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Enter' || isTextField(event.target)) return
      if (event.target?.tagName === 'BUTTON') return
      if (!savedRef.current) return
      event.preventDefault()
      nextRef.current()
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const runBuiltInSearch = async () => {
    const q = queryDraft.trim()
    if (!course || !q) return
    const token = ++searchToken.current
    setView('candidates')
    setSelectedId(null)
    setCandidates({ loading: true, list: [], error: '' })
    try {
      const result = await window.api.searchCoverCandidates({ coursePath: course.path, query: q })
      if (closed.current || token !== searchToken.current) return
      const list = withIds(result?.candidates)
      setCandidates({ loading: false, list, error: result?.error || '' })
      setSelectedId(list[0]?.id || null)
    } catch (err) {
      if (closed.current || token !== searchToken.current) return
      setCandidates({ loading: false, list: [], error: coverErrorText(err, 'No se pudo buscar') })
    }
  }

  const pickCandidate = async () => {
    if (!course || !selectedCandidate || saving) return
    setSaving(true)
    try {
      const result = await window.api.saveCourseCover({
        coursePath: course.path,
        imageUrl: selectedCandidate.imageUrl,
        thumbUrl: selectedCandidate.thumbUrl
      })
      if (!result?.success) throw new Error(result?.error || 'No se pudo guardar la portada')
      await markSaved(course.path)
      setView('drop')
    } catch (err) {
      toast.error(coverErrorText(err, 'No se pudo guardar la portada'))
    } finally {
      if (!closed.current) setSaving(false)
    }
  }

  if (!course) return null

  const doneCount = saved.size
  const preview = savedPreview && savedPreview !== 'saved' ? savedPreview : ''
  const showing = preview || (!savedPreview ? currentCover : '')

  return (
    <dialog
      ref={dialogRef}
      className={cn(dialogShell, dragOver && 'shadow-ring')}
      onClose={handleClose}
      onClick={(event) => {
        if (!saving && event.target === dialogRef.current) handleClose()
      }}
    >
      <div className="flex flex-col gap-[0.2rem] px-[1.15rem] pt-4 pb-2">
        <h3 className={dialogTitle}>
          {isQueue
            ? `Portada ${index + 1} de ${total}`
            : course.hasCover
              ? 'Reemplazar portada'
              : 'Buscar portada'}
        </h3>
        <p className={dialogLead}>
          {course.institution ? `${course.institution} · ` : ''}
          <span className="font-display font-semibold text-ink">{course.title || course.path}</span>
        </p>
        {isQueue ? (
          <div
            className="mt-[0.35rem] h-1.5 overflow-hidden rounded-full bg-ink/8"
            role="progressbar"
            aria-label="Portadas guardadas"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={doneCount}
          >
            <span
              className="block h-full bg-coral transition-[width] duration-300"
              style={{ width: `${Math.round((doneCount / total) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className={dialogForm}>
        <div>
          <label className={fieldLabel} htmlFor="cover-query">
            Búsqueda
          </label>
          <div className="flex flex-wrap items-center gap-[0.45rem]">
            <input
              id="cover-query"
              className={cn(fieldControl, 'min-w-0 flex-1')}
              type="text"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  openGoogle(queryDraft)
                }
              }}
            />
            <button
              type="button"
              className={cn(btnPrimary, 'gap-1.5')}
              onClick={() => openGoogle(queryDraft)}
              disabled={!queryDraft.trim()}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Google Imágenes
            </button>
          </div>
        </div>

        {view === 'drop' ? (
          <div
            className={cn(
              'relative grid aspect-[16/9] max-h-[min(42vh,340px)] w-full place-items-center overflow-hidden rounded-lg border-2 border-dashed border-ink/15 bg-cream-deep text-center transition-colors',
              dragOver && 'border-coral bg-coral/8',
              savedPreview && !dragOver && 'border-solid border-teal/50'
            )}
            aria-live="polite"
          >
            {showing ? (
              <img
                className={cn(
                  'absolute inset-0 h-full w-full object-cover',
                  (dragOver || saving) && 'opacity-30'
                )}
                src={showing}
                alt=""
                draggable={false}
              />
            ) : null}
            <div
              className={cn(
                'relative flex flex-col items-center gap-[0.35rem] px-4 text-ink-soft',
                showing && !dragOver && !saving && 'self-end pb-3'
              )}
            >
              {saving ? (
                <strong className="text-ink">Guardando…</strong>
              ) : dragOver ? (
                <strong className="text-coral-deep">Suelta para usarla</strong>
              ) : savedPreview ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal px-3 py-1 text-sm font-semibold text-white shadow-card">
                  <Check className="size-3.5" aria-hidden="true" />
                  Guardada · suelta otra para cambiarla
                </span>
              ) : showing ? (
                <span className="rounded-full bg-ink/70 px-3 py-1 text-sm font-semibold text-white">
                  Portada actual · suelta otra para reemplazarla
                </span>
              ) : (
                <>
                  <ImagePlus className="size-7 opacity-60" aria-hidden="true" />
                  <strong className="text-ink">Arrastra aquí la imagen desde Google</strong>
                  <span className="text-sm">o cópiala en el navegador y pulsa Ctrl+V</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[0.55rem]">
            {candidates.loading ? (
              <p className={emptyNote}>Buscando…</p>
            ) : candidates.list.length ? (
              <div
                className="grid max-h-[min(42vh,380px)] grid-cols-4 gap-[0.55rem] overflow-auto p-1 max-[640px]:grid-cols-2"
                role="radiogroup"
                aria-label="Opciones de portada"
              >
                {candidates.list.map((candidate) => {
                  const isSelected = candidate.id === selectedId
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={cn(
                        'cursor-pointer rounded-md border border-ink/10 bg-cream-deep p-0 shadow-none focus-visible:border-coral focus-visible:shadow-ring disabled:cursor-default disabled:opacity-70',
                        isSelected && 'border-coral shadow-ring'
                      )}
                      onClick={() => setSelectedId(candidate.id)}
                      onDoubleClick={pickCandidate}
                      disabled={saving}
                    >
                      <span className="block aspect-[16/10] overflow-hidden rounded-md">
                        <img
                          className="block h-full w-full object-cover"
                          src={candidate.dataUrl}
                          alt=""
                          draggable={false}
                        />
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className={emptyNote}>{candidates.error || 'Sin imágenes para esta búsqueda.'}</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className={cn(btnGhost, btnCompact)}
                onClick={() => setView('drop')}
                disabled={saving}
              >
                Volver
              </button>
              <button
                type="button"
                className={cn(btnPrimary, btnCompact)}
                onClick={pickCandidate}
                disabled={saving || !selectedCandidate}
              >
                {saving ? 'Guardando…' : 'Usar esta'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-[0.35rem]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {view === 'drop' ? (
              <button
                type="button"
                className={linkBtn}
                onClick={runBuiltInSearch}
                disabled={saving || !queryDraft.trim()}
                title="Busca imágenes sin salir de la app"
              >
                Buscar aquí
              </button>
            ) : null}
            {isQueue ? (
              <label className="flex items-center gap-[0.4rem] text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="accent-coral"
                  checked={autoGoogle}
                  onChange={(event) => {
                    setAutoGoogle(event.target.checked)
                    try {
                      localStorage.setItem(AUTO_GOOGLE_KEY, event.target.checked ? '1' : '0')
                    } catch {
                      /* ignore */
                    }
                  }}
                />
                Abrir Google al pasar al siguiente
              </label>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={handleClose} disabled={saving}>
              Cerrar
            </button>
            {isQueue && !savedPreview && !isLast ? (
              <button type="button" className={btnGhost} onClick={handleNext} disabled={saving}>
                Saltar
              </button>
            ) : null}
            {savedPreview ? (
              <button type="button" className={btnPrimary} onClick={handleNext} disabled={saving}>
                {isLast ? 'Terminar' : 'Siguiente ↵'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </dialog>
  )
}

export default CoverSearchModal
