import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import { useNoteEditorContext } from './NoteEditorContext'

export const INSERT_TIMESTAMP_COMMAND = createCommand('INSERT_TIMESTAMP_COMMAND')

function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * Timestamp chip that seeks the course video when clicked.
 * Markdown: @[time:123](4:12)
 */
export class TimestampNode extends DecoratorNode {
  static getType() {
    return 'timestamp'
  }

  static clone(node) {
    return new TimestampNode(node.__timeSec, node.__label, node.__key)
  }

  static importJSON(serializedNode) {
    return $createTimestampNode({
      timeSec: typeof serializedNode.timeSec === 'number' ? serializedNode.timeSec : 0,
      label: typeof serializedNode.label === 'string' ? serializedNode.label : ''
    })
  }

  constructor(timeSec = 0, label = '', key) {
    super(key)
    this.__timeSec = timeSec
    this.__label = label
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'timestamp',
      version: 1,
      timeSec: this.getTimeSec(),
      label: this.getLabel()
    }
  }

  exportDOM() {
    const span = document.createElement('span')
    span.setAttribute('class', 'note-editor__timestamp')
    span.setAttribute('data-time-sec', String(this.__timeSec))
    span.textContent = this.getDisplayLabel()
    return { element: span }
  }

  createDOM(config) {
    const span = document.createElement('span')
    span.className = config.theme?.timestamp || 'note-editor__timestamp-wrap'
    return span
  }

  updateDOM() {
    return false
  }

  isInline() {
    return true
  }

  getTimeSec() {
    return this.getLatest().__timeSec
  }

  getLabel() {
    return this.getLatest().__label
  }

  getDisplayLabel() {
    return this.getLabel() || formatTime(this.getTimeSec())
  }

  decorate() {
    return <TimestampChip timeSec={this.__timeSec} label={this.getDisplayLabel()} />
  }
}

function TimestampChip({ timeSec, label }) {
  const { onSeekTimestamp } = useNoteEditorContext()
  return (
    <button
      type="button"
      className="note-editor__timestamp"
      title={`Ir a ${label}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSeekTimestamp?.(timeSec)
      }}
    >
      {label}
    </button>
  )
}

export function $createTimestampNode({ timeSec = 0, label = '' } = {}) {
  const sec = Math.max(0, Number(timeSec) || 0)
  return $applyNodeReplacement(new TimestampNode(sec, label || formatTime(sec)))
}

export function $isTimestampNode(node) {
  return node instanceof TimestampNode
}

export { formatTime as formatTimestampLabel }
