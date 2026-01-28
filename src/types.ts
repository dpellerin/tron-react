export type Status = 'idle' | 'running' | 'paused' | 'round_over' | 'match_over'

export type Score = {
  player: number
  ai: number
}

export type OverlayContent = {
  title: string
  subtitle: string
}
