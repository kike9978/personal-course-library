import { useEffect, useRef, useState } from 'react'
import { cn } from '../ui/cn'
import { iconBtn, iconBtnGhost } from '../ui/classes'

const popoverItem =
  'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-[8px] border-0 bg-transparent px-2.5 py-2 text-left text-sm font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus enabled:hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-teal/10 [&_small]:text-xs [&_small]:font-medium [&_small]:text-ink-soft'

/**
 * Options menu on a lesson or file: attach a project to this file or to its section.
 */
function LinkProjectMenu({
  projects = [],
  activePath,
  sectionId = null,
  sectionTitle = '',
  onToggleFile,
  onToggleSection,
  onCreate,
  tone = 'default'
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const linkedCount = projects.filter(
    (project) => isOnFile(project, activePath) || isOnSection(project, sectionId)
  ).length

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className={
          tone === 'media'
            ? 'inline-flex min-h-0 cursor-pointer items-center justify-center gap-[0.4rem] rounded-full border border-white/18 bg-white/6 px-[0.75rem] py-[0.32rem] text-[0.78rem] font-bold text-[#f5f2ee] shadow-none transition-[background-color,box-shadow] duration-[120ms] ease-pop enabled:hover:bg-white/14 enabled:hover:shadow-none'
            : cn(iconBtn, iconBtnGhost)
        }
        aria-haspopup="menu"
        aria-expanded={open}
        title="Vincular un proyecto a este archivo o a su sección"
        onClick={() => setOpen((value) => !value)}
      >
        {linkedCount > 0 ? `Proyecto · ${linkedCount}` : 'Proyecto'}
      </button>
      {open ? (
        <div
          className="absolute top-[calc(100%+6px)] right-0 z-[5] max-h-[min(60vh,22rem)] min-w-[17rem] overflow-auto rounded-md border border-ink/10 bg-surface p-1.5 shadow-panel"
          role="menu"
          aria-label="Vincular proyecto"
        >
          <p className="mt-3 mb-2 flex flex-col gap-1 text-[0.72rem] font-bold tracking-[0.04em] text-ink-soft uppercase">
            {sectionTitle ? `Vincular · ${sectionTitle}` : 'Vincular proyecto'}
          </p>
          {projects.map((project) => {
            const onFile = isOnFile(project, activePath)
            const onSection = isOnSection(project, sectionId)
            return (
              <div key={project.id} className="flex flex-col gap-[0.35rem] px-2.5 py-2">
                <span className="text-sm font-bold text-ink">{project.title}</span>
                <div className="flex flex-wrap gap-[0.35rem]">
                  <button
                    type="button"
                    className="cursor-pointer rounded-sm border border-ink/10 bg-surface px-2 py-[0.22rem] text-xs font-bold text-ink-soft aria-pressed:border-teal aria-pressed:bg-teal/12 aria-pressed:text-ink"
                    aria-pressed={onFile}
                    onClick={() => onToggleFile?.(project)}
                  >
                    Este archivo
                  </button>
                  {sectionId ? (
                    <button
                      type="button"
                      className="cursor-pointer rounded-sm border border-ink/10 bg-surface px-2 py-[0.22rem] text-xs font-bold text-ink-soft aria-pressed:border-teal aria-pressed:bg-teal/12 aria-pressed:text-ink"
                      aria-pressed={onSection}
                      title={sectionTitle || 'Sección'}
                      onClick={() => onToggleSection?.(project)}
                    >
                      Esta sección
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
          {projects.length > 0 ? <hr className="mx-1.5 my-1 h-px border-0 bg-ink/10" /> : null}
          <button
            type="button"
            className={popoverItem}
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onCreate?.('file')
            }}
          >
            <span>Nuevo proyecto</span>
            <small>Se ancla a este archivo</small>
          </button>
          {sectionId ? (
            <button
              type="button"
              className={popoverItem}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onCreate?.('section')
              }}
            >
              <span>Nuevo proyecto en la sección</span>
              <small>{sectionTitle || 'Toda la sección'}</small>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function isOnFile(project, activePath) {
  return Boolean(activePath) && project.fileRelativePath === activePath
}

function isOnSection(project, sectionId) {
  return Boolean(sectionId) && !project.fileRelativePath && project.sectionId === sectionId
}

export default LinkProjectMenu
