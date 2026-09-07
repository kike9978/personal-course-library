/**
 * Detect if this renderer was opened as the annotations-only pop-out window.
 * Hash form: #annotations-window or #annotations-window?coursePath=...
 */
export function getAnnotationsWindowMode() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '')
  if (!raw.startsWith('annotations-window')) return null
  const q = raw.indexOf('?')
  const params = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '')
  const coursePath = params.get('coursePath')
  return {
    coursePath: coursePath && coursePath.trim() ? coursePath : null
  }
}
