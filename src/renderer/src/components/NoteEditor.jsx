import { useEffect, useMemo, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import {
  ListNode,
  ListItemNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND
} from '@lexical/list'
import { LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $generateHtmlFromNodes } from '@lexical/html'
import { mergeRegister } from '@lexical/utils'
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW
} from 'lexical'

const theme = {
  paragraph: 'note-editor__p',
  quote: 'note-editor__quote',
  heading: { h3: 'note-editor__h3' },
  list: {
    ul: 'note-editor__ul',
    ol: 'note-editor__ol',
    listitem: 'note-editor__li'
  },
  link: 'note-editor__link',
  text: {
    bold: 'note-editor__bold',
    italic: 'note-editor__italic',
    underline: 'note-editor__underline',
    strikethrough: 'note-editor__strike'
  }
}

const editorNodes = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode]

function onError(error) {
  console.error('[NoteEditor]', error)
}

/** Always seed with a paragraph so Lexical never gets an empty EditorState string. */
function buildEditorState(bodyJson, bodyText) {
  if (bodyJson) {
    try {
      const parsed = JSON.parse(bodyJson)
      const children = parsed?.root?.children
      if (Array.isArray(children) && children.length > 0) {
        return bodyJson
      }
    } catch {
      // fall through to plain text
    }
  }

  return () => {
    const root = $getRoot()
    root.clear()
    const text = String(bodyText || '')
    if (!text) {
      root.append($createParagraphNode())
      return
    }
    for (const line of text.split('\n')) {
      const p = $createParagraphNode()
      if (line) p.append($createTextNode(line))
      root.append(p)
    }
  }
}

function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext()
  const [formats, setFormats] = useState({ bold: false, italic: false, underline: false })

  useEffect(() => {
    const sync = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          setFormats({
            bold: selection.hasFormat('bold'),
            italic: selection.hasFormat('italic'),
            underline: selection.hasFormat('underline')
          })
        }
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

  return (
    <div className="note-editor__toolbar" role="toolbar" aria-label="Formato">
      <button
        type="button"
        className={formats.bold ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
        title="Negrita"
      >
        B
      </button>
      <button
        type="button"
        className={formats.italic ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        title="Cursiva"
      >
        I
      </button>
      <button
        type="button"
        className={formats.underline ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
        title="Subrayado"
      >
        U
      </button>
      <span className="note-editor__toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
        title="Lista"
      >
        •
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
        title="Lista numerada"
      >
        1.
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const url = window.prompt('URL del enlace')
          if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
        }}
        title="Enlace"
      >
        Link
      </button>
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

/**
 * Compact Lexical rich-text field for annotations.
 * Reports plain text + html + json for persistence / search.
 */
function NoteEditor({
  editorKey = 'new',
  bodyText = '',
  bodyJson = null,
  placeholder = 'Escribe…',
  autofocus = false,
  variant = 'compact',
  onChange
}) {
  const initialConfig = useMemo(
    () => ({
      namespace: `NoteEditor-${editorKey}`,
      theme,
      onError,
      editable: true,
      nodes: editorNodes,
      editorState: buildEditorState(bodyJson, bodyText)
    }),
    // Remount via key from parent; config frozen per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorKey]
  )

  const handleChange = (editorState, editor) => {
    editorState.read(() => {
      const text = $getRoot().getTextContent()
      const html = $generateHtmlFromNodes(editor, null)
      const json = JSON.stringify(editorState.toJSON())
      onChange?.({ text, html, json })
    })
  }

  return (
    <div className={`note-editor${variant === 'document' ? ' note-editor--document' : ''}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin />
        <div className="note-editor__shell">
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
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        {autofocus ? <AutoFocusPlugin /> : null}
      </LexicalComposer>
    </div>
  )
}

/** Read-only rendering of a note body (HTML preferred, plain fallback). */
function NoteBody({ body, bodyHtml }) {
  if (bodyHtml && /<[a-z][\s\S]*>/i.test(bodyHtml) && bodyHtml.replace(/<[^>]+>/g, '').trim()) {
    return (
      <div
        className="note-body note-body--html"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    )
  }
  if (body) {
    return <p className="note-body note-body--plain">{body}</p>
  }
  return <p className="note-body note-body--muted">Sin texto</p>
}

export { NoteBody }
export default NoteEditor
