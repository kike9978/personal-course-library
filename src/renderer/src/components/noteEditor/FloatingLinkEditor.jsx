import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $findMatchingParent, mergeRegister } from '@lexical/utils'
import { $isLinkNode, TOGGLE_LINK_COMMAND, $isAutoLinkNode } from '@lexical/link'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND
} from 'lexical'

const floatBtn =
  'shrink-0 cursor-pointer rounded-[4px] border-0 bg-transparent px-[0.35rem] py-[0.2rem] text-[0.75rem] font-bold text-ink [font:inherit] hover:bg-black/6'

function normalizeLinkUrl(raw) {
  const url = String(raw || '').trim()
  if (!url) return null
  if (/^(https?:|mailto:|tel:|\/|#|\.)/i.test(url)) return url
  if (url.includes('@') && !url.includes(' ')) return `mailto:${url}`
  return `https://${url}`
}

function getSelectedLink(editor) {
  let link = null
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return
    const node = selection.anchor.getNode()
    link =
      $findMatchingParent(node, (n) => $isLinkNode(n) || $isAutoLinkNode(n)) || null
  })
  return link
}

/**
 * Floating bubble to edit / open / remove the link under the selection.
 */
export default function FloatingLinkEditorPlugin({ anchorElem }) {
  const [editor] = useLexicalComposerContext()
  const [linkUrl, setLinkUrl] = useState('')
  const [isEdit, setIsEdit] = useState(false)
  const [pos, setPos] = useState(null)
  const inputRef = useRef(null)

  const update = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        setPos(null)
        return
      }
      const node = selection.anchor.getNode()
      const link = $findMatchingParent(node, (n) => $isLinkNode(n) || $isAutoLinkNode(n))
      if (!link) {
        setPos(null)
        setIsEdit(false)
        return
      }
      setLinkUrl(link.getURL())
      const dom = editor.getElementByKey(link.getKey())
      const root = anchorElem || editor.getRootElement()
      if (!dom || !root) {
        setPos(null)
        return
      }
      const rect = dom.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      setPos({
        top: rect.bottom - rootRect.top + root.scrollTop + 6,
        left: rect.left - rootRect.left + root.scrollLeft
      })
    })
  }, [anchorElem, editor])

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => update()),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          update()
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, update])

  useEffect(() => {
    if (isEdit) inputRef.current?.focus()
  }, [isEdit])

  if (!pos || !anchorElem) return null

  const apply = () => {
    const url = normalizeLinkUrl(linkUrl)
    if (!url) return
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
    setIsEdit(false)
  }

  const remove = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    setIsEdit(false)
    setPos(null)
  }

  const open = () => {
    const link = getSelectedLink(editor)
    const url = link?.getURL?.() || linkUrl
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return createPortal(
    <div
      className="absolute z-[35] flex max-w-[min(22rem,100%)] items-center gap-[0.3rem] rounded-sm border border-ink/10 bg-surface px-[0.4rem] py-[0.3rem] shadow-card"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {isEdit ? (
        <>
          <input
            ref={inputRef}
            className="min-w-32 flex-1 rounded-[4px] border border-ink/10 bg-cream px-[0.4rem] py-[0.25rem] text-[0.8rem] [font:inherit]"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply()
              }
              if (e.key === 'Escape') setIsEdit(false)
            }}
            placeholder="https://"
          />
          <button type="button" className={floatBtn} onClick={apply}>
            OK
          </button>
          <button type="button" className={floatBtn} onClick={() => setIsEdit(false)}>
            ✕
          </button>
        </>
      ) : (
        <>
          <a
            className="min-w-0 flex-1 overflow-hidden text-[0.78rem] text-ellipsis whitespace-nowrap text-coral-deep underline"
            href={linkUrl}
            onClick={(e) => e.preventDefault()}
          >
            {linkUrl.length > 36 ? `${linkUrl.slice(0, 36)}…` : linkUrl}
          </a>
          <button type="button" className={floatBtn} onClick={open} title="Abrir">
            Abrir
          </button>
          <button type="button" className={floatBtn} onClick={() => setIsEdit(true)} title="Editar">
            Editar
          </button>
          <button type="button" className={floatBtn} onClick={remove} title="Quitar">
            Quitar
          </button>
        </>
      )}
    </div>,
    anchorElem
  )
}
