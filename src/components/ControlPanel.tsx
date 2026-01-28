import type { Difficulty } from '../game/engine'
import type { Status } from '../types'
import { CustomSelect } from './CustomSelect'

type ControlPanelProps = {
  status: Status
  roundsToWin: number
  difficulty: Difficulty
  isMobile: boolean
  onRoundsToWinChange: (value: number) => void
  onDifficultyChange: (value: Difficulty) => void
}

const ROUND_OPTIONS = [1, 3, 5, 7, 9]
const DIFFICULTY_OPTIONS: Difficulty[] = ['easy', 'normal', 'hard']

export function ControlPanel({
  status,
  roundsToWin,
  difficulty,
  isMobile,
  onRoundsToWinChange,
  onDifficultyChange,
}: ControlPanelProps) {
  if (status !== 'idle') {
    return null
  }

  return (
    <div className="panel">
      <div className="settings">
        <label>
          Rounds to win
          <CustomSelect
            value={roundsToWin}
            options={ROUND_OPTIONS.map((value) => ({
              value,
              label: String(value),
            }))}
            onChange={(value) => onRoundsToWinChange(Number(value))}
            disabled={status !== 'idle'}
            ariaLabel="Rounds to win"
          />
        </label>

        <label>
          Difficulty
          <CustomSelect
            value={difficulty}
            options={DIFFICULTY_OPTIONS.map((value) => ({
              value,
              label: value,
            }))}
            onChange={(value) => onDifficultyChange(value as Difficulty)}
            disabled={status !== 'idle'}
            ariaLabel="Difficulty"
          />
        </label>
      </div>

      {!isMobile ? (
        <div className="controls">
          <span>WASD / Arrows to turn</span>
          <span className="controls__divider" aria-hidden>
            ·
          </span>
          <span>Space to start/pause</span>
          <span className="controls__divider" aria-hidden>
            ·
          </span>
          <span>Esc to menu</span>
          <span className="controls__divider" aria-hidden>
            ·
          </span>
          <span>M to mute</span>
          <span className="controls__divider" aria-hidden>
            ·
          </span>
          <span>R to reset</span>
        </div>
      ) : null}
    </div>
  )
}
