import { cn } from './cn'

export const iconBtn =
  'inline-flex items-center justify-center gap-[0.4rem] min-h-[2.4rem] px-[0.9rem] py-[0.45rem] border border-ink/10 rounded-full bg-coral text-white font-extrabold text-[0.82rem] cursor-pointer shadow-card transition-[transform,box-shadow] duration-[120ms] ease-pop enabled:hover:-translate-y-px enabled:hover:shadow-lift disabled:opacity-55 disabled:cursor-not-allowed'

export const iconBtnGhost = 'bg-surface text-ink'
export const iconBtnTeal = 'bg-teal'
export const iconBtnActive = 'border-coral text-coral-deep'

export const btn =
  'border border-ink/10 rounded-full px-[1.1rem] py-[0.55rem] font-extrabold cursor-pointer shadow-card'

export const btnGhost = cn(btn, 'bg-surface text-ink')
export const btnPrimary = cn(btn, 'bg-coral text-white disabled:opacity-55 disabled:cursor-not-allowed')
export const btnCompact = 'px-3 py-[0.35rem] text-[0.8rem] shadow-none'

export const fieldLabel =
  'block mb-[0.3rem] text-[0.78rem] font-extrabold uppercase tracking-[0.04em] text-ink-soft'

export const fieldControl =
  'w-full border border-ink/10 rounded-md bg-surface px-3 py-[0.65rem] text-ink outline-none shadow-none focus:shadow-focus'

export const card = 'border border-ink/10 rounded-md bg-surface shadow-card'
export const cardLg = 'border border-ink/10 rounded-lg bg-surface shadow-card'

export const chip =
  'border border-ink/10 rounded-full bg-surface px-[0.65rem] py-1 text-xs font-bold text-ink-soft cursor-pointer aria-pressed:bg-chip-programs aria-pressed:border-chip-programs-border aria-pressed:text-chip-programs-text'

export const statCard = 'flex items-center gap-[0.65rem] min-w-[140px] px-4 py-[0.65rem] border border-ink/10 rounded-md bg-surface shadow-card'
export const statValue = 'font-display font-black text-[1.4rem] leading-none text-coral'
export const statLabel = 'text-[0.78rem] font-bold text-ink-soft'
