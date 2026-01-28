import type { EngineTuning } from './engine'

export const MOBILE_TUNING: EngineTuning = {
  baseSpeed: 125,
  speedStep: 10,
  maxSpeed: 300,
  gridStep: 32,
}

export const DESKTOP_TUNING: EngineTuning = {
  baseSpeed: 165,
  speedStep: 13.2,
  maxSpeed: 385,
  gridStep: 48,
}
