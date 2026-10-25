import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  useBasicTypeaheadTriggerMatch,
  MenuOption
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { $createMentionNode } from './MentionNode'
import { $createTextNode, $getNodeByKey } from 'lexical'

class MentionOption extends MenuOption {
  constructor(item) {
    super(`${item.type}:${item.id}`)
    this.item = item
    this.title = item.title
    this.subtitle = item.subtitle || item.type
  }
}

/**
 * `@` mentions for lessons, projects, courses, and topics.
 * mentionItems: [{ type: 'lesson'|'project'|'course'|'topic', id, title, subtitle? }]
 * onCreateTopic(title) may return { id, title } for a new topic.
 */
export default function MentionsPlugin({ mentionItems = [], onCreateTopic }) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState(null)
  const checkTrigger = useBasicTypeaheadTriggerMatch('@', { minLength: 0 })

  const options = useMemo(() => {
    const q = String(query || '')
      .trim()
      .toLowerCase()
    const filtered = (mentionItems || []).filter((item) => {
      if (!q) return true
      const hay = `${item.title || ''} ${item.subtitle || ''} ${item.type || ''}`.toLowerCase()
      return hay.includes(q)
    })
    if (q) {
      filtered.sort((a, b) => Number(b.type === 'topic') - Number(a.type === 'topic'))
    }
    const limited = filtered.slice(0, 12)
    const hasExactTopic = filtered.some(
      (item) => item.type === 'topic' && String(item.title || '').trim().toLowerCase() === q
    )
    if (q && onCreateTopic && !hasExactTopic) {
      limited.push({
        type: 'topic',
        id: `new:${q}`,
        title: String(query || '').trim(),
        subtitle: 'Crear tema',
        create: true
      })
    }
    return limited.map((item) => new MentionOption(item))
  }, [mentionItems, onCreateTopic, query])

  const onSelectOption = useCallback(
    (option, textNodeContainingQuery, closeMenu) => {
      const insert = (item) => {
        editor.update(() => {
          const mention = $createMentionNode({
            mentionType: item.type,
            mentionId: item.id,
            text: item.title
          })
          if (textNodeContainingQuery) {
            textNodeContainingQuery.replace(mention)
          }
          const space = $createTextNode(' ')
          mention.insertAfter(space)
          space.select()
          closeMenu()
        })
      }
      if (option.item.create && onCreateTopic) {
        const queryNodeKey = textNodeContainingQuery?.getKey?.() || null
        Promise.resolve(onCreateTopic(option.item.title))
          .then((created) => {
            if (!created?.id) return
            editor.update(() => {
              const mention = $createMentionNode({
                mentionType: 'topic',
                mentionId: created.id,
                text: created.title || option.item.title
              })
              const queryNode = queryNodeKey ? $getNodeByKey(queryNodeKey) : null
              if (queryNode) queryNode.replace(mention)
              const space = $createTextNode(' ')
              mention.insertAfter(space)
              space.select()
              closeMenu()
            })
          })
          .catch(() => {})
        return
      }
      insert(option.item)
    },
    [editor, onCreateTopic]
  )

  if (!mentionItems?.length && !onCreateTopic) return null

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
