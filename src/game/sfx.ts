import deathSfx from '../assets/game-death.ogg'

export class SfxController {
  private deathAudio: HTMLAudioElement
  private unlocked = false
  private muted = false

  constructor() {
    this.deathAudio = new Audio(deathSfx)
    this.deathAudio.preload = 'auto'
    this.deathAudio.volume = 0.7
  }

  destroy() {
    this.deathAudio.pause()
    this.deathAudio.currentTime = 0
  }

  unlock() {
    this.unlocked = true
  }

  setMuted(muted: boolean) {
    this.muted = muted
  }

  playDeath() {
    if (!this.unlocked || this.muted) {
      return
    }
    this.deathAudio.currentTime = 0
    void this.deathAudio.play().catch(() => {})
  }
}
