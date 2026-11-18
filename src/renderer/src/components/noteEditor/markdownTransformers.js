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

function mentionFromMatch(textNode, match) {
  const [, mentionType, text, mentionId] = match
  textNode.replace($createMentionNode({ mentionType, mentionId, text }))
}

/** Older notes: @[lesson|Title](id) */
const MENTION_LEGACY = {
  dependencies: [MentionNode],
  export: () => null,
  importRegExp: /@\[(lesson|project|course|topic)\|([^\]]+)]\(([^)]+)\)/,
  regExp: /@\[(lesson|project|course|topic)\|([^\]]+)]\(([^)]+)\)$/,
  replace: mentionFromMatch,
  trigger: ')',
  type: 'text-match'
}

/** Mention: [[lesson|Title|id]] */
const MENTION = {
  dependencies: [MentionNode],
  export: (node) => {
    if (!$isMentionNode(node)) return null
    const type = node.getMentionType()
    const id = node.getMentionId()
    const text = node.getTextContent().replace(/[\]|]/g, ' ')
    return `[[${type}|${text}|${id}]]`
  },
  importRegExp: /\[\[(lesson|project|course|topic|note)\|([^\]|]+)\|([^\]]+)\]\]/,
  regExp: /\[\[(lesson|project|course|topic|note)\|([^\]|]+)\|([^\]]+)\]\]$/,
  replace: mentionFromMatch,
  trigger: ']',
  type: 'text-match'
}

/**
 * Keep the paragraph when this block is the last line, so the caret still has
 * somewhere to go. Import replaces the line; a later pass adds a trailing
 * paragraph when the document ends on a block.
 */
function replaceWithBlock(parentNode, block, isImport) {
  if (isImport || parentNode.getNextSibling() != null) {
    parentNode.replace(block)
    return
  }
  parentNode.insertBefore(block)
}

/**
 * Excalidraw block: ![excalidraw:id](previewUrl)
 * Element (not text-match) so the drawing is a root block. A block decorator
 * nested in a paragraph is contenteditable=false and swallows clicks.
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
  regExp: /^!\[excalidraw:([^\]]*)\]\(([^)]*)\)$/,
  replace: (parentNode, _children, match, isImport) => {
    const [, drawingId, previewSrc] = match
    replaceWithBlock(
      parentNode,
      $createExcalidrawNode({
        drawingId: drawingId || '',
        previewSrc: previewSrc || ''
      }),
      isImport
    )
  },
  type: 'element'
}

/** `url` or `url "caption"` inside the image parentheses. */
function parseImageDestination(raw) {
  const text = String(raw || '').trim()
  const titled = /^(.*\S)\s+"((?:\\.|[^"])*)"\s*$/.exec(text)
  if (!titled) return { src: text, caption: '' }
  return {
    src: titled[1].trim(),
    caption: titled[2].replace(/\\"/g, '"')
  }
}

function imageTimeSuffix(node) {
  const time = node.getTimeSec()
  if (typeof time !== 'number' || !Number.isFinite(time)) return ''
  const rounded = Math.round(time * 1000) / 1000
  return `{t:${rounded}}`
}

/** Image: ![alt](src), optional caption, optional `{t:seconds}` seek target. Root block. */
const IMAGE = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) return null
    const alt = node.getAltText() || ''
    const src = node.getSrc() || ''
    const caption = node.getCaption() || ''
    const suffix = imageTimeSuffix(node)
    if (!caption) return `![${alt}](${src})${suffix}`
    return `![${alt}](${src} "${caption.replace(/"/g, '\\"')}")${suffix}`
  },
  regExp: /^!\[([^\][]*)\]\((.*)\)(?:\{t:([0-9]+(?:\.[0-9]+)?)\})?\s*$/,
  replace: (parentNode, _children, match, isImport) => {
    const [, altText, dest, timeRaw] = match
    if (String(altText || '').startsWith('excalidraw:')) return false
    const { src, caption } = parseImageDestination(dest)
    if (!src) return false
    const timeSec = timeRaw == null || timeRaw === '' ? null : Number(timeRaw)
    replaceWithBlock(
      parentNode,
      $createImageNode({
        src,
        altText: altText || '',
        caption,
        timeSec: Number.isFinite(timeSec) ? timeSec : null
      }),
      isImport
    )
  },
  type: 'element'
}

/** Transformers used for import/export + markdown shortcuts in notes. */
export const NOTE_TRANSFORMERS = [
  TIMESTAMP,
  MENTION,
  MENTION_LEGACY,
  EXCALIDRAW,
  IMAGE,
  HR,
  ...TRANSFORMERS
]
