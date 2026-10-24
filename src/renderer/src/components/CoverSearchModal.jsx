import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

function coverQueryFor(course) {
  return [course?.institution, course?.title]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
}

function withIds(candidates) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate, index) => ({
    ...candidate,
    id: `${index}-${candidate.imageUrl || index}`
  }))
}

function errorText(err, fallback) {
  let message = String(err?.message || fallback)
  const remote = message.match(/^Error invoking remote method '[^']+':\s*(.*)$/)
  if (remote?.[1]) message = remote[1]
  message = message.replace(/^Error:\s*/i, '')
  return message || fallback
}

function imageUrlFromDrop(dataTransfer) {
  const uriList = String(dataTransfer?.getData('text/uri-list') || '')
  const fromList = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('https://') || line.startsWith('data:image/'))
  if (fromList) return fromList

  const plain = String(dataTransfer?.getData('text/plain') || '').trim()
  if (plain.startsWith('https://') || plain.startsWith('data:image/')) return plain

  const html = String(dataTransfer?.getData('text/html') || '')
  const src = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
  if (src && (src.startsWith('https://') || src.startsWith('data:image/'))) return src

  const downloadUrl = String(dataTransfer?.getData('DownloadURL') || '')
  const fromDownload = downloadUrl.split(':').slice(2).join(':')
  if (fromDownload.startsWith('https://')) return fromDownload
  return ''
}

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl).match(
    /^data:image\/(?:jpeg|jpg|png|webp);base64,([a-z0-9+/=\s]+)$/i
  )
  if (!match) throw new Error('El archivo no es una imagen JPG, PNG o WebP')
  const binary = atob(match[1].replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function droppedImageFile(dataTransfer) {
  return [...(dataTransfer?.files || [])].find((file) => {
    const type = String(file.type || '').toLowerCase()
    if (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') return true
    return /\.(jpe?g|png|webp)$/i.test(file.name || '')
  })
}

function CoverSearchModal({ courses = [], initialStep = 'select', onClose }) {
  const dialogRef = useRef(null)
  const runId = useRef(0)
  const searchAbort = useRef(null)
  const savedCount = useRef(0)
  const toasted = useRef(false)
  const closed = useRef(false)
  const [step, setStep] = useState(
    initialStep === 'choose' || initialStep === 'search' ? 'choose' : 'select'
  )
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set(courses.map((course) => course.path)))
  const [progress, setProgress] = useState({ done: 0, total: courses.length, title: '' })
  const [items, setItems] = useState([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [queryDraft, setQueryDraft] = useState(() =>
    initialStep === 'choose' || initialStep === 'search' ? coverQueryFor(courses[0]) : ''
  )
  const [selectedId, setSelectedId] = useState(null)
  const [researching, setResearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const dropHandlerRef = useRef(null)

  const finishToast = () => {
    if (toasted.current || savedCount.current === 0) return
    toasted.current = true
    const count = savedCount.current
    toast.success(count === 1 ? '1 portada guardada' : `${count} portadas guardadas`)
  }

  const handleClose = () => {
    if (closed.current) return
    closed.current = true
    searchAbort.current?.abort()
    runId.current += 1
    finishToast()
    if (dialogRef.current?.open) dialogRef.current.close()
    onClose?.()
  }

  useEffect(() => {
    const dialog = dialogRef.current
    const frame = requestAnimationFrame(() => {
      if (dialog && !dialog.open) {
        try {
          dialog.showModal()
        } catch (err) {
          console.error('Failed to open cover search dialog:', err)
        }
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const showItem = (index, list) => {
    const item = list[index]
    if (!item) {
      handleClose()
      return
    }
    setReviewIndex(index)
    setQueryDraft(item.query || '')
    setSelectedId(item.candidates[0]?.id || null)
    setStep('review')
  }

  const runSearch = async (list, signal, id, queryOverride = '') => {
    setStep('searching')
    setProgress({
      done: 0,
      total: list.length,
      title: list[0]?.title || list[0]?.path || ''
    })
    const next = []
    for (let i = 0; i < list.length; i++) {
      if (signal?.aborted || runId.current !== id) return
      const course = list[i]
      const override = list.length === 1 ? String(queryOverride || '').trim() : ''
      const courseQuery = override || coverQueryFor(course)
      setProgress({
        done: i,
        total: list.length,
        title: course.title || course.path
      })
      let result
      try {
        result = await window.api.searchCoverCandidates({
          coursePath: course.path,
          query: courseQuery
        })
      } catch (err) {
        result = {
          query: courseQuery,
          candidates: [],
          error: errorText(err, 'No se pudo buscar portadas')
        }
      }
      if (signal?.aborted || runId.current !== id) return
      next.push({
        course,
        query: result?.query || courseQuery,
        candidates: withIds(result?.candidates),
        error: result?.error || null
      })
      setProgress({
        done: i + 1,
        total: list.length,
        title: course.title || course.path
      })
    }
    if (signal?.aborted || runId.current !== id) return
    setItems(next)
    setProgress({ done: list.length, total: list.length, title: '' })
    showItem(0, next)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((course) => {
      const hay = `${course.path} ${course.title || ''} ${course.institution || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [courses, query])

  const selectedCount = selected.size
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((course) => selected.has(course.path))
  const current = items[reviewIndex] || null
  const selectedCandidate =
    current?.candidates?.find((candidate) => candidate.id === selectedId) || null

  const handleBackdropClick = (e) => {
    if (saving || researching) return
    if (e.target === dialogRef.current) handleClose()
  }

  const toggleOne = (coursePath) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(coursePath)) next.delete(coursePath)
      else next.add(coursePath)
      return next
    })
  }

  const startSearch = () => {
    const chosen = courses.filter((course) => selected.has(course.path))
    if (chosen.length === 0) return
    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    const id = ++runId.current
    runSearch(chosen, controller.signal, id)
  }

  const startChosenSearch = () => {
    const course = courses[0]
    const nextQuery = queryDraft.trim()
    if (!course || !nextQuery || saving) return
    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    const id = ++runId.current
    runSearch([course], controller.signal, id, nextQuery)
  }

  const handleResearch = async () => {
    if (!current || researching || saving) return
    const nextQuery = queryDraft.trim()
    if (!nextQuery) return
    setResearching(true)
    try {
      const result = await window.api.searchCoverCandidates({
        coursePath: current.course.path,
        query: nextQuery
      })
      const candidates = withIds(result?.candidates)
      const updated = {
        ...current,
        query: result?.query || nextQuery,
        candidates,
        error: result?.error || null
      }
      setItems((prev) => prev.map((item, index) => (index === reviewIndex ? updated : item)))
      setQueryDraft(updated.query)
      setSelectedId(candidates[0]?.id || null)
    } catch (err) {
      toast.error(errorText(err, 'No se pudo buscar'))
    } finally {
      setResearching(false)
    }
  }

  const handleSkip = () => {
    if (saving) return
    const nextIndex = reviewIndex + 1
    if (nextIndex >= items.length) {
      handleClose()
      return
    }
    showItem(nextIndex, items)
  }

  const advanceAfterSave = () => {
    savedCount.current += 1
    const nextIndex = reviewIndex + 1
    if (items.length === 0 || nextIndex >= items.length) {
      handleClose()
      return
    }
    showItem(nextIndex, items)
  }

  const handleUse = async () => {
    if (!current || !selectedCandidate || saving) return
    setSaving(true)
    try {
      const result = await window.api.saveCourseCover({
        coursePath: current.course.path,
        imageUrl: selectedCandidate.imageUrl,
        thumbUrl: selectedCandidate.thumbUrl
      })
      if (!result?.success) throw new Error(result?.error || 'No se pudo guardar la portada')
      advanceAfterSave()
    } catch (err) {
      toast.error(errorText(err, 'No se pudo guardar la portada'))
    } finally {
      if (!closed.current) setSaving(false)
    }
  }

  const handleOpenGoogle = async () => {
    const nextQuery = queryDraft.trim()
    if (!nextQuery) return
    try {
      await window.api.openGoogleImageSearch(nextQuery)
    } catch (err) {
      toast.error(errorText(err, 'No se pudo abrir el navegador'))
    }
  }

  const handleDrop = async (event) => {
    const course = step === 'choose' ? courses[0] : current?.course
    if (!course || saving || researching) return
    setSaving(true)
    try {
      const file = droppedImageFile(event.dataTransfer)
      let result
      if (file) {
        const data = new Uint8Array(await file.arrayBuffer())
        result = await window.api.saveCourseCoverFromData({
          coursePath: course.path,
          data
        })
      } else {
        const imageUrl = imageUrlFromDrop(event.dataTransfer)
        if (!imageUrl) throw new Error('Arrastra una imagen JPG, PNG o WebP')
        if (imageUrl.startsWith('data:')) {
          result = await window.api.saveCourseCoverFromData({
            coursePath: course.path,
            data: dataUrlToBytes(imageUrl)
          })
        } else {
          result = await window.api.saveCourseCover({
            coursePath: course.path,
            imageUrl
          })
        }
      }
      if (!result?.success) throw new Error(result?.error || 'No se pudo guardar la portada')
      advanceAfterSave()
    } catch (err) {
      toast.error(errorText(err, 'No se pudo usar esa imagen'))
    } finally {
      if (!closed.current) setSaving(false)
    }
  }

  dropHandlerRef.current = handleDrop

  useEffect(() => {
    if (step !== 'review' && step !== 'choose') return undefined
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
      dropHandlerRef.current?.(event)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      clearTimeout(timer)
      setDragOver(false)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [step])

  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <dialog
      ref={dialogRef}
      className={`dialog dialog--covers${dragOver ? ' is-dragover' : ''}`}
      onClose={handleClose}
      onClick={handleBackdropClick}
    >
      {step === 'select' ? (
        <>
          <div className="dialog__preview">
            <div>
              <h3>Buscar portadas</h3>
              <p className="dialog__lead">
                Elige cursos sin imagen. Se buscará en la web con la academia y el título, y podrás
                elegir una opción por curso.
              </p>
            </div>
          </div>
          <div className="dialog__form">
            <div className="import-props__toolbar">
              <input
                type="search"
                className="import-props__search"
                placeholder="Filtrar cursos…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filtrar cursos"
              />
              <div className="import-props__bulk">
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  onClick={() => {
                    setSelected((prev) => {
                      const next = new Set(prev)
                      for (const course of filtered) {
                        if (allFilteredSelected) next.delete(course.path)
                        else next.add(course.path)
                      }
                      return next
                    })
                  }}
                  disabled={filtered.length === 0}
                >
                  {allFilteredSelected ? 'Deseleccionar visibles' : 'Seleccionar visibles'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  onClick={() => setSelected(new Set())}
                  disabled={selectedCount === 0}
                >
                  Ninguno
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  onClick={() => setSelected(new Set(courses.map((course) => course.path)))}
                  disabled={courses.length === 0 || selectedCount === courses.length}
                >
                  Todos
                </button>
              </div>
            </div>
            <div className="import-props__list" role="listbox" aria-multiselectable="true">
              {filtered.length === 0 ? (
                <p className="import-props__empty">No hay cursos que coincidan.</p>
              ) : (
                filtered.map((course) => {
                  const checked = selected.has(course.path)
                  return (
                    <label
                      key={course.path}
                      className={`import-props__row${checked ? ' is-selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(course.path)}
                      />
                      <span className="import-props__meta">
                        <span className="import-props__title">{course.title || course.path}</span>
                        <span className="import-props__folder">{course.path}</span>
                        <span className="import-props__hint">
                          {course.institution || 'Sin academia'}
                        </span>
                      </span>
                    </label>
                  )
                })
              )}
            </div>
            <div className="dialog__actions dialog__actions--spread">
              <span className="import-props__count">
                {selectedCount} de {courses.length} seleccionado{selectedCount === 1 ? '' : 's'}
              </span>
              <div className="dialog__actions-btns">
                <button type="button" className="btn btn--ghost" onClick={handleClose}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={startSearch}
                  disabled={selectedCount === 0}
                >
                  Buscar portadas
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {step === 'choose' && courses[0] ? (
        <>
          <div className="dialog__preview">
            <div>
              <h3>{courses[0].hasCover ? 'Reemplazar portada' : 'Buscar portada'}</h3>
              <p className="dialog__lead">
                {courses[0].institution ? `${courses[0].institution} · ` : ''}
                {courses[0].hasCover
                  ? 'La imagen actual se sustituye cuando guardes otra.'
                  : 'Elige cómo conseguir la imagen. La búsqueda web no empieza sola.'}
              </p>
              <p className="cover-search__course">{courses[0].title || courses[0].path}</p>
            </div>
          </div>
          <div className="dialog__form">
            <div className="field">
              <label htmlFor="cover-query">Búsqueda</label>
              <input
                id="cover-query"
                type="text"
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
              />
            </div>
            <div className="cover-search__query">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleOpenGoogle}
                disabled={saving || !queryDraft.trim()}
              >
                Google Imágenes
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={startChosenSearch}
                disabled={saving || !queryDraft.trim()}
              >
                Buscar en la web
              </button>
            </div>
            <p className={`cover-search__drop-hint${dragOver ? ' is-active' : ''}`}>
              {dragOver
                ? 'Suelta para usar esta imagen'
                : 'Arrastra una imagen desde el navegador a esta ventana.'}
            </p>
            <div className="dialog__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleClose}
                disabled={saving}
              >
                Cerrar
              </button>
            </div>
          </div>
        </>
      ) : null}

      {step === 'searching' ? (
        <>
          <div className="dialog__preview">
            <div>
              <h3>Buscando portadas</h3>
              <p className="dialog__lead">
                {progress.total === 0
                  ? 'No hay cursos para buscar.'
                  : `${progress.done} de ${progress.total}`}
              </p>
            </div>
          </div>
          <div className="dialog__form">
            <div
              className="cover-search__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
            >
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <p className="cover-search__status">{progress.title || 'Preparando búsqueda…'}</p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" onClick={handleClose}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      ) : null}

      {step === 'review' && current ? (
        <>
          <div className="dialog__preview">
            <div>
              <h3>Elegir portada</h3>
              <p className="dialog__lead">
                {reviewIndex + 1} de {items.length}
                {current.course.institution ? ` · ${current.course.institution}` : ''}
              </p>
              <p className="cover-search__course">{current.course.title || current.course.path}</p>
            </div>
          </div>
          <div className="dialog__form">
            <div className="field">
              <label htmlFor="cover-query">Búsqueda</label>
              <div className="cover-search__query">
                <input
                  id="cover-query"
                  type="text"
                  value={queryDraft}
                  onChange={(e) => setQueryDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleResearch()
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={handleResearch}
                  disabled={researching || saving || !queryDraft.trim()}
                >
                  {researching ? 'Buscando…' : 'Buscar de nuevo'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={handleOpenGoogle}
                  disabled={saving || !queryDraft.trim()}
                >
                  Google Imágenes
                </button>
              </div>
            </div>
            <p className={`cover-search__drop-hint${dragOver ? ' is-active' : ''}`}>
              {dragOver
                ? 'Suelta para usar esta imagen'
                : 'O abre Google Imágenes y arrastra una foto a esta ventana.'}
            </p>

            {current.error ? <p className="cover-search__error">{current.error}</p> : null}

            {current.candidates.length > 0 ? (
              <div
                className="cover-search__grid"
                role="radiogroup"
                aria-label="Opciones de portada"
              >
                {current.candidates.map((candidate) => {
                  const isSelected = candidate.id === selectedId
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`cover-search__option${isSelected ? ' is-selected' : ''}`}
                      onClick={() => setSelectedId(candidate.id)}
                      disabled={researching || saving}
                    >
                      <span className="cover-search__thumb">
                        <img src={candidate.dataUrl} alt="" />
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="import-props__empty">Sin imágenes para esta búsqueda.</p>
            )}

            {selectedCandidate?.source ? (
              <p className="cover-search__source">{selectedCandidate.source}</p>
            ) : null}

            <div className="dialog__actions dialog__actions--spread">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleClose}
                disabled={saving}
              >
                Cerrar
              </button>
              <div className="dialog__actions-btns">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={handleSkip}
                  disabled={saving}
                >
                  Saltar
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleUse}
                  disabled={saving || researching || !selectedCandidate}
                >
                  {saving ? 'Guardando…' : 'Usar esta'}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  )
}

export default CoverSearchModal
