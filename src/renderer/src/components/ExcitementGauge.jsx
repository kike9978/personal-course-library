import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'react-hot-toast'
import { Angry, Annoyed, Frown, Laugh, Meh, Smile } from 'lucide-react'
import { cn } from '../ui/cn'

export const EXCITEMENT_LEVELS = [
  { level: 1, label: 'Molesto', color: 'text-ink-soft', icon: Angry },
  { level: 2, label: 'Aburrido', color: 'text-ink', icon: Frown },
  { level: 3, label: 'Indiferente', color: 'text-teal', icon: Annoyed },
  { level: 4, label: 'Contento', color: 'text-coral', icon: Smile },
  { level: 5, label: 'Emocionado', color: 'text-coral-deep', icon: Laugh }
]

function clamp(value) {
  const level = Math.round(Number(value) || 0)
  if (level < 1) return 0
  if (level > 5) return 5
  return level
}

function stopGaugeEvent(event) {
  event.stopPropagation()
}

function FaceIcon({ icon: Icon = Meh, filled }) {
  return (
    <span className="relative grid h-full w-full place-items-center">
      {filled ? <span className="absolute inset-px rounded-full bg-current" aria-hidden="true" /> : null}
      <Icon
        className={cn('relative h-full w-full', filled && 'text-cream')}
        strokeWidth={2}
        aria-hidden="true"
      />
    </span>
  )
}

function menuPosition(anchor) {
  const rect = anchor.getBoundingClientRect()
  const width = 188
  const height = 212
  let left = rect.left
  let top = rect.bottom + 6
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
  if (left < 8) left = 8
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6)
  return { top, left }
}

/** Personal excitement. Neutral face until a level is chosen from the menu. */
export default function ExcitementGauge({ coursePath, value = 0, size = 'sm', onError }) {
  const [level, setLevel] = useState(() => clamp(value))
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const rootRef = useRef(null)
  const menuRef = useRef(null)
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

  const toggle = (event) => {
    stopGaugeEvent(event)
    if (open) {
      setOpen(false)
      return
    }
    if (rootRef.current) setPosition(menuPosition(rootRef.current))
    setOpen(true)
  }

  const pick = async (event, next) => {
    stopGaugeEvent(event)
    setOpen(false)
    if (!coursePath || !window.api?.setCourseExcitement) return
    const chosen = level === next ? 0 : next
    const previous = level
    setLevel(chosen)
    try {
      await window.api.setCourseExcitement(coursePath, chosen)
    } catch (error) {
      setLevel(previous)
      if (onError) onError(error)
      else toast.error(error?.message || 'No se pudo guardar la emoción')
    }
  }

  const label = emotion ? emotion.label : 'Sin emoción'

  return (
    <div
      ref={rootRef}
      className="relative inline-flex"
      onMouseDown={stopGaugeEvent}
      onClick={stopGaugeEvent}
      onDoubleClick={stopGaugeEvent}
    >
      <button
        type="button"
        className={cn(
          'grid cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-ink-soft transition-colors duration-150 ease-pop hover:bg-ink/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          size === 'md' ? 'h-8 w-8' : 'h-6 w-6',
          emotion?.color
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={level ? `${label}. Cambiar emoción` : 'Elegir emoción'}
        title={label}
        onClick={toggle}
      >
        <span className={size === 'md' ? 'h-6 w-6' : 'h-[1.15rem] w-[1.15rem]'}>
          <FaceIcon icon={emotion?.icon} filled={level > 0} />
        </span>
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Emoción"
              className="fixed z-[80] w-[11.5rem] rounded-md border border-ink/10 bg-surface p-1.5 shadow-panel"
              style={{ top: position.top, left: position.left }}
              onMouseDown={stopGaugeEvent}
              onClick={stopGaugeEvent}
            >
              {EXCITEMENT_LEVELS.map((item) => {
                const selected = item.level === level
                return (
                  <button
                    key={item.level}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-sm font-semibold text-ink hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                      selected && 'bg-ink/5'
                    )}
                    title={selected ? `${item.label}. Clic para quitar` : item.label}
                    onClick={(event) => pick(event, item.level)}
                  >
                    <span className={cn('h-6 w-6 shrink-0', selected ? item.color : 'text-ink')}>
                      <FaceIcon icon={item.icon} filled={selected} />
                    </span>
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
