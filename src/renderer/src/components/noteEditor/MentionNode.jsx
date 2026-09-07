import { $applyNodeReplacement, TextNode } from 'lexical'

/**
 * Mention of a lesson, project, or course — markdown: @[lesson|title](path)
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
    return dom
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
