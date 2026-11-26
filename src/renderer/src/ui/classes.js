import { cn } from './cn'

/*
 * Shared control recipes. Tokens live in assets/index.css (@theme).
 * Compose with cn(); override size/spacing at the call site, never colors.
 */

const focusRing = 'focus-visible:outline-none focus-visible:shadow-focus'
const motion = 'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-pop'

/* ---------- Buttons ---------- */

export const btn = cn(
  'inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-3.5 rounded-sm border text-sm font-semibold whitespace-nowrap cursor-pointer select-none',
  motion,
  focusRing,
  'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0'
)

/** Secondary action: white surface, hairline border. */
export const btnGhost = cn(
  btn,
  'border-ink/12 bg-surface text-ink shadow-card enabled:hover:border-ink/20 enabled:hover:bg-cream'
)

/** Primary action: one per region. */
export const btnPrimary = cn(
  btn,
  'border-transparent bg-coral text-white shadow-[0_1px_2px_rgba(196,47,89,0.35),inset_0_1px_0_rgba(255,255,255,0.16)] enabled:hover:bg-coral-deep'
)

/** Tertiary action: no chrome until hover. */
export const btnQuiet = cn(
  btn,
  'border-transparent bg-transparent text-ink-soft shadow-none enabled:hover:bg-ink/5 enabled:hover:text-ink'
)

export const btnDanger = cn(
  btn,
  'border-ink/12 bg-surface text-danger shadow-card enabled:hover:border-danger/30 enabled:hover:bg-danger-soft'
)

/** Size modifier for dense rows and card footers. */
export const btnCompact = 'h-7 gap-1 px-2.5 text-xs shadow-none'

/** Pressed state for toggle buttons (aria-pressed). */
export const btnOn = 'border-coral/35 bg-coral-soft text-coral-deep hover:bg-coral-soft'

/** Button with leading icon. Kept for call sites that already import it. */
export const iconBtn = cn(btnPrimary)
export const iconBtnGhost =
  'border-ink/12 bg-surface text-ink shadow-card enabled:hover:border-ink/20 enabled:hover:bg-cream'
export const iconBtnTeal = 'bg-teal enabled:hover:bg-teal/90'
export const iconBtnActive = btnOn

/** Square icon-only button (toolbars, headers, card corners). */
export const iconOnly = cn(
  'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-ink-soft',
  motion,
  focusRing,
  'enabled:hover:bg-ink/6 enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-[18px]'
)

/* ---------- Fields ---------- */

export const fieldLabel = 'mb-1.5 block text-xs font-medium text-ink-soft'

/** Small uppercase kicker above a group or column. */
export const eyebrow = 'text-2xs font-semibold uppercase tracking-[0.07em] text-ink-soft'

export const fieldControl = cn(
  'w-full rounded-sm border border-ink/12 bg-surface px-3 py-[0.45rem] text-base text-ink shadow-none outline-none',
  'transition-[border-color,box-shadow] duration-150 ease-pop hover:border-ink/20 focus:border-coral/60 focus:shadow-focus disabled:opacity-60'
)

export const selectControl = cn(
  'h-9 cursor-pointer rounded-sm border border-ink/12 bg-surface pr-8 pl-3 text-sm font-medium text-ink outline-none',
  'transition-[border-color,box-shadow] duration-150 ease-pop hover:border-ink/20 focus:border-coral/60 focus:shadow-focus'
)

/** Search input; pair with an absolutely positioned 16px icon at left-3. */
export const searchInput = cn(
  'h-9 w-full rounded-sm border border-ink/12 bg-surface pr-3 pl-9 text-base text-ink shadow-none outline-none',
  'transition-[border-color,box-shadow,background-color] duration-150 ease-pop hover:border-ink/20 focus:border-coral/60 focus:shadow-focus'
)
export const searchIcon =
  'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint'

/* ---------- Surfaces ---------- */

export const card = 'rounded-md border border-ink/8 bg-surface shadow-card'
export const cardLg = 'rounded-lg border border-ink/8 bg-surface shadow-card'
export const cardHover = 'transition-[transform,box-shadow,border-color] duration-150 ease-pop hover:-translate-y-px hover:border-ink/12 hover:shadow-lift'

/** Full-height page shell used by every top-level view. */
export const pageShell = 'flex h-screen flex-col overflow-hidden bg-cream-deep'

/** Floating menu / popover container. */
export const popover =
  'absolute top-[calc(100%+6px)] right-0 z-[5] min-w-[16rem] rounded-md border border-ink/8 bg-surface p-1 shadow-panel animate-fade-in'

/** Row inside a popover menu; supports <span> title + <small> hint. */
export const menuItem = cn(
  'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-sm border-0 bg-transparent px-2.5 py-2 text-left text-sm font-medium text-ink',
  'enabled:hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  '[&_small]:text-xs [&_small]:font-normal [&_small]:text-ink-soft'
)
export const menuDivider = 'mx-1.5 my-1 h-px border-0 bg-ink/8'

/** Modal <dialog>. Add a max-w-* at the call site. */
export const dialogShell = cn(
  'w-[calc(100%-2rem)] rounded-lg border border-ink/8 bg-surface p-0 text-ink shadow-panel',
  'open:flex open:flex-col'
)
export const dialogBody = 'flex flex-col gap-4 px-5 pt-2 pb-5'
export const dialogTitle = 'm-0 font-display text-xl font-bold tracking-tight'
export const dialogLead = 'mt-1 mb-0 text-sm leading-relaxed text-ink-soft [&_code]:text-[0.9em]'

/** Inline notice / banner. */
export const notice =
  'flex flex-wrap items-center justify-between gap-3 rounded-md border border-warn-border bg-warn px-4 py-2.5 text-sm text-warn-text [&_strong]:font-semibold'

/* ---------- Segmented control ---------- */

export const segmented =
  'inline-flex h-9 shrink-0 items-center gap-0.5 rounded-sm bg-ink/6 p-0.5'
export const segmentedItem = cn(
  'inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-0 bg-transparent px-2.5 text-sm font-medium text-ink-soft',
  motion,
  'hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-card aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-card',
  focusRing,
  '[&_svg]:size-4'
)

/* ---------- Chips & badges ---------- */

/** Toggleable filter pill. */
export const chip = cn(
  'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-ink/10 bg-surface px-2.5 text-xs font-medium text-ink-soft',
  motion,
  focusRing,
  'hover:border-ink/20 hover:text-ink aria-pressed:border-chip-programs-border aria-pressed:bg-chip-programs aria-pressed:text-chip-programs-text'
)

export const badge =
  'inline-flex items-center gap-1 rounded-full border px-2 py-px text-2xs font-semibold whitespace-nowrap'
export const badgeNeutral = cn(badge, 'border-ink/10 bg-surface text-ink-soft')
export const badgeAccent = cn(
  badge,
  'border-chip-programs-border bg-chip-programs text-chip-programs-text'
)
export const badgeSuccess = cn(badge, 'border-chip-status-border bg-chip-status text-chip-status-text')
export const badgeTheme = cn(badge, 'border-chip-theme-border bg-chip-theme text-chip-theme-text')
export const badgeMedia = cn(badge, 'border-chip-media-border bg-chip-media text-chip-media-text')
export const badgeWarn = cn(badge, 'border-warn-border bg-warn text-warn-text')

/* ---------- Stats & sections ---------- */

export const statCard =
  'flex min-w-[9rem] flex-col-reverse gap-0.5 rounded-md border border-ink/8 bg-surface px-4 py-3 shadow-card'
export const statValue = 'font-display text-2xl leading-none font-bold tracking-tight text-ink'
export const statLabel = 'text-xs font-medium text-ink-soft'

export const sectionTitle = 'm-0 font-display text-xl font-bold tracking-tight text-ink'
export const sectionMeta = 'text-sm text-ink-soft'
