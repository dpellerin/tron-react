import type { Direction } from '../game/engine'

type MobileControllerProps = {
  onDirectionPress: (direction: Direction) => void
  disabled?: boolean
}

export function MobileController({
  onDirectionPress,
  disabled = false,
}: MobileControllerProps) {
  const handlePress = (direction: Direction) => {
    if (!disabled) {
      onDirectionPress(direction)
    }
  }

  return (
    <div className="mobile-controller">
      <div className="mobile-controller__pad">
        <button
          type="button"
          className="mobile-controller__button mobile-controller__button--up"
          onTouchStart={(e) => {
            e.preventDefault()
            handlePress('up')
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            handlePress('up')
          }}
          disabled={disabled}
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          type="button"
          className="mobile-controller__button mobile-controller__button--left"
          onTouchStart={(e) => {
            e.preventDefault()
            handlePress('left')
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            handlePress('left')
          }}
          disabled={disabled}
          aria-label="Move left"
        >
          ◀
        </button>
        <span className="mobile-controller__center" aria-hidden />
        <button
          type="button"
          className="mobile-controller__button mobile-controller__button--right"
          onTouchStart={(e) => {
            e.preventDefault()
            handlePress('right')
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            handlePress('right')
          }}
          disabled={disabled}
          aria-label="Move right"
        >
          ▶
        </button>
        <button
          type="button"
          className="mobile-controller__button mobile-controller__button--down"
          onTouchStart={(e) => {
            e.preventDefault()
            handlePress('down')
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            handlePress('down')
          }}
          disabled={disabled}
          aria-label="Move down"
        >
          ▼
        </button>
      </div>
    </div>
  )
}
