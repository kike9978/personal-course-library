import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  BookOpen,
  Captions,
  Download,
  ExternalLink,
  Globe,
  ImagePlus,
  Loader2,
  LogIn,
  RotateCw,
  Trash2
} from 'lucide-react'
import { instagramSessionViewer, sourceViewer, youTubeVideoId } from '../../../shared/sources.js'
import { cueIndexAt, pickCaptionTrack } from '../../../shared/captions.js'
import { formatNoteTimestamp } from '../../../shared/knowledgeGraph.js'
import { askConfirm } from '../utils/askConfirm'
import { cn } from '../ui/cn'
import { searchIcon, searchInput, segmented, segmentedItem } from '../ui/classes'
import { Search } from 'lucide-react'
import { btnCompact, btnGhost, btnQuiet, iconOnly, notice } from '../ui/classes'

const POLL_MS = 1000
const SAVE_EVERY_MS = 5000

/**
 * Signed-in Instagram pages are trimmed to the post. If Instagram renames these parts the
 * full page still works; nothing depends on the trim.
 */
const INSTAGRAM_TRIM_CSS = `
  nav, footer, [role="navigation"], [role="contentinfo"] { display: none !important; }
  body { overflow-x: hidden !important; }
`

/** Ask first, then open Instagram's own login window (Phase 2b). */
export async function confirmInstagramSignIn() {
  const ok = await askConfirm({
    title: 'Iniciar sesión en Instagram',
    message:
      'Se abrirá la página de Instagram para que entres con tu cuenta. La app no ve tu contraseña. La sesión se guarda en la carpeta de datos de esta app y solo se usa para ver enlaces de Instagram en Fuentes. Puedes cerrarla cuando quieras desde Fuentes.',
    confirmLabel: 'Continuar'
  })
  if (!ok) return null
  try {
    const status = await window.api.instagramSignIn()
    if (status?.signedIn) toast.success('Sesión de Instagram iniciada')
    else toast('No se completó el inicio de sesión')
    return status
  } catch (error) {
    toast.error(error?.message || 'No se pudo abrir Instagram')
    return null
  }
}

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

function formatDate(value) {
  try {
    return new Date(value).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return ''
  }
}

/** A saved copy, read from disk and drawn with the app's own type. Nothing is fetched. */
function ReaderView({ source }) {
  const [copy, setCopy] = useState(undefined)
  useEffect(() => {
    let cancelled = false
    window.api.readSourceCopy(source.id).then((data) => !cancelled && setCopy(data || null))
    return () => {
      cancelled = true
    }
  }, [source.id, source.snapshot?.capturedAt])
  if (copy === undefined) {
    return (
      <div className="grid h-full place-items-center text-ink-faint">
        <Loader2 aria-hidden="true" className="size-6 animate-spin" />
      </div>
    )
  }
  if (!copy) {
    return (
      <p className="m-0 p-6 text-center text-sm text-ink-soft">
        No se encontró la copia guardada. Vuelve a guardarla desde la página en vivo.
      </p>
    )
  }
  return (
    <article
      lang={copy.lang || undefined}
      className="mx-auto max-w-[42rem] px-6 py-8 text-base leading-relaxed text-ink"
    >
      <p className="m-0 mb-4 text-xs text-ink-faint">
        Copia guardada el {formatDate(copy.capturedAt)} · {copy.wordCount} palabras · solo texto
      </p>
      <h1 className="m-0 mb-1 font-display text-2xl font-bold tracking-tight">
        {copy.title || source.title}
      </h1>
      {copy.byline ? (
        <p className="m-0 mb-6 text-sm text-ink-soft">{copy.byline}</p>
      ) : (
        <div className="mb-6" />
      )}
      {copy.blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = block.level <= 2 ? 'h2' : 'h3'
          return (
            <Tag
              key={index}
              className={cn(
                'mt-7 mb-2 font-display font-semibold',
                Tag === 'h2' ? 'text-xl' : 'text-lg'
              )}
            >
              {block.text}
            </Tag>
          )
        }
        if (block.type === 'item') {
          return (
            <p
              key={index}
              className="my-1 pl-5 before:-ml-4 before:inline-block before:w-4 before:content-['•']"
            >
              {block.text}
            </p>
          )
        }
        if (block.type === 'quote') {
          return (
            <blockquote
              key={index}
              className="my-4 border-l-2 border-ink/15 pl-4 text-ink-soft italic"
            >
              {block.text}
            </blockquote>
          )
        }
        if (block.type === 'code') {
          return (
            <pre
              key={index}
              className="my-4 overflow-auto rounded-sm bg-ink/5 p-3 text-sm whitespace-pre-wrap"
            >
              {block.text}
            </pre>
          )
        }
        return (
          <p key={index} className="my-3">
            {block.text}
          </p>
        )
      })}
    </article>
  )
}

/** Timed lines of a video. Choosing one seeks the player. */
function Transcript({ captions, currentTime, onSeek }) {
  const [query, setQuery] = useState('')
  const listRef = useRef(null)
  const cues = captions?.cues || []
  const q = query.trim().toLowerCase()
  const current = cueIndexAt(cues, currentTime)
  const shown = q
    ? cues
        .map((cue, index) => ({ cue, index }))
        .filter(({ cue }) => cue.text.toLowerCase().includes(q))
    : cues.map((cue, index) => ({ cue, index }))

  useEffect(() => {
    if (q || current < 0) return
    listRef.current
      ?.querySelector(`[data-cue="${current}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [current, q])

  return (
    <aside
      aria-label="Transcripción"
      className="flex w-[20rem] shrink-0 flex-col border-l border-ink/8 bg-surface max-[1100px]:w-[16rem]"
    >
      <div className="border-b border-ink/8 p-2">
        <div className="relative">
          <Search className={searchIcon} aria-hidden="true" />
          <input
            className={searchInput}
            value={query}
            placeholder="Buscar en la transcripción"
            aria-label="Buscar en la transcripción"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p className="m-0 mt-1.5 text-2xs text-ink-faint">
          {captions.lang ? `${captions.lang}${captions.auto ? ' · automática' : ''} · ` : ''}
          {cues.length} líneas · guardada en este equipo
        </p>
      </div>
      <ol ref={listRef} className="m-0 min-h-0 flex-1 list-none overflow-auto p-1">
        {shown.map(({ cue, index }) => (
          <li key={index} data-cue={index}>
            <button
              type="button"
              onClick={() => onSeek(cue.start)}
              className={cn(
                'flex w-full cursor-pointer gap-2 rounded-sm border-0 bg-transparent px-2 py-1 text-left text-sm text-ink hover:bg-cream',
                index === current && !q && 'bg-coral-soft text-coral-deep hover:bg-coral-soft'
              )}
            >
              <span className="shrink-0 pt-px text-2xs text-ink-faint tabular-nums">
                {formatNoteTimestamp(cue.start)}
              </span>
              <span>{cue.text}</span>
            </button>
          </li>
        ))}
        {!shown.length ? (
          <li className="px-2 py-3 text-sm text-ink-soft">Nada coincide con «{query}».</li>
        ) : null}
      </ol>
    </aside>
  )
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
const SourceViewer = forwardRef(function SourceViewer(
  { source, startSec, autoplay, onTime, instagram = null },
  ref
) {
  // Signed in to Instagram in the app (opt-in): show the real page in that session instead.
  const sessionPlan = instagram?.signedIn ? instagramSessionViewer(source) : null
  const plan = sessionPlan || sourceViewer(source)
  const [expired, setExpired] = useState(false)
  // Articles with a saved copy open on the copy; the live page is one click away.
  const canCopy = plan.mode === 'page'
  const gone = source.linkCheck?.state === 'gone'
  const [reader, setReader] = useState(() => canCopy && Boolean(source.snapshot))
  const [copying, setCopying] = useState(false)
  const saveCopy = async () => {
    setCopying(true)
    try {
      await window.api.saveSourceCopy(source.id)
      setReader(true)
      toast.success('Copia guardada')
    } catch (error) {
      toast.error(error?.message || 'No se pudo guardar la copia')
    } finally {
      setCopying(false)
    }
  }
  const dropCopy = async () => {
    const ok = await askConfirm({
      title: 'Borrar copia',
      message: 'Se borra el texto guardado de esta página. El enlace y sus notas se quedan.',
      confirmLabel: 'Borrar'
    })
    if (!ok) return
    await window.api.deleteSourceCopy(source.id)
    setReader(false)
  }
  const webviewRef = useRef(null)
  const [state, setState] = useState('loading')
  const [loginWall, setLoginWall] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [src, setSrc] = useState(() =>
    plan.mode === 'youtube' ? withStart(plan.src, startSec || 0, Boolean(autoplay)) : plan.src
  )
  const lastSaved = useRef({ at: 0, time: null })
  const timeRef = useRef(startSec || 0)

  // Transcript of a YouTube video: saved on disk once fetched, so it opens without the network.
  const videoId = plan.mode === 'youtube' ? youTubeVideoId(source.url) : null
  const [captions, setCaptions] = useState(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [captionsBusy, setCaptionsBusy] = useState(false)
  const [currentTime, setCurrentTime] = useState(startSec || 0)
  const captionsWaiter = useRef(null)
  useEffect(() => {
    if (!videoId) return undefined
    let cancelled = false
    window.api.readSourceCaptions(source.id).then((data) => {
      if (!cancelled && data?.cues?.length) setCaptions(data)
    })
    const stop = window.api.onSourceCaptions?.((data) => {
      if (data?.videoId !== videoId || !data.cues?.length) return
      setCaptions(data)
      window.api.saveSourceCaptions(source.id, data).catch(() => {})
      captionsWaiter.current?.(data)
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [videoId, source.id])

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
    const ready = () => {
      setState('ready')
      if (plan.mode === 'instagram-session') view.insertCSS?.(INSTAGRAM_TRIM_CSS).catch?.(() => {})
    }
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

  useEffect(
    () =>
      window.api.onSourceViewerLogin?.((data) => {
        setLoginWall(true)
        if (data?.expired) setExpired(true)
      }),
    []
  )

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
      setCurrentTime(info.time)
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

  // Ask the player for captions; the main process reads the lines it fetches.
  const requestCaptions = async () => {
    if (captions) {
      setShowTranscript((open) => !open)
      return
    }
    setCaptionsBusy(true)
    try {
      let tracks = []
      for (let attempt = 0; attempt < 8 && !tracks.length; attempt += 1) {
        const result = await run(`(() => {
          const p = document.getElementById('movie_player')
          if (!p || !p.loadModule) return null
          ${attempt === 2 ? 'p.playVideo && p.playVideo()' : ''}
          p.loadModule('captions')
          return (p.getOption('captions', 'tracklist') || []).map((t) => ({ languageCode: t.languageCode, kind: t.kind || '' }))
        })()`)
        tracks = Array.isArray(result) ? result : []
        if (!tracks.length) await new Promise((resolve) => setTimeout(resolve, 800))
      }
      const track = pickCaptionTrack(tracks)
      if (!track) {
        toast('Este video no tiene subtítulos')
        return
      }
      const arrived = new Promise((resolve) => {
        captionsWaiter.current = resolve
        setTimeout(() => resolve(null), 10000)
      })
      await run(`(() => {
        const p = document.getElementById('movie_player')
        p.setOption('captions', 'track', ${JSON.stringify(track)})
        return true
      })()`)
      const data = await arrived
      captionsWaiter.current = null
      if (!data) {
        toast.error('YouTube no envió los subtítulos. Dale a reproducir y vuelve a intentarlo.')
        return
      }
      setShowTranscript(true)
      // The lines are in the pane now; take them off the video.
      run(`document.getElementById('movie_player')?.unloadModule?.('captions')`)
    } finally {
      setCaptionsBusy(false)
    }
  }

  const addCapture = async () => {
    try {
      const result = await window.api.addSourceCapture(source.id)
      if (!result?.canceled && !result?.added) toast.error('No se pudo leer esa imagen')
    } catch (error) {
      toast.error(error?.message || 'No se pudo adjuntar la captura')
    }
  }

  const signInButton =
    source.kind === 'instagram' && !instagram?.signedIn ? (
      <button type="button" className={cn(btnGhost, btnCompact)} onClick={confirmInstagramSignIn}>
        <LogIn aria-hidden="true" className="size-3.5" />
        Iniciar sesión en Instagram
      </button>
    ) : null

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
      {videoId ? (
        <button
          type="button"
          className={cn(btnQuiet, btnCompact)}
          aria-pressed={showTranscript}
          disabled={captionsBusy || (!captions && state !== 'ready')}
          onClick={requestCaptions}
        >
          {captionsBusy ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <Captions aria-hidden="true" className="size-3.5" />
          )}
          {captions
            ? showTranscript
              ? 'Ocultar transcripción'
              : 'Transcripción'
            : 'Traer transcripción'}
        </button>
      ) : null}
      {canCopy && source.snapshot ? (
        <div className={cn(segmented, 'h-7')} role="group" aria-label="Qué mostrar">
          <button
            type="button"
            className={cn(segmentedItem, 'text-xs')}
            aria-pressed={reader}
            onClick={() => setReader(true)}
          >
            <BookOpen aria-hidden="true" />
            Copia guardada
          </button>
          <button
            type="button"
            className={cn(segmentedItem, 'text-xs')}
            aria-pressed={!reader}
            onClick={() => setReader(false)}
          >
            <Globe aria-hidden="true" />
            Página en vivo
          </button>
        </div>
      ) : null}
      {canCopy ? (
        <button
          type="button"
          className={cn(btnQuiet, btnCompact)}
          onClick={saveCopy}
          disabled={copying}
          title="Guarda el texto de la página para leerlo aunque el enlace deje de funcionar"
        >
          {copying ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <Download aria-hidden="true" className="size-3.5" />
          )}
          {source.snapshot ? 'Actualizar copia' : 'Guardar copia'}
        </button>
      ) : null}
      {canCopy && source.snapshot ? (
        <button
          type="button"
          className={cn(btnQuiet, btnCompact)}
          onClick={dropCopy}
          aria-label="Borrar copia"
          title="Borrar copia"
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
      {source.kind === 'instagram' ? (
        <button type="button" className={cn(btnQuiet, btnCompact)} onClick={addCapture}>
          <ImagePlus aria-hidden="true" className="size-3.5" />
          Adjuntar captura
        </button>
      ) : null}
      <span className="ml-auto text-xs text-ink-faint">
        {expired
          ? 'Sesión de Instagram caducada'
          : sessionPlan
            ? 'Sesión de Instagram activa'
            : 'Sin iniciar sesión · nada se guarda'}
      </span>
    </div>
  )

  const goneNotice = gone ? (
    <div className={cn(notice, 'rounded-none border-x-0 border-t-0')}>
      <p className="m-0 text-sm">
        Este enlace ya no existe (respondió {source.linkCheck.code}).{' '}
        {source.snapshot
          ? 'Lo que ves es la copia guardada.'
          : 'No hay copia guardada; tus notas y capturas siguen aquí.'}
      </p>
    </div>
  ) : null

  if (canCopy && reader && source.snapshot) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {goneNotice}
        <div className="min-h-0 flex-1 overflow-auto bg-surface">
          <ReaderView source={source} />
        </div>
        {footer}
      </div>
    )
  }

  if (blocked) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-auto bg-cream-deep p-5">
          {hasCaptures ? (
            <div className="mx-auto max-w-[40rem]">
              <Captures source={source} />
            </div>
          ) : (
            <div className={cn(notice, 'mx-auto mt-10 max-w-[32rem] flex-col items-start gap-3')}>
              <p className="m-0 text-sm">
                {expired
                  ? 'Tu sesión de Instagram caducó. Vuelve a iniciar sesión para ver esta publicación aquí.'
                  : source.kind === 'instagram'
                    ? 'Esta publicación necesita iniciar sesión en Instagram. Inicia sesión en la app, o guárdala desde el navegador con una captura.'
                    : 'Esta página pide iniciar sesión. Ábrela en el navegador.'}
              </p>
              {expired ? (
                <button
                  type="button"
                  className={cn(btnGhost, btnCompact)}
                  onClick={confirmInstagramSignIn}
                >
                  <LogIn aria-hidden="true" className="size-3.5" />
                  Iniciar sesión otra vez
                </button>
              ) : (
                signInButton
              )}
            </div>
          )}
        </div>
        {footer}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {goneNotice}
      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            'relative min-h-0 min-w-0 flex-1',
            plan.mode === 'instagram' || plan.mode === 'instagram-session'
              ? 'bg-cream-deep'
              : 'bg-ink/90'
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
              partition={plan.partition || 'sources'}
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
        {showTranscript && captions ? (
          <Transcript
            captions={captions}
            currentTime={currentTime}
            onSeek={async (sec) => {
              const done = await run(seekScript(sec))
              if (!done) setSrc(withStart(plan.src, sec, true))
              setCurrentTime(sec)
            }}
          />
        ) : null}
      </div>
      {noInlineVideo ? (
        <div className={cn(notice, 'rounded-none border-x-0 border-b-0')}>
          <p className="m-0 text-sm">
            Instagram no deja reproducir este reel fuera de su app (suele pasar con música con
            licencia). Puedes leer la descripción aquí y verlo con <strong>Abrir enlace</strong>, o
            iniciar sesión en Instagram para verlo en la app.
          </p>
          {signInButton}
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
