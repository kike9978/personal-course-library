import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { $createMentionNode } from './MentionNode'
import { cn } from '../../ui/cn.js'

const typeaheadMenu =
  'z-40 flex max-h-56 min-w-48 max-w-72 flex-col gap-[0.1rem] overflow-auto rounded-sm border border-ink/10 bg-surface p-1 shadow-card'
const typeaheadItem =
  'm-0 flex w-full cursor-pointer flex-col items-start gap-[0.1rem] rounded-sm border-0 bg-transparent px-[0.5rem] py-[0.4rem] text-left text-sm font-semibold text-ink [font:inherit] hover:bg-black/6'
const typeaheadTitle = 'block max-w-full overflow-hidden text-ellipsis whitespace-nowrap'
const typeaheadSub = 'block text-xs font-semibold tracking-[0.02em] text-ink-soft uppercase'
import { $createTextNode, $getNodeByKey } from 'lexical'

function bracketTrigger(text) {
  const match = /(^|\s)(\[\[([^\]\n]{0,75}))$/.exec(text)
  if (!match) return null
  return {
    leadOffset: match.index + match[1].length,
    matchingString: match[3],
    replaceableString: match[2]
  }
}

function replaceTrigger(textNode, mention) {
  if (!textNode) return
  const text = textNode.getTextContent()
  const start = text.lastIndexOf('[[')
  if (start > 0) {
    textNode.setTextContent(text.slice(0, start))
    textNode.insertAfter(mention)
    return
  }
  textNode.replace(mention)
}

class MentionOption extends MenuOption {
  constructor(item) {
    super(`${item.type}:${item.id}`)
    this.item = item
    this.title = item.title
    this.subtitle = item.subtitle || item.type
  }
}

/**
 * `[[` links for notes, lessons, projects, courses, and topics.
 * mentionItems: [{ type: 'note'|'lesson'|'project'|'course'|'topic', id, title, subtitle? }]
 * onCreateTopic(title) may return { id, title } for a new topic.
 */
export default function MentionsPlugin({ mentionItems = [], onCreateTopic }) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState(null)
  const checkTrigger = useCallback((text) => bracketTrigger(text), [])

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
          replaceTrigger(textNodeContainingQuery, mention)
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
              if (!queryNode) return
              replaceTrigger(queryNode, mention)
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
          <div className={typeaheadMenu} role="listbox">
            {opts.map((option, i) => (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={selectedIndex === i}
                className={cn(typeaheadItem, selectedIndex === i && 'bg-black/6')}
                onMouseEnter={() => setHighlightedIndex(i)}
                onClick={() => selectOptionAndCleanUp(option)}
              >
                <span className={typeaheadTitle}>{option.title}</span>
                <span className={typeaheadSub}>{option.subtitle}</span>
              </button>
            ))}
          </div>,
          anchorElementRef.current
        )
      }}
    />
  )
}
