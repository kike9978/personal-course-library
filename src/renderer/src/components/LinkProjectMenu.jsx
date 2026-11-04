import { useEffect, useRef, useState } from 'react'

function isOnFile(project, activePath) {
  return Boolean(activePath) && project.fileRelativePath === activePath
}

function isOnSection(project, sectionId) {
  return Boolean(sectionId) && !project.fileRelativePath && project.sectionId === sectionId
}

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
  onCreate
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
    <div className="header-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-btn icon-btn--ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Vincular un proyecto a este archivo o a su sección"
        onClick={() => setOpen((value) => !value)}
      >
        {linkedCount > 0 ? `Proyecto · ${linkedCount}` : 'Proyecto'}
      </button>
      {open ? (
        <div
          className="header-popover header-popover--scroll"
          role="menu"
          aria-label="Vincular proyecto"
        >
          <p className="header-popover__label">
            {sectionTitle ? `Vincular · ${sectionTitle}` : 'Vincular proyecto'}
          </p>
          {projects.map((project) => {
            const onFile = isOnFile(project, activePath)
            const onSection = isOnSection(project, sectionId)
            return (
              <div key={project.id} className="link-project-row">
                <span className="link-project-row__title">{project.title}</span>
                <div className="link-project-row__choices">
                  <button
                    type="button"
                    className="link-project-row__choice"
                    aria-pressed={onFile}
                    onClick={() => onToggleFile?.(project)}
                  >
                    Este archivo
                  </button>
                  {sectionId ? (
                    <button
                      type="button"
                      className="link-project-row__choice"
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
          {projects.length > 0 ? <hr className="header-popover__sep" /> : null}
          <button
            type="button"
            className="header-popover__item"
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
              className="header-popover__item"
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

export default LinkProjectMenu
