import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

type SelectOption = {
  value: string | number
  label: string
}

type CustomSelectProps = {
  value: string | number
  options: SelectOption[]
  onChange: (value: string | number) => void
  disabled?: boolean
  ariaLabel?: string
}

export function CustomSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false)
      }
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleToggle = () => {
    if (disabled) {
      return
    }
    setOpen((prev) => !prev)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen((prev) => !prev)
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const currentIndex = options.findIndex((option) => option.value === value)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (currentIndex + delta + options.length) % options.length
      onChange(options[nextIndex].value)
      if (!open) {
        setOpen(true)
      }
    }
  }

  return (
    <div
      className={`custom-select${disabled ? ' custom-select--disabled' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="custom-select__button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span>{selected?.label}</span>
        <span className="custom-select__caret" aria-hidden />
      </button>
      {open && !disabled ? (
        <div className="custom-select__menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`custom-select__option${
                option.value === value ? ' is-selected' : ''
              }`}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
