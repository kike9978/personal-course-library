import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  ArrowLeft,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  List,
  Pencil,
  Play,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import { NoteBody } from './NoteEditor'
import { KindIcon, Thumb, formatDuration } from './sourceVisuals'
import { askConfirm } from '../utils/askConfirm'
import { collectionDuration, collectionEntries, nextToPlay } from '../../../shared/collections.js'
import { formatNoteTimestamp } from '../../../shared/knowledgeGraph.js'
import { sourceKindLabel } from '../../../shared/sources.js'
import { cn } from '../ui/cn'
import {
  badgeNeutral,
  btnCompact,
  btnDanger,
  btnGhost,
  btnPrimary,
  btnQuiet,
  card,
  cardHover,
  chip,
  eyebrow,
  fieldControl,
  iconOnly,
  menuItem,
  menuDivider,
  popover,
  segmented,
  segmentedItem
} from '../ui/classes'

const KIND_FILTERS = [
  { id: '', label: 'Todo' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'article', label: 'Artículos' },
  { id: 'other', label: 'Otros' }
]

async function saveCollection(payload) {
  try {
    return await window.api.upsertSourceCollection(payload)
  } catch (error) {
    toast.error(error?.message || 'No se pudo guardar la colección')
    return null
  }
}

/** Four thumbnails, or the chosen cover, as a collection's picture. */
function Mosaic({ entries, cover, className }) {
  const chosen = cover ? entries.find((entry) => entry.sourceId === cover) : null
  if (chosen) return <Thumb source={chosen.source} className={cn('w-full', className)} />
  const four = entries.slice(0, 4)
  if (!four.length) {
    return (
      <div className={cn('grid place-items-center bg-cream text-ink-faint', className)}>
        <FolderPlus aria-hidden="true" className="size-8" />
      </div>
    )
  }
  if (four.length < 4) return <Thumb source={four[0].source} className={cn('w-full', className)} />
  return (
    <div className={cn('grid grid-cols-2 grid-rows-2 gap-px bg-ink/8', className)}>
      {four.map((entry) => (
        <Thumb key={entry.sourceId} source={entry.source} className="h-full w-full" />
      ))}
    </div>
  )
}

/**
 * "Guardar en…": add links to collections, or make a new one with them.
 * `sourceIds` is one link (panel) or several (multi-select).
 */
export function SaveToCollectionMenu({ sourceIds, collections, className, onDone, label }) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const ids = (sourceIds || []).filter(Boolean)
  const inside = (collection) =>
    ids.length > 0 && ids.every((id) => collection.items.some((item) => item.sourceId === id))

  const toggle = async (collection) => {
    const all = inside(collection)
    const saved = await saveCollection(
      all ? { id: collection.id, remove: ids } : { id: collection.id, add: ids }
    )
    if (!saved) return
    toast.success(all ? `Quitada de «${saved.title}»` : `Guardada en «${saved.title}»`)
    onDone?.()
  }

  const create = async () => {
    const name = title.trim()
    if (!name) return
    const saved = await saveCollection({ title: name, add: ids })
    if (!saved) return
    toast.success(`Guardada en «${saved.title}»`)
    setTitle('')
    setCreating(false)
    setOpen(false)
    onDone?.()
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        className={cn(btnGhost, btnCompact)}
        disabled={!ids.length}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <FolderPlus aria-hidden="true" className="size-3.5" />
        {label || 'Guardar en…'}
      </button>
      {open ? (
        <div className={cn(popover, 'absolute top-full left-0 z-50 mt-1 w-64 p-1')} role="menu">
          {collections.length ? (
            collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={inside(collection)}
                className={cn(menuItem, 'w-full justify-between')}
                onClick={() => toggle(collection)}
              >
                <span className="truncate">{collection.title}</span>
                <small>{inside(collection) ? '✓' : collection.items.length}</small>
              </button>
            ))
          ) : (
            <p className="m-0 px-2 py-1.5 text-sm text-ink-soft">Aún no hay colecciones.</p>
          )}
          <hr className={menuDivider} />
          {creating ? (
            <form
              className="flex gap-1 p-1"
              onSubmit={(event) => {
                event.preventDefault()
                create()
              }}
            >
              <input
                autoFocus
                className={cn(fieldControl, 'h-8 py-0 text-sm')}
                value={title}
                placeholder="Nombre de la colección"
                aria-label="Nombre de la colección"
                onChange={(event) => setTitle(event.target.value)}
              />
              <button type="submit" className={cn(btnPrimary, btnCompact)} disabled={!title.trim()}>
                Crear
              </button>
            </form>
          ) : (
            <button
              type="button"
              className={cn(menuItem, 'w-full')}
              onClick={() => setCreating(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus aria-hidden="true" className="size-3.5" />
                Nueva colección
              </span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** All collections as cards. */
export function CollectionsHome({ collections, sources, onOpen }) {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const create = async () => {
    const name = title.trim()
    if (!name) return
    const saved = await saveCollection({ title: name })
    if (!saved) return
    setTitle('')
    setCreating(false)
    onOpen(saved.id)
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        {creating ? (
          <form
            className="flex w-full max-w-[26rem] gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              create()
            }}
          >
            <input
              autoFocus
              className={fieldControl}
              value={title}
              placeholder="Nombre de la colección"
              aria-label="Nombre de la colección"
              onChange={(event) => setTitle(event.target.value)}
            />
            <button type="submit" className={btnPrimary} disabled={!title.trim()}>
              Crear
            </button>
            <button type="button" className={btnQuiet} onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </form>
        ) : (
          <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Nueva colección
          </button>
        )}
      </div>
      {collections.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
          {collections.map((collection) => {
            const entries = collectionEntries(collection, sources)
            const duration = collection.layout === 'list' ? collectionDuration(entries) : null
            return (
              <button
                key={collection.id}
                type="button"
                className={cn(
                  card,
                  cardHover,
                  'flex cursor-pointer flex-col overflow-hidden p-0 text-left'
                )}
                onClick={() => onOpen(collection.id)}
              >
                <Mosaic entries={entries} cover={collection.cover} className="aspect-video" />
                <div className="flex flex-col gap-1 px-3 py-2.5">
                  <p className="m-0 line-clamp-2 font-display text-md font-semibold text-ink">
                    {collection.title}
                  </p>
                  <p className="m-0 text-xs text-ink-soft">
                    {collection.layout === 'board' ? 'Tablero' : 'Lista'} · {entries.length}{' '}
                    {entries.length === 1 ? 'enlace' : 'enlaces'}
                    {duration ? ` · ${formatDuration(duration)}` : ''}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mx-auto mt-10 flex max-w-[28rem] flex-col items-center gap-2 text-center">
          <p className="m-0 font-display text-lg font-semibold">Aún no hay colecciones</p>
          <p className="m-0 text-sm text-ink-soft">
            Agrupa enlaces: una lista de videos para ver en orden, o un tablero de referencias.
            Desde una fuente, usa <strong>Guardar en…</strong>.
          </p>
        </div>
      )}
    </div>
  )
}

function Caption({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  useEffect(() => {
    if (!editing) setDraft(value || '')
  }, [value, editing])
  if (editing) {
    return (
      <input
        autoFocus
        className={cn(fieldControl, 'h-7 py-0 text-xs')}
        value={draft}
        maxLength={240}
        placeholder="Por qué está aquí"
        aria-label="Nota corta"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false)
          if (draft.trim() !== (value || '')) onSave(draft.trim())
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(value || '')
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <button
      type="button"
      className="cursor-text border-0 bg-transparent p-0 text-left text-xs text-ink-soft hover:text-ink"
      onClick={(event) => {
        event.stopPropagation()
        setEditing(true)
      }}
    >
      {value || <span className="text-ink-faint">Añadir nota corta</span>}
    </button>
  )
}

/** Drag rows or cards to reorder; drops call `onMove(sourceId, index)`. */
function useReorder(onMove) {
  const dragged = useRef(null)
  const [over, setOver] = useState(null)
  const props = (sourceId, index) => ({
    draggable: true,
    onDragStart: (event) => {
      dragged.current = sourceId
      event.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: (event) => {
      if (!dragged.current) return
      event.preventDefault()
      setOver(index)
    },
    onDragLeave: () => setOver((current) => (current === index ? null : current)),
    onDrop: (event) => {
      event.preventDefault()
      const id = dragged.current
      dragged.current = null
      setOver(null)
      if (id && id !== sourceId) onMove(id, index)
    },
    onDragEnd: () => {
      dragged.current = null
      setOver(null)
    }
  })
  return { props, over }
}

/**
 * One collection: Lista (ordered, like a playlist) or Tablero (masonry, like a board).
 * Both show the same items in the same order; captions and order are shared.
 */
export function CollectionPage({
  collection,
  sources,
  topics,
  selectedId,
  onBack,
  onSelect,
  onPlay
}) {
  const [kind, setKind] = useState('')
  const [topicId, setTopicId] = useState('')
  const [notes, setNotes] = useState([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(collection.title)
  const [draftDescription, setDraftDescription] = useState(collection.description || '')
  useEffect(() => {
    setDraftTitle(collection.title)
    setDraftDescription(collection.description || '')
  }, [collection.title, collection.description])

  const entries = useMemo(() => collectionEntries(collection, sources), [collection, sources])
  const visible = entries.filter(
    (entry) =>
      (!kind || entry.source.kind === kind) &&
      (!topicId || (entry.source.topicIds || []).includes(topicId))
  )
  const filtered = Boolean(kind || topicId)
  const duration = collectionDuration(entries)
  const next = nextToPlay(entries)

  // Notes of the collection: every note on any of its links, newest first.
  const ids = useMemo(() => new Set(entries.map((entry) => entry.sourceId)), [entries])
  useEffect(() => {
    let cancelled = false
    const load = () =>
      window.api.listAllNotes().then((all) => {
        if (cancelled) return
        setNotes(
          (all || [])
            .filter((note) => (note.anchors || []).some((anchor) => ids.has(anchor.sourceId)))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        )
      })
    load()
    const stop = window.api.onNotesChanged?.(() => load())
    return () => {
      cancelled = true
      stop?.()
    }
  }, [ids])

  const update = (patch) => saveCollection({ id: collection.id, ...patch })
  const { props: dragProps, over } = useReorder((sourceId, to) =>
    update({ move: { sourceId, to } })
  )

  const remove = async (entry) => {
    await update({ remove: [entry.sourceId] })
    toast(
      (t) => (
        <span className="flex items-center gap-3">
          Quitada de la colección
          <button
            type="button"
            className={cn(btnGhost, btnCompact)}
            onClick={async () => {
              toast.dismiss(t.id)
              const restored = [...collection.items]
              await update({ items: restored })
            }}
          >
            Deshacer
          </button>
        </span>
      ),
      { duration: 5000 }
    )
  }

  const destroy = async () => {
    const ok = await askConfirm({
      title: 'Borrar colección',
      message: `Se borra «${collection.title}». Los enlaces y sus notas se quedan en Fuentes.`,
      confirmLabel: 'Borrar'
    })
    if (!ok) return
    await window.api.deleteSourceCollection(collection.id)
    onBack()
  }

  const usedTopics = topics.filter((topic) =>
    entries.some((entry) => (entry.source.topicIds || []).includes(topic.id))
  )
  const sourceTitle = (sourceId) =>
    entries.find((entry) => entry.sourceId === sourceId)?.source.title

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <button type="button" className={cn(btnQuiet, 'h-8 px-2')} onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Colecciones
        </button>
      </div>
      <header className="flex flex-wrap items-start gap-5">
        <Mosaic
          entries={entries}
          cover={collection.cover}
          className="aspect-video w-56 shrink-0 overflow-hidden rounded-md border border-ink/8"
        />
        <div className="flex min-w-[16rem] flex-1 flex-col gap-2">
          {editingTitle ? (
            <input
              autoFocus
              className={cn(fieldControl, 'font-display text-xl font-semibold')}
              value={draftTitle}
              aria-label="Nombre de la colección"
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={() => {
                setEditingTitle(false)
                if (draftTitle.trim() && draftTitle.trim() !== collection.title) {
                  update({ title: draftTitle.trim() })
                }
              }}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
          ) : (
            <button
              type="button"
              className="group flex cursor-text items-center gap-2 border-0 bg-transparent p-0 text-left"
              onClick={() => setEditingTitle(true)}
            >
              <h2 className="m-0 font-display text-2xl font-bold tracking-tight text-ink">
                {collection.title}
              </h2>
              <Pencil
                aria-hidden="true"
                className="size-4 text-ink-faint opacity-0 group-hover:opacity-100"
              />
            </button>
          )}
          <textarea
            className={cn(fieldControl, 'min-h-[2.5rem] resize-y text-sm')}
            rows={2}
            value={draftDescription}
            placeholder="De qué va esta colección"
            aria-label="Descripción"
            onChange={(event) => setDraftDescription(event.target.value)}
            onBlur={() =>
              draftDescription.trim() !== (collection.description || '') &&
              update({ description: draftDescription.trim() })
            }
          />
          <p className="m-0 text-sm text-ink-soft">
            {entries.length} {entries.length === 1 ? 'enlace' : 'enlaces'}
            {collection.layout === 'list' && duration ? ` · ${formatDuration(duration)}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {next ? (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => onPlay(next.source, collection.id)}
              >
                <Play aria-hidden="true" className="size-4 fill-current" />
                Reproducir
              </button>
            ) : null}
            <div className={segmented} role="group" aria-label="Vista">
              <button
                type="button"
                className={segmentedItem}
                aria-pressed={collection.layout === 'list'}
                onClick={() => update({ layout: 'list' })}
              >
                <List aria-hidden="true" />
                Lista
              </button>
              <button
                type="button"
                className={segmentedItem}
                aria-pressed={collection.layout === 'board'}
                onClick={() => update({ layout: 'board' })}
              >
                <LayoutGrid aria-hidden="true" />
                Tablero
              </button>
            </div>
            <button
              type="button"
              className={cn(btnDanger, btnCompact, 'ml-auto')}
              onClick={destroy}
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Borrar colección
            </button>
          </div>
        </div>
      </header>

      {entries.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {KIND_FILTERS.map((item) => (
            <button
              key={item.id || 'all'}
              type="button"
              className={chip}
              aria-pressed={kind === item.id}
              onClick={() => setKind(item.id)}
            >
              {item.label}
            </button>
          ))}
          {usedTopics.length ? (
            <select
              className={cn(fieldControl, 'h-8 w-auto py-0 text-sm')}
              value={topicId}
              aria-label="Tema"
              onChange={(event) => setTopicId(event.target.value)}
            >
              <option value="">Todos los temas</option>
              {usedTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          ) : null}
          {filtered ? (
            <span className="text-xs text-ink-faint">
              Con un filtro puesto no se puede reordenar.
            </span>
          ) : null}
        </div>
      ) : (
        <p className="m-0 text-sm text-ink-soft">
          Vacía. Desde una fuente usa <strong>Guardar en…</strong>, o pega un enlace mientras esta
          colección está abierta.
        </p>
      )}

      {collection.layout === 'board' ? (
        <div className="columns-[14rem] gap-3">
          {visible.map((entry) => {
            const index = entries.findIndex((item) => item.sourceId === entry.sourceId)
            return (
              <div
                key={entry.sourceId}
                {...(filtered ? {} : dragProps(entry.sourceId, index))}
                className={cn(
                  card,
                  'group relative mb-3 cursor-pointer break-inside-avoid overflow-hidden',
                  entry.sourceId === selectedId && 'shadow-ring',
                  over === index && 'ring-2 ring-coral/50'
                )}
                onClick={() => onSelect(entry.sourceId)}
              >
                <Thumb source={entry.source} natural />
                <div className="flex flex-col gap-1 px-3 py-2">
                  <p className="m-0 line-clamp-2 text-sm font-semibold text-ink">
                    {entry.source.title}
                  </p>
                  <Caption
                    value={entry.note}
                    onSave={(note) => update({ caption: { sourceId: entry.sourceId, note } })}
                  />
                </div>
                <button
                  type="button"
                  className={cn(
                    iconOnly,
                    'absolute top-2 right-2 bg-surface/90 opacity-0 group-hover:opacity-100 focus:opacity-100'
                  )}
                  aria-label="Quitar de la colección"
                  title="Quitar de la colección"
                  onClick={(event) => {
                    event.stopPropagation()
                    remove(entry)
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {visible.map((entry) => {
            const index = entries.findIndex((item) => item.sourceId === entry.sourceId)
            const source = entry.source
            const watched =
              source.durationSec && (source.lastPositionSec || 0) >= source.durationSec - 30
            return (
              <li
                key={entry.sourceId}
                {...(filtered ? {} : dragProps(entry.sourceId, index))}
                className={cn(
                  'group flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-1.5 hover:bg-surface',
                  entry.sourceId === selectedId && 'border-ink/8 bg-surface shadow-card',
                  over === index && 'border-coral/50'
                )}
                onClick={() => onSelect(entry.sourceId)}
              >
                {!filtered ? (
                  <GripVertical
                    aria-hidden="true"
                    className="size-4 shrink-0 cursor-grab text-ink-faint opacity-0 group-hover:opacity-100"
                  />
                ) : null}
                <span className="w-6 shrink-0 text-right text-sm text-ink-faint tabular-nums">
                  {index + 1}
                </span>
                <Thumb source={source} className="aspect-video w-28 shrink-0 rounded-sm" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="m-0 truncate text-sm font-semibold text-ink">{source.title}</p>
                  <p className="m-0 flex items-center gap-1.5 truncate text-xs text-ink-soft">
                    <KindIcon kind={source.kind} className="size-3.5 shrink-0 text-ink-faint" />
                    {[source.author, sourceKindLabel(source.kind)].filter(Boolean).join(' · ')}
                    {source.durationSec ? ` · ${formatDuration(source.durationSec)}` : ''}
                    {watched ? ' · visto' : ''}
                  </p>
                  <Caption
                    value={entry.note}
                    onSave={(note) => update({ caption: { sourceId: entry.sourceId, note } })}
                  />
                </div>
                {source.kind === 'youtube' ? (
                  <button
                    type="button"
                    className={iconOnly}
                    aria-label="Reproducir"
                    title="Reproducir"
                    onClick={(event) => {
                      event.stopPropagation()
                      onPlay(source, collection.id)
                    }}
                  >
                    <Play aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(iconOnly, 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
                  aria-label="Quitar de la colección"
                  title="Quitar de la colección"
                  onClick={(event) => {
                    event.stopPropagation()
                    remove(entry)
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {notes.length ? (
        <section className="flex flex-col gap-2 border-t border-ink/8 pt-4">
          <h3 className={eyebrow}>Notas de la colección · {notes.length}</h3>
          <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  className={cn(
                    card,
                    cardHover,
                    'block w-full cursor-pointer px-3 pt-2.5 pb-1.5 text-left'
                  )}
                  onClick={() => onSelect(note.sourceId)}
                >
                  <span className="mb-1 flex items-center gap-2 text-xs text-ink-soft">
                    <span className="truncate">{sourceTitle(note.sourceId)}</span>
                    {typeof note.timeSec === 'number' ? (
                      <span className={badgeNeutral}>{formatNoteTimestamp(note.timeSec)}</span>
                    ) : null}
                  </span>
                  <NoteBody body={note.body} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
