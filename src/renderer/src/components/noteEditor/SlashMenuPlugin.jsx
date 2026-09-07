import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  useBasicTypeaheadTriggerMatch,
  MenuOption
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND
} from '@lexical/list'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode'
import { INSERT_TABLE_COMMAND } from '@lexical/table'
import { $createCodeNode } from '@lexical/code-core'
import { $setBlocksType } from '@lexical/selection'
import { $getSelection, $isRangeSelection, $createParagraphNode } from 'lexical'
import { INSERT_IMAGE_COMMAND } from './ImageNode'
import { INSERT_EXCALIDRAW_COMMAND } from './ExcalidrawNode'
import { INSERT_TIMESTAMP_COMMAND } from './TimestampNode'

class SlashOption extends MenuOption {
  constructor(key, title, keywords, onSelect) {
    super(key)
    this.title = title
    this.keywords = keywords
    this.onSelect = onSelect
  }
}

/**
 * `/` slash command menu for inserting common note blocks.
 */
export default function SlashMenuPlugin({ currentTimeSec = 0, enableTimestamp = false }) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState(null)
  const checkTrigger = useBasicTypeaheadTriggerMatch('/', { minLength: 0 })

  const options = useMemo(() => {
    const all = [
      new SlashOption('text', 'Párrafo', ['text', 'p'], () => {
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createParagraphNode())
        })
      }),
      new SlashOption('h2', 'Título', ['h2', 'heading', 'titulo'], () => {
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode('h2'))
        })
      }),
      new SlashOption('h3', 'Subtítulo', ['h3', 'heading'], () => {
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode('h3'))
        })
      }),
      new SlashOption('ul', 'Lista', ['lista', 'bullet'], () => {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
      }),
      new SlashOption('ol', 'Lista numerada', ['numero', 'ordered'], () => {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
      }),
      new SlashOption('check', 'Tareas', ['todo', 'check', 'tarea'], () => {
        editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
      }),
      new SlashOption('quote', 'Cita', ['quote', 'cita'], () => {
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createQuoteNode())
        })
      }),
      new SlashOption('code', 'Código', ['code', 'bloque'], () => {
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return
          $setBlocksType(selection, () => $createCodeNode())
        })
      }),
      new SlashOption('table', 'Tabla', ['table', 'tabla'], () => {
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          rows: '3',
          columns: '3',
          includeHeaders: true
        })
      }),
      new SlashOption('hr', 'Separador', ['hr', 'divider'], () => {
        editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
      }),
      new SlashOption('img', 'Imagen', ['image', 'img', 'foto'], async () => {
        if (!window.api?.pickNoteImage) return
        const picked = await window.api.pickNoteImage()
        if (picked?.canceled || !picked?.url) return
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          src: picked.url,
          altText: picked.fileName || 'Imagen'
        })
      }),
      new SlashOption('draw', 'Dibujo', ['excalidraw', 'draw', 'dibujo'], () => {
        editor.dispatchCommand(INSERT_EXCALIDRAW_COMMAND, undefined)
      })
    ]

    if (enableTimestamp) {
      all.push(
        new SlashOption('time', 'Marca de tiempo', ['time', 'timestamp', 'video'], () => {
          editor.dispatchCommand(INSERT_TIMESTAMP_COMMAND, { timeSec: currentTimeSec })
        })
      )
    }

    const q = String(query || '')
      .trim()
      .toLowerCase()
    if (!q) return all
    return all.filter(
      (o) => o.title.toLowerCase().includes(q) || o.keywords.some((k) => k.includes(q))
    )
  }, [currentTimeSec, editor, enableTimestamp, query])

  const onSelectOption = useCallback((option, textNodeContainingQuery, closeMenu) => {
    closeMenu()
    editor.update(() => {
      if (textNodeContainingQuery) textNodeContainingQuery.remove()
    })
    // Allow removal to flush, then run command
    queueMicrotask(() => option.onSelect())
  }, [editor])

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={setQuery}
      triggerFn={checkTrigger}
      options={options}
      onSelectOption={onSelectOption}
      menuRenderFn={(anchorElementRef, { options: opts, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        if (!anchorElementRef.current || !opts.length) return null
        return createPortal(
          <div className="note-editor__typeahead" role="listbox">
            {opts.map((option, i) => (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={selectedIndex === i}
                className={selectedIndex === i ? 'is-active' : ''}
                onMouseEnter={() => setHighlightedIndex(i)}
                onClick={() => selectOptionAndCleanUp(option)}
              >
                {option.title}
              </button>
            ))}
          </div>,
          anchorElementRef.current
        )
      }}
    />
  )
}
