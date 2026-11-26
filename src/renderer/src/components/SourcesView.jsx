import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  ArrowLeft,
  Archive,
  Camera,
  Eye,
  Play,
  ExternalLink,
  FileText,
  Globe,
  Inbox,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  SquarePlay,
  Trash2,
  X
} from 'lucide-react'
import AppHeader from './AppHeader'
import SourceViewer from './SourceViewer'
import NoteEditor, { NoteBody } from './NoteEditor'
import ChipAutocomplete from './ChipAutocomplete'
import { askConfirm } from '../utils/askConfirm'
import { findUrlInText, sourceKindLabel } from '../../../shared/sources.js'
import { formatNoteTimestamp, noteTextTitle } from '../../../shared/knowledgeGraph.js'
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
  pageShell,
  searchIcon,
  searchInput,
  segmented,
  segmentedItem
} from '../ui/classes'

const STATUS_TABS = [
  { id: 'inbox', label: 'Bandeja', icon: Inbox },
  { id: 'kept', label: 'Guardadas', icon: Link2 },
  { id: 'archived', label: 'Archivadas', icon: Archive }
]

const KIND_FILTERS = [
  { id: '', label: 'Todo' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'article', label: 'Artículos' },
  { id: 'other', label: 'Otros' }
]

const KIND_ICON = {
  youtube: SquarePlay,
  instagram: Camera,
  article: FileText,
  other: Globe
}

function thumbUrl(source) {
  return source?.thumbnailFile
    ? `course-media://source-thumb/?file=${encodeURIComponent(source.thumbnailFile)}`
    : null
}

function KindIcon({ kind, className }) {
  const Icon = KIND_ICON[kind] || Globe
  return <Icon aria-hidden="true" className={className} />
}

function Thumb({ source, className }) {
  const src = thumbUrl(source)
  if (src) {
    return <img src={src} alt="" loading="lazy" className={cn('object-cover', className)} />
  }
  return (
    <div className={cn('grid place-items-center bg-cream text-ink-faint', className)}>
      <KindIcon kind={source?.kind} className="size-8" />
    </div>
  )
}

function isTypingTarget(target) {
  if (!target) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function SourceCard({ source, selected, highlighted, onSelect }) {
  const meta = [source.author, source.siteName || sourceKindLabel(source.kind)]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      onClick={() => onSelect(source.id)}
      aria-pressed={selected}
      className={cn(
        card,
        cardHover,
        'group flex cursor-pointer flex-col overflow-hidden p-0 text-left',
        selected && 'shadow-ring',
        highlighted && 'animate-pulse shadow-ring'
      )}
    >
      <Thumb source={source} className="aspect-video w-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs text-ink-soft">
          <KindIcon kind={source.kind} className="size-3.5 shrink-0 text-ink-faint" />
          <span className="truncate">{meta}</span>
        </div>
        <p className="m-0 line-clamp-2 font-display text-md leading-snug font-semibold text-ink">
          {source.title}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {source.noteCount ? (
            <span className={badgeNeutral}>
              {source.noteCount} {source.noteCount === 1 ? 'nota' : 'notas'}
            </span>
          ) : null}
          {(source.topics || []).slice(0, 3).map((topic) => (
            <span key={topic.id} className={badgeNeutral}>
              #{topic.title}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

function EditableText({ value, placeholder, onSave, className, inputClassName, label }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  useEffect(() => {
    if (!editing) setDraft(value || '')
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== String(value || '').trim()) onSave(next)
  }

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        className={cn(fieldControl, inputClassName)}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
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
      title={`Editar ${label.toLowerCase()}`}
      onClick={() => setEditing(true)}
      className={cn(
        'group/edit flex w-full cursor-text items-start gap-1.5 rounded-sm border-0 bg-transparent p-0 text-left hover:bg-cream',
        className
      )}
    >
      <span className={cn('min-w-0 flex-1', !value && 'text-ink-faint')}>
        {value || placeholder}
      </span>
      <Pencil
        aria-hidden="true"
        className="mt-1 size-3.5 shrink-0 text-ink-faint opacity-0 group-hover/edit:opacity-100"
      />
    </button>
  )
}

/**
 * `player` is set while a YouTube video is open in the viewer: `{ time, seek }`.
 * `onOpenAt(sec)` opens the viewer at a second when it is closed.
 */
function SourceNotes({ source, player, onOpenAt }) {
  const [notes, setNotes] = useState([])
  const [draft, setDraft] = useState('')
  // The second the note is about: taken when typing starts, so playback can keep going.
  const pinnedTime = useRef(null)
  const timed = source.kind === 'youtube'
  const [editorKey, setEditorKey] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setNotes(await window.api.listSourceNotes(source.id))
    } catch (error) {
      toast.error(error?.message || 'No se pudieron leer las notas')
    }
  }, [source.id])

  useEffect(() => {
    setDraft('')
    setEditingId(null)
    load()
  }, [load])

  useEffect(() => window.api.onNotesChanged?.(() => load()), [load])

  const saveNew = async () => {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    const wasInbox = source.status === 'inbox'
    try {
      const timeSec = timed && player ? (pinnedTime.current ?? player.time) : null
      await window.api.upsertNote(null, {
        body,
        anchors: [
          {
            sourceId: source.id,
            sourceTitle: source.title,
            ...(typeof timeSec === 'number' ? { timeSec: Math.floor(timeSec) } : {})
          }
        ]
      })
      pinnedTime.current = null
      setDraft('')
      setEditorKey((key) => key + 1)
      await load()
      if (wasInbox) {
        toast(
          (t) => (
            <span className="flex items-center gap-3">
              Movida a Guardadas
              <button
                type="button"
                className={cn(btnGhost, btnCompact)}
                onClick={async () => {
                  toast.dismiss(t.id)
                  await window.api.updateSource({ id: source.id, status: 'inbox' })
                }}
              >
                Deshacer
              </button>
            </span>
          ),
          { duration: 6000 }
        )
      }
    } catch (error) {
      toast.error(error?.message || 'No se pudo guardar la nota')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      await window.api.upsertNote(null, { id: editingId, body: editDraft.trim() })
      setEditingId(null)
      await load()
    } catch (error) {
      toast.error(error?.message || 'No se pudo guardar la nota')
    }
  }

  const remove = async (note) => {
    const ok = await askConfirm({
      title: 'Borrar nota',
      message: `Se borrará «${noteTextTitle(note, 60) || 'esta nota'}».`,
      confirmLabel: 'Borrar'
    })
    if (!ok) return
    try {
      await window.api.deleteNote(null, note.id)
      await load()
    } catch (error) {
      toast.error(error?.message || 'No se pudo borrar la nota')
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className={eyebrow}>Notas</h3>
      <div className="flex flex-col gap-2">
        <NoteEditor
          key={`source-${source.id}-${editorKey}`}
          editorKey={`source-${source.id}-${editorKey}`}
          bodyText=""
          placeholder={
            timed && player
              ? `Escribe una nota en ${formatNoteTimestamp(pinnedTime.current ?? player.time)}`
              : '¿Qué vale la pena recordar de esto?'
          }
          compactToolbar
          enableTimestamp={Boolean(timed && player)}
          currentTimeSec={player?.time || 0}
          onSeekTimestamp={player ? (sec) => player.seek(sec) : null}
          onChange={({ markdown }) => {
            const empty = !markdown.trim()
            if (empty) pinnedTime.current = null
            else if (pinnedTime.current == null && player) pinnedTime.current = player.time
            setDraft(markdown)
          }}
        />
        <div className="flex justify-start">
          <button
            type="button"
            className={cn(btnPrimary, btnCompact)}
            disabled={!draft.trim() || saving}
            onClick={saveNew}
          >
            {timed && player && draft.trim()
              ? `Guardar nota en ${formatNoteTimestamp(pinnedTime.current ?? player.time)}`
              : 'Guardar nota'}
          </button>
        </div>
      </div>
      {notes.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {notes.map((note) =>
            editingId === note.id ? (
              <li key={note.id} className="flex flex-col gap-2">
                <NoteEditor
                  key={`edit-${note.id}`}
                  editorKey={`edit-${note.id}`}
                  bodyText={note.body}
                  autofocus
                  compactToolbar
                  onChange={({ markdown }) => setEditDraft(markdown)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className={cn(btnQuiet, btnCompact)}
                    onClick={() => setEditingId(null)}
                  >
                    Cancelar
                  </button>
                  <button type="button" className={cn(btnPrimary, btnCompact)} onClick={saveEdit}>
                    Guardar
                  </button>
                </div>
              </li>
            ) : (
              <li key={note.id} className={cn(card, 'group/note px-3 pt-2.5 pb-1.5')}>
                <div className="mb-1 flex items-center gap-2 text-xs text-ink-soft">
                  {typeof note.timeSec === 'number' ? (
                    timed ? (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border-0 bg-coral-soft px-2 py-0.5 text-xs font-medium text-coral-deep tabular-nums hover:bg-coral/15"
                        title="Ir a este momento del video"
                        onClick={() =>
                          player ? player.seek(note.timeSec) : onOpenAt?.(note.timeSec)
                        }
                      >
                        <Play aria-hidden="true" className="size-3 fill-current" />
                        Ir a {formatNoteTimestamp(note.timeSec)}
                      </button>
                    ) : (
                      <span className={badgeNeutral}>{formatNoteTimestamp(note.timeSec)}</span>
                    )
                  ) : null}
                  <span>{new Date(note.createdAt || Date.now()).toLocaleDateString('es')}</span>
                  <span className="ml-auto flex gap-1 opacity-0 group-hover/note:opacity-100 group-focus-within/note:opacity-100">
                    <button
                      type="button"
                      className={iconOnly}
                      aria-label="Editar nota"
                      title="Editar nota"
                      onClick={() => {
                        setEditDraft(note.body || '')
                        setEditingId(note.id)
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={iconOnly}
                      aria-label="Borrar nota"
                      title="Borrar nota"
                      onClick={() => remove(note)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </span>
                </div>
                <NoteBody body={note.body} />
                {note.topics?.length ? (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {note.topics.map((topic) => (
                      <span key={topic.id} className={badgeNeutral}>
                        #{topic.title}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            )
          )}
        </ul>
      ) : (
        <p className="m-0 text-sm text-ink-soft">
          Aún no hay notas. La primera nota mueve este enlace de Bandeja a Guardadas.
        </p>
      )}
    </section>
  )
}

function SourcePanel({ source, topics, viewing, player, onView, onOpenAt, onClose, onDeleted }) {
  const [refreshing, setRefreshing] = useState(false)

  const update = async (patch) => {
    try {
      await window.api.updateSource({ id: source.id, ...patch })
    } catch (error) {
      toast.error(error?.message || 'No se pudo guardar')
    }
  }

  const topicTitles = (source.topics || []).map((topic) => topic.title)

  const setTopics = async (titles) => {
    try {
      const ids = []
      for (const title of titles) {
        const known = topics.find(
          (topic) => topic.title.toLowerCase() === String(title).trim().toLowerCase()
        )
        ids.push(known ? known.id : (await window.api.upsertTopic({ title })).id)
      }
      await update({ topicIds: ids })
    } catch (error) {
      toast.error(error?.message || 'No se pudo guardar el tema')
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      await window.api.refreshSource(source.id)
      toast.success('Datos actualizados')
    } catch (error) {
      toast.error(error?.message || 'No se pudo leer el enlace')
    } finally {
      setRefreshing(false)
    }
  }

  const remove = async () => {
    const count = source.noteCount || 0
    const ok = await askConfirm({
      title: 'Borrar fuente',
      message: count
        ? `${count} ${count === 1 ? 'nota apunta' : 'notas apuntan'} a este enlace. Las notas se quedan, solo pierden el enlace.`
        : 'Se borrará este enlace guardado.',
      confirmLabel: 'Borrar'
    })
    if (!ok) return
    try {
      await window.api.deleteSource(source.id)
      onDeleted()
    } catch (error) {
      toast.error(error?.message || 'No se pudo borrar')
    }
  }

  return (
    <aside
      aria-label="Fuente"
      className="flex w-[min(30rem,46vw)] shrink-0 flex-col overflow-hidden border-l border-ink/8 bg-surface max-[900px]:w-full"
    >
      <div className="flex items-center gap-2 border-b border-ink/8 px-4 py-2">
        <KindIcon kind={source.kind} className="size-4 text-ink-faint" />
        <span className="text-sm text-ink-soft">{sourceKindLabel(source.kind)}</span>
        <button
          type="button"
          className={cn(iconOnly, 'ml-auto')}
          aria-label="Cerrar"
          title="Cerrar"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-4 py-4">
        {viewing ? null : (
          <button
            type="button"
            className="group/thumb relative block cursor-pointer overflow-hidden rounded-md border border-ink/8 bg-transparent p-0"
            onClick={onView}
            title="Ver aquí"
          >
            <Thumb source={source} className="aspect-video w-full" />
            <span className="absolute inset-0 grid place-items-center bg-ink/0 text-white opacity-0 transition-opacity group-hover/thumb:bg-ink/35 group-hover/thumb:opacity-100">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1.5 text-sm font-semibold">
                <Eye aria-hidden="true" className="size-4" />
                Ver aquí
              </span>
            </span>
          </button>
        )}
        <div className="flex flex-col gap-1">
          <EditableText
            label="Título"
            value={source.title}
            placeholder="Sin título"
            onSave={(title) => title && update({ title })}
            className="font-display text-lg leading-snug font-semibold text-ink"
          />
          <EditableText
            label="Autor"
            value={source.author}
            placeholder="Añadir autor"
            onSave={(author) => update({ author })}
            className="text-sm text-ink-soft"
          />
          <p className="m-0 truncate text-xs text-ink-faint" title={source.url}>
            {source.url}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {viewing ? null : (
            <button type="button" className={cn(btnPrimary, btnCompact)} onClick={onView}>
              <Eye aria-hidden="true" className="size-3.5" />
              Ver aquí
            </button>
          )}
          <button
            type="button"
            className={cn(btnGhost, btnCompact)}
            onClick={() => window.api.openSourceUrl(source.id)}
          >
            <ExternalLink aria-hidden="true" className="size-3.5" />
            Abrir enlace
          </button>
          <button
            type="button"
            className={cn(btnQuiet, btnCompact)}
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-3.5" />
            )}
            Actualizar datos
          </button>
        </div>
        <div className={cn(segmented, 'self-start')} role="group" aria-label="Estado">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={segmentedItem}
              aria-pressed={source.status === tab.id}
              onClick={() => source.status !== tab.id && update({ status: tab.id })}
            >
              <tab.icon aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>
        <ChipAutocomplete
          id={`source-topics-${source.id}`}
          label="Temas"
          values={topicTitles}
          options={topics.map((topic) => topic.title)}
          onChange={setTopics}
          placeholder="Añade un tema…"
        />
        <SourceNotes source={source} player={player} onOpenAt={onOpenAt} />
        <div className="border-t border-ink/8 pt-4">
          <button type="button" className={cn(btnDanger, btnCompact)} onClick={remove}>
            <Trash2 aria-hidden="true" className="size-3.5" />
            Borrar fuente
          </button>
        </div>
      </div>
    </aside>
  )
}

function SourcesView({ onNavigate, openTarget }) {
  const [sources, setSources] = useState([])
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [linkText, setLinkText] = useState('')
  const [adding, setAdding] = useState(false)
  const [status, setStatus] = useState('inbox')
  const [kind, setKind] = useState('')
  const [topicId, setTopicId] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [highlightId, setHighlightId] = useState(null)
  // The viewer replaces the grid while a link is open in it.
  const [viewing, setViewing] = useState(null) // { id, startSec, nonce }
  const [playerTime, setPlayerTime] = useState(0)
  const viewerRef = useRef(null)
  const linkInputRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const [list, topicList] = await Promise.all([
        window.api.listSources(),
        window.api.listTopics()
      ])
      setSources(list || [])
      setTopics(topicList || [])
    } catch (error) {
      toast.error(error?.message || 'No se pudieron leer las fuentes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => window.api.onSourcesChanged?.(() => load()), [load])
  useEffect(() => window.api.onNotesChanged?.(() => load()), [load])

  useEffect(() => {
    if (!highlightId) return undefined
    const timer = setTimeout(() => setHighlightId(null), 1600)
    return () => clearTimeout(timer)
  }, [highlightId])

  const showSource = useCallback((source) => {
    setStatus(source.status || 'inbox')
    setKind('')
    setTopicId('')
    setQuery('')
    setSelectedId(source.id)
    setHighlightId(source.id)
  }, [])

  const addLink = useCallback(
    async (raw) => {
      const url = findUrlInText(raw)
      if (!url) {
        toast.error('Pega un enlace que empiece por https://')
        return
      }
      setAdding(true)
      try {
        const result = await window.api.addSource({ url })
        setLinkText('')
        await load()
        showSource(result.source)
        if (result.existed) toast('Ya estaba guardado')
        else if (result.ok === false) {
          toast(
            `Guardado sin datos: ${result.reason || 'no se pudo leer la página'}. Puedes editar el título.`
          )
        }
      } catch (error) {
        toast.error(error?.message || 'No se pudo guardar el enlace')
      } finally {
        setAdding(false)
      }
    },
    [load, showSource]
  )

  // Pasting a link anywhere in the view (outside a field) saves it.
  useEffect(() => {
    const onPaste = (event) => {
      if (isTypingTarget(event.target)) return
      const text = event.clipboardData?.getData('text') || ''
      if (!findUrlInText(text)) return
      event.preventDefault()
      addLink(text)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addLink])

  const counts = useMemo(() => {
    const out = { inbox: 0, kept: 0, archived: 0 }
    for (const source of sources) out[source.status] = (out[source.status] || 0) + 1
    return out
  }, [sources])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sources.filter((source) => {
      if (source.status !== status) return false
      if (kind && source.kind !== kind) return false
      if (topicId && !(source.topicIds || []).includes(topicId)) return false
      if (!q) return true
      return [source.title, source.author, source.siteName, source.url]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    })
  }, [sources, status, kind, topicId, query])

  const usedTopics = useMemo(() => {
    const ids = new Set(sources.flatMap((source) => source.topicIds || []))
    return topics.filter((topic) => ids.has(topic.id))
  }, [sources, topics])

  const selected = sources.find((source) => source.id === selectedId) || null
  const viewingSource = viewing && selected && viewing.id === selected.id ? selected : null

  const openViewer = useCallback((source, sec = null) => {
    if (!source) return
    const startSec =
      typeof sec === 'number'
        ? sec
        : typeof source.lastPositionSec === 'number'
          ? source.lastPositionSec
          : source.startSec || 0
    setSelectedId(source.id)
    setPlayerTime(startSec || 0)
    // A jump to a chosen second starts playing; reopening where you left off does not.
    setViewing({ id: source.id, startSec, autoplay: typeof sec === 'number', nonce: Date.now() })
  }, [])

  const openAt = useCallback(
    (sec) => {
      if (viewingSource && viewerRef.current) viewerRef.current.seek(sec)
      else openViewer(selected, sec)
    },
    [viewingSource, selected, openViewer]
  )

  // Opened from Anotaciones or the graph: show that link, at that second when there is one.
  const handledTarget = useRef(null)
  useEffect(() => {
    if (!openTarget?.id || loading || handledTarget.current === openTarget.at) return
    const source = sources.find((item) => item.id === openTarget.id)
    handledTarget.current = openTarget.at
    if (!source) {
      toast.error('Esa fuente ya no está guardada')
      return
    }
    setStatus(source.status || 'inbox')
    if (viewing?.id === source.id && viewerRef.current && typeof openTarget.timeSec === 'number') {
      viewerRef.current.seek(openTarget.timeSec)
      return
    }
    openViewer(source, typeof openTarget.timeSec === 'number' ? openTarget.timeSec : null)
  }, [openTarget, loading, sources, viewing, openViewer])

  const player =
    viewingSource?.kind === 'youtube'
      ? { time: playerTime, seek: (sec) => viewerRef.current?.seek(sec) }
      : null

  const emptyText = sources.length
    ? status === 'inbox' && !kind && !topicId && !query
      ? 'Nada pendiente'
      : 'Ninguna fuente coincide'
    : 'Pega un enlace de YouTube, un artículo o una publicación'

  return (
    <div className={pageShell}>
      <AppHeader
        active="sources"
        onNavigate={onNavigate}
        center={
          <form
            className="relative flex w-full max-w-[34rem] items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              addLink(linkText)
            }}
          >
            <Link2 className={searchIcon} aria-hidden="true" />
            <input
              ref={linkInputRef}
              className={searchInput}
              value={linkText}
              placeholder="Pega un enlace"
              aria-label="Pega un enlace"
              onChange={(event) => setLinkText(event.target.value)}
              disabled={adding}
            />
            <button
              type="submit"
              className={cn(btnPrimary, 'shrink-0')}
              disabled={adding || !linkText.trim()}
            >
              {adding ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              Guardar
            </button>
          </form>
        }
      >
        <div className={segmented} role="group" aria-label="Estado">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={segmentedItem}
              aria-pressed={status === tab.id}
              onClick={() => setStatus(tab.id)}
            >
              <tab.icon aria-hidden="true" />
              {tab.label}
              <span className="text-xs text-ink-faint tabular-nums">{counts[tab.id] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
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
        </div>
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
        <div className="relative ml-auto w-full max-w-[16rem]">
          <Search className={searchIcon} aria-hidden="true" />
          <input
            className={searchInput}
            value={query}
            placeholder="Buscar"
            aria-label="Buscar fuentes"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </AppHeader>
      <div className="flex min-h-0 flex-1 max-[900px]:flex-col">
        {viewingSource ? (
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-ink/8 bg-surface px-3 py-1.5">
              <button
                type="button"
                className={cn(btnQuiet, 'h-8 px-2')}
                onClick={() => setViewing(null)}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Fuentes
              </button>
              <span className="truncate text-sm text-ink-soft">{viewingSource.title}</span>
            </div>
            <div className="min-h-0 flex-1">
              <SourceViewer
                key={`${viewingSource.id}-${viewing.nonce}`}
                ref={viewerRef}
                source={viewingSource}
                startSec={viewing.startSec}
                autoplay={viewing.autoplay}
                onTime={setPlayerTime}
              />
            </div>
          </main>
        ) : (
          <main className="min-h-0 min-w-0 flex-1 overflow-auto px-6 py-6">
            {loading ? (
              <p className="mt-12 text-center text-ink-soft">Cargando…</p>
            ) : visible.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
                {visible.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    selected={source.id === selectedId}
                    highlighted={source.id === highlightId}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            ) : (
              <div className="mx-auto mt-16 flex max-w-[26rem] flex-col items-center gap-3 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-coral-soft text-coral">
                  <Link2 className="size-5" aria-hidden="true" />
                </span>
                <p className="m-0 font-display text-lg font-semibold">{emptyText}</p>
                {!sources.length ? (
                  <p className="m-0 text-sm text-ink-soft">
                    Pega el enlace arriba o en cualquier parte de esta vista.
                  </p>
                ) : null}
              </div>
            )}
          </main>
        )}
        {selected ? (
          <SourcePanel
            key={selected.id}
            source={selected}
            topics={topics}
            viewing={Boolean(viewingSource)}
            player={player}
            onView={() => openViewer(selected)}
            onOpenAt={openAt}
            onClose={() => {
              setViewing(null)
              setSelectedId(null)
            }}
            onDeleted={() => {
              setViewing(null)
              setSelectedId(null)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

export default SourcesView
