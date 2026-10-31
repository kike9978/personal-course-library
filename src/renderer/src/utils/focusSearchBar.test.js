import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { focusSearchOnShortcut, visibleSearchInput } from './focusSearchBar.js'

function rect(top, left, width = 120, height = 32) {
  return { top, left, width, height, right: left + width, bottom: top + height }
}

function input(box, { disabled = false, search = true } = {}) {
  const classes = new Set()
  const el = {
    disabled,
    hidden: false,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    },
    offsetWidth: box.width,
    getBoundingClientRect: () => box,
    focus() {
      el.focused = true
    },
    select() {
      el.selected = true
    },
    addEventListener() {},
    matches(selector) {
      return search && selector.includes('search')
    }
  }
  return el
}

function docFrom({ inputs, dialogs = [], active = null }) {
  const rootInputs = inputs
  return {
    activeElement: active,
    defaultView: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
    },
    querySelectorAll(selector) {
      if (selector === 'dialog[open]') return dialogs
      if (selector.includes('search-field') || selector.includes('import-props__search')) {
        return rootInputs
      }
      return []
    }
  }
}

function shortcut(doc, extra = {}) {
  const event = {
    key: 'f',
    code: 'KeyF',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    prevented: false,
    stopped: false,
    preventDefault() {
      event.prevented = true
    },
    stopPropagation() {
      event.stopped = true
    },
    ...extra
  }
  const handled = focusSearchOnShortcut(event, doc)
  return { handled, event }
}

describe('focusSearchOnShortcut', () => {
  it('focuses and highlights the only visible search bar', () => {
    const field = input(rect(12, 40))
    const doc = docFrom({ inputs: [field] })
    const { handled, event } = shortcut(doc)
    assert.equal(handled, true)
    assert.equal(event.prevented, true)
    assert.equal(field.focused, true)
    assert.equal(field.selected, true)
    assert.equal(field.classList.contains('is-find-target'), true)
  })

  it('does nothing when the screen has no search bar', () => {
    const doc = docFrom({ inputs: [] })
    const { handled, event } = shortcut(doc)
    assert.equal(handled, false)
    assert.equal(event.prevented, false)
  })

  it('ignores a search bar that is not visible', () => {
    const hidden = input(rect(0, 0, 0, 0))
    const doc = docFrom({ inputs: [hidden] })
    const { handled } = shortcut(doc)
    assert.equal(handled, false)
    assert.equal(hidden.focused, undefined)
  })

  it('picks the topmost search bar when several are visible', () => {
    const lower = input(rect(180, 20))
    const upper = input(rect(24, 200))
    const doc = docFrom({ inputs: [lower, upper] })
    shortcut(doc)
    assert.equal(upper.focused, true)
    assert.equal(lower.focused, undefined)
  })

  it('keeps the search bar that already has focus', () => {
    const lower = input(rect(180, 20))
    const upper = input(rect(24, 200))
    const doc = docFrom({ inputs: [lower, upper], active: lower })
    shortcut(doc)
    assert.equal(lower.focused, true)
    assert.equal(upper.focused, undefined)
  })

  it('leaves a page search alone while a dialog without one is open', () => {
    const page = input(rect(12, 40))
    const dialog = {
      querySelectorAll() {
        return []
      }
    }
    const doc = docFrom({ inputs: [page], dialogs: [dialog] })
    doc.querySelectorAll = (selector) => {
      if (selector === 'dialog[open]') return [dialog]
      return [page]
    }
    const { handled, event } = shortcut(doc)
    assert.equal(handled, false)
    assert.equal(event.prevented, false)
    assert.equal(visibleSearchInput(doc), null)
  })

  it('focuses the search inside the open dialog', () => {
    const page = input(rect(12, 40))
    const modal = input(rect(80, 40))
    const dialog = {
      querySelectorAll() {
        return [modal]
      }
    }
    const doc = docFrom({ inputs: [page], dialogs: [dialog] })
    doc.querySelectorAll = (selector) => {
      if (selector === 'dialog[open]') return [dialog]
      return [page]
    }
    shortcut(doc)
    assert.equal(modal.focused, true)
    assert.equal(page.focused, undefined)
  })

  it('ignores modified or non-find keys', () => {
    const field = input(rect(12, 40))
    const doc = docFrom({ inputs: [field] })
    assert.equal(shortcut(doc, { shiftKey: true }).handled, false)
    assert.equal(shortcut(doc, { altKey: true }).handled, false)
    assert.equal(shortcut(doc, { ctrlKey: false, metaKey: false }).handled, false)
    assert.equal(shortcut(doc, { key: 'r', code: 'KeyR' }).handled, false)
    assert.equal(field.focused, undefined)
  })
})
