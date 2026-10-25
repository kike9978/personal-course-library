import { useEffect, useMemo, useRef, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin'
import { AutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin'
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin'
import { HashtagPlugin } from '@lexical/react/LexicalHashtagPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { DraggableBlockPlugin_EXPERIMENTAL } from '@lexical/react/LexicalDraggableBlockPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND
} from '@lexical/react/LexicalHorizontalRuleNode'
import {
  HeadingNode,
  QuoteNode,
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode
} from '@lexical/rich-text'
import {
  ListNode,
  ListItemNode,
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  REMOVE_LIST_COMMAND
} from '@lexical/list'
import {
  LinkNode,
  AutoLinkNode,
  TOGGLE_LINK_COMMAND,
  $isLinkNode,
  $createLinkNode,
  $toggleLink,
  autoLinkUrlMatcher,
  autoLinkEmailMatcher
} from '@lexical/link'
import { HashtagNode } from '@lexical/hashtag'
import {
  TableNode,
  TableCellNode,
  TableRowNode,
  INSERT_TABLE_COMMAND
} from '@lexical/table'
import { CodeNode, CodeHighlightNode, $createCodeNode, $isCodeNode } from '@lexical/code-core'
import { $setBlocksType } from '@lexical/selection'
import { $findMatchingParent, $wrapNodeInElement, mergeRegister } from '@lexical/utils'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { marked } from 'marked'
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $createParagraphNode,
  $createTextNode,
  $insertNodes,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  DROP_COMMAND,
  DRAGOVER_COMMAND
} from 'lexical'
import { ImageNode, $createImageNode, INSERT_IMAGE_COMMAND } from './noteEditor/ImageNode'
import {
  ExcalidrawNode,
  $createExcalidrawNode,
  INSERT_EXCALIDRAW_COMMAND
} from './noteEditor/ExcalidrawNode'
import {
  TimestampNode,
  $createTimestampNode,
  INSERT_TIMESTAMP_COMMAND,
  formatTimestampLabel
} from './noteEditor/TimestampNode'
import { MentionNode } from './noteEditor/MentionNode'
import { NOTE_TRANSFORMERS } from './noteEditor/markdownTransformers'
import { NoteEditorContext } from './noteEditor/NoteEditorContext'
import FloatingLinkEditorPlugin from './noteEditor/FloatingLinkEditor'
import SlashMenuPlugin from './noteEditor/SlashMenuPlugin'
import MentionsPlugin from './noteEditor/MentionsPlugin'

const AUTO_LINK_MATCHERS = [autoLinkUrlMatcher, autoLinkEmailMatcher]

const theme = {
  paragraph: 'note-editor__p',
  quote: 'note-editor__quote',
  heading: { h2: 'note-editor__h2', h3: 'note-editor__h3' },
  code: 'note-editor__code-block',
  codeHighlight: {
    atrule: 'note-editor__token-attr',
    attr: 'note-editor__token-attr',
    boolean: 'note-editor__token-bool',
    builtin: 'note-editor__token-builtin',
    cdata: 'note-editor__token-comment',
    char: 'note-editor__token-string',
    class: 'note-editor__token-class',
    'class-name': 'note-editor__token-class',
    comment: 'note-editor__token-comment',
    constant: 'note-editor__token-const',
    deleted: 'note-editor__token-deleted',
    doctype: 'note-editor__token-comment',
    entity: 'note-editor__token-operator',
    function: 'note-editor__token-function',
    important: 'note-editor__token-important',
    inserted: 'note-editor__token-inserted',
    keyword: 'note-editor__token-keyword',
    namespace: 'note-editor__token-namespace',
    number: 'note-editor__token-number',
    operator: 'note-editor__token-operator',
    prolog: 'note-editor__token-comment',
    property: 'note-editor__token-property',
    punctuation: 'note-editor__token-punct',
    regex: 'note-editor__token-regex',
    selector: 'note-editor__token-selector',
    string: 'note-editor__token-string',
    symbol: 'note-editor__token-symbol',
    tag: 'note-editor__token-tag',
    url: 'note-editor__token-url',
    variable: 'note-editor__token-variable'
  },
  image: 'note-editor__image',
  excalidraw: 'note-editor__excalidraw',
  timestamp: 'note-editor__timestamp-wrap',
  mention: 'note-editor__mention',
  hashtag: 'note-editor__hashtag',
  hr: 'note-editor__hr',
  table: 'note-editor__table',
  tableCell: 'note-editor__table-cell',
  tableCellHeader: 'note-editor__table-cell-header',
  tableRow: 'note-editor__table-row',
  list: {
    ul: 'note-editor__ul',
    ol: 'note-editor__ol',
    checklist: 'note-editor__checklist',
    listitem: 'note-editor__li',
    listitemChecked: 'note-editor__li--checked',
    listitemUnchecked: 'note-editor__li--unchecked',
    nested: { listitem: 'note-editor__li--nested' }
  },
  link: 'note-editor__link',
  text: {
    bold: 'note-editor__bold',
    italic: 'note-editor__italic',
    underline: 'note-editor__underline',
    strikethrough: 'note-editor__strike',
    code: 'note-editor__code'
  }
}

const editorNodes = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  HashtagNode,
  CodeNode,
  CodeHighlightNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  HorizontalRuleNode,
  ImageNode,
  ExcalidrawNode,
  TimestampNode,
  MentionNode
]

function onError(error) {
  console.error('[NoteEditor]', error)
}

/** Seed editor from markdown (canonical) or legacy Lexical JSON. */
function buildEditorState(bodyMarkdown, bodyJson) {
  if (bodyJson) {
    try {
      const parsed = JSON.parse(bodyJson)
      const children = parsed?.root?.children
      if (Array.isArray(children) && children.length > 0) {
        return bodyJson
      }
    } catch {
      // fall through to markdown
    }
  }

  return () => {
    const markdown = String(bodyMarkdown || '')
    if (!markdown.trim()) {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode())
      return
    }
    $convertFromMarkdownString(markdown, NOTE_TRANSFORMERS)
  }
}

const emptyToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  code: false,
  link: false,
  block: 'paragraph'
}

function getSelectedBlockType(selection) {
  const anchorNode = selection.anchor.getNode()
  const codeParent = $findMatchingParent(anchorNode, $isCodeNode)
  if (codeParent) return 'code'

  let element =
    anchorNode.getKey() === 'root'
      ? anchorNode
      : $findMatchingParent(anchorNode, (node) => {
          const parent = node.getParent()
          return parent !== null && $isRootOrShadowRoot(parent)
        })

  if (element === null) {
    element = anchorNode.getTopLevelElementOrThrow()
  }

  if ($isListNode(element)) {
    const listType = element.getListType()
    if (listType === 'check') return 'check'
    return listType === 'number' ? 'ol' : 'ul'
  }
  if ($isHeadingNode(element)) {
    return element.getTag()
  }
  if ($isQuoteNode(element)) {
    return 'quote'
  }
  if ($isCodeNode(element)) {
    return 'code'
  }
  return 'paragraph'
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

async function persistImageFile(file) {
  if (!file || !String(file.type || '').startsWith('image/')) return null
  if (!window.api?.saveNoteImage) return null
  const dataBase64 = await fileToBase64(file)
  const saved = await window.api.saveNoteImage({
    dataBase64,
    mimeType: file.type,
    fileName: file.name
  })
  if (!saved?.ok || !saved.url) return null
  return { src: saved.url, altText: file.name || 'Imagen' }
}

function ImagesPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const insertFromPayload = (payload) => {
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, payload)
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_IMAGE_COMMAND,
        (payload) => {
          const src = payload?.src
          if (!src) return false
          const imageNode = $createImageNode({
            src,
            altText: payload.altText || ''
          })
          $insertNodes([imageNode])
          if ($isRootOrShadowRoot(imageNode.getParentOrThrow())) {
            $wrapNodeInElement(imageNode, $createParagraphNode).selectEnd()
          } else {
            imageNode.selectNext()
          }
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand(
        INSERT_EXCALIDRAW_COMMAND,
        () => {
          const node = $createExcalidrawNode()
          $insertNodes([node])
          if ($isRootOrShadowRoot(node.getParentOrThrow())) {
            $wrapNodeInElement(node, $createParagraphNode).selectEnd()
          } else {
            node.selectNext()
          }
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand(
        INSERT_TIMESTAMP_COMMAND,
        (payload) => {
          const timeSec = typeof payload?.timeSec === 'number' ? payload.timeSec : 0
          const node = $createTimestampNode({
            timeSec,
            label: formatTimestampLabel(timeSec)
          })
          $insertNodes([node])
          const space = $createTextNode(' ')
          node.insertAfter(space)
          space.select()
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event) => {
          const dt = event.dataTransfer
          if (!dt?.types?.includes('Files')) return false
          event.preventDefault()
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          const files = Array.from(event.dataTransfer?.files || [])
          const image = files.find((f) => String(f.type || '').startsWith('image/'))
          if (!image) return false
          event.preventDefault()
          persistImageFile(image).then((payload) => {
            if (payload) insertFromPayload(payload)
          })
          return true
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const clipboard = event.clipboardData
          if (!clipboard) return false
          const files = Array.from(clipboard.files || [])
          const image = files.find((f) => String(f.type || '').startsWith('image/'))
          if (!image) return false
          event.preventDefault()
          persistImageFile(image).then((payload) => {
            if (payload) insertFromPayload(payload)
          })
          return true
        },
        COMMAND_PRIORITY_HIGH
      )
    )
  }, [editor])

  return null
}

function normalizeLinkUrl(raw) {
  const url = String(raw || '').trim()
  if (!url) return null
  if (/^(https?:|mailto:|tel:|\/|#|\.)/i.test(url)) return url
  if (url.includes('@') && !url.includes(' ')) return `mailto:${url}`
  return `https://${url}`
}

function ToolbarPlugin({ enableTimestamp = false, currentTimeSec = 0 }) {
  const [editor] = useLexicalComposerContext()
  const [formats, setFormats] = useState(emptyToolbarState)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const linkInputRef = useRef(null)

  useEffect(() => {
    const sync = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return

        const linkParent = $findMatchingParent(selection.anchor.getNode(), $isLinkNode)
        setFormats({
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          underline: selection.hasFormat('underline'),
          strikethrough: selection.hasFormat('strikethrough'),
          code: selection.hasFormat('code'),
          link: Boolean(linkParent),
          block: getSelectedBlockType(selection)
        })
      })
    }

    return mergeRegister(
      editor.registerUpdateListener(sync),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          sync()
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor])

  useEffect(() => {
    if (!linkOpen) return
    const id = window.setTimeout(() => linkInputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [linkOpen])

  const formatText = (format) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
  }

  const setBlock = (type) => {
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      const current = getSelectedBlockType(selection)
      if (type === 'quote') {
        $setBlocksType(selection, () =>
          current === 'quote' ? $createParagraphNode() : $createQuoteNode()
        )
        return
      }
      if (type === 'code') {
        if (current === 'code') {
          $setBlocksType(selection, () => $createParagraphNode())
        } else {
          $setBlocksType(selection, () => $createCodeNode())
        }
        return
      }
      if (type === 'h2' || type === 'h3') {
        $setBlocksType(selection, () =>
          current === type ? $createParagraphNode() : $createHeadingNode(type)
        )
      }
    })
  }

  const toggleList = (listType) => {
    const isActive = formats.block === listType
    if (isActive) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
      return
    }
    if (listType === 'check') {
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
      return
    }
    editor.dispatchCommand(
      listType === 'ol' ? INSERT_ORDERED_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
      undefined
    )
  }

  const openLinkEditor = () => {
    let current = 'https://'
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      const linkParent = $findMatchingParent(selection.anchor.getNode(), $isLinkNode)
      if (linkParent) current = linkParent.getURL() || 'https://'
    })
    setLinkUrl(current)
    setLinkOpen(true)
  }

  const applyLink = () => {
    const url = normalizeLinkUrl(linkUrl)
    if (!url) return

    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      if (selection.isCollapsed()) {
        const linkParent = $findMatchingParent(selection.anchor.getNode(), $isLinkNode)
        if (linkParent) {
          linkParent.setURL(url)
        } else {
          const linkNode = $createLinkNode(url)
          linkNode.append($createTextNode(url))
          selection.insertNodes([linkNode])
          linkNode.selectEnd()
        }
        return
      }

      $toggleLink(url)
    })
    setLinkOpen(false)
  }

  const removeLink = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    setLinkOpen(false)
  }

  const insertHr = () => {
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
  }

  const insertImage = async () => {
    if (!window.api?.pickNoteImage) return
    const picked = await window.api.pickNoteImage()
    if (picked?.canceled || !picked?.url) return
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
      src: picked.url,
      altText: picked.fileName || 'Imagen'
    })
  }

  const insertExcalidraw = () => {
    editor.dispatchCommand(INSERT_EXCALIDRAW_COMMAND, undefined)
  }

  const insertTable = () => {
    editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      rows: '3',
      columns: '3',
      includeHeaders: true
    })
  }

  const insertTimestamp = () => {
    editor.dispatchCommand(INSERT_TIMESTAMP_COMMAND, { timeSec: currentTimeSec })
  }

  return (
    <div className="note-editor__toolbar" role="toolbar" aria-label="Formato">
      <button
        type="button"
        className={formats.bold ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('bold')}
        title="Negrita"
        aria-pressed={formats.bold}
      >
        B
      </button>
      <button
        type="button"
        className={formats.italic ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('italic')}
        title="Cursiva"
        aria-pressed={formats.italic}
      >
        I
      </button>
      <button
        type="button"
        className={formats.underline ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('underline')}
        title="Subrayado"
        aria-pressed={formats.underline}
      >
        U
      </button>
      <button
        type="button"
        className={formats.strikethrough ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('strikethrough')}
        title="Tachado"
        aria-pressed={formats.strikethrough}
      >
        S
      </button>
      <button
        type="button"
        className={formats.code ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('code')}
        title="Código en línea"
        aria-pressed={formats.code}
      >
        {'</>'}
      </button>
      <span className="note-editor__toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        className={formats.block === 'h2' ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setBlock('h2')}
        title="Título"
        aria-pressed={formats.block === 'h2'}
      >
        H2
      </button>
      <button
        type="button"
        className={formats.block === 'h3' ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setBlock('h3')}
        title="Subtítulo"
        aria-pressed={formats.block === 'h3'}
      >
        H3
      </button>
      <button
        type="button"
        className={formats.block === 'quote' ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setBlock('quote')}
        title="Cita"
        aria-pressed={formats.block === 'quote'}
      >
        “ ”
      </button>
      <button
        type="button"
        className={formats.block === 'code' ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setBlock('code')}
        title="Bloque de código"
        aria-pressed={formats.block === 'code'}
      >
        Code
      </button>
      <span className="note-editor__toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        className={formats.block === 'ul' ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleList('ul')}
        title="Lista"
        aria-pressed={formats.block === 'ul'}
      >
        •
      </button>
      <button
        type="button"
        className={formats.block === 'ol' ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleList('ol')}
        title="Lista numerada"
        aria-pressed={formats.block === 'ol'}
      >
        1.
      </button>
      <button
        type="button"
        className={formats.block === 'check' ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleList('check')}
        title="Lista de tareas"
        aria-pressed={formats.block === 'check'}
      >
        ☐
      </button>
      <span className="note-editor__toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={insertHr}
        title="Separador"
      >
        ―
      </button>
      <button
        type="button"
        className={formats.link || linkOpen ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (linkOpen ? setLinkOpen(false) : openLinkEditor())}
        title="Enlace"
        aria-pressed={formats.link || linkOpen}
      >
        Link
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={insertImage}
        title="Adjuntar imagen"
      >
        Img
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={insertExcalidraw}
        title="Dibujo Excalidraw"
      >
        Draw
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={insertTable}
        title="Insertar tabla"
      >
        Table
      </button>
      {enableTimestamp ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertTimestamp}
          title="Marca de tiempo del video"
        >
          Time
        </button>
      ) : null}
      {linkOpen ? (
        <form
          className="note-editor__link-form"
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <input
            ref={linkInputRef}
            className="note-editor__link-input"
            type="text"
            inputMode="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="https://"
            aria-label="URL del enlace"
          />
          <button type="submit" title="Aplicar enlace">
            OK
          </button>
          {formats.link ? (
            <button type="button" onClick={removeLink} title="Quitar enlace">
              Quitar
            </button>
          ) : null}
          <button type="button" onClick={() => setLinkOpen(false)} title="Cancelar">
            ✕
          </button>
        </form>
      ) : null}
    </div>
  )
}

function AutoFocusPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const id = window.setTimeout(() => {
      editor.focus()
    }, 0)
    return () => window.clearTimeout(id)
  }, [editor])
  return null
}

const DRAGGABLE_BLOCK_MENU_CLASSNAME = 'note-editor__drag-handle'

function isOnDragMenu(element) {
  return Boolean(element.closest(`.${DRAGGABLE_BLOCK_MENU_CLASSNAME}`))
}

/** Lexical experimental block reorder handle (hover grip + drop line). */
function DraggableBlocksPlugin({ anchorElem }) {
  const menuRef = useRef(null)
  const targetLineRef = useRef(null)

  if (!anchorElem) return null

  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      isOnMenu={isOnDragMenu}
      menuComponent={
        <div
          ref={menuRef}
          className={DRAGGABLE_BLOCK_MENU_CLASSNAME}
          title="Arrastrar bloque"
          aria-label="Arrastrar bloque"
        >
          <span className="note-editor__drag-handle-icon" aria-hidden="true" />
        </div>
      }
      targetLineComponent={
        <div ref={targetLineRef} className="note-editor__drag-line" />
      }
    />
  )
}

/**
 * Lexical note editor with markdown as the persistence format.
 * onChange → { text, markdown } where both are the markdown source.
 */
function NoteEditor({
  editorKey = 'new',
  bodyText = '',
  bodyJson = null,
  placeholder = 'Escribe…',
  autofocus = false,
  variant = 'compact',
  onChange,
  onSeekTimestamp = null,
  currentTimeSec = 0,
  enableTimestamp = false,
  mentionItems = [],
  onCreateTopic = null
}) {
  const [anchorElem, setAnchorElem] = useState(null)

  const editorContext = useMemo(
    () => ({
      onSeekTimestamp,
      currentTimeSec
    }),
    [onSeekTimestamp, currentTimeSec]
  )

  const initialConfig = useMemo(
    () => ({
      namespace: `NoteEditor-${editorKey}`,
      theme,
      onError,
      editable: true,
      nodes: editorNodes,
      editorState: buildEditorState(bodyText, bodyJson)
    }),
    // Remount via key from parent; config frozen per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorKey]
  )

  const handleChange = (editorState, editor) => {
    editorState.read(() => {
      const markdown = $convertToMarkdownString(NOTE_TRANSFORMERS)
      onChange?.({ text: markdown, markdown })
    })
  }

  return (
    <NoteEditorContext.Provider value={editorContext}>
      <div className={`note-editor${variant === 'document' ? ' note-editor--document' : ''}`}>
        <LexicalComposer initialConfig={initialConfig}>
          <ToolbarPlugin
            enableTimestamp={enableTimestamp}
            currentTimeSec={currentTimeSec}
          />
          <div className="note-editor__shell">
            <div
              className="note-editor__anchor"
              ref={(el) => {
                if (el) setAnchorElem(el)
              }}
            >
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    className="note-editor__input"
                    aria-placeholder={placeholder}
                    placeholder={<div className="note-editor__placeholder">{placeholder}</div>}
                  />
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <DraggableBlocksPlugin anchorElem={anchorElem} />
              <FloatingLinkEditorPlugin anchorElem={anchorElem} />
            </div>
          </div>
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <LinkPlugin />
          <ClickableLinkPlugin newTab />
          <AutoLinkPlugin matchers={AUTO_LINK_MATCHERS} />
          <TabIndentationPlugin />
          <HashtagPlugin />
          <TablePlugin hasCellMerge hasCellBackgroundColor={false} hasHorizontalScroll />
          <HorizontalRulePlugin />
          <MarkdownShortcutPlugin transformers={NOTE_TRANSFORMERS} />
          <ImagesPlugin />
          <SlashMenuPlugin
            currentTimeSec={currentTimeSec}
            enableTimestamp={enableTimestamp}
          />
          <MentionsPlugin mentionItems={mentionItems} onCreateTopic={onCreateTopic} />
          <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
          {autofocus ? <AutoFocusPlugin /> : null}
        </LexicalComposer>
      </div>
    </NoteEditorContext.Provider>
  )
}

/** Read-only markdown rendering for annotation lists / previews. */
function NoteBody({ body }) {
  const markdown = String(body || '').trim()
  if (!markdown) {
    return <p className="note-body note-body--muted">Sin texto</p>
  }

  marked.setOptions({ gfm: true, breaks: true })
  const html = marked.parse(markdown)
  return <div className="note-body note-body--md" dangerouslySetInnerHTML={{ __html: html }} />
}

export { NoteBody }
export default NoteEditor
