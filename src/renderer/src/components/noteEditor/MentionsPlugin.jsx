import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  useBasicTypeaheadTriggerMatch,
  MenuOption
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { $createMentionNode } from './MentionNode'
import { $createTextNode } from 'lexical'

class MentionOption extends MenuOption {
  constructor(item) {
    super(`${item.type}:${item.id}`)
    this.item = item
    this.title = item.title
    this.subtitle = item.subtitle || item.type
  }
}

/**
 * `@` mentions for lessons, projects, and courses.
 * mentionItems: [{ type: 'lesson'|'project'|'course', id, title, subtitle? }]
 */
export default function MentionsPlugin({ mentionItems = [] }) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState(null)
  const checkTrigger = useBasicTypeaheadTriggerMatch('@', { minLength: 0 })

  const options = useMemo(() => {
    const q = String(query || '')
      .trim()
      .toLowerCase()
    const filtered = (mentionItems || [])
      .filter((item) => {
        if (!q) return true
        const hay = `${item.title || ''} ${item.subtitle || ''} ${item.type || ''}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 12)
    return filtered.map((item) => new MentionOption(item))
  }, [mentionItems, query])

  const onSelectOption = useCallback(
    (option, textNodeContainingQuery, closeMenu) => {
      editor.update(() => {
        const mention = $createMentionNode({
          mentionType: option.item.type,
          mentionId: option.item.id,
          text: option.item.title
        })
        if (textNodeContainingQuery) {
          textNodeContainingQuery.replace(mention)
        }
        const space = $createTextNode(' ')
        mention.insertAfter(space)
        space.select()
        closeMenu()
      })
    },
    [editor]
  )

  if (!mentionItems?.length) return null

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
                <span className="note-editor__typeahead-title">{option.title}</span>
                <span className="note-editor__typeahead-sub">{option.subtitle}</span>
              </button>
            ))}
          </div>,
          anchorElementRef.current
        )
      }}
    />
  )
}
