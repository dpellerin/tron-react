import { useEffect, useRef } from 'react'
import { TronEngine, type Difficulty, type RoundResult } from '../game/engine'
import { MusicController } from '../game/music'
import { SoundEngine } from '../game/sound'
import { SfxController } from '../game/sfx'
import { DESKTOP_TUNING, MOBILE_TUNING } from '../game/tuning'
import type { Status } from '../types'

type UseGameEngineArgs = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  onRoundEnd: (result: RoundResult) => void
  isMobile: boolean
  difficulty: Difficulty
  isMuted: boolean
  status: Status
}

export function useGameEngine({
  canvasRef,
  onRoundEnd,
  isMobile,
  difficulty,
  isMuted,
  status,
}: UseGameEngineArgs) {
  const engineRef = useRef<TronEngine | null>(null)
  const soundRef = useRef<SoundEngine | null>(null)
  const musicRef = useRef<MusicController | null>(null)
  const sfxRef = useRef<SfxController | null>(null)
  const initialTuningRef = useRef(isMobile ? MOBILE_TUNING : DESKTOP_TUNING)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const engine = new TronEngine(canvas, {
      onRoundEnd: (result) => {
        soundRef.current?.stopEngines()
        sfxRef.current?.playDeath()
        onRoundEnd(result)
      },
      onTurn: (who) => {
        soundRef.current?.resetRamp(who)
      },
      tuning: initialTuningRef.current,
    })
    engineRef.current = engine
    soundRef.current = new SoundEngine()
    musicRef.current = new MusicController()
    sfxRef.current = new SfxController()

    const handleResize = () => {
      engine.resize()
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(canvas)
    window.addEventListener('resize', handleResize)
    requestAnimationFrame(handleResize)

    return () => {
      observer.disconnect()
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
  }, [canvasRef, onRoundEnd])

  useEffect(() => {
    engineRef.current?.setTuning(isMobile ? MOBILE_TUNING : DESKTOP_TUNING)
  }, [isMobile])

  useEffect(() => {
    engineRef.current?.setDifficulty(difficulty)
  }, [difficulty])

  useEffect(() => {
    soundRef.current?.setMuted(isMuted)
    musicRef.current?.setMuted(isMuted)
    sfxRef.current?.setMuted(isMuted)
  }, [isMuted])

  useEffect(() => {
    musicRef.current?.setMode(status === 'running' ? 'play' : 'menu')
  }, [status])

  return {
    engineRef,
    soundRef,
    musicRef,
    sfxRef,
  }
}
