import menuTrack from '../assets/game-menu.ogg'
import playTrack from '../assets/game-play.ogg'

export type MusicMode = 'menu' | 'play'

export class MusicController {
  private menuAudio: HTMLAudioElement
  private playAudio: HTMLAudioElement
  private mode: MusicMode = 'menu'
  private unlocked = false
  private muted = false

  constructor() {
    this.menuAudio = new Audio(menuTrack)
    this.playAudio = new Audio(playTrack)

    this.menuAudio.loop = true
    this.playAudio.loop = true

    this.menuAudio.preload = 'auto'
    this.playAudio.preload = 'auto'

    this.menuAudio.volume = 0.35
    this.playAudio.volume = 0.5
  }

  destroy() {
    this.stopAll()
  }

  setMode(mode: MusicMode) {
    this.mode = mode
    if (!this.unlocked) {
      this.startMuted(mode)
      return
    }
    if (mode === 'menu') {
      this.startMenu()
    } else {
      this.startPlay()
    }
  }

  unlock() {
    if (this.unlocked) {
      return
    }
    this.unlocked = true
    this.menuAudio.muted = this.muted
    this.playAudio.muted = this.muted
    this.setMode(this.mode)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    this.menuAudio.muted = muted
    this.playAudio.muted = muted
  }

  private startMuted(mode: MusicMode) {
    const target = mode === 'menu' ? this.menuAudio : this.playAudio
    const other = mode === 'menu' ? this.playAudio : this.menuAudio
    other.pause()
    other.currentTime = 0
    target.muted = true
    void target.play().catch(() => {})
  }

  private startMenu() {
    this.playAudio.pause()
    this.playAudio.currentTime = 0
    void this.menuAudio.play().catch(() => {})
  }

  private startPlay() {
    this.menuAudio.pause()
    this.menuAudio.currentTime = 0
    void this.playAudio.play().catch(() => {})
  }

  private stopAll() {
    this.menuAudio.pause()
    this.playAudio.pause()
    this.menuAudio.currentTime = 0
    this.playAudio.currentTime = 0
  }
}
