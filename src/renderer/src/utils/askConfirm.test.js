import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { askConfirm, focusLiveElement } from './askConfirm.js'

function element(tag) {
  const listeners = new Map()
  const el = {
    tag,
    className: '',
    textContent: '',
    isConnected: false,
    attrs: {},
    children: [],
    setAttribute(name, value) {
      el.attrs[name] = value
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(el.attrs, name)
    },
    append(...nodes) {
      el.children.push(...nodes)
    },
    addEventListener(type, fn) {
      listeners.set(type, fn)
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.(event)
    },
    focus(options) {
      el.focusedWith = options || null
      el.owner.active = el
    },
    close() {
      el.open = false
      listeners.get('close')?.()
    },
    showModal() {
      el.open = true
    },
    remove() {
      el.isConnected = false
    }
  }
  return el
}

function fakeDocument() {
  const created = []
  const doc = {
    active: null,
    get activeElement() {
      return doc.active
    },
    body: null,
    defaultView: { queueMicrotask },
    createElement(tag) {
      const el = element(tag)
      el.owner = doc
      created.push(el)
      return el
    },
    querySelector() {
      return doc.list || null
    }
  }
  const body = element('body')
  body.owner = doc
  body.isConnected = true
  doc.body = body
  doc.active = body
  const list = element('aside')
  list.owner = doc
  list.isConnected = true
  doc.list = list
  doc.created = created
  return doc
}

describe('focusLiveElement', () => {
  it('focuses the annotations list when the active node is gone', () => {
    const doc = fakeDocument()
    const detached = element('button')
    detached.owner = doc
    detached.isConnected = false
    doc.active = detached

    const focused = focusLiveElement(doc)

    assert.equal(focused, doc.list)
    assert.equal(doc.active, doc.list)
    assert.equal(doc.list.attrs.tabindex, '-1')
  })

  it('leaves a connected field focused', () => {
    const doc = fakeDocument()
    const input = element('textarea')
    input.owner = doc
    input.isConnected = true
    doc.active = input

    assert.equal(focusLiveElement(doc), input)
    assert.equal(doc.active, input)
  })
})

describe('askConfirm', () => {
  it('resolves true from the confirm button and moves focus off the opener', async () => {
    const doc = fakeDocument()
    const pending = askConfirm({
      title: 'Borrar anotación',
      message: '¿Borrar esta anotación?',
      confirmLabel: 'Borrar',
      doc
    })
    const dialog = doc.created.find((el) => el.tag === 'dialog')
    const actions = dialog.children[0].children.find((el) => el.attrs['data-confirm-actions'] === '')
    const confirm = actions.children.find((el) => el.textContent === 'Borrar')
    const opener = element('button')
    opener.owner = doc
    opener.isConnected = true
    doc.active = opener

    confirm.dispatch('click')
    assert.equal(await pending, true)
    await new Promise((resolve) => queueMicrotask(resolve))
    assert.equal(dialog.isConnected, false)
    assert.equal(doc.active, doc.list)
  })

  it('resolves false from cancel', async () => {
    const doc = fakeDocument()
    const pending = askConfirm({ message: '¿Borrar esta anotación?', doc })
    const dialog = doc.created.find((el) => el.tag === 'dialog')
    const actions = dialog.children[0].children.find((el) => el.attrs['data-confirm-actions'] === '')
    const cancel = actions.children.find((el) => el.textContent === 'Cancelar')
    cancel.dispatch('click')
    assert.equal(await pending, false)
  })
})
