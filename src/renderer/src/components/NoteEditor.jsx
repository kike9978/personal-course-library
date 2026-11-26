import {
  Bold as BoldIcon,
  Check as CheckIcon,
  Code as CodeIcon,
  Heading2 as Heading2Icon,
  Heading3 as Heading3Icon,
  ImagePlus as ImagePlusIcon,
  Italic as ItalicIcon,
  Link as LinkIcon,
  List as ListIcon,
  ListChecks as ListChecksIcon,
  ListOrdered as ListOrderedIcon,
  Minus as MinusIcon,
  PenTool as PenToolIcon,
  Quote as QuoteIcon,
  SquareCode as SquareCodeIcon,
  Strikethrough as StrikethroughIcon,
  Table2 as Table2Icon,
  Type as TypeIcon,
  Underline as UnderlineIcon,
  Unlink as UnlinkIcon,
  X as XIcon,
} from 'lucide-react'
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
import { $findMatchingParent, mergeRegister } from '@lexical/utils'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { marked } from 'marked'
import {
  $getRoot,
  $getSelection,
  $getNearestNodeFromDOMNode,
  $isDecoratorNode,
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
import { cn } from '../ui/cn.js'
import FloatingLinkEditorPlugin from './noteEditor/FloatingLinkEditor'
import SlashMenuPlugin from './noteEditor/SlashMenuPlugin'
import MentionsPlugin from './noteEditor/MentionsPlugin'
import HashtagMenuPlugin from './noteEditor/HashtagMenuPlugin'

const AUTO_LINK_MATCHERS = [autoLinkUrlMatcher, autoLinkEmailMatcher]

const mono = '[font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace]'
const tokenAttr = 'text-[#0b6e4f]'
const tokenLiteral = 'text-[#9a3412]'
const tokenFn = 'text-[#1d4ed8]'
const tokenComment = 'text-ink-soft italic'
const tokenKeyword = 'text-[#a21caf]'
const tokenString = 'text-[#b45309]'
const tokenPlain = 'text-ink'

const checkBox =
  "relative ml-[0.15rem] pl-[1.45rem] list-none outline-none before:content-[''] before:absolute before:top-[0.2em] before:left-0 before:block before:h-[0.9em] before:w-[0.9em] before:cursor-pointer before:rounded-[3px] before:border before:bg-cover"
const checkMark =
  "after:content-[''] after:absolute after:top-[0.35em] after:left-[0.28em] after:block after:h-[0.5em] after:w-[0.28em] after:cursor-pointer after:rotate-45 after:border-solid after:border-white after:border-t-0 after:border-l-0 after:border-r-[0.12em] after:border-b-[0.12em]"

const theme = {
  paragraph: 'mb-[0.35rem]',
  quote: 'my-[0.35rem] border-l-[3px] border-l-ink/16 pl-[0.65rem] text-ink-soft',
  heading: {
    h2: 'mt-[0.55rem] mb-[0.35rem] text-lg leading-[1.3] font-semibold text-ink',
    h3: 'mt-[0.45rem] mb-[0.3rem] text-base leading-[1.35] [font-weight:750] text-ink'
  },
  code: `my-[0.45rem] block overflow-x-auto rounded-sm bg-black/6 px-[0.65rem] py-[0.55rem] text-sm leading-[1.45] whitespace-pre-wrap [tab-size:2] ${mono}`,
  codeHighlight: {
    atrule: tokenAttr,
    attr: tokenAttr,
    boolean: tokenLiteral,
    builtin: tokenFn,
    cdata: tokenComment,
    char: tokenString,
    class: tokenFn,
    'class-name': tokenFn,
    comment: tokenComment,
    constant: tokenLiteral,
    deleted: tokenPlain,
    doctype: tokenComment,
    entity: tokenPlain,
    function: tokenFn,
    important: tokenKeyword,
    inserted: tokenPlain,
    keyword: tokenKeyword,
    namespace: tokenFn,
    number: tokenLiteral,
    operator: tokenPlain,
    prolog: tokenComment,
    property: tokenAttr,
    punctuation: tokenPlain,
    regex: tokenString,
    selector: tokenAttr,
    string: tokenString,
    symbol: tokenLiteral,
    tag: tokenKeyword,
    url: tokenString,
    variable: tokenAttr
  },
  image: 'my-[0.45rem] block',
  excalidraw: 'my-[0.45rem] block',
  timestamp: 'inline',
  mention:
    'inline rounded-[4px] bg-black/6 px-[0.25em] py-[0.05em] font-semibold text-ink data-[mention-type=note]:cursor-pointer',
  hashtag: 'font-semibold text-coral-deep',
  hr: 'my-3 border-x-0 border-b-0 border-t border-t-ink/16',
  table: 'my-2 w-full table-fixed border-collapse overflow-hidden border-spacing-0',
  tableCell:
    'relative min-w-[4.5rem] border border-ink/16 px-[0.45rem] py-[0.35rem] text-left align-top outline-none',
  tableCellHeader:
    'relative min-w-[4.5rem] border border-ink/16 bg-black/4 px-[0.45rem] py-[0.35rem] text-left align-top font-semibold outline-none',
  tableRow: '',
  list: {
    ul: 'mt-[0.2rem] mb-[0.45rem] pl-5',
    ol: 'mt-[0.2rem] mb-[0.45rem] pl-5',
    checklist: 'mt-[0.2rem] mb-[0.45rem] list-none pl-1',
    listitem: 'my-[0.1rem]',
    listitemChecked: `${checkBox} text-ink-soft line-through before:border-coral before:bg-coral ${checkMark}`,
    listitemUnchecked: `${checkBox} before:border-ink/16`,
    nested: { listitem: 'list-none before:!hidden after:!hidden' }
  },
  link: 'text-coral-deep underline',
  text: {
    bold: 'font-semibold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: `rounded-[4px] bg-black/6 px-[0.35em] py-[0.1em] text-[0.86em] text-ink ${mono}`
  }
}

const toolbarBtn =
  'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xs border-0 bg-transparent p-0 text-ink-soft transition-colors duration-150 hover:bg-ink/6 hover:text-ink [&_svg]:size-4'
const toolbarBtnOn = 'bg-coral-soft text-coral-deep hover:bg-coral-soft hover:text-coral-deep'

function toolBtn(active) {
  return cn(toolbarBtn, active && toolbarBtnOn)
}

const linkInputClass =
  'h-7 min-w-0 flex-1 rounded-xs border border-ink/12 bg-surface px-2 text-xs text-ink outline-none focus:border-coral/60 focus:shadow-focus'

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
    $prepareNoteForEditing()
  }
}

/**
 * Block images and drawings must sit on the root. Inside a paragraph they are
 * contenteditable=false and the browser will not place a caret, so an existing
 * note looks frozen. A paragraph after the last block is the place to type.
 */
function $prepareNoteForEditing() {
  const root = $getRoot()
  const nested = []
  for (const child of root.getChildren()) {
    if (typeof child.getChildren !== 'function') continue
    for (const inner of child.getChildren()) {
      if ($isDecoratorNode(inner) && !inner.isInline()) nested.push(inner)
    }
  }
  for (const block of nested) {
    const parent = block.getParent()
    if (!parent || $isRootOrShadowRoot(parent)) continue
    parent.insertAfter(block)
    if (parent.getChildrenSize() === 0) parent.remove()
  }
  const last = root.getLastChild()
  if (!last || ($isDecoratorNode(last) && !last.isInline())) {
    root.append($createParagraphNode())
  }
}

function $insertBlock(node) {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) $getRoot().selectEnd()
  $insertNodes([node])
  const parent = node.getParent()
  if (parent && !$isRootOrShadowRoot(parent)) {
    parent.insertAfter(node)
    if (parent.getChildrenSize() === 0) parent.remove()
  }
  const next = node.getNextSibling()
  if (next && next.getType() === 'paragraph') {
    next.selectStart()
    return
  }
  const paragraph = $createParagraphNode()
  node.insertAfter(paragraph)
  paragraph.selectStart()
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
          $insertBlock(
            $createImageNode({
              src,
              altText: payload.altText || '',
              caption: payload.caption || '',
              timeSec: typeof payload.timeSec === 'number' ? payload.timeSec : null
            })
          )
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand(
        INSERT_EXCALIDRAW_COMMAND,
        () => {
          $insertBlock($createExcalidrawNode())
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

function EditorApiPlugin({ apiRef }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!apiRef) return undefined
    apiRef.current = {
      insertImage: (payload) => {
        const src = payload?.src
        if (!src) return
        editor.focus()
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) $getRoot().selectEnd()
        })
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          src,
          altText: payload.altText || '',
          timeSec: typeof payload.timeSec === 'number' ? payload.timeSec : null
        })
      },
      insertTimestamp: (payload) => {
        const timeSec = typeof payload?.timeSec === 'number' ? payload.timeSec : 0
        editor.focus()
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) $getRoot().selectEnd()
        })
        editor.dispatchCommand(INSERT_TIMESTAMP_COMMAND, { timeSec })
      }
    }
    return () => {
      if (apiRef.current) apiRef.current = null
    }
  }, [apiRef, editor])

  return null
}

function ToolbarPlugin({ compact = false, variant = 'compact' }) {
  const [editor] = useLexicalComposerContext()
  const [formats, setFormats] = useState(emptyToolbarState)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [toolsOpen, setToolsOpen] = useState(!compact)
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

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-0.5 border-b border-ink/8 bg-surface px-1.5 py-1',
        variant === 'document' && 'mb-2 bg-transparent',
        compact && !toolsOpen && 'justify-end px-[0.3rem] py-[0.2rem]'
      )}
      role="toolbar"
      aria-label="Formato"
    >
      {compact ? (
        <button
          type="button"
          className={toolBtn(toolsOpen)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setToolsOpen((open) => !open)}
          title="Formato"
          aria-expanded={toolsOpen}
          aria-label="Mostrar formato"
        >
          <TypeIcon aria-hidden="true" />
        </button>
      ) : null}
      {compact && !toolsOpen ? null : (
        <>
      <button
        type="button"
        className={toolBtn(formats.bold)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('bold')}
        title="Negrita"
        aria-label="Negrita"
        aria-pressed={formats.bold}
      >
        <BoldIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.italic)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('italic')}
        title="Cursiva"
        aria-label="Cursiva"
        aria-pressed={formats.italic}
      >
        <ItalicIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.underline)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('underline')}
        title="Subrayado"
        aria-label="Subrayado"
        aria-pressed={formats.underline}
      >
        <UnderlineIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.strikethrough)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('strikethrough')}
        title="Tachado"
        aria-label="Tachado"
        aria-pressed={formats.strikethrough}
      >
        <StrikethroughIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.code)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => formatText('code')}
        title="Código en línea"
        aria-label="Código en línea"
        aria-pressed={formats.code}
      >
        <CodeIcon aria-hidden="true" />
      </button>
      <span className="mx-1 h-4 w-px bg-ink/10" aria-hidden="true" />
      <button
        type="button"
        className={toolBtn(formats.block === 'h2')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setBlock('h2')}
        title="Título"
        aria-label="Título"
        aria-pressed={formats.block === 'h2'}
      >
        <Heading2Icon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.block === 'h3')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setBlock('h3')}
        title="Subtítulo"
        aria-label="Subtítulo"
        aria-pressed={formats.block === 'h3'}
      >
        <Heading3Icon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.block === 'quote')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setBlock('quote')}
        title="Cita"
        aria-label="Cita"
        aria-pressed={formats.block === 'quote'}
      >
        <QuoteIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.block === 'code')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setBlock('code')}
        title="Bloque de código"
        aria-label="Bloque de código"
        aria-pressed={formats.block === 'code'}
      >
        <SquareCodeIcon aria-hidden="true" />
      </button>
      <span className="mx-1 h-4 w-px bg-ink/10" aria-hidden="true" />
      <button
        type="button"
        className={toolBtn(formats.block === 'ul')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleList('ul')}
        title="Lista"
        aria-label="Lista"
        aria-pressed={formats.block === 'ul'}
      >
        <ListIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.block === 'ol')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleList('ol')}
        title="Lista numerada"
        aria-label="Lista numerada"
        aria-pressed={formats.block === 'ol'}
      >
        <ListOrderedIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.block === 'check')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleList('check')}
        title="Lista de tareas"
        aria-label="Lista de tareas"
        aria-pressed={formats.block === 'check'}
      >
        <ListChecksIcon aria-hidden="true" />
      </button>
      <span className="mx-1 h-4 w-px bg-ink/10" aria-hidden="true" />
      <button
        type="button"
        className={toolBtn(false)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={insertHr}
        title="Separador"
        aria-label="Separador"
      >
        <MinusIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(formats.link || linkOpen)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (linkOpen ? setLinkOpen(false) : openLinkEditor())}
        title="Enlace"
        aria-label="Enlace"
        aria-pressed={formats.link || linkOpen}
      >
        <LinkIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(false)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={insertImage}
        title="Adjuntar imagen"
        aria-label="Adjuntar imagen"
      >
        <ImagePlusIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(false)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={insertExcalidraw}
        title="Dibujo Excalidraw"
        aria-label="Dibujo Excalidraw"
      >
        <PenToolIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={toolBtn(false)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={insertTable}
        title="Insertar tabla"
        aria-label="Insertar tabla"
      >
        <Table2Icon aria-hidden="true" />
      </button>
        </>
      )}
      {linkOpen && (!compact || toolsOpen) ? (
        <form
          className="ml-[0.15rem] flex min-w-40 flex-[1_1_12rem] items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <input
            ref={linkInputRef}
            className={linkInputClass}
            type="text"
            inputMode="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="https://"
            aria-label="URL del enlace"
          />
          <button type="submit" className={toolBtn(false)} title="Aplicar enlace">
            <CheckIcon aria-hidden="true" />
          </button>
          {formats.link ? (
            <button type="button" className={toolBtn(false)} onClick={removeLink} title="Quitar enlace">
              <UnlinkIcon aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" className={toolBtn(false)} onClick={() => setLinkOpen(false)} title="Cancelar">
            <XIcon aria-hidden="true" />
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

const DRAG_HANDLE = '[data-drag-handle]'

function isOnDragMenu(element) {
  return Boolean(element.closest(DRAG_HANDLE))
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
          data-drag-handle=""
          className="absolute top-0 left-0 z-[4] hidden h-5 w-5 cursor-grab items-center justify-center rounded-[4px] p-[0.1rem] text-ink-soft opacity-0 will-change-[transform,opacity] hover:bg-black/6 hover:text-ink active:cursor-grabbing"
          title="Arrastrar bloque"
          aria-label="Arrastrar bloque"
        >
          <span
            className="block h-[0.9rem] w-[0.7rem] bg-[radial-gradient(circle,currentColor_1.1px,transparent_1.25px)] bg-[length:0.35rem_0.35rem] bg-center opacity-[0.55]"
            aria-hidden="true"
          />
        </div>
      }
      targetLineComponent={
        <div
          ref={targetLineRef}
          className="pointer-events-none absolute top-0 left-0 z-[5] h-[3px] rounded-[2px] bg-coral opacity-0 will-change-transform"
        />
      }
    />
  )
}

/** Lift saved block images/drawings and leave a paragraph the caret can use. */
function PrepareNotePlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editor.update(() => {
      $prepareNoteForEditing()
    })
  }, [editor])
  return null
}

/**
 * A click on a picture or drawing used to select that block and then ignore
 * typing. Put the caret in the paragraph after it instead.
 */
function BlockCaretPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const onMouseDown = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('button, a, input, textarea, [data-image-key]')) return
      const host = target.closest('[data-lexical-decorator="true"]')
      if (!host || !editor.getRootElement()?.contains(host)) return
      event.preventDefault()
      event.stopPropagation()
      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(host)
        const block = $isDecoratorNode(node) ? node : node?.getParent?.()
        if (!$isDecoratorNode(block) || block.isInline()) return
        const next = block.getNextSibling()
        if (next && next.getType() === 'paragraph') {
          next.selectStart()
          return
        }
        const paragraph = $createParagraphNode()
        block.insertAfter(paragraph)
        paragraph.selectStart()
      })
      editor.focus()
    }
    return editor.registerRootListener((root, prev) => {
      prev?.removeEventListener('mousedown', onMouseDown, true)
      root?.addEventListener('mousedown', onMouseDown, true)
    })
  }, [editor])
  return null
}

function MentionClickPlugin({ onOpenMention }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (!onOpenMention) return undefined
    const onClick = (event) => {
      const chip = event.target?.closest?.('[data-mention-id]')
      if (!chip || chip.dataset.mentionType !== 'note' || !chip.dataset.mentionId) return
      event.preventDefault()
      onOpenMention({ type: chip.dataset.mentionType, id: chip.dataset.mentionId })
    }
    return editor.registerRootListener((root, prev) => {
      prev?.removeEventListener('click', onClick)
      root?.addEventListener('click', onClick)
    })
  }, [editor, onOpenMention])
  return null
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
  compactToolbar = false,
  onChange,
  onSeekTimestamp = null,
  currentTimeSec = 0,
  enableTimestamp = false,
  mentionItems = [],
  programs = [],
  onCreateTopic = null,
  onOpenMention = null,
  onCaptureFrame = null,
  editorApiRef = null,
  onFocus = null,
  onBlur = null,
  focusSignal = 0
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
      <div
        className={cn(
          'overflow-hidden rounded-sm border border-ink/10 bg-cream',
          variant === 'document' && 'rounded-none border-0 bg-transparent'
        )}
      >
        <LexicalComposer initialConfig={initialConfig}>
          <ToolbarPlugin compact={compactToolbar} variant={variant} />
          <div
            className={cn(
              'relative min-h-[5.5rem] max-h-56 overflow-auto',
              variant === 'document' && 'min-h-64 max-h-none'
            )}
          >
            <div
              className="relative min-h-[inherit] [&>div[aria-hidden='true']]:pointer-events-none [&>div[aria-hidden='true']]:absolute [&>div[aria-hidden='true']]:inset-0 [&>div[aria-hidden='true']]:z-0"
              ref={(el) => {
                if (el) setAnchorElem(el)
              }}
            >
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    className={cn(
                      'relative z-[1] min-h-[5.5rem] cursor-text overflow-visible py-[0.55rem] pr-[0.65rem] pl-[1.85rem] text-base leading-[1.45] text-ink caret-coral-deep select-text [font:inherit] outline-none',
                      variant === 'document' &&
                        'min-h-64 max-h-none py-[0.35rem] pr-[0.35rem] pl-[1.85rem] text-base leading-[1.55]'
                    )}
                    aria-placeholder={placeholder}
                    placeholder={
                      <div className="pointer-events-none absolute top-[0.55rem] left-[1.85rem] text-base text-ink-soft opacity-70">
                        {placeholder}
                      </div>
                    }
                    spellCheck={false}
                    onFocus={onFocus}
                    onBlur={onBlur}
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
          <TablePlugin hasCellMerge hasCellBackgroundColor={false} hasHorizontalScroll />
          <HorizontalRulePlugin />
          <MarkdownShortcutPlugin transformers={NOTE_TRANSFORMERS} />
          <ImagesPlugin />
          <EditorApiPlugin apiRef={editorApiRef} />
          <SlashMenuPlugin
            currentTimeSec={currentTimeSec}
            enableTimestamp={enableTimestamp}
            onCaptureFrame={onCaptureFrame}
          />
          <MentionsPlugin mentionItems={mentionItems} onCreateTopic={onCreateTopic} />
          <HashtagMenuPlugin
            mentionItems={mentionItems}
            programs={programs}
            onCreateTopic={onCreateTopic}
          />
          <MentionClickPlugin onOpenMention={onOpenMention} />
          <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
          <PrepareNotePlugin />
          <BlockCaretPlugin />
          {autofocus ? <AutoFocusPlugin /> : null}
          <FocusSignalPlugin signal={focusSignal} />
        </LexicalComposer>
      </div>
    </NoteEditorContext.Provider>
  )
}

function FocusSignalPlugin({ signal }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (!signal) return
    editor.focus()
  }, [editor, signal])
  return null
}

/** Drop the seek suffix so read-only markdown still renders the image. */
function stripImageTime(markdown) {
  return markdown.replace(/(!\[[^\][]*\]\([^)\n]*\))\{t:[0-9]+(?:\.[0-9]+)?\}/g, '$1')
}

/** Read-only markdown rendering for annotation lists / previews. */
function NoteBody({ body }) {
  const markdown = stripImageTime(String(body || '').trim())
  if (!markdown) {
    return <p className="mb-[0.45rem] text-sm leading-[1.4] italic opacity-55">Sin texto</p>
  }

  marked.setOptions({ gfm: true, breaks: true })
  const html = marked.parse(markdown)
  return (
    <div
      className="mb-[0.45rem] text-sm leading-[1.4] whitespace-normal [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-coral-deep [&_blockquote]:mb-[0.45rem] [&_code]:rounded-[4px] [&_code]:bg-black/6 [&_code]:px-[0.35em] [&_code]:py-[0.1em] [&_code]:text-[0.86em] [&_code]:[font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-sm [&_img]:border [&_img]:border-ink/10 [&_ol]:mb-[0.45rem] [&_p]:mb-[0.45rem] [&_pre]:mb-[0.45rem] [&_pre]:overflow-auto [&_pre]:rounded-sm [&_pre]:bg-black/6 [&_pre]:px-[0.55rem] [&_pre]:py-[0.45rem] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:mb-[0.45rem]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export { NoteBody }
export default NoteEditor
