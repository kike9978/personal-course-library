import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the custom @theme tokens in assets/index.css so that
// e.g. cn('shadow-card', 'shadow-none') resolves to 'shadow-none'.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ['card', 'lift', 'panel', 'focus', 'find', 'ring', 'ring-soft'],
      radius: ['pill']
    }
  }
})

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
