import { useRef } from 'react'

function CoursePickBox({ checked, indeterminate = false, label, onPick, className = '' }) {
  const rangeRef = useRef(false)

  return (
    <label
      className={`course-pick${className ? ` ${className}` : ''}`}
      onPointerDown={(event) => {
        rangeRef.current = event.shiftKey
        event.stopPropagation()
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
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
