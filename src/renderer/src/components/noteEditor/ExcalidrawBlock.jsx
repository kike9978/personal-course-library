import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { cn } from '../../ui/cn.js'
import { btnGhost, btnPrimary } from '../../ui/classes.js'
import { $getNodeByKey } from 'lexical'
import { $isExcalidrawNode } from './ExcalidrawNode'

const Excalidraw = lazy(async () => {
  const mod = await import('@excalidraw/excalidraw')
  await import('@excalidraw/excalidraw/index.css')
  return { default: mod.Excalidraw }
})

function ensureExcalidrawAssets() {
  if (typeof window === 'undefined') return
  if (!window.EXCALIDRAW_ASSET_PATH) {
    window.EXCALIDRAW_ASSET_PATH = import.meta.env.BASE_URL || './'
  }
}

const exportItem =
  'cursor-pointer rounded-sm border-0 bg-transparent px-[0.55rem] py-[0.4rem] text-left text-sm font-semibold text-ink [font:inherit] hover:bg-black/5'

const excalidrawPreview = 'block max-h-56 w-full bg-white object-contain'

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la vista previa'))
    reader.readAsDataURL(blob)
  })
}

function ExcalidrawModal({ drawingId, onClose, onSaved }) {
  const apiRef = useRef(null)
  const [initialData, setInitialData] = useState(undefined)
  const [loading, setLoading] = useState(Boolean(drawingId))
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    ensureExcalidrawAssets()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!drawingId) {
        setInitialData({ elements: [], appState: { viewBackgroundColor: '#ffffff' } })
        setLoading(false)
        return
      }
      try {
        const result = await window.api.loadNoteDrawing(drawingId)
        if (cancelled) return
        if (!result?.ok) throw new Error(result?.error || 'No se pudo cargar el dibujo')
        const parsed = JSON.parse(result.sceneJson)
        setInitialData({
          elements: parsed.elements || [],
          appState: {
            ...(parsed.appState || {}),
            viewBackgroundColor: parsed.appState?.viewBackgroundColor || '#ffffff'
          },
          files: parsed.files || undefined,
          scrollToContent: true
        })
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'No se pudo cargar el dibujo')
          setInitialData({ elements: [], appState: { viewBackgroundColor: '#ffffff' } })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [drawingId])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (exportOpen) setExportOpen(false)
        else onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, exportOpen])

  const getScene = useCallback(async () => {
    const api = apiRef.current
    if (!api) throw new Error('Lienzo no listo')
    const mod = await import('@excalidraw/excalidraw')
    return {
      mod,
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles()
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!window.api?.saveNoteDrawing) return
    setSaving(true)
    setError(null)
    try {
      const { mod, elements, appState, files } = await getScene()
      const sceneJson = mod.serializeAsJSON(elements, appState, files, 'local')
      const blob = await mod.exportToBlob({
        elements,
        appState: {
          ...appState,
          exportBackground: true,
          exportWithDarkMode: false
        },
        files,
        mimeType: 'image/png'
      })
      const previewBase64 = await blobToBase64(blob)
      const saved = await window.api.saveNoteDrawing({
        drawingId: drawingId || null,
        sceneJson,
        previewBase64
      })
      if (!saved?.ok) throw new Error(saved?.error || 'No se pudo guardar')
      onSaved?.({
        drawingId: saved.drawingId,
        previewSrc: saved.previewUrl || ''
      })
    } catch (err) {
      setError(err?.message || 'Error al guardar el dibujo')
    } finally {
      setSaving(false)
    }
  }, [drawingId, getScene, onSaved])

  const handleExport = useCallback(
    async (format) => {
      setExportOpen(false)
      setExporting(true)
      setError(null)
      try {
        const { mod, elements, appState, files } = await getScene()
        const { exportViaDialog } = await import('../../utils/exportHelpers')
        const base = `dibujo-${drawingId || Date.now().toString(36)}`

        if (format === 'png') {
          const blob = await mod.exportToBlob({
            elements,
            appState: { ...appState, exportBackground: true, exportWithDarkMode: false },
            files,
            mimeType: 'image/png'
          })
          const dataBase64 = await blobToBase64(blob)
          const result = await exportViaDialog({
            defaultPath: `${base}.png`,
            filters: [{ name: 'PNG', extensions: ['png'] }],
            dataBase64
          })
          if (result.canceled) return
        } else if (format === 'svg') {
          const svg = await mod.exportToSvg({
            elements,
            appState: { ...appState, exportBackground: true, exportWithDarkMode: false },
            files
          })
          const svgText = new XMLSerializer().serializeToString(svg)
          const result = await exportViaDialog({
            defaultPath: `${base}.svg`,
            filters: [{ name: 'SVG', extensions: ['svg'] }],
            dataText: svgText
          })
          if (result.canceled) return
        } else if (format === 'excalidraw') {
          const sceneJson = mod.serializeAsJSON(elements, appState, files, 'local')
          const result = await exportViaDialog({
            defaultPath: `${base}.excalidraw`,
            filters: [{ name: 'Excalidraw', extensions: ['excalidraw', 'json'] }],
            dataText: sceneJson
          })
          if (result.canceled) return
        }
      } catch (err) {
        if (err?.message !== 'Exportación no disponible') {
          setError(err?.message || 'Error al exportar')
        }
      } finally {
        setExporting(false)
      }
    },
    [drawingId, getScene]
  )

  const uiOptions = useMemo(
    () => ({
      canvasActions: {
        loadScene: false,
        export: false,
        saveToActiveFile: false,
        toggleTheme: true,
        changeViewBackgroundColor: true
      },
      tools: { image: true }
    }),
    []
  )

  const busy = saving || exporting || loading

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-cream"
      role="dialog"
      aria-modal="true"
      aria-label="Editor Excalidraw"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink/10 bg-surface px-[0.85rem] py-[0.55rem]">
        <div className="font-display font-semibold text-ink">Dibujo</div>
        <div className="flex flex-wrap items-center gap-[0.45rem]">
          {error ? <span className="mr-[0.35rem] text-sm text-coral-deep">{error}</span> : null}
          <div className="relative">
            <button
              type="button"
              className={btnGhost}
              onClick={() => setExportOpen((v) => !v)}
              disabled={busy}
              aria-expanded={exportOpen}
            >
              {exporting ? 'Exportando…' : 'Exportar'}
            </button>
            {exportOpen ? (
              <div
                className="absolute top-[calc(100%+0.3rem)] right-0 z-[2] flex min-w-44 flex-col gap-[0.15rem] rounded-sm border border-ink/10 bg-surface p-[0.3rem] shadow-card"
                role="menu"
              >
                <button type="button" role="menuitem" className={exportItem} onClick={() => handleExport('png')}>
                  PNG
                </button>
                <button type="button" role="menuitem" className={exportItem} onClick={() => handleExport('svg')}>
                  SVG
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={exportItem}
                  onClick={() => handleExport('excalidraw')}
                >
                  Excalidraw (.excalidraw)
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className={btnGhost} onClick={onClose} disabled={saving || exporting}>
            Cerrar
          </button>
          <button type="button" className={btnPrimary} onClick={handleSave} disabled={busy}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 [&_.excalidraw]:h-full">
        {loading ? (
          <div className="flex h-full items-center justify-center text-md text-ink-soft">Cargando lienzo…</div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-md text-ink-soft">
                Cargando Excalidraw…
              </div>
            }
          >
            <Excalidraw
              langCode="es-ES"
              theme="light"
              UIOptions={uiOptions}
              initialData={initialData}
              excalidrawAPI={(api) => {
                apiRef.current = api
              }}
            />
          </Suspense>
        )}
      </div>
    </div>,
    document.body
  )
}

/**
 * Inline preview card for an Excalidraw block inside the Lexical note editor.
 */
export default function ExcalidrawBlock({ nodeKey, drawingId, previewSrc }) {
  const [editor] = useLexicalComposerContext()
  const [open, setOpen] = useState(!drawingId)

  const handleSaved = useCallback(
    ({ drawingId: nextId, previewSrc: nextPreview }) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!$isExcalidrawNode(node)) return
        node.setDrawingId(nextId)
        node.setPreviewSrc(nextPreview || '')
      })
      setOpen(false)
    },
    [editor, nodeKey]
  )

  return (
    <>
      <div className="overflow-hidden rounded-sm border border-ink/10 bg-surface">
        <button
          type="button"
          className="m-0 block w-full cursor-pointer border-0 bg-cream p-0 text-left"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen(true)}
        >
          {previewSrc ? (
            <img src={previewSrc} alt="Dibujo Excalidraw" className={excalidrawPreview} />
          ) : (
            <span className="flex min-h-28 items-center justify-center p-4 text-sm text-ink-soft">
              Lienzo vacío — clic para dibujar
            </span>
          )}
        </button>
        <div className="flex items-center justify-between gap-2 border-t border-ink/10 bg-surface px-[0.55rem] py-[0.35rem] text-xs font-semibold text-ink-soft">
          <span>Excalidraw</span>
          <button
            type="button"
            className={cn(btnGhost, 'min-h-[1.6rem] px-[0.55rem] py-[0.15rem] text-xs')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(true)}
          >
            {drawingId ? 'Editar' : 'Dibujar'}
          </button>
        </div>
      </div>
      {open ? (
        <ExcalidrawModal drawingId={drawingId || null} onClose={() => setOpen(false)} onSaved={handleSaved} />
      ) : null}
    </>
  )
}
