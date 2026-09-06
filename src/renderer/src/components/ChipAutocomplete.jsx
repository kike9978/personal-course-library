import { useEffect, useId, useMemo, useRef, useState } from 'react'

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

  const selectedKeys = useMemo(
    () => new Set(selected.map((v) => v.toLowerCase())),
    [selected]
  )

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

    const canCreate =
      q &&
      !selectedKeys.has(q) &&
      !base.some((o) => o.toLowerCase() === q)

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
    <div className="field chip-autocomplete" ref={rootRef}>
      {label ? (
        <label htmlFor={id} id={`${id}-label`}>
          {label}
        </label>
      ) : null}

      <div
        className={`chip-autocomplete__control${open ? ' is-open' : ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((value) => (
          <span key={value} className="chip-autocomplete__chip">
            <span>{value}</span>
            <button
              type="button"
              className="chip-autocomplete__remove"
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
          className="chip-autocomplete__input"
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
        <ul id={listboxId} className="chip-autocomplete__list" role="listbox">
          {flatItems.length === 0 ? (
            <li className="chip-autocomplete__empty">Sin coincidencias</li>
          ) : (
            flatItems.map((item, index) => (
              <li key={`${item.type}-${item.label}`} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={`chip-autocomplete__option${index === activeIndex ? ' is-active' : ''}`}
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
                    <span className="chip-autocomplete__check" aria-hidden="true">
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
