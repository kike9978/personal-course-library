import {
  CARD_TYPE_LABELS,
  WEAK_SUPPORT,
  checkCardFields,
  hasCode
} from '../../../../shared/flashcardCards.js'
import { cn } from '../../ui/cn'
import { CardImage, CardText } from './CardFace'

const area =
  'w-full resize-y rounded-md border border-ink/10 bg-surface px-[0.6rem] py-[0.45rem] text-[0.85rem] leading-[1.4] text-ink outline-none focus:shadow-focus'
const small = 'text-[0.72rem] font-bold text-ink-soft'

export function TypeBadge({ type }) {
  return (
    <span className="rounded-full border border-ink/10 bg-cream px-2 py-[0.1rem] text-[0.68rem] font-extrabold tracking-[0.03em] text-ink-soft uppercase">
      {CARD_TYPE_LABELS[type] || CARD_TYPE_LABELS.basic}
    </span>
  )
}

/**
 * Front, back and image fields for one card. Shared by the review before saving
 * and by editing a saved card.
 */
export function CardFields({ card, images = [], onChange }) {
  const cloze = card.type === 'cloze'
  const check = checkCardFields(card)
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className={small}>
          {cloze ? 'Texto con huecos {{c1::…}}' : card.type === 'reverse' ? 'Término' : 'Pregunta'}
        </span>
        <textarea
          className={area}
          rows={cloze ? 3 : 2}
          value={card.front}
          onChange={(event) => onChange({ front: event.target.value })}
        />
      </label>
      {cloze || hasCode(card.front) ? (
        <div className="m-0 text-[0.82rem] leading-[1.4] text-ink-soft">
          <CardText text={card.front} hide={cloze ? 'all' : null} />
        </div>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className={small}>
          {cloze ? 'Extra (opcional)' : card.type === 'reverse' ? 'Definición' : 'Respuesta'}
        </span>
        <textarea
          className={area}
          rows={2}
          value={card.back}
          onChange={(event) => onChange({ back: event.target.value })}
        />
      </label>
      {hasCode(card.back) ? (
        <div className="m-0 text-[0.82rem] leading-[1.4] text-ink-soft">
          <CardText text={card.back} />
        </div>
      ) : null}
      {images.length || card.image ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className={small}>Imagen</span>
            <select
              className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-[0.8rem]"
              value={card.image?.file || ''}
              onChange={(event) => {
                const picked = images.find((image) => image.file === event.target.value)
                onChange({
                  image: picked ? { file: picked.file, alt: picked.alt } : null,
                  imageAuto: false
                })
              }}
            >
              <option value="">Sin imagen</option>
              {card.image && !images.some((image) => image.file === card.image.file) ? (
                <option value={card.image.file}>{card.image.alt || 'Imagen actual'}</option>
              ) : null}
              {images.map((image) => (
                <option key={image.file} value={image.file}>
                  {image.ref ? `${image.ref} · ` : ''}
                  {image.alt || image.near || image.file}
                </option>
              ))}
            </select>
          </label>
          <CardImage image={card.image} className="max-h-[5rem]" />
          {card.imageAuto && card.image ? (
            <span className="text-[0.72rem] text-ink-soft">Primera imagen de la nota</span>
          ) : null}
        </div>
      ) : null}
      {!check.ok ? (
        <p className="m-0 text-[0.78rem] font-bold text-coral-deep">{check.error}</p>
      ) : null}
    </div>
  )
}

/**
 * Cards parsed from the replies, before they are saved. Each can be edited,
 * re-pointed to another image of its source, or left out.
 */
function CardReview({ cards, sourcesByRef, onChange }) {
  if (!cards.length) return null
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {cards.map((card, index) => {
        const source = sourcesByRef.get(card.sourceRef)
        const weak = typeof card.support === 'number' && card.support < WEAK_SUPPORT
        const valid = checkCardFields(card).ok
        return (
          <li
            key={card.uid}
            className={cn(
              'rounded-md border border-ink/10 bg-surface p-3',
              (!card.include || !valid) && 'opacity-60'
            )}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                className="accent-coral"
                checked={card.include && valid}
                disabled={!valid}
                aria-label={`Incluir tarjeta ${index + 1}`}
                onChange={(event) => onChange(card.uid, { include: event.target.checked })}
              />
              <span className="text-[0.75rem] font-bold text-ink-soft">{index + 1}</span>
              <TypeBadge type={card.type} />
              <span
                className="min-w-0 flex-1 truncate text-[0.72rem] text-ink-soft"
                title={card.source}
              >
                {card.sourceRef} · {card.source || source?.title || ''}
              </span>
              {weak ? (
                <span
                  className="rounded-full bg-coral/10 px-2 py-[0.1rem] text-[0.68rem] font-bold text-coral-deep"
                  title="Pocas palabras de la respuesta aparecen en la fuente citada."
                >
                  Revisar: no aparece en la fuente
                </span>
              ) : null}
            </div>
            <CardFields
              card={card}
              images={source?.images || []}
              onChange={(patch) => onChange(card.uid, patch)}
            />
          </li>
        )
      })}
    </ol>
  )
}

export default CardReview
