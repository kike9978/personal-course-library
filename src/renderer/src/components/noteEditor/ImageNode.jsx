import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { cn } from '../../ui/cn.js'
import { useNoteEditorContext } from './NoteEditorContext'
import { formatTimestampLabel } from './TimestampNode'
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $getNodeByKey,
  createCommand,
  DecoratorNode
} from 'lexical'

export const INSERT_IMAGE_COMMAND = createCommand('INSERT_IMAGE_COMMAND')

const linkInputClass =
  'h-7 min-w-0 flex-1 rounded-[6px] border border-ink/10 bg-cream px-[0.45rem] text-[0.78rem] font-medium text-ink outline-none focus:border-coral'
const imgClass = 'block h-auto max-w-full rounded-[6px] border border-ink/10'
const imageFormBtn =
  'h-7 cursor-pointer rounded-[6px] border border-ink/10 bg-surface px-[0.55rem] text-[0.75rem] font-bold whitespace-nowrap text-ink [font:inherit] hover:border-coral hover:text-coral-deep focus-visible:border-coral focus-visible:text-coral-deep'

/**
 * Lexical DecoratorNode for note image attachments.
 * Follows Lexical docs: decorate() returns React; JSON holds src/alt.
 * @see https://lexical.dev/docs/concepts/nodes
 */
export class ImageNode extends DecoratorNode {
  static getType() {
    return 'image'
  }

  static clone(node) {
    return new ImageNode(node.__src, node.__altText, node.__caption, node.__timeSec, node.__key)
  }

  static importJSON(serializedNode) {
    const { src, altText, caption, timeSec } = serializedNode
    return $createImageNode({
      src: typeof src === 'string' ? src : '',
      altText: typeof altText === 'string' ? altText : '',
      caption: typeof caption === 'string' ? caption : '',
      timeSec: typeof timeSec === 'number' ? timeSec : null
    })
  }

  static importDOM() {
    return {
      img: () => ({
        conversion: (domNode) => {
          const src = domNode.getAttribute('src')
          if (!src) return null
          return {
            node: $createImageNode({
              src,
              altText: domNode.getAttribute('alt') || ''
            })
          }
        },
        priority: 2
      })
    }
  }

  constructor(src = '', altText = '', caption = '', timeSec = null, key) {
    super(key)
    this.__src = src
    this.__altText = altText
    this.__caption = caption
    this.__timeSec = typeof timeSec === 'number' && Number.isFinite(timeSec) ? timeSec : null
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'image',
      version: 1,
      src: this.getSrc(),
      altText: this.getAltText(),
      caption: this.getCaption(),
      timeSec: this.getTimeSec()
    }
  }

  exportDOM() {
    const img = document.createElement('img')
    img.setAttribute('src', this.__src)
    img.setAttribute('alt', this.__altText)
    img.setAttribute('class', imgClass)
    return { element: img }
  }

  createDOM(config) {
    const span = document.createElement('span')
    const className = config.theme?.image
    if (className) span.className = className
    else span.className = 'my-[0.45rem] block'
    return span
  }

  updateDOM() {
    return false
  }

  isInline() {
    return false
  }

  getSrc() {
    return this.getLatest().__src
  }

  getAltText() {
    return this.getLatest().__altText
  }

  getCaption() {
    return this.getLatest().__caption || ''
  }

  getTimeSec() {
    const value = this.getLatest().__timeSec
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  setAltText(altText) {
    const self = this.getWritable()
    self.__altText = altText
    return self
  }

  setCaption(caption) {
    const self = this.getWritable()
    self.__caption = caption
    return self
  }

  setSrc(src) {
    const self = this.getWritable()
    self.__src = src
    return self
  }

  decorate() {
    return (
      <ImageBlock
        nodeKey={this.getKey()}
        src={this.__src}
        altText={this.__altText}
        caption={this.__caption || ''}
        timeSec={this.__timeSec}
      />
    )
  }
}

function writeImage(editor, nodeKey, patch) {
  editor.update(() => {
    const node = $getNodeByKey(nodeKey)
    if (!$isImageNode(node)) return
    if ('altText' in patch) node.setAltText(patch.altText)
    if ('caption' in patch) node.setCaption(patch.caption)
    if ('src' in patch) node.setSrc(patch.src)
  })
}

function focusLineBelow(editor, nodeKey) {
  editor.update(() => {
    const node = $getNodeByKey(nodeKey)
    if (!$isImageNode(node)) return
    let next = node.getNextSibling()
    if (!next || next.getType() !== 'paragraph') {
      const paragraph = $createParagraphNode()
      node.insertAfter(paragraph)
      next = paragraph
    }
    next.selectStart()
  })
  editor.focus()
}

function ImageBlock({ nodeKey, src, altText, caption, timeSec = null }) {
  const [editor] = useLexicalComposerContext()
  const { onSeekTimestamp } = useNoteEditorContext()
  const timed = typeof timeSec === 'number' && Number.isFinite(timeSec)
  const [open, setOpen] = useState(false)
  const [alt, setAlt] = useState(altText || '')
  const [footer, setFooter] = useState(caption || '')
  const [source, setSource] = useState(src || '')

  useEffect(() => {
    setAlt(altText || '')
    setFooter(caption || '')
    setSource(src || '')
  }, [altText, caption, src])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(`[data-image-key="${nodeKey}"]`)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [nodeKey, open])

  const replaceFile = async () => {
    if (!window.api?.pickNoteImage) return
    const picked = await window.api.pickNoteImage()
    if (picked?.canceled || !picked?.url) return
    setSource(picked.url)
    writeImage(editor, nodeKey, { src: picked.url })
  }

  return (
    <figure className="note-editor__figure group m-0" data-image-key={nodeKey}>
      <button
        type="button"
        className="m-0 block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (timed) onSeekTimestamp?.(timeSec)
          else setOpen(true)
        }}
        aria-expanded={open}
        aria-label={
          timed
            ? `Ir a ${formatTimestampLabel(timeSec)}`
            : altText
              ? `Imagen: ${altText}`
              : 'Imagen'
        }
        title={timed ? `Ir a ${formatTimestampLabel(timeSec)}` : undefined}
      >
        <img src={src} alt={altText || ''} className={cn(imgClass, open && 'border-coral')} draggable={false} />
      </button>
      <button
        type="button"
        className="mt-[0.3rem] cursor-pointer rounded-sm border border-ink/10 bg-surface px-[0.45rem] py-[0.15rem] text-[0.72rem] font-bold text-ink-soft hover:border-coral hover:text-coral-deep"
        aria-expanded={open}
        aria-label="Editar imagen"
        title="Editar imagen"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        Editar
      </button>
      {footer ? (
        <figcaption className="mt-[0.35rem] text-[0.82rem] leading-[1.4] text-ink-soft">{footer}</figcaption>
      ) : null}
      {open ? (
        <form
          className="mt-[0.45rem] flex flex-col gap-[0.4rem] rounded-sm border border-ink/10 bg-surface p-[0.55rem]"
          onSubmit={(event) => event.preventDefault()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onBeforeInput={(event) => event.stopPropagation()}
        >
          <label className="flex flex-col gap-[0.2rem] text-[0.72rem] [font-weight:650] text-ink-soft">
            Pie de foto
            <input
              className={linkInputClass}
              value={footer}
              onChange={(event) => {
                const value = event.target.value
                setFooter(value)
                writeImage(editor, nodeKey, { caption: value })
              }}
              placeholder="Texto bajo la imagen"
            />
          </label>
          <label className="flex flex-col gap-[0.2rem] text-[0.72rem] [font-weight:650] text-ink-soft">
            Texto alternativo
            <input
              className={linkInputClass}
              value={alt}
              onChange={(event) => {
                const value = event.target.value
                setAlt(value)
                writeImage(editor, nodeKey, { altText: value })
              }}
              placeholder="Describe la imagen"
            />
          </label>
          <label className="flex flex-col gap-[0.2rem] text-[0.72rem] [font-weight:650] text-ink-soft">
            Enlace
            <span className="flex items-center gap-[0.35rem]">
              <input
                className={linkInputClass}
                value={source}
                onChange={(event) => {
                  const value = event.target.value
                  setSource(value)
                  writeImage(editor, nodeKey, { src: value })
                }}
                placeholder="course-media:// o https://"
                spellCheck={false}
              />
              <button type="button" className={imageFormBtn} onClick={replaceFile}>
                Reemplazar
              </button>
            </span>
          </label>
        </form>
      ) : null}
      <button
        type="button"
        className={cn(
          'mt-[0.15rem] block h-[0.7rem] w-full cursor-text rounded-[4px] border-0 bg-transparent p-0 group-hover:bg-coral/12 focus-visible:bg-coral/12',
          open && 'bg-coral/12'
        )}
        aria-label="Añadir línea debajo"
        title="Añadir línea debajo"
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          focusLineBelow(editor, nodeKey)
          setOpen(false)
        }}
      />
    </figure>
  )
}

export function $createImageNode({ src, altText = '', caption = '', timeSec = null } = {}) {
  return $applyNodeReplacement(new ImageNode(src, altText, caption, timeSec))
}

export function $isImageNode(node) {
  return node instanceof ImageNode
}
