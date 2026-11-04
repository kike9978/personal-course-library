import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { HashtagNode, $createHashtagNode, registerLexicalHashtag } from '@lexical/hashtag'
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode
} from 'lexical'
import { $createMentionNode } from './MentionNode'
import {
  findHashtagMatch,
  hashTrigger,
  hashtagMenuItems,
  hashtagToken,
  matchHashtagExceptCaret
} from './hashtagMenu'

class HashtagOption extends MenuOption {
  constructor(item) {
    super(`${item.create ? 'new' : 'topic'}:${item.id}`)
    this.item = item
    this.title = item.title
    this.subtitle = item.subtitle || 'Tema'
  }
}

function caretInText() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text') {
    return null
  }
  const node = selection.anchor.getNode()
  return { nodeText: node.getTextContent(), offset: selection.anchor.offset }
}

function replaceHash(textNode, replacement) {
  if (!textNode) return
  const text = textNode.getTextContent()
  const start = text.lastIndexOf('#')
  if (start < 0) return
  if (start > 0) {
    textNode.setTextContent(text.slice(0, start))
    textNode.insertAfter(replacement)
    return
  }
  textNode.replace(replacement)
}

function topicNode(item) {
  const token = hashtagToken(item.title)
  if (token) return $createHashtagNode(`#${token}`)
  return $createMentionNode({
    mentionType: 'topic',
    mentionId: item.id,
    text: item.title
  })
}

/**
 * `#` menu of existing topics. The tag under the caret stays plain text so
 * the typeahead can read it; leaving the tag turns it into a hashtag.
 */
export default function HashtagMenuPlugin({ mentionItems = [], programs = [], onCreateTopic }) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState(null)
  const checkTrigger = useCallback((text) => hashTrigger(text), [])

  useEffect(() => {
    if (!editor.hasNodes([HashtagNode])) return undefined
    return registerLexicalHashtag(editor, {
      getHashtagMatch: (text) => matchHashtagExceptCaret(text, caretInText())
    })
  }, [editor])

  useEffect(() => {
    let previousKey = null
    return editor.registerUpdateListener(() => {
      let left = null
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        const key =
          $isRangeSelection(selection) && selection.anchor.type === 'text'
            ? selection.anchor.getNode().getKey()
            : null
        if (previousKey && previousKey !== key) left = previousKey
        previousKey = key
      })
      if (!left) return
      editor.update(() => {
        const node = $getNodeByKey(left)
        if ($isTextNode(node) && node.isSimpleText() && findHashtagMatch(node.getTextContent())) {
          node.markDirty()
        }
      })
    })
  }, [editor])

  const options = useMemo(
    () =>
      hashtagMenuItems(mentionItems, query, {
        canCreate: Boolean(onCreateTopic),
        programs
      }).map((item) => new HashtagOption(item)),
    [mentionItems, onCreateTopic, programs, query]
  )

  const insertTopic = useCallback((textNode, item, closeMenu) => {
    const node = topicNode(item)
    replaceHash(textNode, node)
    const space = $createTextNode(' ')
    node.insertAfter(space)
    space.select()
    closeMenu()
  }, [])

  const onSelectOption = useCallback(
    (option, textNodeContainingQuery, closeMenu) => {
      const needsTopic = option.item.type === 'program' && !hashtagToken(option.item.title)
      if ((option.item.create || needsTopic) && onCreateTopic) {
        const queryNodeKey = textNodeContainingQuery?.getKey?.() || null
        Promise.resolve(onCreateTopic(option.item.title))
          .then((created) => {
            const title = created?.title || option.item.title
            if (needsTopic && !created?.id) return
            editor.update(() => {
              const queryNode = queryNodeKey ? $getNodeByKey(queryNodeKey) : null
              if (!queryNode) return
              insertTopic(
                queryNode,
                needsTopic
                  ? { type: 'topic', id: created.id, title }
                  : { ...option.item, title, create: true },
                closeMenu
              )
            })
          })
          .catch(() => {})
        return
      }
      editor.update(() => {
        insertTopic(textNodeContainingQuery, option.item, closeMenu)
      })
    },
    [editor, insertTopic, onCreateTopic]
  )

  if (!mentionItems?.some((item) => item?.type === 'topic') && !programs.length && !onCreateTopic) {
    return null
  }

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={setQuery}
      triggerFn={checkTrigger}
      options={options}
      onSelectOption={onSelectOption}
      ignoreEntityBoundary
      menuRenderFn={(
        anchorElementRef,
        { options: opts, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
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
