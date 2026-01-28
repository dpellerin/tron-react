import type { Score, Status } from '../types'

type HudProps = {
  score: Score
  isMuted: boolean
  status: Status
  onToggleMute: () => void
  onResetMatch: () => void
}

export function Hud({ score, isMuted, status, onToggleMute, onResetMatch }: HudProps) {
  return (
    <div className="hud">
      <div className="score score-player">Human: {score.player}</div>
      <div className="hud-controls">
        <button
          type="button"
          className="audio-toggle"
          onClick={onToggleMute}
          aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        <button
          type="button"
          className="reset-button"
          onClick={onResetMatch}
          aria-label="Reset match"
          title="Reset match"
          disabled={status === 'idle'}
        >
          <span className="reset-button__icon" aria-hidden>
            ⟳
          </span>
        </button>
      </div>
      <div className="score score-ai">Computer: {score.ai}</div>
    </div>
  )
}
