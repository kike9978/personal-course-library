import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { cierreGallery, flattenOutline } from '../../../shared/cierres.js'
import {
  ExternalLink,
  Flag,
  FolderOpen,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X
} from 'lucide-react'
import AppHeader from './AppHeader'
import CierreComposer from './CierreComposer'
import CierreImageViewer from './CierreImageViewer'
import { askConfirm } from '../utils/askConfirm'
import { cn } from '../ui/cn'
import {
  btnCompact,
  btnGhost,
  btnOn,
  btnPrimary,
  cardLg,
  eyebrow,
  fieldControl,
  iconOnly,
  pageShell,
  searchIcon,
  searchInput
} from '../ui/classes'


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
  const [viewer, setViewer] = useState(null)

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
        item.projectTitle,
        item.lessonTitle,
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
    <div className={pageShell}>
      <AppHeader
        active="cierres"
        onNavigate={onNavigate}
        center={
          <div className="relative w-full max-w-[22rem]">
            <Search className={searchIcon} aria-hidden="true" />
            <input
              type="search"
              data-search-field=""
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cierre…"
              aria-label="Buscar cierres"
              title="Buscar (Ctrl+F)"
              className={searchInput}
            />
          </div>
        }
        actions={
          <>
            <button
              type="button"
              className={cn(btnGhost, favoritesOnly && btnOn)}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((value) => !value)}
            >
              <Star
                size={15}
                aria-hidden="true"
                className={favoritesOnly ? 'fill-current' : undefined}
              />
              Favoritos
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => setComposer({ picker: true })}
            >
              <Plus size={16} aria-hidden="true" />
              Publicar
            </button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] max-[900px]:grid-cols-1">
        <aside className="flex min-h-0 flex-col gap-0.5 overflow-auto border-r border-ink/8 bg-surface px-3 py-4 max-[900px]:border-r-0 max-[900px]:border-b">
          <p className={cn(eyebrow, 'mb-1.5 px-2.5')}>Cursos</p>
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

        <div className="min-h-0 overflow-auto px-6 py-6">
          {loading ? (
            <p className="mt-12 text-center text-ink-soft">Cargando…</p>
          ) : sectionEmpty || filtered.length === 0 ? (
            <div className="mx-auto mt-16 flex max-w-[26rem] flex-col items-center gap-3 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-coral-soft text-coral">
                <Flag className="size-5" aria-hidden="true" />
              </span>
              <p className="m-0 font-display text-lg font-semibold">
                {sectionEmpty
                  ? `${selectedSection.title} todavía no tiene un cierre`
                  : items.length === 0
                    ? 'Aún no hay cierres'
                    : 'Nada coincide con este filtro'}
              </p>
              {items.length === 0 && !sectionEmpty ? (
                <p className="m-0 text-sm leading-relaxed text-ink-soft">
                  Cuando marques un proyecto como hecho o completes una lección, puedes publicar qué
                  entregaste y qué aprendiste.
                </p>
              ) : null}
              <button
                type="button"
                className={cn(btnPrimary, 'mt-1')}
                onClick={() => setComposer({ picker: true })}
              >
                <Plus size={16} aria-hidden="true" />
                Publicar cierre
              </button>
            </div>
          ) : (
            <div className="mx-auto flex max-w-[680px] flex-col gap-4">
              {filtered.map((item) => {
                const comments = item.comments || []
                const threadOpen = openThread === item.id
                const gallery = cierreGallery(item)
                const ordered = gallery.main ? [gallery.main, ...gallery.rest] : []
                const shown = gallery.rest.slice(0, 4)
                const hidden = gallery.rest.length - shown.length
                return (
                  <article
                    key={item.id}
                    className={cn(cardLg, 'group/post flex flex-col overflow-hidden')}
                  >
                    {gallery.main ? (
                      <div className="border-b border-ink/8">
                        <button
                          type="button"
                          className="block w-full cursor-zoom-in border-0 bg-ink/5 p-0"
                          aria-label="Ver imagen principal"
                          onClick={() => setViewer({ images: ordered, index: 0, title: item.title })}
                        >
                          <img
                            src={gallery.main}
                            alt=""
                            className="max-h-[340px] w-full object-cover"
                          />
                        </button>
                        {shown.length ? (
                          <div className="grid grid-cols-4 gap-0.5 border-t border-ink/8 bg-ink/8">
                            {shown.map((url, index) => {
                              const more = index === shown.length - 1 && hidden > 0
                              return (
                                <button
                                  key={url}
                                  type="button"
                                  className="relative block aspect-[4/3] cursor-zoom-in overflow-hidden border-0 bg-ink/5 p-0"
                                  aria-label={
                                    more
                                      ? `Ver ${hidden} imágenes más`
                                      : `Ver imagen ${index + 2} de ${ordered.length}`
                                  }
                                  onClick={() =>
                                    setViewer({ images: ordered, index: index + 1, title: item.title })
                                  }
                                >
                                  <img
                                    src={url}
                                    alt=""
                                    className="size-full object-cover transition-transform duration-200 hover:scale-[1.03]"
                                  />
                                  {more ? (
                                    <span className="absolute inset-0 grid place-items-center bg-[rgba(23,21,28,0.55)] font-display text-xl font-bold text-white">
                                      +{hidden}
                                    </span>
                                  ) : null}
                                </button>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-3 px-5 pt-4 pb-4">
                      <header className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="m-0 flex min-w-0 items-center gap-1.5 text-xs text-ink-soft">
                            <span className="truncate font-medium text-ink">
                              {titleByPath[item.coursePath] || item.coursePath}
                            </span>
                            {item.sectionTitle ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{item.sectionTitle}</span>
                              </>
                            ) : null}
                            {formatWhen(item.publishedAt) ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="shrink-0">{formatWhen(item.publishedAt)}</span>
                              </>
                            ) : null}
                          </p>
                          <h2 className="m-0 mt-1 font-display text-xl font-bold tracking-tight">
                            {item.title}
                          </h2>
                        </div>
                        <button
                          type="button"
                          className={cn(iconOnly, item.favorite && 'text-coral enabled:hover:text-coral')}
                          aria-pressed={item.favorite}
                          aria-label={item.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
                          title={item.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
                          onClick={() => void toggleFavorite(item)}
                        >
                          <StarIcon filled={item.favorite} />
                        </button>
                      </header>
                      <p className="m-0 text-md leading-relaxed whitespace-pre-wrap">{item.learned}</p>
                      {item.differently ? (
                        <div className="rounded-md border-l-2 border-teal bg-teal-tint/60 px-3.5 py-2.5">
                          <p className={cn(eyebrow, 'mb-1 text-teal')}>Qué haría distinto</p>
                          <p className="m-0 text-base leading-relaxed whitespace-pre-wrap text-ink">
                            {item.differently}
                          </p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          className={cn(btnGhost, btnCompact, 'h-8')}
                          onClick={() => openSubject(item)}
                        >
                          <ExternalLink size={14} aria-hidden="true" />
                          {item.projectId ? 'Abrir proyecto' : 'Abrir lección'}
                        </button>
                        {item.projectId ? (
                          <button
                            type="button"
                            className={cn(btnGhost, btnCompact, 'h-8')}
                            onClick={() => void openFolder(item)}
                          >
                            <FolderOpen size={14} aria-hidden="true" />
                            Abrir carpeta
                          </button>
                        ) : null}
                        <span className="flex-1" />
                        <button
                          type="button"
                          className={iconOnly}
                          title="Editar"
                          aria-label="Editar cierre"
                          onClick={() => setComposer(item)}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={cn(iconOnly, 'enabled:hover:bg-danger-soft enabled:hover:text-danger')}
                          title="Quitar"
                          aria-label="Quitar cierre"
                          onClick={() => void remove(item)}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-ink/6 bg-cream px-5 py-2.5">
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-ink-soft hover:text-ink"
                        aria-expanded={threadOpen}
                        onClick={() => {
                          setOpenThread(threadOpen ? null : item.id)
                          setFollowup('')
                        }}
                      >
                        <MessageSquare size={14} aria-hidden="true" />
                        Seguimiento
                        {comments.length ? (
                          <span className="rounded-full bg-ink/6 px-1.5 text-xs tabular-nums">
                            {comments.length}
                          </span>
                        ) : null}
                      </button>
                      {threadOpen ? (
                        <div className="mt-3 flex flex-col gap-2 pb-1">
                          {comments.map((comment) => (
                            <div
                              key={comment.id}
                              className="group/comment flex items-start gap-2.5 border-l-2 border-ink/10 pl-3"
                            >
                              <p className="m-0 min-w-0 flex-1 text-base leading-relaxed whitespace-pre-wrap">
                                {comment.body}
                              </p>
                              <button
                                type="button"
                                className={cn(iconOnly, 'size-7 opacity-0 group-hover/comment:opacity-100 focus-visible:opacity-100')}
                                title="Quitar seguimiento"
                                aria-label="Quitar seguimiento"
                                onClick={() => void removeFollowup(item, comment)}
                              >
                                <X aria-hidden="true" />
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
                              className={cn(fieldControl, 'min-w-0 flex-1')}
                              value={followup}
                              onChange={(event) => setFollowup(event.target.value)}
                              placeholder="Añadir seguimiento"
                              aria-label="Añadir seguimiento"
                            />
                            <button
                              type="submit"
                              className={btnPrimary}
                              disabled={!followup.trim()}
                            >
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
      {viewer ? (
        <CierreImageViewer
          images={viewer.images}
          index={viewer.index}
          title={viewer.title}
          onIndex={(index) => setViewer((value) => (value ? { ...value, index } : value))}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  )
}

function RailButton({ active, label, count, nested = false, empty = false, onClick }) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-sm font-medium text-ink transition-colors duration-150 hover:bg-ink/5',
        nested && 'ml-2.5 w-[calc(100%-0.625rem)] border-l border-ink/10 rounded-l-none pl-3 text-ink-soft',
        empty && 'text-ink-faint',
        active && 'bg-coral-soft text-coral-deep hover:bg-coral-soft'
      )}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={cn('text-xs tabular-nums', active ? 'text-coral-deep' : 'text-ink-faint')}>
        {empty ? '—' : count}
      </span>
    </button>
  )
}

export default CierresFeed
