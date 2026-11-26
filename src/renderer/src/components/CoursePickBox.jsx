import { useRef } from 'react'
import { cn } from '../ui/cn'

function CoursePickBox({ checked, indeterminate = false, label, onPick, className = '' }) {
  const rangeRef = useRef(false)

  return (
    <label
      className={cn(
        'grid h-[1.45rem] w-[1.45rem] shrink-0 cursor-pointer place-items-center rounded-sm border border-ink/10 bg-surface shadow-card',
        className
      )}
      onPointerDown={(event) => {
        rangeRef.current = event.shiftKey
        event.stopPropagation()
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        className="m-0 h-[0.95rem] w-[0.95rem] cursor-pointer accent-coral"
        checked={checked}
        aria-label={label}
        ref={(node) => {
          if (node) node.indeterminate = indeterminate && !checked
        }}
        onChange={() => onPick?.({ range: rangeRef.current })}
      />
    </label>
  )
}

export default CoursePickBox
