/**
 * In-app confirmation.
 * `window.confirm` opens a native dialog. On Windows, Electron does not always
 * hand keyboard focus back to the window after that dialog closes.
 */

function focusOptions(target) {
  try {
    target.focus({ preventScroll: true })
  } catch {
    target.focus()
  }
}

/**
 * Put keyboard focus on a node that is still in the document.
 * `force` moves focus even when something is already focused, which matters
 * when that node is about to be removed. On Windows, removing the focused
 * node can leave the window ignoring the keyboard.
 */
export function focusLiveElement(doc = document, { force = false } = {}) {
  const active = doc.activeElement
  if (
    !force &&
    active &&
    active.isConnected &&
    active !== doc.body &&
    active !== doc.documentElement
  ) {
    return active
  }
  const target = doc.querySelector?.('.annotations-page-list, .annotations-doc-pane') || doc.body
  if (!target || typeof target.focus !== 'function') return null
  if (!target.hasAttribute?.('tabindex')) target.setAttribute?.('tabindex', '-1')
  focusOptions(target)
  return target
}

export function askConfirm({
  title = 'Confirmar',
  message = '',
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  doc = typeof document !== 'undefined' ? document : null
} = {}) {
  if (!doc?.body || typeof doc.createElement !== 'function') {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    let settled = false
    const dialog = doc.createElement('dialog')
    dialog.className = 'dialog dialog--confirm'

    const form = doc.createElement('form')
    form.className = 'dialog__form'
    form.addEventListener('submit', (event) => event.preventDefault())

    const heading = doc.createElement('h3')
    heading.textContent = title

    const lead = doc.createElement('p')
    lead.className = 'dialog__lead'
    lead.textContent = message

    const actions = doc.createElement('div')
    actions.className = 'dialog__actions'

    const cancel = doc.createElement('button')
    cancel.type = 'button'
    cancel.className = 'btn btn--ghost'
    cancel.textContent = cancelLabel

    const confirm = doc.createElement('button')
    confirm.type = 'button'
    confirm.className = 'btn btn--primary'
    confirm.textContent = confirmLabel

    const finish = (value) => {
      if (settled) return
      settled = true
      dialog.close?.()
      dialog.remove?.()
      const restore = () => focusLiveElement(doc, { force: true })
      const view = doc.defaultView
      if (typeof view?.queueMicrotask === 'function') view.queueMicrotask(restore)
      else queueMicrotask(restore)
      resolve(value)
    }

    cancel.addEventListener('click', () => finish(false))
    confirm.addEventListener('click', () => finish(true))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      finish(false)
    })
    dialog.addEventListener('close', () => finish(false))
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(false)
    })

    actions.append(cancel, confirm)
    form.append(heading, lead, actions)
    dialog.append(form)
    doc.body.append(dialog)
    dialog.showModal?.()
    cancel.focus?.()
  })
}
