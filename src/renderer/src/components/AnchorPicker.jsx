import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  File,
  FileArchive,
  FileText,
  FolderTree,
  Image,
  LayoutGrid,
  Music,
  PlayCircle,
  Search
} from 'lucide-react'
import { cn } from '../ui/cn'

const GENERAL = { value: '', label: 'Grupo general «Proyectos»', kind: 'general' }

function KindIcon({ kind, className }) {
  const props = { size: 15, strokeWidth: 2, 'aria-hidden': true, className }
  if (kind === 'general') return <LayoutGrid {...props} />
  if (kind === 'section') return <FolderTree {...props} />
  if (kind === 'video') return <PlayCircle {...props} />
  if (kind === 'audio') return <Music {...props} />
  if (kind === 'doc') return <FileText {...props} />
  if (kind === 'image') return <Image {...props} />
  if (kind === 'archive') return <FileArchive {...props} />
  return <File {...props} />
}

/** "A / B / C" → { trail: "A / B", leaf: "C" } */
function splitPath(label) {
  const parts = String(label || '').split(' / ')
  return { trail: parts.slice(0, -1).join(' / '), leaf: parts[parts.length - 1] }
}

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Searchable picker for where a project sits in the course tree.
 * `groups`: [{ id, label: "Sección / Sub", sectionValue?: "section:id", items: [{ value, label, kind }] }]
 */
function AnchorPicker({ value, groups, onChange, fallbackLabel }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const listId = useId()

  // Flat lookup for the trigger label.
  const byValue = useMemo(() => {
    const map = new Map([['', { ...GENERAL, context: '' }]])
    for (const group of groups) {
      if (group.sectionValue) {
        const { trail, leaf } = splitPath(group.label)
        map.set(group.sectionValue, {
          value: group.sectionValue,
          label: leaf,
          kind: 'section',
          context: trail ? `${trail} · sección completa` : 'Sección completa'
        })
      }
      for (const item of group.items) {
        map.set(item.value, { ...item, context: group.label })
      }
    }
    return map
  }, [groups])

  // Visible rows: headers (selectable when they are real sections) and their files.
  const rows = useMemo(() => {
    const q = normalize(query.trim())
    const out = []
    if (!q || normalize(GENERAL.label).includes(q)) out.push({ type: 'option', ...GENERAL })
    for (const group of groups) {
      const groupHit = !q || normalize(group.label).includes(q)
      const items = groupHit
        ? group.items
        : group.items.filter((i) => normalize(i.label).includes(q))
      if (!groupHit && !items.length) continue
      const { trail, leaf } = splitPath(group.label)
      out.push({
        type: group.sectionValue ? 'option' : 'heading',
        value: group.sectionValue,
        label: leaf,
        trail,
        kind: 'section',
        header: true,
        key: `g:${group.id}`
      })
      for (const item of items) out.push({ type: 'option', ...item, child: true })
    }
    return out
  }, [groups, query])

  const options = rows.filter((row) => row.type === 'option')

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  // Start on the current value when opening, and on the first match while searching.
  useEffect(() => {
    if (!open) return
    const current = options.findIndex((o) => o.value === value)
    setActive(query || current === -1 ? 0 : current)
  }, [open, query])

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector(`[data-option-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const openPicker = () => {
    setQuery('')
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const choose = (next) => {
    onChange(next)
    setOpen(false)
    rootRef.current?.querySelector('button')?.focus()
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(options.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(options.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (options[active]) choose(options[active].value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      rootRef.current?.querySelector('button')?.focus()
    }
  }

  const current = byValue.get(value) || {
    value,
    label: fallbackLabel || value,
    kind: value?.startsWith('section:') ? 'section' : 'other',
    context: 'Ya no está en el curso'
  }

  let optionIndex = -1

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-sm border border-ink/10 bg-surface px-3 py-2 text-left tracking-normal shadow-none transition-[box-shadow,border-color] duration-150 hover:border-ink/20 focus-visible:border-[rgba(232,69,112,0.45)] focus-visible:shadow-focus focus-visible:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            openPicker()
          }
        }}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-ink/5 text-ink-soft">
          <KindIcon kind={current.kind} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{current.label}</span>
          {current.context ? (
            <span className="block truncate text-2xs font-medium text-ink-soft">
              {current.context}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn('shrink-0 text-ink-soft transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="absolute top-[calc(100%+6px)] right-0 left-0 z-[6] flex flex-col overflow-hidden rounded-md border border-ink/8 bg-surface shadow-panel">
          <div className="relative border-b border-ink/8">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
            />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
              className="!w-full !rounded-none !border-0 !bg-transparent !py-2.5 !pr-3 !pl-9 text-sm !font-medium !shadow-none"
              placeholder="Buscar sección, lección o archivo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Dónde aparece en el curso"
            className="m-0 max-h-[min(55vh,22rem)] list-none overflow-auto p-1"
          >
            {rows.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm font-medium text-ink-soft">
                Nada coincide con «{query}»
              </li>
            ) : null}
            {rows.map((row) => {
              if (row.type === 'heading') {
                return (
                  <li
                    key={row.key}
                    role="presentation"
                    className="mt-1.5 truncate px-2.5 pt-1.5 pb-1 text-2xs font-semibold tracking-[0.05em] text-ink-faint uppercase first:mt-0"
                  >
                    {row.trail ? `${row.trail} / ` : ''}
                    {row.label}
                  </li>
                )
              }
              optionIndex += 1
              const index = optionIndex
              const selected = row.value === value
              return (
                <li
                  key={row.key || row.value || '__general__'}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={selected}
                  data-option-index={index}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-sm py-[0.4rem] pr-2.5 text-sm tracking-normal text-ink',
                    row.child ? 'pl-8' : 'pl-2.5',
                    row.header && 'mt-1.5 font-semibold first:mt-0',
                    index === active && 'bg-coral/10'
                  )}
                  onPointerMove={() => setActive(index)}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(row.value)}
                >
                  <KindIcon
                    kind={row.kind}
                    className={cn('shrink-0', selected ? 'text-coral' : 'text-ink-faint')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.label}</span>
                    {row.header && row.trail ? (
                      <span className="block truncate text-2xs font-medium text-ink-faint">
                        {row.trail}
                      </span>
                    ) : null}
                  </span>
                  {row.header ? (
                    <span className="shrink-0 text-2xs font-medium text-ink-faint">
                      sección completa
                    </span>
                  ) : null}
                  {selected ? (
                    <Check size={15} aria-hidden="true" className="shrink-0 text-coral" />
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export default AnchorPicker
