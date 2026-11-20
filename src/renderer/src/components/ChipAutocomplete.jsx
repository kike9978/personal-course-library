import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '../ui/cn'
import { fieldLabel } from '../ui/classes'

/**
 * Multi-select autocomplete that stores values as chips.
 * Allows picking from `options` or creating a new value with Enter / comma.
 */
function ChipAutocomplete({
  id,
  label,
  values = [],
  options = [],
  onChange,
  placeholder = 'Escribe para buscar…'
}) {
  const listboxId = useId()
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const selected = useMemo(() => {
    const seen = new Set()
    return (Array.isArray(values) ? values : [])
      .map((v) => String(v).trim())
      .filter((v) => {
        if (!v) return false
        const key = v.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [values])

  const selectedKeys = useMemo(() => new Set(selected.map((v) => v.toLowerCase())), [selected])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = options
      .map((o) => String(o).trim())
      .filter(Boolean)
      .filter((o, i, arr) => arr.findIndex((x) => x.toLowerCase() === o.toLowerCase()) === i)

    const filtered = base.filter((o) => {
      if (selectedKeys.has(o.toLowerCase())) return false
      if (!q) return true
      return o.toLowerCase().includes(q)
    })

    const canCreate = q && !selectedKeys.has(q) && !base.some((o) => o.toLowerCase() === q)

    return {
      items: filtered.slice(0, 8),
      canCreate: Boolean(canCreate),
      createLabel: query.trim()
    }
  }, [options, query, selectedKeys])

  const flatItems = useMemo(() => {
    const items = suggestions.items.map((label) => ({ type: 'option', label }))
    if (suggestions.canCreate) {
      items.push({ type: 'create', label: suggestions.createLabel })
    }
    return items
  }, [suggestions])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  useEffect(() => {
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const commitValue = (raw) => {
    const next = String(raw || '').trim()
    if (!next) return
    if (selectedKeys.has(next.toLowerCase())) {
      setQuery('')
      return
    }
    onChange([...selected, next])
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  const removeValue = (value) => {
    onChange(selected.filter((v) => v.toLowerCase() !== value.toLowerCase()))
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && !query && selected.length) {
      e.preventDefault()
      removeValue(selected[selected.length - 1])
      return
    }

    if (e.key === 'Escape') {
      setOpen(false)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
      return
    }

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (open && flatItems[activeIndex]) {
        commitValue(flatItems[activeIndex].label)
      } else {
        commitValue(query)
      }
      return
    }

    if (e.key === 'Tab' && query.trim()) {
      commitValue(query)
    }
  }

  const showList = open && (flatItems.length > 0 || query.trim())

  return (
    <div className="relative" ref={rootRef}>
      {label ? (
        <label className={fieldLabel} htmlFor={id} id={`${id}-label`}>
          {label}
        </label>
      ) : null}

      <div
        className={cn(
          'flex min-h-[2.75rem] w-full cursor-text flex-wrap items-center gap-[0.35rem] rounded-md border border-ink/10 bg-surface px-[0.55rem] py-[0.4rem] focus-within:shadow-focus',
          open && 'shadow-focus'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((value) => (
          <span
            key={value}
            className="inline-flex max-w-full items-center gap-[0.2rem] rounded-full border border-chip-programs-border bg-chip-programs py-[0.2rem] pr-[0.35rem] pl-[0.55rem] text-[0.78rem] font-bold text-chip-programs-text"
          >
            <span className="truncate">{value}</span>
            <button
              type="button"
              className="grid h-[1.2rem] w-[1.2rem] cursor-pointer place-items-center rounded-full border-0 bg-transparent text-base leading-none text-inherit hover:bg-[rgba(26,20,35,0.08)]"
              aria-label={`Quitar ${value}`}
              onClick={(e) => {
                e.stopPropagation()
                removeValue(value)
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-labelledby={label ? `${id}-label` : undefined}
          className="min-w-[120px] flex-[1_1_120px] border-0 bg-transparent px-1 py-[0.35rem] text-inherit text-ink shadow-none outline-none"
          value={query}
          placeholder={selected.length ? '' : placeholder}
          onChange={(e) => {
            setQuery(e.target.value.replace(/,/g, ''))
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {showList ? (
        <ul
          id={listboxId}
          className="absolute top-[calc(100%+0.35rem)] right-0 left-0 z-50 m-0 max-h-[220px] list-none overflow-auto rounded-md border border-ink/10 bg-surface p-[0.35rem] shadow-panel"
          role="listbox"
        >
          {flatItems.length === 0 ? (
            <li className="px-[0.65rem] py-[0.65rem] text-[0.85rem] text-ink-soft">
              Sin coincidencias
            </li>
          ) : (
            flatItems.map((item, index) => (
              <li
                key={`${item.type}-${item.label}`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border-0 bg-transparent px-[0.65rem] py-[0.55rem] text-left font-[inherit] text-ink hover:bg-coral/10',
                    index === activeIndex && 'bg-coral/10'
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitValue(item.label)}
                >
                  {item.type === 'create' ? (
                    <span>
                      Añadir “<strong>{item.label}</strong>”
                    </span>
                  ) : (
                    <span>{item.label}</span>
                  )}
                  {selectedKeys.has(item.label.toLowerCase()) ? (
                    <span className="font-extrabold text-teal" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}

export default ChipAutocomplete
