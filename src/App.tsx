import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  TronEngine,
  type Difficulty,
  type Direction,
  type RoundResult,
} from './game/engine'
import { SoundEngine } from './game/sound'
import { MusicController } from './game/music'
import { SfxController } from './game/sfx'
import './App.css'

type Status = 'idle' | 'running' | 'paused' | 'round_over' | 'match_over'

type Score = {
  player: number
  ai: number
}

const ROUND_OPTIONS = [1, 3, 5, 7, 9]
const DIFFICULTY_OPTIONS: Difficulty[] = ['easy', 'normal', 'hard']

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<TronEngine | null>(null)
  const roundsToWinRef = useRef(5)
  const soundRef = useRef<SoundEngine | null>(null)
  const musicRef = useRef<MusicController | null>(null)
  const sfxRef = useRef<SfxController | null>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [score, setScore] = useState<Score>({ player: 0, ai: 0 })
  const [roundWinner, setRoundWinner] = useState<RoundResult | null>(null)
  const [roundsToWin, setRoundsToWin] = useState(5)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    roundsToWinRef.current = roundsToWin
  }, [roundsToWin])

  const handleRoundEnd = useCallback((result: RoundResult) => {
    setRoundWinner(result)
    soundRef.current?.stopEngines()
    sfxRef.current?.playDeath()
    setScore((prev) => {
      const next = { ...prev }
      if (result === 'player') {
        next.player += 1
      } else if (result === 'ai') {
        next.ai += 1
      }
      const matchOver =
        next.player >= roundsToWinRef.current ||
        next.ai >= roundsToWinRef.current
      setStatus(matchOver ? 'match_over' : 'round_over')
      return next
    })
  }, [])

  const startRound = useCallback(() => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    if (status === 'match_over') {
      setScore({ player: 0, ai: 0 })
    }
    setRoundWinner(null)
    setStatus('running')
    engine.startRound()
    soundRef.current?.startEngines()
  }, [status])

  const resetMatch = useCallback(() => {
    setScore({ player: 0, ai: 0 })
    setRoundWinner(null)
    setStatus('idle')
    engineRef.current?.reset()
    soundRef.current?.stopEngines()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const engine = new TronEngine(canvas, {
      onRoundEnd: handleRoundEnd,
      onTurn: (who) => {
        soundRef.current?.resetRamp(who)
      },
    })
    engineRef.current = engine
    soundRef.current = new SoundEngine()
    musicRef.current = new MusicController()
    sfxRef.current = new SfxController()

    const handleResize = () => {
      engine.resize()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      engine.destroy()
      soundRef.current?.destroy()
      soundRef.current = null
      musicRef.current?.destroy()
      musicRef.current = null
      sfxRef.current?.destroy()
      sfxRef.current = null
      engineRef.current = null
    }
  }, [handleRoundEnd])

  useEffect(() => {
    engineRef.current?.setDifficulty(difficulty)
  }, [difficulty])

  useEffect(() => {
    soundRef.current?.setMuted(isMuted)
    musicRef.current?.setMuted(isMuted)
    sfxRef.current?.setMuted(isMuted)
  }, [isMuted])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      musicRef.current?.unlock()
      sfxRef.current?.unlock()
      if (event.repeat) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        if (status === 'running') {
          engineRef.current?.pause()
          soundRef.current?.stopEngines()
          setStatus('paused')
          return
        }
        if (status === 'paused') {
          engineRef.current?.resume()
          soundRef.current?.startEngines()
          setStatus('running')
          return
        }
        if (status === 'match_over') {
          resetMatch()
          return
        }
        startRound()
        return
      }

      if (event.code === 'KeyM') {
        event.preventDefault()
        setIsMuted((prev) => !prev)
        return
      }

      if (event.code === 'Escape') {
        event.preventDefault()
        resetMatch()
        return
      }

      if (status !== 'running') {
        return
      }

      const direction = keyToDirection(event.code)
      if (direction) {
        event.preventDefault()
        engineRef.current?.setPlayerDirection(direction)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [resetMatch, startRound, status])

  useEffect(() => {
    musicRef.current?.setMode(status === 'running' ? 'play' : 'menu')
  }, [status])


  const overlay = useMemo(() => {
    if (status === 'running') {
      return null
    }

    if (status === 'idle') {
      return {
        title: 'Press Space to Start',
        subtitle: `First to ${roundsToWin} wins the match`,
      }
    }

    if (status === 'round_over') {
      const title =
        roundWinner === 'tie'
          ? 'Tie Round'
          : roundWinner === 'player'
            ? 'You Win the Round'
            : 'CPU Wins the Round'
      return {
        title,
        subtitle: 'Press Space for next round',
      }
    }

    if (status === 'paused') {
      return {
        title: 'Paused',
        subtitle: 'Press Space to resume',
      }
    }

    const matchTitle =
      score.player >= roundsToWin ? 'You Win the Match' : 'CPU Wins the Match'

    return {
      title: matchTitle,
      subtitle: 'Press Space to return to menu',
    }
  }, [roundWinner, roundsToWin, score.player, status])

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />

      <div className="hud">
        <div className="score score-player">Human: {score.player}</div>
        <div className="score score-ai">Computer: {score.ai}</div>
      </div>

      <button
        type="button"
        className="audio-toggle"
        onClick={() => setIsMuted((prev) => !prev)}
        aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>

      {status !== 'running' ? (
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
                onChange={(value) => setRoundsToWin(Number(value))}
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
                onChange={(value) => setDifficulty(value as Difficulty)}
                disabled={status !== 'idle'}
                ariaLabel="Difficulty"
              />
            </label>
          </div>

          <div className="controls">
            WASD / Arrows to turn · Space to start/pause · Esc to menu · M to mute
          </div>
        </div>
      ) : null}

      {overlay ? (
        <div className="overlay">
          <div className={`overlay-card${status === 'match_over' ? ' overlay-card--win' : ''}`}>
            <div className="overlay-title">{overlay.title}</div>
            <div className="overlay-subtitle">{overlay.subtitle}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

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

function CustomSelect({
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

function keyToDirection(code: string): Direction | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'up'
    case 'ArrowDown':
    case 'KeyS':
      return 'down'
    case 'ArrowLeft':
    case 'KeyA':
      return 'left'
    case 'ArrowRight':
    case 'KeyD':
      return 'right'
    default:
      return null
  }
}

export default App
