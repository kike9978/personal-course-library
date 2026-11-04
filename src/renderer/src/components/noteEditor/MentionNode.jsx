import { $applyNodeReplacement, TextNode } from 'lexical'

/**
 * Mention of a note, lesson, project, course, or topic — markdown: [[type|title|id]]
 */
export class MentionNode extends TextNode {
  static getType() {
    return 'mention'
  }

  static clone(node) {
    return new MentionNode(node.__mentionType, node.__mentionId, node.__text, node.__key)
  }

  static importJSON(serializedNode) {
    return $createMentionNode({
      mentionType: serializedNode.mentionType || 'lesson',
      mentionId: serializedNode.mentionId || '',
      text: serializedNode.text || ''
    })
  }

  constructor(mentionType = 'lesson', mentionId = '', text = '', key) {
    super(text || mentionId, key)
    this.__mentionType = mentionType
    this.__mentionId = mentionId
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'mention',
      version: 1,
      mentionType: this.getMentionType(),
      mentionId: this.getMentionId()
    }
  }

  createDOM(config) {
    const dom = super.createDOM(config)
    dom.className = config.theme?.mention || 'note-editor__mention'
    dom.spellcheck = false
    dom.dataset.mentionType = this.getMentionType()
    dom.dataset.mentionId = this.getMentionId()
    return dom
  }

  updateDOM(prevNode, dom, config) {
    const updated = super.updateDOM(prevNode, dom, config)
    dom.dataset.mentionType = this.__mentionType
    dom.dataset.mentionId = this.__mentionId
    return updated
  }

  isToken() {
    return true
  }

  canInsertTextBefore() {
    return false
  }

  canInsertTextAfter() {
    return false
  }

  getMentionType() {
    return this.getLatest().__mentionType
  }

  getMentionId() {
    return this.getLatest().__mentionId
  }
}

export function $createMentionNode({ mentionType = 'lesson', mentionId = '', text = '' }) {
  const label = text || mentionId
  const node = new MentionNode(mentionType, mentionId, label)
  node.setMode('token')
  return $applyNodeReplacement(node)
}

export function $isMentionNode(node) {
  return node instanceof MentionNode
}
