import { Fragment } from 'react'
import { clozeParts, textSegments } from '../../../../shared/flashcardCards.js'
import { cn } from '../../ui/cn'

export function cardImageUrl(image) {
  return image?.file ? `course-media://note/?file=${encodeURIComponent(image.file)}` : ''
}

/** Prose with `inline code` shown in a code face. */
function InlineCode({ text }) {
  return String(text)
    .split(/(`[^`\n]+`)/)
    .map((piece, index) =>
      /^`[^`\n]+`$/.test(piece) ? (
        <code
          key={index}
          className="rounded bg-ink/[0.06] px-[0.3em] py-[0.05em] font-mono text-[0.85em] font-semibold"
        >
          {piece.slice(1, -1)}
        </code>
      ) : (
        <Fragment key={index}>{piece}</Fragment>
      )
    )
}

/**
 * Card text: prose, ``` code blocks and cloze blanks.
 * `hide`: 'all' hides every blank, a number hides that blank, null shows the answers.
 * `focus`: with answers shown, only that blank is highlighted (the one that was asked).
 */
export function CardText({ text, hide = null, focus = null }) {
  const pieces = (segment) =>
    clozeParts(segment.text, hide).map((part, index) => {
      if (!part.answer) {
        return segment.code ? (
          <Fragment key={index}>{part.text}</Fragment>
        ) : (
          <InlineCode key={index} text={part.text} />
        )
      }
      if (part.blank) {
        return (
          <span
            key={index}
            className="mx-[0.15em] inline-block min-w-[3ch] rounded border-b-2 border-coral bg-coral/10 px-1 text-coral-deep"
          >
            {part.hint ? `[${part.hint}]` : '[…]'}
          </span>
        )
      }
      if (focus != null && part.n !== focus) return <Fragment key={index}>{part.text}</Fragment>
      return (
        <span key={index} className="font-bold text-coral-deep">
          {part.text}
        </span>
      )
    })

  return (
    <>
      {textSegments(text).map((segment, index) => {
        const list = pieces(segment)
        if (!segment.code) return <Fragment key={index}>{list}</Fragment>
        // <code>, not <pre>: study cards sit inside a <button>, which only takes inline content.
        return (
          <code
            key={index}
            className="my-2 block overflow-x-auto rounded-md bg-ink/[0.05] px-3 py-2 text-left font-mono text-sm leading-[1.5] font-medium whitespace-pre"
          >
            {list}
          </code>
        )
      })}
    </>
  )
}

export function CardImage({ image, className }) {
  if (!image?.file) return null
  return (
    <img
      src={cardImageUrl(image)}
      alt={image.alt || ''}
      className={cn('max-h-[18rem] w-auto max-w-full rounded-md object-contain', className)}
    />
  )
}
