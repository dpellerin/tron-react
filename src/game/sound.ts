type EngineId = 'player' | 'ai'

type EngineVoice = {
  osc: OscillatorNode
  gain: GainNode
  pan: StereoPannerNode
  base: number
  max: number
}

const ENGINE_SETTINGS: Record<
  EngineId,
  { base: number; gain: number; type: OscillatorType; detune: number }
> = {
  player: { base: 58, gain: 0.1, type: 'sawtooth', detune: -4 },
  ai: { base: 100, gain: 0.1, type: 'sawtooth', detune: 4 },
}

const RAMP_DURATION = 6

export class SoundEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private voices: Partial<Record<EngineId, EngineVoice>> = {}
  private muted = false

  destroy() {
    this.stopEngines()
    if (this.context) {
      this.context.close()
    }
    this.context = null
    this.master = null
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master) {
      this.master.gain.value = muted ? 0 : 0.5
    }
  }

  startEngines() {
    if (!('AudioContext' in window)) {
      return
    }
    this.ensureContext()
    if (!this.context || !this.master) {
      return
    }
    this.stopEngines()
    this.voices.player = this.createVoice('player')
    this.voices.ai = this.createVoice('ai')
    this.resetRamp('player')
    this.resetRamp('ai')
  }

  stopEngines() {
    if (!this.context) {
      return
    }
    const now = this.context.currentTime
    Object.values(this.voices).forEach((voice) => {
      if (!voice) return
      voice.gain.gain.cancelScheduledValues(now)
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now)
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.12)
      voice.osc.stop(now + 0.15)
    })
    this.voices = {}
  }

  resetRamp(id: EngineId) {
    const voice = this.voices[id]
    if (!voice || !this.context) {
      return
    }
    const now = this.context.currentTime
    voice.osc.frequency.cancelScheduledValues(now)
    voice.osc.frequency.setValueAtTime(voice.base, now)
    voice.osc.frequency.linearRampToValueAtTime(voice.max, now + RAMP_DURATION)
  }

  private ensureContext() {
    if (!this.context) {
      this.context = new AudioContext()
    }
    if (!this.master && this.context) {
      this.master = this.context.createGain()
      this.master.gain.value = this.muted ? 0 : 0.5
      this.master.connect(this.context.destination)
    }
    if (this.context?.state === 'suspended') {
      this.context.resume()
    }
  }

  private createVoice(id: EngineId): EngineVoice {
    if (!this.context || !this.master) {
      throw new Error('Audio context not initialized')
    }
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    const pan = this.context.createStereoPanner()
    const settings = ENGINE_SETTINGS[id]

    osc.type = settings.type
    osc.detune.value = settings.detune
    gain.gain.value = settings.gain
    pan.pan.value = id === 'player' ? -0.5 : 0.5

    osc.connect(gain)
    gain.connect(pan)
    pan.connect(this.master)

    const now = this.context.currentTime
    osc.frequency.setValueAtTime(settings.base, now)
    osc.start(now)

    return {
      osc,
      gain,
      pan,
      base: settings.base,
      max: settings.base * 4,
    }
  }
}
