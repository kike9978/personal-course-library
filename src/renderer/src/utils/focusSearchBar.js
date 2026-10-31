const FLASH_CLASS = 'is-find-target'

const SEARCH_SELECTOR = '.search-field input, input.import-props__search'

function isVisibleSearch(input, view) {
  if (!input || input.disabled || input.hidden) return false
  const style = view?.getComputedStyle?.(input)
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false
  const rect = input.getBoundingClientRect?.()
  return Boolean(rect && rect.width > 0 && rect.height > 0)
}

function topmost(inputs) {
  return inputs.reduce((best, input) => {
    const a = best.getBoundingClientRect()
    const b = input.getBoundingClientRect()
    if (b.top !== a.top) return b.top < a.top ? input : best
    return b.left < a.left ? input : best
  })
}

/**
 * Search field that Ctrl/Cmd+F should focus.
 * An open dialog owns the shortcut: a filter inside it wins, and a search
 * behind the dialog is left alone.
 */
export function visibleSearchInput(doc = document) {
  const dialogs = [...doc.querySelectorAll('dialog[open]')]
  const scope = dialogs.length ? dialogs[dialogs.length - 1] : doc
  const view = doc.defaultView
  const visible = [...scope.querySelectorAll(SEARCH_SELECTOR)].filter((input) =>
    isVisibleSearch(input, view)
  )
  if (!visible.length) return null
  const active = doc.activeElement
  if (active && visible.includes(active)) return active
  return topmost(visible)
}

function flashSearch(input) {
  input.classList.remove(FLASH_CLASS)
  void input.offsetWidth
  input.classList.add(FLASH_CLASS)
  input.addEventListener(
    'animationend',
    () => {
      input.classList.remove(FLASH_CLASS)
    },
    { once: true }
  )
}

export function highlightSearchInput(input) {
  if (!input) return
  flashSearch(input)
  input.focus()
  input.select?.()
}

export function focusSearchOnShortcut(event, doc = document) {
  if (event.altKey || event.shiftKey || event.isComposing) return false
  if (!(event.ctrlKey || event.metaKey) || event.repeat) return false
  const key = String(event.key || '').toLowerCase()
  if (event.code !== 'KeyF' && key !== 'f') return false
  const input = visibleSearchInput(doc)
  if (!input) return false
  event.preventDefault()
  event.stopPropagation()
  highlightSearchInput(input)
  return true
}
