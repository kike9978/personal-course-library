import { ArrowLeft } from 'lucide-react'
import AppNav, { NAV_ITEMS } from './AppNav'
import brandMark from '../assets/img/brand-mark.svg'
import { cn } from '../ui/cn'
import { btnQuiet } from '../ui/classes'

/**
 * Shared top bar for every top-level view.
 *
 * - With `active`, shows the brand mark + main navigation; the active tab is the
 *   page title (rendered as a visually hidden <h1> for assistive tech).
 * - Without `active` (pop-out windows, embedded panels), shows `title` / `subtitle`.
 *
 * Slots: `center` (e.g. search), `actions` (right-aligned), `children` (toolbar row).
 */
function AppHeader({
  active,
  onNavigate,
  title,
  subtitle,
  onBack,
  backLabel = 'Volver',
  center,
  actions,
  children,
  className
}) {
  const navLabel = NAV_ITEMS.find((item) => item.id === active)?.label
  const heading = title || navLabel

  return (
    <header
      className={cn(
        'relative z-40 shrink-0 border-b border-ink/8 bg-surface-muted px-5 backdrop-blur-xl backdrop-saturate-150',
        className
      )}
    >
      <div className="@container flex min-h-14 min-w-0 flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          {onBack ? (
            <button type="button" className={cn(btnQuiet, 'h-8 px-2 text-ink')} onClick={onBack}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {backLabel}
            </button>
          ) : null}
          {active ? (
            <>
              <img
                src={brandMark}
                alt=""
                className="size-8 shrink-0 rounded-sm shadow-card ring-1 ring-ink/8"
              />
              {heading ? <h1 className="sr-only">{heading}</h1> : null}
              <AppNav active={active} onSelect={onNavigate} />
            </>
          ) : heading ? (
            <div className="flex min-w-0 flex-col">
              <h1 className="m-0 truncate font-display text-lg leading-tight font-semibold">
                {heading}
              </h1>
              {subtitle ? (
                <span className="block min-w-0 truncate text-xs text-ink-soft">{subtitle}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {center ? (
          <div className="relative flex min-w-[12rem] flex-[1_1_16rem] items-center gap-2 @max-[860px]:order-1 @max-[860px]:basis-full">
            {center}
          </div>
        ) : null}

        {actions ? (
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {children ? (
        <div className="flex min-w-0 items-center gap-2 border-t border-ink/6 py-2">{children}</div>
      ) : null}
    </header>
  )
}

export default AppHeader
