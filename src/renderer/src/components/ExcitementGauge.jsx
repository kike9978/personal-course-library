import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'react-hot-toast'
import { FaceGrinning, Frown, Laugh, Meh, Smile, SmilePlus } from 'lucide-react'
import { cn } from '../ui/cn'

/** How much you want to take a course. One coral ramp: stronger color, more ganas. */
export const EXCITEMENT_LEVELS = [
  {
    level: 1,
    label: 'Nada',
    phrase: 'Nada de ganas',
    filterLabel: 'Cualquier valor',
    color: 'text-coral/45',
    icon: Frown
  },
  {
    level: 2,
    label: 'Pocas',
    phrase: 'Pocas ganas',
    filterLabel: 'Pocas o más',
    color: 'text-coral/65',
    icon: Meh
  },
  {
    level: 3,
    label: 'Algunas',
    phrase: 'Algunas ganas',
    filterLabel: 'Algunas o más',
    color: 'text-coral/85',
    icon: Smile
  },
  {
    level: 4,
    label: 'Bastantes',
    phrase: 'Bastantes ganas',
    filterLabel: 'Bastantes o más',
    color: 'text-coral',
    icon: FaceGrinning
  },
  {
    level: 5,
    label: 'Muchísimas',
    phrase: 'Muchísimas ganas',
    filterLabel: 'Muchísimas',
    color: 'text-coral-deep',
    icon: Laugh
  }
]

const MENU_WIDTH = 196
const MENU_HEIGHT = 92

function clamp(value) {
  const level = Math.round(Number(value) || 0)
  if (level < 1) return 0
  if (level > 5) return 5
  return level
}

function stopGaugeEvent(event) {
  event.stopPropagation()
}

function menuPosition(anchor) {
  const rect = anchor.getBoundingClientRect()
  let left = rect.left + rect.width / 2 - MENU_WIDTH / 2
  let top = rect.bottom + 6
  if (left + MENU_WIDTH > window.innerWidth - 8) left = window.innerWidth - MENU_WIDTH - 8
  if (left < 8) left = 8
  if (top + MENU_HEIGHT > window.innerHeight - 8) top = Math.max(8, rect.top - MENU_HEIGHT - 6)
  return { top, left }
}

/** Five pips, filled up to the level. Compact enough to sit beside the stars. */
function Dots({ level }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {EXCITEMENT_LEVELS.map((item) => (
        <span
          key={item.level}
          className={cn('h-1.5 w-1.5 rounded-full', item.level <= level ? 'bg-coral' : 'bg-ink/12')}
        />
      ))}
    </span>
  )
}

/**
 * Personal "ganas" for a course.
 * - variant "dots" (cards, table): pip meter; hidden while unset until the row/card is hovered.
 * - variant "face" (detail views): face on a soft tint; `showLabel` adds the phrase beside it.
 */
export default function ExcitementGauge({
  coursePath,
  value = 0,
  variant = 'dots',
  showLabel = false,
  onError
}) {
  const [level, setLevel] = useState(() => clamp(value))
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const [preview, setPreview] = useState(0)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const itemRefs = useRef([])
  const emotion = EXCITEMENT_LEVELS.find((item) => item.level === level)

  useEffect(() => {
    setLevel(clamp(value))
  }, [value, coursePath])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const close = () => setOpen(false)
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  // Move focus into the picker: the current level, or the middle face when unset.
  useEffect(() => {
    if (!open || !position) return
    const index = level ? level - 1 : 2
    itemRefs.current[index]?.focus()
  }, [open, position])

  const toggle = (event) => {
    stopGaugeEvent(event)
    if (open) {
      setOpen(false)
      return
    }
    if (rootRef.current) setPosition(menuPosition(rootRef.current))
    setPreview(0)
    setOpen(true)
  }

  const save = async (next) => {
    setOpen(false)
    triggerRef.current?.focus()
    if (!coursePath || !window.api?.setCourseExcitement) return
    if (next === level) return
    const previous = level
    setLevel(next)
    try {
      await window.api.setCourseExcitement(coursePath, next)
    } catch (error) {
      setLevel(previous)
      if (onError) onError(error)
      else toast.error(error?.message || 'No se pudieron guardar las ganas')
    }
  }

  const onMenuKeyDown = (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const current = itemRefs.current.indexOf(document.activeElement)
    const last = EXCITEMENT_LEVELS.length - 1
    let next = current < 0 ? 0 : current
    if (event.key === 'ArrowLeft') next = Math.max(0, next - 1)
    if (event.key === 'ArrowRight') next = Math.min(last, next + 1)
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = last
    itemRefs.current[next]?.focus()
  }

  const phrase = emotion ? emotion.phrase : 'Sin ganas marcadas'
  const shown = EXCITEMENT_LEVELS.find((item) => item.level === (preview || level))
  const isDots = variant === 'dots'
  const FaceIcon = emotion?.icon || SmilePlus

  return (
    <div
      ref={rootRef}
      className="relative inline-flex"
      onMouseDown={stopGaugeEvent}
      onClick={stopGaugeEvent}
      onDoubleClick={stopGaugeEvent}
    >
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'inline-flex cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent p-0 transition-[opacity,background-color] duration-150 ease-pop focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          isDots && 'h-6 px-1 hover:bg-ink/[0.06]',
          isDots &&
            !level &&
            !open &&
            'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100'
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={level ? `${phrase}. Cambiar` : 'Marcar ganas'}
        title={level ? phrase : 'Marcar ganas'}
        onClick={toggle}
      >
        {isDots ? (
          level ? (
            <Dots level={level} />
          ) : (
            <SmilePlus className="h-4 w-4 text-ink-faint" strokeWidth={2} aria-hidden="true" />
          )
        ) : (
          <>
            <span
              className={cn(
                'grid h-8 w-8 place-items-center rounded-full transition-colors duration-150',
                level ? cn('bg-coral-soft', emotion.color) : 'text-ink-faint hover:bg-ink/[0.06]'
              )}
            >
              <FaceIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            {showLabel ? (
              <span
                className={cn('pr-1 text-sm font-semibold', level ? 'text-ink' : 'text-ink-soft')}
              >
                {level ? phrase : 'Marcar ganas'}
              </span>
            ) : null}
          </>
        )}
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Ganas"
              className="fixed z-[80] rounded-md border border-ink/10 bg-surface p-2 shadow-panel"
              style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
              onMouseDown={stopGaugeEvent}
              onClick={stopGaugeEvent}
              onKeyDown={onMenuKeyDown}
              onMouseLeave={() => setPreview(0)}
            >
              <div className="flex justify-between">
                {EXCITEMENT_LEVELS.map((item, index) => {
                  const selected = item.level === level
                  const Icon = item.icon
                  return (
                    <button
                      key={item.level}
                      ref={(node) => {
                        itemRefs.current[index] = node
                      }}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      aria-label={item.phrase}
                      tabIndex={-1}
                      className={cn(
                        'grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-md border-0 bg-transparent transition-colors duration-100 hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                        selected
                          ? cn('bg-coral-soft hover:bg-coral-soft', item.color)
                          : 'text-ink-soft',
                        !selected && preview === item.level && item.color
                      )}
                      onMouseEnter={() => setPreview(item.level)}
                      onFocus={() => setPreview(item.level)}
                      onClick={(event) => {
                        stopGaugeEvent(event)
                        save(item.level)
                      }}
                    >
                      <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
              <div className="mt-1.5 flex min-h-5 items-center justify-between gap-2 px-1 text-xs">
                <span className="font-semibold text-ink-soft" aria-live="polite">
                  {shown ? shown.phrase : 'Elige tus ganas'}
                </span>
                {level ? (
                  <button
                    type="button"
                    className="cursor-pointer rounded-sm border-0 bg-transparent p-0 text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    onClick={(event) => {
                      stopGaugeEvent(event)
                      save(0)
                    }}
                  >
                    Quitar
                  </button>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
