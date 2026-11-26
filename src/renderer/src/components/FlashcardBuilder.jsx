import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  buildFlashcardBrief,
  parseConceptReply,
  parseFlashcardBrief,
  planParts,
  uncoveredSources
} from '../../../shared/flashcardBrief.js'
import {
  CARD_TYPES,
  CARD_TYPE_LABELS,
  cardKey,
  checkCardFields
} from '../../../shared/flashcardCards.js'
import { askConfirm } from '../utils/askConfirm'
import {
  btnGhost,
  btnPrimary,
  dialogShell as dialogBase
} from '../ui/classes'
import { cn } from '../ui/cn'
import CardReview from './flashcards/CardReview'
import ScopePicker from './flashcards/ScopePicker'
import { loadScopeSources, notesSources } from './flashcards/scopeSources'

const dialogShell = cn(dialogBase, 'max-h-[min(92vh,60rem)] max-w-[52rem] overflow-auto [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-55')
const sectionBox = 'flex flex-col gap-3 rounded-lg border border-ink/10 bg-surface-muted p-4'
const sectionTitle = 'm-0 font-display text-md font-bold'
const label = 'text-xs font-semibold uppercase tracking-[0.04em] text-ink-soft'
const input =
  'w-full rounded-md border border-ink/10 bg-surface px-3 py-[0.55rem] text-base text-ink outline-none focus:shadow-focus disabled:opacity-60'
const textArea =
  'w-full resize-y rounded-md border border-ink/10 bg-surface px-3 py-[0.55rem] text-xs leading-[1.45] text-ink outline-none focus:shadow-focus'
const note = 'm-0 text-xs leading-[1.45] text-ink-soft'
const small = 'px-3 py-[0.35rem] text-sm'

const DEFAULT_TYPES = ['basic', 'reverse', 'cloze']
const PER_SOURCE = [
  { value: 0, label: 'Auto' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 5, label: '5' }
]

let uidSeed = 0
const nextUid = () => {
  uidSeed += 1
  return `c${uidSeed}`
}

function plural(n, one, many) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`
}

/**
 * Make cards from notes or a course scope, through briefs pasted into a chat.
 * - notes: notes checked in Annotations (no scope picker)
 * - courses: enables choosing a course, its lessons, notes and subtitles
 * - decks / initialTarget: add to an existing deck instead of a new one
 */
function FlashcardBuilder({
  notes = null,
  courses = [],
  decks: givenDecks = null,
  initialTarget = 'new',
  onClose,
  onSaved,
  onOpenDecks
}) {
  const dialogRef = useRef(null)
  const alive = useRef(true)
  const fromNotes = Array.isArray(notes)

  const [scope, setScope] = useState({
    coursePath: '',
    courseTitle: '',
    tree: null,
    lessonPaths: new Set(),
    useNotes: true,
    useSubtitles: false,
    lang: ''
  })
  const [prepared, setPrepared] = useState(null)
  const [preparing, setPreparing] = useState(fromNotes)

  useEffect(() => {
    if (!fromNotes) return undefined
    let cancelled = false
    setPreparing(true)
    notesSources(notes)
      .then((result) => {
        if (!cancelled) setPrepared(result)
      })
      .finally(() => {
        if (!cancelled) setPreparing(false)
      })
    return () => {
      cancelled = true
    }
    // The notes are fixed for this dialog; they are read once.
  }, [])

  const [goal, setGoal] = useState('')
  const [title, setTitle] = useState('')
  const [types, setTypes] = useState(() => new Set(DEFAULT_TYPES))
  const [mode, setMode] = useState('cards')
  const [perSource, setPerSource] = useState(0)
  const [target, setTarget] = useState(initialTarget || 'new')

  const [plan, setPlan] = useState(null)
  const [partIndex, setPartIndex] = useState(0)
  const [answered, setAnswered] = useState(() => new Set())
  const [concepts, setConcepts] = useState([])
  const [pending, setPending] = useState([])
  const [replyTitle, setReplyTitle] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState('')
  const [skips, setSkips] = useState([])
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)

  const [loadedDecks, setLoadedDecks] = useState([])
  const decks = givenDecks || loadedDecks

  useEffect(() => {
    if (givenDecks || typeof window.api?.listDecks !== 'function') return
    window.api
      .listDecks()
      .then((list) => {
        if (alive.current) setLoadedDecks(list || [])
      })
      .catch(() => {})
  }, [givenDecks])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    const frame = requestAnimationFrame(() => {
      if (dialog && !dialog.open) dialog.showModal()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const targetDeck = target === 'new' ? null : decks.find((deck) => deck.id === target) || null
  const locked = Boolean(plan) || Boolean(saved)

  const handleClose = () => {
    dialogRef.current?.close()
    onClose?.()
  }

  const updateScope = (patch) => {
    setScope((current) => ({ ...current, ...patch }))
    setPrepared(null)
  }

  const prepare = async () => {
    if (!scope.coursePath || !scope.tree || !scope.lessonPaths.size) return
    if (!scope.useNotes && !scope.useSubtitles) {
      setError('Elige notas, subtítulos o ambos.')
      return
    }
    setPreparing(true)
    setError('')
    try {
      const result = await loadScopeSources(scope)
      if (!alive.current) return
      setPrepared(result)
      if (!result.sources.length) setError('No hay texto en lo que elegiste.')
    } catch (err) {
      if (alive.current) setError(err?.message || 'No se pudieron leer las fuentes')
    } finally {
      if (alive.current) setPreparing(false)
    }
  }

  const sourcesByRef = useMemo(
    () => new Map((plan?.sources || prepared?.sources || []).map((source) => [source.ref, source])),
    [plan, prepared]
  )

  const startPlan = () => {
    const sources = prepared?.sources || []
    if (!sources.length) return
    const existingCards = targetDeck?.cards || []
    setPlan({
      phase: mode === 'concepts' ? 'concepts' : 'cards',
      sources,
      parts: planParts(sources),
      outline: prepared.outline || '',
      goal: goal.trim(),
      types: CARD_TYPES.filter((type) => types.has(type)),
      perSource,
      concepts: [],
      existingCards,
      existingKeys: existingCards.map(cardKey)
    })
    setPartIndex(0)
    setAnswered(new Set())
    setError('')
    setSkips([])
  }

  const resetPlan = async () => {
    if (pending.length || concepts.length) {
      const ok = await askConfirm({
        title: 'Empezar de nuevo',
        message: 'Se descartan las tarjetas y conceptos que pegaste y no guardaste.',
        confirmLabel: 'Descartar'
      })
      if (!ok) return
    }
    setPlan(null)
    setConcepts([])
    setPending([])
    setReplyTitle('')
    setAnswered(new Set())
    setPasteText('')
    setError('')
    setSkips([])
  }

  const brief = useMemo(() => {
    if (!plan) return ''
    return buildFlashcardBrief({
      sources: plan.sources,
      refs: plan.parts[partIndex],
      part: partIndex + 1,
      parts: plan.parts.length,
      goal: plan.goal,
      types: plan.types,
      mode: plan.phase,
      concepts: plan.concepts,
      existing: plan.existingCards,
      outline: plan.outline,
      perSource: plan.perSource
    })
  }, [plan, partIndex])

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief)
      setCopied(true)
    } catch {
      setError('No se pudo copiar solo. Selecciona el texto del encargo y cópialo.')
    }
  }

  const markAnswered = () => {
    const next = new Set(answered)
    next.add(partIndex)
    setAnswered(next)
    const open = plan.parts.findIndex((_, index) => !next.has(index))
    if (open >= 0) setPartIndex(open)
  }

  const fail = (message) => {
    setError(message)
    toast.error(message)
  }

  const addReply = () => {
    if (!plan || !pasteText.trim()) return
    try {
      readReply()
    } catch (err) {
      fail(`No se pudo leer la respuesta: ${err?.message || err}`)
    }
  }

  const readReply = () => {
    if (plan.phase === 'concepts') {
      const parsed = parseConceptReply(pasteText, plan.sources, {
        goal: plan.goal,
        existing: concepts.map((concept) => concept.name)
      })
      if (!parsed.ok) {
        fail(parsed.error)
        return
      }
      setConcepts((current) => [
        ...current,
        ...parsed.concepts.map((concept) => ({ ...concept, include: true }))
      ])
      toast.success(`Se añadieron ${plural(parsed.concepts.length, 'concepto', 'conceptos')}.`)
    } else {
      const parsed = parseFlashcardBrief(pasteText, plan.sources, {
        goal: plan.goal,
        types: plan.types,
        existing: [...plan.existingKeys, ...pending.map(cardKey)]
      })
      setSkips(parsed.skips || [])
      if (!parsed.ok) {
        fail(parsed.error)
        return
      }
      if (parsed.deck.title && !replyTitle) setReplyTitle(parsed.deck.title)
      setPending((current) => [
        ...current,
        ...parsed.deck.cards.map((card) => ({ ...card, uid: nextUid(), include: true }))
      ])
      toast.success(
        parsed.skips.length
          ? `Se añadieron ${plural(parsed.deck.cards.length, 'tarjeta', 'tarjetas')}. ${parsed.skips.length} quedaron fuera.`
          : `Se añadieron ${plural(parsed.deck.cards.length, 'tarjeta', 'tarjetas')}.`
      )
    }
    setError('')
    setPasteText('')
    markAnswered()
  }

  const useConcepts = () => {
    const chosen = concepts.filter((concept) => concept.include)
    if (!chosen.length) return
    const cited = new Set(chosen.flatMap((concept) => concept.sources))
    const sources = plan.sources.filter((source) => cited.has(source.ref))
    setPlan({
      ...plan,
      phase: 'cards',
      sources,
      parts: planParts(sources),
      concepts: chosen.map(({ name, sources: refs }) => ({ name, sources: refs }))
    })
    setPartIndex(0)
    setAnswered(new Set())
    setError('')
  }

  const updateCard = (uid, patch) => {
    setPending((current) =>
      current.map((card) => (card.uid === uid ? { ...card, ...patch } : card))
    )
  }

  const ready = pending.filter((card) => card.include && checkCardFields(card).ok)
  const uncovered =
    plan?.phase === 'cards' && pending.length ? uncoveredSources(plan.sources, pending) : []

  const save = async () => {
    if (saving || !ready.length) return
    setSaving(true)
    setError('')
    const cards = ready.map((card) => ({
      type: card.type,
      front: card.front,
      back: card.back,
      image: card.image,
      noteId: card.noteId,
      coursePath: card.coursePath,
      lessonPath: card.lessonPath,
      lesson: card.lesson,
      timeSec: card.timeSec,
      source: card.source
    }))
    try {
      let deck
      let count
      if (targetDeck) {
        const result = await window.api.appendDeckCards(targetDeck.id, cards)
        deck = result.deck
        count = result.added
      } else {
        deck = await window.api.createDeck({
          title: title.trim() || replyTitle || goal.trim() || 'Tarjetas',
          cards
        })
        count = deck?.cards?.length || cards.length
      }
      if (!alive.current) return
      setSaved(deck)
      toast.success(
        targetDeck
          ? `Se añadieron ${plural(count, 'tarjeta', 'tarjetas')} a «${deck.title}».`
          : `Se guardó «${deck.title}» con ${plural(count, 'tarjeta', 'tarjetas')}.`
      )
      onSaved?.(deck)
    } catch (err) {
      if (alive.current) {
        setError(
          String(err?.message || 'No se guardó nada').replace(
            /^Error invoking remote method '[^']+': (Error: )?/,
            ''
          )
        )
      }
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  const sourceCounts = useMemo(() => {
    const list = prepared?.sources || []
    return {
      notes: list.filter((source) => source.kind === 'note').length,
      chunks: list.filter((source) => source.kind === 'lesson').length,
      parts: list.length ? planParts(list).length : 0
    }
  }, [prepared])

  const conceptPhase = plan?.phase === 'concepts'

  return (
    <dialog
      ref={dialogRef}
      className={dialogShell}
      aria-labelledby="flashcard-builder-title"
      onCancel={(event) => {
        event.preventDefault()
        handleClose()
      }}
    >
      <div className="flex flex-col gap-4 px-5 pt-4 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="flashcard-builder-title" className="m-0 font-display text-xl font-bold">
              {targetDeck ? `Añadir tarjetas a «${targetDeck.title}»` : 'Crear tarjetas'}
            </h3>
            <p className={cn(note, 'mt-1')}>
              El encargo se copia a tu chat. Pegas la respuesta, revisas las tarjetas y se guardan.
              La app no llama a un modelo.
            </p>
          </div>
          <button type="button" className={cn(btnGhost, small)} onClick={handleClose}>
            Cerrar
          </button>
        </div>

        <section className={sectionBox}>
          <h4 className={sectionTitle}>1. Fuente</h4>
          {fromNotes ? (
            <p className={note}>
              {preparing
                ? 'Leyendo las notas…'
                : `${plural(sourceCounts.notes, 'nota entra', 'notas entran')} en el encargo.`}
              {prepared?.windows
                ? ` ${plural(prepared.windows, 'lleva', 'llevan')} lo que dice el video en ese momento.`
                : ''}
              {prepared?.emptyNotes ? ` ${prepared.emptyNotes} sin texto quedaron fuera.` : ''}
            </p>
          ) : (
            <>
              <ScopePicker
                courses={courses}
                value={scope}
                onChange={updateScope}
                disabled={locked}
              />
              {scope.tree ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={cn(btnGhost, small)}
                    disabled={locked || preparing || !scope.lessonPaths.size}
                    onClick={prepare}
                  >
                    {preparing ? 'Leyendo…' : prepared ? 'Volver a leer' : 'Leer fuentes'}
                  </button>
                  {prepared ? (
                    <span className={note}>
                      {[
                        sourceCounts.notes ? plural(sourceCounts.notes, 'nota', 'notas') : '',
                        sourceCounts.chunks
                          ? plural(
                              sourceCounts.chunks,
                              'fragmento de subtítulos',
                              'fragmentos de subtítulos'
                            )
                          : ''
                      ]
                        .filter(Boolean)
                        .join(' y ') || 'Nada que usar'}
                      {sourceCounts.parts > 1 ? ` · ${sourceCounts.parts} partes` : ''}
                      {prepared.missingSubtitles
                        ? ` · ${plural(prepared.missingSubtitles, 'lección', 'lecciones')} sin subtítulos`
                        : ''}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className={sectionBox}>
          <h4 className={sectionTitle}>2. Opciones</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={label}>Qué quieres recordar</span>
              <input
                className={input}
                value={goal}
                maxLength={180}
                disabled={locked}
                placeholder="La luz de este módulo"
                onChange={(event) => setGoal(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Mazo</span>
              <select
                className={input}
                value={target}
                disabled={locked}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="new">Mazo nuevo</option>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    Añadir a «{deck.title}» ({deck.cards.length})
                  </option>
                ))}
              </select>
            </label>
            {target === 'new' ? (
              <label className="flex flex-col gap-1">
                <span className={label}>Nombre del mazo (opcional)</span>
                <input
                  className={input}
                  value={title}
                  maxLength={120}
                  disabled={Boolean(saved)}
                  placeholder="Si lo dejas vacío, usa el de la respuesta"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
            ) : null}
            <div className="flex flex-col gap-1">
              <span className={label}>Tarjetas por fuente</span>
              <div className="flex flex-wrap gap-1">
                {PER_SOURCE.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={cn(
                      btnGhost,
                      'px-3 py-[0.3rem] text-xs shadow-none',
                      perSource === item.value && 'border-coral/35 bg-coral-soft text-coral-deep'
                    )}
                    aria-pressed={perSource === item.value}
                    disabled={locked}
                    onClick={() => setPerSource(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className={label}>Tipos de tarjeta</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {CARD_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-coral"
                    checked={types.has(type)}
                    disabled={locked || (types.has(type) && types.size === 1)}
                    onChange={() =>
                      setTypes((current) => {
                        const next = new Set(current)
                        if (next.has(type)) next.delete(type)
                        else next.add(type)
                        return next
                      })
                    }
                  />
                  {CARD_TYPE_LABELS[type]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className={label}>Cómo</span>
            <div className="flex flex-col gap-1 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="flashcard-mode"
                  className="mt-[0.2rem] accent-coral"
                  checked={mode === 'cards'}
                  disabled={locked}
                  onChange={() => setMode('cards')}
                />
                <span>Tarjetas directo</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="flashcard-mode"
                  className="mt-[0.2rem] accent-coral"
                  checked={mode === 'concepts'}
                  disabled={locked}
                  onChange={() => setMode('concepts')}
                />
                <span>
                  Conceptos primero
                  <span className="block text-xs text-ink-soft">
                    El chat lista los conceptos clave, eliges cuáles, y luego escribe tarjetas solo
                    para esos. Mejor para cursos enteros.
                  </span>
                </span>
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {plan ? (
              <button
                type="button"
                className={cn(btnGhost, small)}
                disabled={Boolean(saved)}
                onClick={resetPlan}
              >
                Cambiar opciones
              </button>
            ) : (
              <button
                type="button"
                className={cn(btnPrimary, small)}
                disabled={!prepared?.sources.length}
                onClick={startPlan}
              >
                Generar encargo
              </button>
            )}
          </div>
        </section>

        {plan && !saved ? (
          <section className={sectionBox}>
            <h4 className={sectionTitle}>
              3. {conceptPhase ? 'Encargo de conceptos' : 'Encargo de tarjetas'}
            </h4>
            {plan.parts.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className={cn(label, 'mr-1')}>Partes</span>
                {plan.parts.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={cn(
                      btnGhost,
                      'min-w-[2.4rem] px-2 py-[0.25rem] text-xs shadow-none',
                      index === partIndex && 'border-coral/35 bg-coral-soft text-coral-deep',
                      answered.has(index) && 'bg-teal/10'
                    )}
                    aria-pressed={index === partIndex}
                    onClick={() => {
                      setPartIndex(index)
                      setCopied(false)
                    }}
                  >
                    {index + 1}
                    {answered.has(index) ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            ) : null}
            <p className={note}>
              {plan.parts.length > 1
                ? `Parte ${partIndex + 1} de ${plan.parts.length}. Copia cada parte en el mismo chat o en uno nuevo y pega cada respuesta aquí.`
                : 'Copia el encargo en tu chat y pega aquí la respuesta.'}
              {plan.concepts.length
                ? ` Cubre ${plural(plan.concepts.length, 'concepto', 'conceptos')}.`
                : ''}
            </p>
            <textarea
              className={cn(textArea, 'min-h-[7rem]')}
              readOnly
              value={brief}
              aria-label="Encargo"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={cn(btnGhost, small)} onClick={copyBrief}>
                {copied
                  ? 'Copiado'
                  : `Copiar${plan.parts.length > 1 ? ` parte ${partIndex + 1}` : ''}`}
              </button>
              <span className={note}>{Math.round(brief.length / 1000)}k caracteres</span>
            </div>
            <textarea
              className={cn(textArea, 'min-h-[5.5rem]')}
              value={pasteText}
              placeholder="Pega aquí el JSON de la respuesta"
              aria-label="Respuesta"
              onChange={(event) => {
                setPasteText(event.target.value)
                setError('')
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(btnPrimary, small)}
                disabled={!pasteText.trim()}
                onClick={addReply}
              >
                {conceptPhase ? 'Añadir conceptos' : 'Añadir tarjetas'}
              </button>
              {error ? (
                <span className="text-sm font-semibold text-coral-deep">{error}</span>
              ) : null}
            </div>
            {skips.length ? (
              <details className="text-xs text-ink-soft">
                <summary className="cursor-pointer">
                  {plural(skips.length, 'fila quedó fuera', 'filas quedaron fuera')}
                </summary>
                <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                  {skips.map((skip, index) => (
                    <li key={`${skip.title}-${index}`}>
                      {skip.title}: {skip.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}

        {conceptPhase && concepts.length ? (
          <section className={sectionBox}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className={sectionTitle}>
                Conceptos ({concepts.filter((c) => c.include).length}/{concepts.length})
              </h4>
              <button
                type="button"
                className={cn(btnPrimary, small)}
                disabled={!concepts.some((concept) => concept.include)}
                onClick={useConcepts}
              >
                Escribir tarjetas para estos
              </button>
            </div>
            {answered.size < plan.parts.length ? (
              <p className={note}>
                Faltan {plural(plan.parts.length - answered.size, 'parte', 'partes')} por pegar.
                Puedes seguir sin ellas.
              </p>
            ) : null}
            <ul className="m-0 flex max-h-[20rem] list-none flex-col gap-1 overflow-auto p-0">
              {concepts.map((concept, index) => (
                <li key={`${concept.name}-${index}`}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-[0.2rem] accent-coral"
                      checked={concept.include}
                      onChange={(event) =>
                        setConcepts((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, include: event.target.checked } : item
                          )
                        )
                      }
                    />
                    <span>
                      <strong>{concept.name}</strong>
                      <span className="text-ink-soft"> · {concept.sources.join(', ')}</span>
                      {concept.why ? (
                        <span className="block text-xs text-ink-soft">{concept.why}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {pending.length ? (
          <section className={sectionBox}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className={sectionTitle}>
                4. Revisión ({ready.length}/{pending.length})
              </h4>
              {saved ? (
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-teal">
                    Guardado en «{saved.title}»
                  </span>
                  {onOpenDecks ? (
                    <button
                      type="button"
                      className={cn(btnPrimary, small)}
                      onClick={() => {
                        handleClose()
                        onOpenDecks(saved)
                      }}
                    >
                      Ver mazo
                    </button>
                  ) : null}
                </span>
              ) : (
                <button
                  type="button"
                  className={cn(btnPrimary, small)}
                  disabled={saving || !ready.length}
                  onClick={save}
                >
                  {saving
                    ? 'Guardando…'
                    : targetDeck
                      ? `Añadir ${plural(ready.length, 'tarjeta', 'tarjetas')}`
                      : `Guardar ${plural(ready.length, 'tarjeta', 'tarjetas')}`}
                </button>
              )}
            </div>
            {plan && plan.parts.length > 1 && answered.size < plan.parts.length && !saved ? (
              <p className={note}>
                Faltan {plural(plan.parts.length - answered.size, 'parte', 'partes')} por pegar.
              </p>
            ) : null}
            {uncovered.length ? (
              <p className={note}>
                Sin tarjetas:{' '}
                {uncovered
                  .slice(0, 12)
                  .map((source) => `${source.ref} (${source.lesson || source.title})`)
                  .join(', ')}
                {uncovered.length > 12 ? ` y ${uncovered.length - 12} más` : ''}.
              </p>
            ) : null}
            <CardReview
              cards={pending}
              sourcesByRef={sourcesByRef}
              onChange={saved ? () => {} : updateCard}
            />
          </section>
        ) : null}
      </div>
    </dialog>
  )
}

export default FlashcardBuilder
