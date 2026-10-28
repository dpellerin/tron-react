import { afterEach, describe, expect, it, vi } from 'vitest'
import { TronEngine } from './engine'

afterEach(() => vi.unstubAllGlobals())

describe('canvas rendering', () => {
  it('renders static scenes once and resumes drawing when the game changes', () => {
    let nextFrame: FrameRequestCallback | undefined
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    vi.stubGlobal('Image', class { src = ''; onload: (() => void) | null = null })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextFrame = callback
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const clearRect = vi.fn()
    const context = new Proxy({ clearRect }, {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target]
        if (key === 'createRadialGradient') return () => ({ addColorStop() {} })
        return () => {}
      },
      set() { return true },
    })
    const canvas = {
      getContext: () => context,
      getBoundingClientRect: () => ({ width: 800, height: 500 }),
      width: 0,
      height: 0,
      style: { width: '', height: '' },
    } as unknown as HTMLCanvasElement
    const engine = new TronEngine(canvas, { onRoundEnd: () => {} })
    let time = performance.now()
    const frame = () => {
      time += 16
      if (!nextFrame) throw new Error('Missing animation frame')
      nextFrame(time)
    }

    frame()
    frame()
    expect(clearRect).toHaveBeenCalledTimes(1)
    engine.startRound()
    frame()
    expect(clearRect).toHaveBeenCalledTimes(2)
    engine.pause()
    frame()
    frame()
    expect(clearRect).toHaveBeenCalledTimes(2)
    engine.reset()
    frame()
    expect(clearRect).toHaveBeenCalledTimes(3)
    engine.destroy()
  })
})
