import type { OverlayContent, Status } from '../types'

type OverlayProps = {
  overlay: OverlayContent | null
  status: Status
  onAction: () => void
}

export function Overlay({ overlay, status, onAction }: OverlayProps) {
  if (!overlay) {
    return null
  }

  const actionLabel =
    status === 'paused'
      ? 'Resume'
      : status === 'match_over'
        ? 'New Match'
        : status === 'round_over'
          ? 'Next Round'
          : 'Start'

  return (
    <div className="overlay">
      <div className={`overlay-card${status === 'match_over' ? ' overlay-card--win' : ''}`}>
        <div className="overlay-title">{overlay.title}</div>
        <div className="overlay-subtitle">{overlay.subtitle}</div>
        <button type="button" className="overlay-action" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
