import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ExternalLink, ImagePlus, Loader2, RotateCw, Trash2 } from 'lucide-react'
import { sourceViewer } from '../../../shared/sources.js'
import { cn } from '../ui/cn'
import { btnCompact, btnGhost, btnQuiet, iconOnly, notice } from '../ui/classes'

const POLL_MS = 1000
const SAVE_EVERY_MS = 5000

const READ_VIDEO = `(() => {
  const v = document.querySelector('video')
  if (!v) return null
  return { time: v.currentTime || 0, duration: Number.isFinite(v.duration) ? v.duration : null, paused: v.paused, ready: v.readyState }
})()`

function seekScript(sec) {
  return `(() => {
    const v = document.querySelector('video')
    if (!v || v.readyState === 0) return false
    v.currentTime = ${Number(sec) || 0}
    v.play().catch(() => {})
    return true
  })()`
}

function captureUrl(file) {
  return `course-media://source-capture/?file=${encodeURIComponent(file)}`
}

function withStart(src, sec, autoplay) {
  const url = new URL(src)
  if (sec > 0) url.searchParams.set('start', String(Math.floor(sec)))
  if (autoplay) url.searchParams.set('autoplay', '1')
  return url.href
}

function Captures({ source }) {
  const captures = source.captures || []
  if (!captures.length) return null
  return (
    <div className="flex flex-col gap-3">
      {captures.map((capture) => (
        <figure
          key={capture.file}
          className="group/cap relative m-0 overflow-hidden rounded-md border border-ink/8 bg-surface"
        >
          <img src={captureUrl(capture.file)} alt="" className="block h-auto w-full" />
          <button
            type="button"
            className={cn(
              iconOnly,
              'absolute top-2 right-2 bg-surface/90 opacity-0 group-hover/cap:opacity-100 group-focus-within/cap:opacity-100'
            )}
            aria-label="Quitar captura"
            title="Quitar captura"
            onClick={() => window.api.removeSourceCapture(source.id, capture.file)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </figure>
      ))}
    </div>
  )
}

/**
 * Shows a saved link inside the app with no account: YouTube through its embedded player,
 * public Instagram posts through their embed page, other pages live. Anything that needs a
 * login falls back to captures the user attached, or to opening the link in the browser.
 *
 * Ref: `seek(sec)` and `getTime()` for YouTube.
 */
const SourceViewer = forwardRef(function SourceViewer({ source, startSec, autoplay, onTime }, ref) {
  const plan = sourceViewer(source)
  const webviewRef = useRef(null)
  const [state, setState] = useState('loading')
  const [loginWall, setLoginWall] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [src, setSrc] = useState(() =>
    plan.mode === 'youtube' ? withStart(plan.src, startSec || 0, Boolean(autoplay)) : plan.src
  )
  const lastSaved = useRef({ at: 0, time: null })
  const timeRef = useRef(startSec || 0)

  const run = useCallback(async (script) => {
    const view = webviewRef.current
    if (!view || typeof view.executeJavaScript !== 'function') return null
    try {
      return await view.executeJavaScript(script)
    } catch {
      return null
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      getTime: () => timeRef.current,
      async seek(sec) {
        if (plan.mode !== 'youtube') return
        const done = await run(seekScript(sec))
        // The player has not loaded a video yet: reload it at that second and start playing.
        if (!done) setSrc(withStart(plan.src, sec, true))
        timeRef.current = sec
        onTime?.(sec)
      }
    }),
    [plan.mode, plan.src, run, onTime]
  )

  // Load events from the <webview> element.
  useEffect(() => {
    const view = webviewRef.current
    if (!view) return undefined
    setState('loading')
    const ready = () => setState('ready')
    const failed = (event) => {
      // -3 is an aborted load, usually because the page navigated on its own.
      if (event.errorCode === -3 || event.isMainFrame === false) return
      setState('failed')
    }
    view.addEventListener('dom-ready', ready)
    view.addEventListener('did-fail-load', failed)
    return () => {
      view.removeEventListener('dom-ready', ready)
      view.removeEventListener('did-fail-load', failed)
    }
  }, [src, reloadKey, plan.mode])

  useEffect(() => window.api.onSourceViewerLogin?.(() => setLoginWall(true)), [])

  // Instagram leaves the video out of the embed for reels with licensed music:
  // only the cover and "Watch on Instagram" come back. Say so instead of a dead play button.
  const [noInlineVideo, setNoInlineVideo] = useState(false)
  useEffect(() => {
    setNoInlineVideo(false)
    if (plan.mode !== 'instagram' || state !== 'ready' || !/\/(reel|reels|tv)\//.test(source.url)) {
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const missing = await run(
        `!document.querySelector('video') && !!document.querySelector('a[href*="instagram.com"]')`
      )
      if (!cancelled && missing === true) setNoInlineVideo(true)
    }, 4000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [plan.mode, state, source.url, run])

  // Follow YouTube playback: show the clock in the composer and remember where it stopped.
  useEffect(() => {
    if (plan.mode !== 'youtube' || state !== 'ready') return undefined
    let cancelled = false
    const timer = setInterval(async () => {
      const info = await run(READ_VIDEO)
      if (cancelled || !info || info.ready === 0) return
      timeRef.current = info.time
      onTime?.(info.time)
      const now = Date.now()
      const moved = Math.abs((lastSaved.current.time ?? -10) - info.time) >= 2
      if (moved && now - lastSaved.current.at >= SAVE_EVERY_MS) {
        lastSaved.current = { at: now, time: info.time }
        window.api.setSourcePosition({
          id: source.id,
          positionSec: info.time,
          durationSec: info.duration
        })
      }
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      if (timeRef.current > 0) {
        window.api.setSourcePosition({ id: source.id, positionSec: timeRef.current })
      }
    }
  }, [plan.mode, state, run, onTime, source.id])

  const addCapture = async () => {
    try {
      const result = await window.api.addSourceCapture(source.id)
      if (!result?.canceled && !result?.added) toast.error('No se pudo leer esa imagen')
    } catch (error) {
      toast.error(error?.message || 'No se pudo adjuntar la captura')
    }
  }

  const hasCaptures = Boolean(source.captures?.length)
  const blocked = plan.mode === 'none' || loginWall
  const canEmbed = !blocked

  const footer = (
    <div className="flex flex-wrap items-center gap-2 border-t border-ink/8 bg-surface px-3 py-2">
      <button
        type="button"
        className={cn(btnGhost, btnCompact)}
        onClick={() => window.api.openSourceUrl(source.id)}
      >
        <ExternalLink aria-hidden="true" className="size-3.5" />
        Abrir enlace
      </button>
      {canEmbed && state === 'failed' ? (
        <button
          type="button"
          className={cn(btnQuiet, btnCompact)}
          onClick={() => setReloadKey((key) => key + 1)}
        >
          <RotateCw aria-hidden="true" className="size-3.5" />
          Reintentar
        </button>
      ) : null}
      {source.kind === 'instagram' ? (
        <button type="button" className={cn(btnQuiet, btnCompact)} onClick={addCapture}>
          <ImagePlus aria-hidden="true" className="size-3.5" />
          Adjuntar captura
        </button>
      ) : null}
      <span className="ml-auto text-xs text-ink-faint">Sin iniciar sesión · nada se guarda</span>
    </div>
  )

  if (blocked) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-auto bg-cream-deep p-5">
          {hasCaptures ? (
            <div className="mx-auto max-w-[40rem]">
              <Captures source={source} />
            </div>
          ) : (
            <div className={cn(notice, 'mx-auto mt-10 max-w-[32rem]')}>
              <p className="m-0 text-sm">
                {source.kind === 'instagram'
                  ? 'Esta publicación necesita iniciar sesión en Instagram. Guárdala desde el navegador con una captura para verla aquí.'
                  : 'Esta página pide iniciar sesión. Ábrela en el navegador.'}
              </p>
            </div>
          )}
        </div>
        {footer}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          'relative min-h-0 flex-1',
          plan.mode === 'instagram' ? 'bg-cream-deep' : 'bg-ink/90'
        )}
      >
        {/* Instagram's embed is laid out for about 540px; wider, it only gets blurrier. */}
        <div
          className={cn(
            'absolute inset-y-0',
            plan.mode === 'instagram'
              ? 'left-1/2 w-full max-w-[34rem] -translate-x-1/2'
              : 'inset-x-0'
          )}
        >
          <webview
            key={`${src}-${reloadKey}`}
            ref={webviewRef}
            src={src}
            // eslint-disable-next-line react/no-unknown-property -- Electron <webview> attribute
            partition="sources"
            {...(plan.referrer ? { httpreferrer: plan.referrer } : {})}
            className="absolute inset-0 h-full w-full"
            style={{ display: 'flex' }}
          />
        </div>
        {state === 'loading' ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-white/80">
            <Loader2 aria-hidden="true" className="size-6 animate-spin" />
          </div>
        ) : null}
        {state === 'failed' ? (
          <div className="absolute inset-0 grid place-items-center bg-cream-deep p-6">
            <p className="m-0 max-w-[28rem] text-center text-sm text-ink-soft">
              No se pudo cargar aquí. Reintenta o abre el enlace en el navegador.
            </p>
          </div>
        ) : null}
      </div>
      {noInlineVideo ? (
        <div className={cn(notice, 'rounded-none border-x-0 border-b-0')}>
          <p className="m-0 text-sm">
            Instagram no deja reproducir este reel fuera de su app (suele pasar con música con
            licencia). Puedes leer la descripción aquí y verlo con <strong>Abrir enlace</strong>.
          </p>
        </div>
      ) : null}
      {hasCaptures && plan.mode === 'instagram' ? (
        <details className="border-t border-ink/8 bg-surface px-3 py-2">
          <summary className="cursor-pointer text-sm text-ink-soft">
            Capturas ({source.captures.length})
          </summary>
          <div className="mt-2 max-h-[40vh] overflow-auto">
            <Captures source={source} />
          </div>
        </details>
      ) : null}
      {footer}
    </div>
  )
})

export default SourceViewer
