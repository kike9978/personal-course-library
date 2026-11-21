import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { flattenOutline } from '../../../shared/cierres.js'
import AppNav from './AppNav'
import CierreComposer from './CierreComposer'
import { askConfirm } from '../utils/askConfirm'
import { cn } from '../ui/cn'
import { btnGhost, btnPrimary } from '../ui/classes'

const pageWash =
  'h-screen flex flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_0%,rgba(232,69,112,0.05),transparent_40%),radial-gradient(circle_at_88%_8%,rgba(61,122,122,0.05),transparent_38%),var(--color-cream-deep)]'

function formatWhen(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return ''
  }
}

function StarIcon({ filled }) {
  return (
    <svg className="size-[1rem]" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.6 9.7 5.7l4.5.4-3.4 2.9.1 4.5L8 11.6 4.1 13.5l1-4.5L1.8 6.1l4.5-.4L8 1.6Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CierresFeed({ courses, onNavigate, onOpenCourse }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [coursePath, setCoursePath] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [outline, setOutline] = useState([])
  const [composer, setComposer] = useState(null)
  const [openThread, setOpenThread] = useState(null)
  const [followup, setFollowup] = useState('')

  const titleByPath = useMemo(() => {
    const map = {}
    for (const course of courses) map[course.path] = course.title || course.path
    return map
  }, [courses])

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const list = await window.api.listCierres()
      setItems(list || [])
    } catch (err) {
      toast.error(err.message || 'No se pudieron cargar los cierres')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => window.api.onCierresChanged?.(() => void load({ quiet: true })), [load])

  useEffect(() => {
    if (!coursePath) {
      setOutline([])
      return
    }
    let cancel = false
    window.api
      .scanCourse(coursePath)
      .then((tree) => {
        if (!cancel) setOutline(flattenOutline(tree?.sections))
      })
      .catch(() => {
        if (!cancel) setOutline([])
      })
    return () => {
      cancel = true
    }
  }, [coursePath])

  const courseOptions = useMemo(() => {
    const paths = new Set(items.map((item) => item.coursePath))
    return courses
      .filter((course) => paths.has(course.path))
      .sort((a, b) =>
        (a.title || a.path).localeCompare(b.title || b.path, undefined, { sensitivity: 'base' })
      )
  }, [courses, items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (favoritesOnly && !item.favorite) return false
      if (coursePath && item.coursePath !== coursePath) return false
      if (sectionId && (item.sectionId || '') !== sectionId) return false
      if (!q) return true
      const hay = [
        item.title,
        item.learned,
        item.differently,
        item.sectionTitle,
        titleByPath[item.coursePath]
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, favoritesOnly, coursePath, sectionId, query, titleByPath])

  const sectionCounts = useMemo(() => {
    const counts = new Map()
    for (const item of items) {
      if (item.coursePath !== coursePath) continue
      const key = item.sectionId || ''
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return counts
  }, [items, coursePath])

  const selectedSection = outline.find((row) => row.id === sectionId) || null
  const sectionEmpty = Boolean(
    coursePath && sectionId && selectedSection && (sectionCounts.get(sectionId) || 0) === 0
  )

  const toggleFavorite = async (item) => {
    const next = !item.favorite
    setItems((list) => list.map((row) => (row.id === item.id ? { ...row, favorite: next } : row)))
    try {
      await window.api.setCierreFavorite(item.id, next)
    } catch (err) {
      setItems((list) =>
        list.map((row) => (row.id === item.id ? { ...row, favorite: item.favorite } : row))
      )
      toast.error(err.message || 'No se pudo marcar')
    }
  }

  const remove = async (item) => {
    const ok = await askConfirm({
      title: 'Quitar cierre',
      message: 'Se quita la publicación. El proyecto o la lección siguen como estaban.',
      confirmLabel: 'Quitar',
      cancelLabel: 'Cancelar'
    })
    if (!ok) return
    try {
      await window.api.deleteCierre(item.id)
      if (openThread === item.id) setOpenThread(null)
    } catch (err) {
      toast.error(err.message || 'No se pudo quitar')
    }
  }

  const addFollowup = async (item) => {
    const body = followup.trim()
    if (!body) return
    try {
      const saved = await window.api.upsertCierreComment(item.id, { body })
      setItems((list) => list.map((row) => (row.id === saved.id ? saved : row)))
      setFollowup('')
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar el seguimiento')
    }
  }

  const removeFollowup = async (item, comment) => {
    try {
      const saved = await window.api.deleteCierreComment(item.id, comment.id)
      setItems((list) => list.map((row) => (row.id === saved.id ? saved : row)))
    } catch (err) {
      toast.error(err.message || 'No se pudo quitar el seguimiento')
    }
  }

  const openSubject = (item) => {
    const course = courses.find((entry) => entry.path === item.coursePath)
    if (!course) {
      toast.error('Curso no encontrado en la biblioteca')
      return
    }
    if (item.projectId) onOpenCourse?.(course, { projectId: item.projectId })
    else if (item.lessonRelativePath) {
      onOpenCourse?.(course, { lessonRelativePath: item.lessonRelativePath })
    }
  }

  const openFolder = async (item) => {
    if (!item.projectId) return
    try {
      await window.api.openProjectLink(item.coursePath, item.projectId)
    } catch (err) {
      toast.error(err.message || 'No se pudo abrir la carpeta')
    }
  }

  return (
    <div className={pageWash}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink/10 bg-surface-muted px-5 py-4 backdrop-blur-[10px]">
        <div className="flex min-w-0 flex-col gap-[0.2rem]">
          <h1 className="m-0 font-display text-[1.35rem] font-black tracking-[-0.02em] text-ink">
            Cierres
          </h1>
          <AppNav active="cierres" onSelect={onNavigate} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-[0.65rem] max-[900px]:ml-0 max-[900px]:w-full">
          <button
            type="button"
            className={cn(
              btnGhost,
              'px-3 py-[0.4rem] text-[0.8rem] shadow-none',
              favoritesOnly && 'border-coral text-coral-deep'
            )}
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((value) => !value)}
          >
            Favoritos
          </button>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cierre…"
            aria-label="Buscar cierres"
            className="w-[min(100%,280px)] rounded-full border border-ink/10 bg-surface py-[0.55rem] pr-4 pl-4 text-ink shadow-none outline-none"
          />
          <button
            type="button"
            className={btnPrimary}
            onClick={() => setComposer({ picker: true })}
          >
            Publicar
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] max-[900px]:grid-cols-1">
        <aside className="flex min-h-0 flex-col gap-1 overflow-auto border-r border-ink/10 px-3 py-4 max-[900px]:border-r-0 max-[900px]:border-b">
          <RailButton
            active={!coursePath && !favoritesOnly}
            label="Todos"
            count={items.length}
            onClick={() => {
              setCoursePath('')
              setSectionId('')
              setFavoritesOnly(false)
            }}
          />
          {courseOptions.map((course) => {
            const count = items.filter((item) => item.coursePath === course.path).length
            const active = coursePath === course.path
            return (
              <div key={course.path} className="flex flex-col gap-1">
                <RailButton
                  active={active && !sectionId}
                  label={course.title || course.path}
                  count={count}
                  onClick={() => {
                    setCoursePath(course.path)
                    setSectionId('')
                  }}
                />
                {active
                  ? outline.map((section) => {
                      const sectionCount = sectionCounts.get(section.id) || 0
                      return (
                        <RailButton
                          key={section.id}
                          nested
                          active={sectionId === section.id}
                          label={section.label}
                          count={sectionCount}
                          empty={sectionCount === 0}
                          onClick={() => setSectionId(section.id)}
                        />
                      )
                    })
                  : null}
              </div>
            )
          })}
        </aside>

        <div className="min-h-0 overflow-auto px-5 py-4">
          {loading ? (
            <p className="mt-12 text-center text-ink-soft">Cargando…</p>
          ) : sectionEmpty ? (
            <p className="mt-12 text-center text-ink-soft">
              {selectedSection.title} todavía no tiene un cierre.
            </p>
          ) : filtered.length === 0 ? (
            <p className="mx-auto mt-12 max-w-[36rem] text-center text-ink-soft">
              {items.length === 0
                ? 'Cuando marques un proyecto como hecho o completes una lección, puedes publicar qué entregaste y qué aprendiste.'
                : 'Nada coincide con este filtro.'}
            </p>
          ) : (
            <div className="mx-auto flex max-w-[720px] flex-col gap-4">
              {filtered.map((item) => {
                const comments = item.comments || []
                const threadOpen = openThread === item.id
                return (
                  <article
                    key={item.id}
                    className="flex flex-col gap-3 rounded-lg border border-ink/10 bg-surface p-4 shadow-card"
                  >
                    <header className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[0.75rem] font-bold tracking-[0.03em] text-ink-soft uppercase">
                          {titleByPath[item.coursePath] || item.coursePath}
                          {item.sectionTitle ? ` · ${item.sectionTitle}` : ''}
                          {formatWhen(item.publishedAt) ? ` · ${formatWhen(item.publishedAt)}` : ''}
                        </p>
                        <h2 className="m-0 mt-1 font-display text-[1.2rem] font-black tracking-[-0.02em]">
                          {item.title}
                        </h2>
                      </div>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-ink/10 bg-cream',
                          item.favorite ? 'text-coral' : 'text-ink-soft'
                        )}
                        aria-pressed={item.favorite}
                        aria-label={item.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
                        onClick={() => void toggleFavorite(item)}
                      >
                        <StarIcon filled={item.favorite} />
                      </button>
                    </header>
                    {item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt=""
                        className="max-h-[280px] w-full rounded-md border border-ink/10 object-cover"
                      />
                    ) : null}
                    <p className="m-0 whitespace-pre-wrap leading-relaxed">{item.learned}</p>
                    {item.differently ? (
                      <p className="m-0 whitespace-pre-wrap leading-relaxed text-ink-soft">
                        <span className="font-extrabold text-ink">Qué haría distinto. </span>
                        {item.differently}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btnGhost} onClick={() => openSubject(item)}>
                        {item.projectId ? 'Abrir proyecto' : 'Abrir lección'}
                      </button>
                      {item.projectId ? (
                        <button
                          type="button"
                          className={btnGhost}
                          onClick={() => void openFolder(item)}
                        >
                          Abrir carpeta
                        </button>
                      ) : null}
                      <button type="button" className={btnGhost} onClick={() => setComposer(item)}>
                        Editar
                      </button>
                      <button type="button" className={btnGhost} onClick={() => void remove(item)}>
                        Quitar
                      </button>
                    </div>
                    <div className="border-t border-ink/10 pt-3">
                      <button
                        type="button"
                        className="cursor-pointer border-0 bg-transparent p-0 text-[0.82rem] font-extrabold text-ink-soft"
                        aria-expanded={threadOpen}
                        onClick={() => {
                          setOpenThread(threadOpen ? null : item.id)
                          setFollowup('')
                        }}
                      >
                        Seguimiento{comments.length ? ` · ${comments.length}` : ''}
                      </button>
                      {threadOpen ? (
                        <div className="mt-3 flex flex-col gap-3">
                          {comments.map((comment) => (
                            <div key={comment.id} className="flex items-start gap-3">
                              <p className="m-0 min-w-0 flex-1 whitespace-pre-wrap text-[0.92rem] leading-relaxed">
                                {comment.body}
                              </p>
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-[0.75rem] font-bold text-ink-soft"
                                onClick={() => void removeFollowup(item, comment)}
                              >
                                Quitar
                              </button>
                            </div>
                          ))}
                          <form
                            className="flex gap-2"
                            onSubmit={(event) => {
                              event.preventDefault()
                              void addFollowup(item)
                            }}
                          >
                            <input
                              className="min-w-0 flex-1 rounded-full border border-ink/10 bg-cream px-3 py-2 text-ink outline-none"
                              value={followup}
                              onChange={(event) => setFollowup(event.target.value)}
                              placeholder="Añadir seguimiento"
                              aria-label="Añadir seguimiento"
                            />
                            <button type="submit" className={btnPrimary}>
                              Añadir
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <CierreComposer
        open={Boolean(composer)}
        picker={Boolean(composer?.picker)}
        initial={composer?.picker ? null : composer}
        courses={courses}
        onClose={() => setComposer(null)}
        onSaved={() => setComposer(null)}
      />
    </div>
  )
}

function RailButton({ active, label, count, nested = false, empty = false, onClick }) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-[0.4rem] text-left text-[0.85rem] font-bold text-ink hover:bg-ink/5',
        nested && 'pl-4 text-[0.8rem] font-semibold',
        empty && 'text-ink-soft',
        active && 'bg-ink/5 text-coral-deep'
      )}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[0.72rem] font-bold text-ink-soft">{empty ? 'sin cierre' : count}</span>
    </button>
  )
}

export default CierresFeed
