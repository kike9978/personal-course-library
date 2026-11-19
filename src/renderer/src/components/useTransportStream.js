import { useEffect, useRef } from 'react'
import Hls from 'hls.js'

export function isTransportStream(relativePath) {
  return /\.(m2ts|mts|ts)$/i.test(relativePath || '')
}

export function transportPlaylistUrl(mediaUrl) {
  if (!mediaUrl) return null
  return `${mediaUrl}${mediaUrl.includes('?') ? '&' : '?'}hls=1`
}

function failureMessage(data) {
  const detail = String(data?.details || '')
  if (
    data?.type === Hls.ErrorTypes.MEDIA_ERROR ||
    /codec|bufferAdd|bufferAppend|fragParsing/i.test(detail)
  ) {
    return 'No se pudo reproducir este .ts. Hace falta video H.264 y audio AAC.'
  }
  return 'No se pudo leer el video .ts'
}

/**
 * Play a .ts/.m2ts/.mts lesson through the indexed HLS playlist.
 * The video element keeps the lesson clock, so seek and resume stay unchanged.
 */
export function useTransportStream(videoRef, url, { onReady, onError } = {}) {
  const readyRef = useRef(onReady)
  const errorRef = useRef(onError)
  readyRef.current = onReady
  errorRef.current = onError

  useEffect(() => {
    if (!url) return undefined
    const el = videoRef.current
    if (!el) return undefined
    if (!Hls.isSupported()) {
      errorRef.current?.('Este equipo no puede reproducir video .ts')
      return undefined
    }

    let disposed = false
    let recovered = false
    const hls = new Hls({
      enableWorker: false,
      lowLatencyMode: false,
      backBufferLength: 90,
      startPosition: -1
    })
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (disposed) return
      readyRef.current?.()
      el.play?.().catch(() => {})
    })
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (disposed || !data?.fatal) return
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
        recovered = true
        hls.recoverMediaError()
        return
      }
      errorRef.current?.(failureMessage(data))
    })
    hls.attachMedia(el)
    hls.loadSource(url)

    return () => {
      disposed = true
      hls.destroy()
    }
  }, [url, videoRef])
}
