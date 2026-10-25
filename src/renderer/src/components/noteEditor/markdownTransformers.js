import { TRANSFORMERS } from '@lexical/markdown'
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode
} from '@lexical/react/LexicalHorizontalRuleNode'
import { $createImageNode, $isImageNode, ImageNode } from './ImageNode'
import { $createExcalidrawNode, $isExcalidrawNode, ExcalidrawNode } from './ExcalidrawNode'
import {
  $createTimestampNode,
  $isTimestampNode,
  TimestampNode,
  formatTimestampLabel
} from './TimestampNode'
import { $createMentionNode, $isMentionNode, MentionNode } from './MentionNode'

/** Horizontal rule: --- */
const HR = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? '***' : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _children, _match, isImport) => {
    const line = $createHorizontalRuleNode()
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line)
    } else {
      parentNode.insertBefore(line)
    }
    line.selectNext()
  },
  triggerOnEnter: true,
  type: 'element'
}

/** Timestamp: @[time:12.5](0:12) */
const TIMESTAMP = {
  dependencies: [TimestampNode],
  export: (node) => {
    if (!$isTimestampNode(node)) return null
    const sec = node.getTimeSec()
    const label = node.getDisplayLabel()
    return `@[time:${sec}](${label})`
  },
  importRegExp: /@\[time:([0-9.]+)]\(([^)]*)\)/,
  regExp: /@\[time:([0-9.]+)]\(([^)]*)\)$/,
  replace: (textNode, match) => {
    const [, secRaw, label] = match
    textNode.replace(
      $createTimestampNode({
        timeSec: Number(secRaw) || 0,
        label: label || formatTimestampLabel(Number(secRaw) || 0)
      })
    )
  },
  trigger: ')',
  type: 'text-match'
}

/** Mention: @[lesson|Title](id) */
const MENTION = {
  dependencies: [MentionNode],
  export: (node) => {
    if (!$isMentionNode(node)) return null
    const type = node.getMentionType()
    const id = node.getMentionId()
    const text = node.getTextContent()
    return `@[${type}|${text}](${id})`
  },
  importRegExp: /@\[(lesson|project|course|topic)\|([^\]]+)]\(([^)]+)\)/,
  regExp: /@\[(lesson|project|course|topic)\|([^\]]+)]\(([^)]+)\)$/,
  replace: (textNode, match) => {
    const [, mentionType, text, mentionId] = match
    textNode.replace($createMentionNode({ mentionType, mentionId, text }))
  },
  trigger: ')',
  type: 'text-match'
}

/**
 * Excalidraw block: ![excalidraw:id](previewUrl)
 * Must be registered before IMAGE so it wins over the generic image pattern.
 */
const EXCALIDRAW = {
  dependencies: [ExcalidrawNode],
  export: (node) => {
    if (!$isExcalidrawNode(node)) return null
    const id = node.getDrawingId() || ''
    const preview = node.getPreviewSrc() || ''
    return `![excalidraw:${id}](${preview})`
  },
  importRegExp: /!\[excalidraw:([^\]]*)\]\(([^)]*)\)/,
  regExp: /!\[excalidraw:([^\]]*)\]\(([^)]*)\)$/,
  replace: (textNode, match) => {
    const [, drawingId, previewSrc] = match
    textNode.replace(
      $createExcalidrawNode({
        drawingId: drawingId || '',
        previewSrc: previewSrc || ''
      })
    )
  },
  trigger: ')',
  type: 'text-match'
}

/** Image: ![alt](src) */
const IMAGE = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) return null
    const alt = node.getAltText() || ''
    const src = node.getSrc() || ''
    return `![${alt}](${src})`
  },
  importRegExp: /!\[([^\][]*)\]\(([^)]+)\)/,
  regExp: /!\[([^\][]*)\]\(([^)]+)\)$/,
  replace: (textNode, match) => {
    const [, altText, src] = match
    textNode.replace($createImageNode({ src, altText: altText || '' }))
  },
  trigger: ')',
  type: 'text-match'
}

/** Transformers used for import/export + markdown shortcuts in notes. */
export const NOTE_TRANSFORMERS = [TIMESTAMP, MENTION, EXCALIDRAW, IMAGE, HR, ...TRANSFORMERS]
