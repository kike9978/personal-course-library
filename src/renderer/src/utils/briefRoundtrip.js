/**
 * The copy → chat → paste round trip shared by the description and lista dialogs.
 * Copying an encargo marks it pending; when the window gets focus back, the clipboard
 * is read and a reply that parses is filled in for review.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const PENDING_EVENT = 'pcl-brief-pending'
const PENDING_TTL = 1000 * 60 * 60 * 24 * 3
const consumed = new Set()

function pendingKey(kind) {
  return `pcl.brief.pending.${kind}`
}

export function readBriefPending(kind) {
  try {
    const at = Number(localStorage.getItem(pendingKey(kind))) || 0
    return at && Date.now() - at < PENDING_TTL ? at : 0
  } catch {
    return 0
  }
}

function writeBriefPending(kind, at) {
  try {
    if (at) localStorage.setItem(pendingKey(kind), String(at))
    else localStorage.removeItem(pendingKey(kind))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(PENDING_EVENT, { detail: { kind } }))
}

export function clearBriefPending(kind) {
  writeBriefPending(kind, 0)
}

/** True while an encargo of this kind was copied and its reply has not been saved. */
export function useBriefPending(kind) {
  const [pending, setPending] = useState(() => Boolean(readBriefPending(kind)))
  useEffect(() => {
    const sync = () => setPending(Boolean(readBriefPending(kind)))
    window.addEventListener(PENDING_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PENDING_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [kind])
  return pending
}

export async function readClipboardText() {
  try {
    if (typeof window.api?.readClipboardText === 'function') {
      return String((await window.api.readClipboardText()) || '')
    }
    return String((await navigator.clipboard.readText()) || '')
  } catch {
    return ''
  }
}

/**
 * `accepts(text)` says whether clipboard text is a reply for this dialog.
 * Returns the brief, the paste box value, and `detected` when the paste came from the clipboard.
 */
export function useBriefRoundtrip({ kind, accepts, active = true }) {
  const [brief, setBrief] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyNote, setCopyNote] = useState('')
  const [paste, setPasteState] = useState('')
  const [detected, setDetected] = useState(false)
  const acceptsRef = useRef(accepts)
  acceptsRef.current = accepts
  const lastSeen = useRef('')
  const pasteRef = useRef('')
  pasteRef.current = paste

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const check = useCallback(async () => {
    if (!active) return false
    const text = await readClipboardText()
    if (!text.trim() || text === lastSeen.current || consumed.has(text)) return false
    lastSeen.current = text
    if (text === pasteRef.current) return false
    if (!acceptsRef.current?.(text)) return false
    setPasteState(text)
    setDetected(true)
    return true
  }, [active])

  useEffect(() => {
    if (!active) return undefined
    check()
    const onFocus = () => check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, check])

  /** Copy `text` as the encargo. Returns true when it reached the clipboard. */
  const copy = useCallback(
    async (text) => {
      setBrief(text)
      setCopyNote('')
      lastSeen.current = text
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        writeBriefPending(kind, Date.now())
        return true
      } catch {
        setCopyNote('No se pudo copiar solo. Abre «Ver encargo» y cópialo a mano.')
        return false
      }
    },
    [kind]
  )

  const setPaste = useCallback((value) => {
    setPasteState(value)
    setDetected(false)
  }, [])

  /** Call after the reply was saved. The same clipboard text is not offered again. */
  const done = useCallback(() => {
    if (pasteRef.current) consumed.add(pasteRef.current)
    clearBriefPending(kind)
    setDetected(false)
  }, [kind])

  return { brief, setBrief, copy, copied, copyNote, paste, setPaste, detected, done, check }
}
