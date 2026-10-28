import { describe, expect, it } from 'vitest'
import { DIFFICULTY_CONFIG, chooseAiDirection, type Difficulty } from './ai'
import { pointHitsSegments, type Segment, type Vec } from './collision'

const WIDTH = 800
const HEIGHT = 500
const SPEED = 165
const RADIUS = 6
const DT = 1 / 60

type Cycle = {
  pos: Vec
  dir: Vec
  segments: Segment[]
}

function spawnCycles() {
  const player: Cycle = {
    pos: { x: 80, y: 250 },
    dir: { x: 1, y: 0 },
    segments: [{ a: { x: 80, y: 250 }, b: { x: 80, y: 250 } }],
  }
  const ai: Cycle = {
    pos: { x: 720, y: 250 },
    dir: { x: -1, y: 0 },
    segments: [{ a: { x: 720, y: 250 }, b: { x: 720, y: 250 } }],
  }
  return { player, ai }
}

function hits(point: Vec, self: Cycle, other: Cycle) {
  if (
    point.x <= RADIUS ||
    point.x >= WIDTH - RADIUS ||
    point.y <= RADIUS ||
    point.y >= HEIGHT - RADIUS
  ) {
    return true
  }
  if (pointHitsSegments(point, other.segments, RADIUS)) {
    return true
  }
  if (self.segments.length > 2) {
    return pointHitsSegments(point, self.segments.slice(0, -2), RADIUS)
  }
  return false
}

function step(cycle: Cycle, distance: number) {
  const next = {
    x: cycle.pos.x + cycle.dir.x * distance,
    y: cycle.pos.y + cycle.dir.y * distance,
  }
  cycle.segments[cycle.segments.length - 1].b = { ...next }
  cycle.pos = next
  return next
}

function turn(cycle: Cycle, dir: Vec) {
  cycle.dir = dir
  cycle.segments.push({ a: { ...cycle.pos }, b: { ...cycle.pos } })
}

function play(difficulty: Difficulty, seconds: number) {
  const { player, ai } = spawnCycles()
  const config = { ...DIFFICULTY_CONFIG[difficulty], randomness: 0 }
  let timer = 0
  let elapsed = 0

  while (elapsed < seconds) {
    timer -= DT
    if (timer <= 0) {
      timer = config.decisionInterval
      const chosen = chooseAiDirection(
        {
          width: WIDTH,
          height: HEIGHT,
          speed: SPEED,
          ai,
          player,
          wouldCollide: (point) => hits(point, ai, player),
        },
        config,
        () => 0.5,
      )
      if (chosen && (chosen.x !== ai.dir.x || chosen.y !== ai.dir.y)) {
        turn(ai, chosen)
      }
    }

    const distance = SPEED * DT
    const nextPlayer = step(player, distance)
    const nextAi = step(ai, distance)
    const playerHit = hits(nextPlayer, player, ai)
    const aiHit = hits(nextAi, ai, player)
    elapsed += DT

    if (playerHit || aiHit) {
      return { elapsed, playerHit, aiHit }
    }
  }

  return { elapsed, playerHit: false, aiHit: false }
}

describe('spawn simulation', () => {
  it.each(['easy', 'normal', 'hard'] as const)(
    '%s AI does not crash in the opening seconds against a straight player',
    (difficulty) => {
      const result = play(difficulty, 8)
      expect(result.aiHit && !result.playerHit).toBe(false)
      expect(result.elapsed).toBeGreaterThan(1.5)
    },
  )

  it('hard avoids losing alone in the opening against a straight player', () => {
    const hard = play('hard', 12)
    expect(hard.aiHit && !hard.playerHit).toBe(false)
  })
})
