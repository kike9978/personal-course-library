import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import ExcalidrawBlock from './ExcalidrawBlock'

export const INSERT_EXCALIDRAW_COMMAND = createCommand('INSERT_EXCALIDRAW_COMMAND')

/**
 * Lexical DecoratorNode for an Excalidraw drawing embedded in a note.
 * Stores drawingId + preview image URL; scene lives in note-attachments.
 */
export class ExcalidrawNode extends DecoratorNode {
  static getType() {
    return 'excalidraw'
  }

  static clone(node) {
    return new ExcalidrawNode(node.__drawingId, node.__previewSrc, node.__key)
  }

  static importJSON(serializedNode) {
    return $createExcalidrawNode({
      drawingId: typeof serializedNode.drawingId === 'string' ? serializedNode.drawingId : '',
      previewSrc: typeof serializedNode.previewSrc === 'string' ? serializedNode.previewSrc : ''
    })
  }

  constructor(drawingId = '', previewSrc = '', key) {
    super(key)
    this.__drawingId = drawingId
    this.__previewSrc = previewSrc
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'excalidraw',
      version: 1,
      drawingId: this.getDrawingId(),
      previewSrc: this.getPreviewSrc()
    }
  }

  exportDOM() {
    const wrap = document.createElement('div')
    wrap.setAttribute('class', 'note-editor__excalidraw-export')
    wrap.setAttribute('data-excalidraw-id', this.__drawingId || '')
    if (this.__previewSrc) {
      const img = document.createElement('img')
      img.setAttribute('src', this.__previewSrc)
      img.setAttribute('alt', 'Dibujo Excalidraw')
      img.setAttribute('class', 'note-editor__excalidraw-preview')
      wrap.appendChild(img)
    } else {
      wrap.textContent = 'Dibujo Excalidraw'
    }
    return { element: wrap }
  }

  createDOM(config) {
    const div = document.createElement('div')
    const className = config.theme?.excalidraw
    div.className = className || 'note-editor__excalidraw'
    return div
  }

  updateDOM() {
    return false
  }

  isInline() {
    return false
  }

  getDrawingId() {
    return this.getLatest().__drawingId
  }

  getPreviewSrc() {
    return this.getLatest().__previewSrc
  }

  setDrawingId(drawingId) {
    const self = this.getWritable()
    self.__drawingId = drawingId
    return self
  }

  setPreviewSrc(previewSrc) {
    const self = this.getWritable()
    self.__previewSrc = previewSrc
    return self
  }

  decorate() {
    return (
      <ExcalidrawBlock
        nodeKey={this.getKey()}
        drawingId={this.__drawingId}
        previewSrc={this.__previewSrc}
      />
    )
  }
}

export function $createExcalidrawNode({ drawingId = '', previewSrc = '' } = {}) {
  return $applyNodeReplacement(new ExcalidrawNode(drawingId, previewSrc))
}

export function $isExcalidrawNode(node) {
  return node instanceof ExcalidrawNode
}
