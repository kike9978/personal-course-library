import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $getNodeByKey,
  createCommand,
  DecoratorNode
} from 'lexical'

export const INSERT_IMAGE_COMMAND = createCommand('INSERT_IMAGE_COMMAND')

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
    return new ImageNode(node.__src, node.__altText, node.__caption, node.__key)
  }

  static importJSON(serializedNode) {
    const { src, altText, caption } = serializedNode
    return $createImageNode({
      src: typeof src === 'string' ? src : '',
      altText: typeof altText === 'string' ? altText : '',
      caption: typeof caption === 'string' ? caption : ''
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

  constructor(src = '', altText = '', caption = '', key) {
    super(key)
    this.__src = src
    this.__altText = altText
    this.__caption = caption
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'image',
      version: 1,
      src: this.getSrc(),
      altText: this.getAltText(),
      caption: this.getCaption()
    }
  }

  exportDOM() {
    const img = document.createElement('img')
    img.setAttribute('src', this.__src)
    img.setAttribute('alt', this.__altText)
    img.setAttribute('class', 'note-editor__img')
    return { element: img }
  }

  createDOM(config) {
    const span = document.createElement('span')
    const className = config.theme?.image
    if (className) span.className = className
    else span.className = 'note-editor__image'
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

function ImageBlock({ nodeKey, src, altText, caption }) {
  const [editor] = useLexicalComposerContext()
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
    <figure className={`note-editor__figure${open ? ' is-selected' : ''}`} data-image-key={nodeKey}>
      <button
        type="button"
        className="note-editor__image-hit"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label={altText ? `Imagen: ${altText}` : 'Imagen'}
      >
        <img src={src} alt={altText || ''} className="note-editor__img" draggable={false} />
      </button>
      {footer ? <figcaption className="note-editor__caption">{footer}</figcaption> : null}
      {open ? (
        <form
          className="note-editor__image-form"
          onSubmit={(event) => event.preventDefault()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onBeforeInput={(event) => event.stopPropagation()}
        >
          <label>
            Pie de foto
            <input
              className="note-editor__link-input"
              value={footer}
              onChange={(event) => {
                const value = event.target.value
                setFooter(value)
                writeImage(editor, nodeKey, { caption: value })
              }}
              placeholder="Texto bajo la imagen"
            />
          </label>
          <label>
            Texto alternativo
            <input
              className="note-editor__link-input"
              value={alt}
              onChange={(event) => {
                const value = event.target.value
                setAlt(value)
                writeImage(editor, nodeKey, { altText: value })
              }}
              placeholder="Describe la imagen"
            />
          </label>
          <label>
            Enlace
            <span className="note-editor__image-source">
              <input
                className="note-editor__link-input"
                value={source}
                onChange={(event) => {
                  const value = event.target.value
                  setSource(value)
                  writeImage(editor, nodeKey, { src: value })
                }}
                placeholder="course-media:// o https://"
                spellCheck={false}
              />
              <button type="button" onClick={replaceFile}>
                Reemplazar
              </button>
            </span>
          </label>
        </form>
      ) : null}
      <button
        type="button"
        className="note-editor__image-gap"
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

export function $createImageNode({ src, altText = '', caption = '' }) {
  return $applyNodeReplacement(new ImageNode(src, altText, caption))
}

export function $isImageNode(node) {
  return node instanceof ImageNode
}
