import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'

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
    return new ImageNode(node.__src, node.__altText, node.__key)
  }

  static importJSON(serializedNode) {
    const { src, altText } = serializedNode
    return $createImageNode({
      src: typeof src === 'string' ? src : '',
      altText: typeof altText === 'string' ? altText : ''
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

  constructor(src = '', altText = '', key) {
    super(key)
    this.__src = src
    this.__altText = altText
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'image',
      version: 1,
      src: this.getSrc(),
      altText: this.getAltText()
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

  setAltText(altText) {
    const self = this.getWritable()
    self.__altText = altText
    return self
  }

  decorate() {
    return (
      <img
        src={this.__src}
        alt={this.__altText || ''}
        className="note-editor__img"
        draggable={false}
      />
    )
  }
}

export function $createImageNode({ src, altText = '' }) {
  return $applyNodeReplacement(new ImageNode(src, altText))
}

export function $isImageNode(node) {
  return node instanceof ImageNode
}
