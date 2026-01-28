import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type Difficulty,
  type Direction,
  type RoundResult,
} from './game/engine'
import { ControlPanel } from './components/ControlPanel'
import { Hud } from './components/Hud'
import { MobileController } from './components/MobileController'
import { OrientationLock } from './components/OrientationLock'
import { Overlay } from './components/Overlay'
import { useGameEngine } from './hooks/useGameEngine'
import { useIsMobile } from './hooks/useIsMobile'
import type { Score, Status } from './types'
import { keyToDirection } from './utils/controls'
import './styles/App.base.css'
import './styles/App.desktop.css'
import './styles/App.mobile.css'

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const roundsToWinRef = useRef(5)

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

  const isMobile = useIsMobile()

  const { engineRef, soundRef, musicRef, sfxRef } = useGameEngine({
    canvasRef,
    onRoundEnd: handleRoundEnd,
    isMobile,
    difficulty,
    isMuted,
    status,
  })

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
  }, [engineRef, soundRef, status])

  const resetMatch = useCallback(() => {
    setScore({ player: 0, ai: 0 })
    setRoundWinner(null)
    setStatus('idle')
    engineRef.current?.reset()
    soundRef.current?.stopEngines()
  }, [engineRef, soundRef])

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

      if (event.code === 'KeyR') {
        event.preventDefault()
        resetMatch()
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
  }, [engineRef, musicRef, resetMatch, sfxRef, soundRef, startRound, status])

  const overlay = useMemo(() => {
    if (status === 'running') {
      return null
    }

    const startText = isMobile ? 'Press Start' : 'Press Space or Start'
    const nextText = isMobile ? 'Next round' : 'Press Space or Next'
    const resumeText = isMobile ? 'Resume' : 'Press Space or Resume'
    const menuText = isMobile ? 'New match' : 'Press Space or New Match'

    if (status === 'idle') {
      return {
        title: startText,
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
        subtitle: nextText,
      }
    }

    if (status === 'paused') {
      return {
        title: 'Paused',
        subtitle: resumeText,
      }
    }

    const matchTitle =
      score.player >= roundsToWin ? 'You Win the Match' : 'CPU Wins the Match'

    return {
      title: matchTitle,
      subtitle: menuText,
    }
  }, [roundWinner, roundsToWin, score.player, status, isMobile])

  const handleOverlayAction = useCallback(() => {
    musicRef.current?.unlock()
    sfxRef.current?.unlock()

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
    if (status === 'idle' || status === 'round_over') {
      startRound()
    }
  }, [engineRef, musicRef, resetMatch, sfxRef, soundRef, startRound, status])

  const handleDirectionPress = useCallback((direction: Direction) => {
    if (status !== 'running') {
      return
    }
    engineRef.current?.setPlayerDirection(direction)
  }, [engineRef, status])

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />

      <Hud
        score={score}
        isMuted={isMuted}
        status={status}
        onToggleMute={() => setIsMuted((prev) => !prev)}
        onResetMatch={resetMatch}
      />

      <ControlPanel
        status={status}
        roundsToWin={roundsToWin}
        difficulty={difficulty}
        isMobile={isMobile}
        onRoundsToWinChange={setRoundsToWin}
        onDifficultyChange={setDifficulty}
      />

      <Overlay overlay={overlay} status={status} onAction={handleOverlayAction} />

      <OrientationLock />

      <MobileController
        onDirectionPress={handleDirectionPress}
        disabled={status !== 'running'}
      />
    </div>
  )
}

export default App
