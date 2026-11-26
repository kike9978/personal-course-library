import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Layers, Plus, Settings } from 'lucide-react'
import AppNav from './AppNav'
import FlashcardBuilder from './FlashcardBuilder'
import { CardImage, CardText } from './flashcards/CardFace'
import { CardFields, TypeBadge } from './flashcards/CardReview'
import { checkCardFields, clozeNumbers, formatClock } from '../../../shared/flashcardCards.js'
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

const smallBtn = 'px-3 py-[0.35rem] text-[0.8rem]'
const ankiField =
  'w-full rounded-md border border-ink/10 bg-surface px-3 py-[0.5rem] text-[0.85rem] text-ink outline-none focus:shadow-focus'

function syncSummary(result) {
  const parts = []
  if (result.added) parts.push(result.added === 1 ? '1 nueva' : `${result.added} nuevas`)
  if (result.updated)
    parts.push(result.updated === 1 ? '1 actualizada' : `${result.updated} actualizadas`)
  if (result.images) parts.push(result.images === 1 ? '1 imagen' : `${result.images} imágenes`)
  const head = parts.length ? `Anki: ${parts.join(', ')}.` : 'Anki ya estaba al día.'
  const extra = []
  if (result.failed) extra.push(`${result.failed} no entraron`)
  if (result.missingImages) extra.push(`${result.missingImages} imágenes no se encontraron`)
  return extra.length ? `${head} ${extra.join(', ')}.` : head
}

function AnkiBar({ status, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ url: '', apiKey: '', parent: '' })

  const openSettings = async () => {
    try {
      const saved = await window.api.getAnkiSettings()
      setForm({ url: saved.url || '', apiKey: saved.apiKey || '', parent: saved.parent ?? '' })
      setOpen(true)
    } catch (err) {
      toast.error(err?.message || 'No se pudieron leer los ajustes de Anki')
    }
  }

  const save = async (event) => {
    event.preventDefault()
    try {
      await window.api.setAnkiSettings(form)
      setOpen(false)
      onRefresh?.()
    } catch (err) {
      toast.error(err?.message || 'No se guardaron los ajustes')
    }
  }

  const label = !status
    ? 'Buscando Anki…'
    : status.ok
      ? 'Anki conectado'
      : status.code === 'KEY'
        ? 'Anki pide una clave'
        : 'Anki cerrado o sin AnkiConnect'

  return (
    <div className="mx-auto mb-4 flex max-w-[60rem] flex-col gap-2 rounded-lg border border-ink/10 bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[0.85rem]">
          <span
            className={cn(
              'size-2 rounded-full',
              status?.ok ? 'bg-teal' : status ? 'bg-coral' : 'bg-ink/30'
            )}
          />
          {label}
        </span>
        <div className="flex gap-2">
          <button type="button" className={cn(btnGhost, smallBtn)} onClick={onRefresh}>
            Comprobar
          </button>
          <button
            type="button"
            className={cn(btnGhost, smallBtn)}
            aria-label="Ajustes de Anki"
            title="Ajustes de Anki"
            onClick={() => (open ? setOpen(false) : openSettings())}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
      {status && !status.ok && !open ? (
        <p className="m-0 text-[0.78rem] leading-[1.45] text-ink-soft">
          Abre Anki en el escritorio. Si es la primera vez, instala AnkiConnect en Anki:
          Herramientas → Complementos → Obtener complementos, código <code>2055492159</code>, y
          reinicia Anki. Mientras tanto puedes exportar el mazo a un archivo.
        </p>
      ) : null}
      {open ? (
        <form className="grid gap-2 sm:grid-cols-3" onSubmit={save}>
          <label className="flex flex-col gap-1 text-[0.75rem] font-bold text-ink-soft">
            Dirección de AnkiConnect
            <input
              className={ankiField}
              value={form.url}
              placeholder="http://localhost:8765"
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[0.75rem] font-bold text-ink-soft">
            Clave (si la pusiste)
            <input
              className={ankiField}
              type="password"
              value={form.apiKey}
              onChange={(event) =>
                setForm((current) => ({ ...current, apiKey: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[0.75rem] font-bold text-ink-soft">
            Mazo principal en Anki
            <input
              className={ankiField}
              value={form.parent}
              placeholder="Vacío: sin mazo principal"
              onChange={(event) =>
                setForm((current) => ({ ...current, parent: event.target.value }))
              }
            />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button type="button" className={cn(btnGhost, smallBtn)} onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className={cn(btnPrimary, smallBtn)}>
              Guardar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function DeckAnkiActions({ deck, ankiReady, busy, onSync, onExport }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={cn(btnGhost, smallBtn)}
        disabled={busy || !ankiReady}
        title={ankiReady ? 'Enviar a Anki y sincronizar' : 'Abre Anki para enviar'}
        onClick={() => onSync(deck)}
      >
        {busy ? 'Enviando…' : 'Enviar a Anki'}
      </button>
      <button type="button" className={cn(btnGhost, smallBtn)} onClick={() => onExport(deck)}>
        Exportar archivo
      </button>
      {deck.ankiSyncedAt ? (
        <span className="text-[0.72rem] text-ink-soft">
          En Anki desde {formatWhen(deck.ankiSyncedAt)}
        </span>
      ) : null}
    </div>
  )
}

const cardFace =
  'col-start-1 row-start-1 flex min-h-[14rem] flex-col rounded-lg border border-ink/10 bg-surface px-6 py-8 text-left shadow-card [backface-visibility:hidden]'
const faceLabel =
  'mb-3 block text-[0.72rem] font-extrabold tracking-[0.04em] text-ink-soft uppercase'
const faceText = 'block font-display text-[1.35rem] leading-[1.35] font-black'

/**
 * Reverse cards are studied both ways, and a cloze once per blank (as in Anki),
 * so each part of a code block is asked on its own. Every other card once.
 */
function studyItems(cards) {
  const items = []
  for (const card of cards) {
    const blanks = card.type === 'cloze' ? clozeNumbers(card.front) : []
    if (blanks.length > 1) {
      for (const n of blanks) items.push({ key: `${card.id}:c${n}`, card, blank: n })
    } else if (card.type === 'reverse') {
      items.push({ key: `${card.id}:f`, card, backward: false })
      items.push({ key: `${card.id}:b`, card, backward: true })
    } else {
      items.push({ key: card.id, card, backward: false })
    }
  }
  return items
}

function sameAnswer(typed, answer) {
  const norm = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  return Boolean(norm(typed)) && norm(typed) === norm(answer)
}

function frontOf(item) {
  const { card, backward } = item
  if (card.type === 'cloze') {
    return {
      label: 'Completa',
      body: <CardText text={card.front} hide={item.blank ?? 'all'} />
    }
  }
  if (card.type === 'reverse') {
    return backward
      ? { label: 'Definición', body: <CardText text={card.back} /> }
      : { label: 'Término', body: <CardText text={card.front} /> }
  }
  return { label: 'Pregunta', body: <CardText text={card.front} /> }
}

function backOf(item, typed) {
  const { card, backward } = item
  if (card.type === 'cloze') {
    return {
      label: 'Respuesta',
      body: <CardText text={card.front} focus={item.blank ?? null} />,
      extra: card.back ? <CardText text={card.back} /> : ''
    }
  }
  if (card.type === 'reverse') {
    return backward
      ? { label: 'Término', body: <CardText text={card.front} /> }
      : { label: 'Definición', body: <CardText text={card.back} /> }
  }
  if (card.type === 'typein') {
    const hit = sameAnswer(typed, card.back)
    return {
      label: 'Respuesta',
      body: card.back,
      extra: typed ? (hit ? `✓ Escribiste «${typed}»` : `✗ Escribiste «${typed}»`) : ''
    }
  }
  return { label: 'Respuesta', body: <CardText text={card.back} /> }
}

function StudyCard({ item, flipped, onFlip, typed }) {
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const front = frontOf(item)
  const back = backOf(item, typed)
  const { card } = item

  return (
    <button
      type="button"
      className="w-full cursor-pointer border-0 bg-transparent p-0 [perspective:1100px]"
      aria-pressed={flipped}
      aria-label={flipped ? 'Volver a la pregunta' : 'Mostrar la respuesta'}
      onClick={onFlip}
    >
      <span
        className={cn(
          'grid w-full [transform-style:preserve-3d]',
          animate &&
            'transition-transform duration-[640ms] ease-[cubic-bezier(0.45,0.05,0.2,1)] motion-reduce:transition-none',
          flipped && '[transform:rotateY(180deg)]'
        )}
      >
        <span className={cardFace}>
          <span className={faceLabel}>{front.label}</span>
          <span className={faceText}>{front.body}</span>
        </span>
        <span className={cn(cardFace, 'bg-cream [transform:rotateY(180deg)]')}>
          <span className={faceLabel}>{back.label}</span>
          <span className={faceText}>{back.body}</span>
          {back.extra ? (
            <span className="mt-3 block text-[0.95rem] leading-[1.45] text-ink-soft">
              {back.extra}
            </span>
          ) : null}
          <CardImage image={card.image} className="mt-4 self-center" />
          {card.source ? (
            <span className="mt-auto block pt-4 text-[0.75rem] text-ink-soft">{card.source}</span>
          ) : null}
        </span>
      </span>
    </button>
  )
}

function CardEditor({ card, onCancel, onSave }) {
  const [draft, setDraft] = useState({ ...card })
  const [saving, setSaving] = useState(false)
  const valid = checkCardFields(draft).ok
  const images = card.image ? [{ ...card.image }] : []
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ink/10 bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <TypeBadge type={card.type} />
        <span className="text-[0.78rem] text-ink-soft">Editar tarjeta</span>
      </div>
      <CardFields
        card={draft}
        images={images}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className={cn(btnGhost, smallBtn)} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className={cn(btnPrimary, smallBtn)}
          disabled={!valid || saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onSave({ front: draft.front, back: draft.back, image: draft.image || null })
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function cleanError(err, fallback) {
  return String(err?.message || fallback).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )
}

function FlashcardsView({ courses = [], onNavigate, onOpenNote, onOpenLesson }) {
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [deckId, setDeckId] = useState(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [typed, setTyped] = useState('')
  const [editing, setEditing] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)
  const [anki, setAnki] = useState(null)
  const [syncingId, setSyncingId] = useState(null)
  const [builder, setBuilder] = useState(null)

  const checkAnki = useCallback(async () => {
    setAnki(null)
    try {
      setAnki(await window.api.ankiStatus())
    } catch (err) {
      setAnki({ ok: false, code: 'ERROR', error: err?.message || '' })
    }
  }, [])

  useEffect(() => {
    checkAnki()
  }, [checkAnki])

  const putDeck = (saved) =>
    setDecks((current) => {
      const exists = current.some((item) => item.id === saved.id)
      return exists
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current]
    })

  const syncDeck = async (item) => {
    if (syncingId) return
    setSyncingId(item.id)
    try {
      const result = await window.api.syncDeckToAnki(item.id)
      putDeck(result.deck)
      const summary = syncSummary(result)
      if (result.synced) toast.success(`${summary} Sincronizado con AnkiWeb.`)
      else toast(`${summary} No se sincronizó con AnkiWeb: ${result.syncError}`, { duration: 7000 })
    } catch (err) {
      toast.error(cleanError(err, 'No se pudo enviar a Anki'))
      checkAnki()
    } finally {
      setSyncingId(null)
    }
  }

  const exportDeck = async (item) => {
    try {
      const result = await window.api.exportDeckForAnki(item.id)
      if (result?.canceled) return
      toast.success(
        result.mediaCount
          ? `Exportado. En Anki: Archivo → Importar el .txt y copia las ${result.mediaCount} imágenes de la carpeta «imagenes» a collection.media.`
          : 'Exportado. En Anki: Archivo → Importar y elige el .txt.',
        { duration: 9000 }
      )
    } catch (err) {
      toast.error(cleanError(err, 'No se pudo exportar'))
    }
  }

  const refresh = useCallback(async () => {
    const list = await window.api.listDecks()
    setDecks(list || [])
    return list || []
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'No se pudieron cargar las tarjetas')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  const deck = decks.find((item) => item.id === deckId) || null
  const queue = useMemo(() => {
    const cards = deck?.cards || []
    return studyItems(pendingOnly ? cards.filter((card) => !card.known) : cards)
  }, [deck, pendingOnly])
  const item = queue[index] || null
  const card = item?.card || null

  useEffect(() => {
    setIndex(0)
    setFlipped(false)
    setEditing(false)
  }, [deckId, pendingOnly])

  useEffect(() => {
    if (index > 0 && index >= queue.length) setIndex(Math.max(0, queue.length - 1))
  }, [index, queue.length])

  useEffect(() => {
    setTyped('')
  }, [item?.key])

  const showCard = (next) => {
    setIndex(next)
    setFlipped(false)
    setEditing(false)
  }

  const markKnown = async (known) => {
    if (!deck || !card) return
    try {
      const saved = await window.api.setDeckCardKnown(deck.id, card.id, known)
      putDeck(saved)
      setFlipped(false)
      if (!known || !pendingOnly) {
        setIndex((value) => (value + 1 >= queue.length ? 0 : value + 1))
      }
    } catch (err) {
      toast.error(cleanError(err, 'No se pudo guardar la tarjeta'))
    }
  }

  const saveEdit = async (patch) => {
    try {
      putDeck(await window.api.updateDeckCard(deck.id, card.id, patch))
      setEditing(false)
      toast.success('Tarjeta guardada')
    } catch (err) {
      toast.error(cleanError(err, 'No se pudo guardar la tarjeta'))
    }
  }

  const removeCard = async () => {
    const ok = await askConfirm({
      title: 'Quitar tarjeta',
      message: deck.ankiSyncedAt
        ? 'Se quita de este mazo. Si ya está en Anki, allí se queda; bórrala en Anki si no la quieres.'
        : 'Se quita de este mazo.',
      confirmLabel: 'Quitar'
    })
    if (!ok) return
    try {
      putDeck(await window.api.deleteDeckCard(deck.id, card.id))
      setFlipped(false)
      setEditing(false)
    } catch (err) {
      toast.error(cleanError(err, 'No se pudo quitar la tarjeta'))
    }
  }

  const removeDeck = async (target) => {
    const ok = await askConfirm({
      title: 'Borrar mazo',
      message: `Se borra «${target.title}» y sus tarjetas. Las notas se quedan.`,
      confirmLabel: 'Borrar'
    })
    if (!ok) return
    try {
      await window.api.deleteDeck(target.id)
      if (deckId === target.id) setDeckId(null)
      await refresh()
      toast.success('Mazo borrado')
    } catch (err) {
      toast.error(cleanError(err, 'No se pudo borrar el mazo'))
    }
  }

  return (
    <div className={pageWash}>
      {builder ? (
        <FlashcardBuilder
          courses={courses}
          decks={decks}
          initialTarget={builder.target || 'new'}
          onClose={() => setBuilder(null)}
          onSaved={(saved) => putDeck(saved)}
          onOpenDecks={(saved) => {
            if (saved?.id) setDeckId(saved.id)
          }}
        />
      ) : null}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-ink/10 bg-surface-muted px-5 py-4 backdrop-blur-[10px]">
        <div className="flex min-w-0 flex-col gap-[0.2rem]">
          <h1 className="m-0 font-display text-[1.35rem] font-black tracking-[-0.02em] text-ink">
            Tarjetas
          </h1>
          <AppNav active="flashcards" onSelect={onNavigate} />
        </div>
        <button
          type="button"
          className={cn(btnPrimary, 'inline-flex items-center gap-2')}
          onClick={() => setBuilder({ target: 'new' })}
        >
          <Plus size={16} /> Nuevo mazo
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        {loading ? (
          <p className="text-ink-soft">Cargando…</p>
        ) : deck ? (
          <div className="mx-auto flex max-w-[36rem] flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className={btnGhost} onClick={() => setDeckId(null)}>
                Mazos
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setBuilder({ target: deck.id })}
                >
                  Añadir tarjetas
                </button>
                <button
                  type="button"
                  className={cn(btnGhost, pendingOnly && 'border-coral text-coral-deep')}
                  aria-pressed={pendingOnly}
                  onClick={() => setPendingOnly((value) => !value)}
                >
                  Solo pendientes
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="m-0 font-display text-[1.4rem] font-black">{deck.title}</h2>
              <DeckAnkiActions
                deck={deck}
                ankiReady={Boolean(anki?.ok)}
                busy={syncingId === deck.id}
                onSync={syncDeck}
                onExport={exportDeck}
              />
              <p className="mt-1 mb-0 flex items-center gap-2 text-[0.82rem] text-ink-soft">
                {queue.length
                  ? `${Math.min(index + 1, queue.length)} / ${queue.length}`
                  : 'No quedan pendientes en este mazo.'}
                {card ? <TypeBadge type={card.type} /> : null}
              </p>
            </div>
            {card && editing ? (
              <CardEditor
                key={card.id}
                card={card}
                onCancel={() => setEditing(false)}
                onSave={saveEdit}
              />
            ) : card ? (
              <>
                <StudyCard
                  key={item.key}
                  item={item}
                  typed={typed}
                  flipped={flipped}
                  onFlip={() => setFlipped((value) => !value)}
                />
                {card.type === 'typein' && !flipped ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      setFlipped(true)
                    }}
                  >
                    <input
                      className="min-w-0 flex-1 rounded-md border border-ink/10 bg-surface px-3 py-[0.55rem] text-ink outline-none focus:shadow-focus"
                      value={typed}
                      placeholder="Escribe la respuesta"
                      aria-label="Tu respuesta"
                      onChange={(event) => setTyped(event.target.value)}
                    />
                    <button type="submit" className={btnGhost}>
                      Comprobar
                    </button>
                  </form>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => showCard(index <= 0 ? queue.length - 1 : index - 1)}
                  >
                    Anterior
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnGhost} onClick={() => setFlipped(true)}>
                      Mostrar
                    </button>
                    <button type="button" className={btnGhost} onClick={() => markKnown(false)}>
                      Otra vez
                    </button>
                    <button type="button" className={btnPrimary} onClick={() => markKnown(true)}>
                      {card.known ? 'Aprendida' : 'La sé'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => showCard(index + 1 >= queue.length ? 0 : index + 1)}
                  >
                    Siguiente
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {onOpenLesson && card.lessonPath && card.coursePath ? (
                    <button
                      type="button"
                      className={cn(btnGhost, smallBtn)}
                      onClick={() =>
                        onOpenLesson({
                          coursePath: card.coursePath,
                          lessonRelativePath: card.lessonPath,
                          timeSec: card.timeSec
                        })
                      }
                    >
                      Ver en el video
                      {typeof card.timeSec === 'number' ? ` · ${formatClock(card.timeSec)}` : ''}
                    </button>
                  ) : null}
                  {onOpenNote && card.noteId ? (
                    <button
                      type="button"
                      className={cn(btnGhost, smallBtn)}
                      onClick={() =>
                        onOpenNote({ id: card.noteId, coursePath: card.coursePath || null })
                      }
                    >
                      Ver nota
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={cn(btnGhost, smallBtn)}
                    onClick={() => setEditing(true)}
                  >
                    Editar
                  </button>
                  <button type="button" className={cn(btnGhost, smallBtn)} onClick={removeCard}>
                    Quitar
                  </button>
                </div>
              </>
            ) : (
              <p className="text-ink-soft">Marca Solo pendientes otra vez para verlas todas.</p>
            )}
          </div>
        ) : decks.length === 0 ? (
          <div className="mx-auto flex max-w-[30rem] flex-col items-start gap-3 pt-6">
            <Layers className="size-8 text-coral" />
            <p className="m-0 text-[0.95rem] leading-[1.45]">
              Todavía no hay mazos. Crea uno desde un curso (sus notas y subtítulos), o en
              Anotaciones marca notas sueltas.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => setBuilder({ target: 'new' })}
              >
                Crear desde un curso
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => onNavigate?.('annotations')}
              >
                Ir a anotaciones
              </button>
            </div>
          </div>
        ) : (
          <>
            <AnkiBar status={anki} onRefresh={checkAnki} />
            <ul className="m-0 mx-auto grid max-w-[60rem] list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 p-0">
              {decks.map((entry) => {
                const known = entry.cards.filter((cardItem) => cardItem.known).length
                return (
                  <li key={entry.id}>
                    <article className="flex h-full flex-col gap-2 rounded-lg border border-ink/10 bg-surface p-4 shadow-card">
                      <button
                        type="button"
                        className="cursor-pointer border-0 bg-transparent p-0 text-left"
                        onClick={() => setDeckId(entry.id)}
                      >
                        <strong className="font-display text-[1.05rem]">{entry.title}</strong>
                        <span className="mt-1 block text-[0.8rem] text-ink-soft">
                          {entry.cards.length === 1
                            ? '1 tarjeta'
                            : `${entry.cards.length} tarjetas`}
                          {known ? ` · ${known} aprendidas` : ''}
                        </span>
                        {entry.updatedAt ? (
                          <span className="mt-1 block text-[0.75rem] text-ink-soft">
                            {formatWhen(entry.updatedAt)}
                          </span>
                        ) : null}
                      </button>
                      <div className="mt-auto flex flex-col gap-2">
                        <DeckAnkiActions
                          deck={entry}
                          ankiReady={Boolean(anki?.ok)}
                          busy={syncingId === entry.id}
                          onSync={syncDeck}
                          onExport={exportDeck}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={cn(btnGhost, smallBtn)}
                            onClick={() => setBuilder({ target: entry.id })}
                          >
                            Añadir tarjetas
                          </button>
                          <button
                            type="button"
                            className={cn(btnGhost, smallBtn)}
                            onClick={() => removeDeck(entry)}
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

export default FlashcardsView
