import { describe, expect, it } from 'vitest'
import {
  AI_CELL_SIZE,
  DIFFICULTY_CONFIG,
  chooseAiDirection,
  computeTerritory,
  type AiSnapshot,
  type DifficultyConfig,
} from './ai'
import type { Segment, Vec } from './collision'

const CELL = AI_CELL_SIZE
const quietRng = () => 0.5

function cellCenter(cx: number, cy: number): Vec {
  return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 }
}

function occupyCell(cx: number, cy: number): Segment {
  const x = cx * CELL + 4
  const y = cy * CELL + 4
  return { a: { x, y }, b: { x: x + 8, y } }
}

function cycle(pos: Vec, dir: Vec, extra: Segment[] = []) {
  return {
    pos,
    dir,
    segments: [{ a: { ...pos }, b: { ...pos } }, ...extra],
  }
}

function snapshot(partial: {
  ai: AiSnapshot['ai']
  player: AiSnapshot['player']
  wouldCollide?: AiSnapshot['wouldCollide']
  width?: number
  height?: number
}): AiSnapshot {
  return {
    width: partial.width ?? 480,
    height: partial.height ?? 480,
    speed: 160,
    ai: partial.ai,
    player: partial.player,
    wouldCollide: partial.wouldCollide ?? (() => false),
  }
}

function config(overrides: Partial<DifficultyConfig> = {}): DifficultyConfig {
  return {
    ...DIFFICULTY_CONFIG.normal,
    randomness: 0,
    minTurnBenefit: 0,
    interceptWeight: 0,
    ...overrides,
  }
}

describe('computeTerritory', () => {
  it('contests a cell only at equal distance', () => {
    const occupied = new Uint8Array(5 * 3)
    const result = computeTerritory(occupied, 5, 3, { x: 0, y: 1 }, { x: 4, y: 1 })

    expect(result.contested).toBe(3)
    expect(result.ai).toBe(6)
    expect(result.player).toBe(6)
    expect(result.diff).toBe(0)
  })

  it('counts territory beyond a contested choke point', () => {
    const occupied = new Uint8Array(25).fill(1)
    for (let x = 0; x < 5; x += 1) occupied[5 + x] = 0
    for (let y = 2; y < 5; y += 1) occupied[y * 5 + 2] = 0
    const result = computeTerritory(occupied, 5, 5, { x: 0, y: 1 }, { x: 4, y: 1 })
    expect(result).toEqual({ ai: 2, player: 2, contested: 4, diff: 0 })
  })

  it('does not neutralize a closer cell when the other head arrives later', () => {
    const occupied = new Uint8Array(7 * 1)
    const result = computeTerritory(occupied, 7, 1, { x: 0, y: 0 }, { x: 6, y: 0 })

    expect(result.ai).toBe(3)
    expect(result.player).toBe(3)
    expect(result.contested).toBe(1)
  })
})

describe('chooseAiDirection', () => {
  it('never picks a heading the survival probe rejects when another heading lives', () => {
    const aiPos = cellCenter(8, 8)
    const chosen = chooseAiDirection(
      snapshot({
        ai: cycle(aiPos, { x: 1, y: 0 }),
        player: cycle(cellCenter(2, 2), { x: 1, y: 0 }),
        wouldCollide: (point) => point.x >= aiPos.x + 6,
      }),
      config(),
      quietRng,
    )

    expect(chosen).not.toBeNull()
    expect(chosen?.x).not.toBe(1)
  })

  it('checks the full distance to the next decision at high speed', () => {
    const aiPos = cellCenter(8, 8)
    const board = snapshot({
      ai: cycle(aiPos, { x: 1, y: 0 }),
      player: cycle(cellCenter(2, 2), { x: 1, y: 0 }),
      wouldCollide: (point) => point.x >= aiPos.x + 60,
    })
    board.speed = 385
    const chosen = chooseAiDirection(board, { ...DIFFICULTY_CONFIG.easy, randomness: 0 }, quietRng)
    expect(chosen?.x).not.toBe(1)
  })

  it('warns hard about a simultaneous crossing with a moving player', () => {
    const board = snapshot({
      ai: cycle({ x: 200, y: 240 }, { x: 1, y: 0 }),
      player: cycle({ x: 240, y: 200 }, { x: 0, y: 1 }),
    })
    board.speed = 385
    const settings = config({ decisionInterval: 0.12, minTurnBenefit: 200, lookahead: 2 })
    expect(chooseAiDirection(board, { ...settings, lookahead: 1 }, quietRng)).toEqual({ x: 1, y: 0 })
    expect(chooseAiDirection(board, settings, quietRng)).not.toEqual({ x: 1, y: 0 })
  })

  it('avoids a rapid alternating turn when going forward is safe', () => {
    const board = snapshot({
      ai: cycle(cellCenter(12, 11), { x: 1, y: 0 }),
      player: cycle(cellCenter(4, 12), { x: 1, y: 0 }),
    })
    const hard = { ...DIFFICULTY_CONFIG.hard, randomness: 0 }
    expect(chooseAiDirection(board, hard, quietRng)).toEqual({ x: 0, y: 1 })
    board.distanceSinceTurn = 10
    board.lastTurnRotation = -1
    expect(chooseAiDirection(board, hard, quietRng)).toEqual({ x: 1, y: 0 })
    board.distanceSinceTurn = 48
    expect(chooseAiDirection(board, hard, quietRng)).toEqual({ x: 0, y: 1 })
  })

  it('allows a quick second turn in the same direction for a U-turn', () => {
    const board = snapshot({
      ai: cycle(cellCenter(12, 11), { x: 1, y: 0 }),
      player: cycle(cellCenter(4, 12), { x: 1, y: 0 }),
    })
    board.distanceSinceTurn = 10
    board.lastTurnRotation = 1
    expect(chooseAiDirection(board, { ...DIFFICULTY_CONFIG.hard, randomness: 0 }, quietRng))
      .toEqual({ x: 0, y: 1 })
  })

  it('breaks commitment when the forward path becomes dangerous', () => {
    const aiPos = cellCenter(8, 8)
    const board = snapshot({
      ai: cycle(aiPos, { x: 1, y: 0 }),
      player: cycle(cellCenter(2, 2), { x: 1, y: 0 }),
      wouldCollide: (point) => point.x >= aiPos.x + 8,
    })
    board.distanceSinceTurn = 2
    board.lastTurnRotation = -1
    expect(chooseAiDirection(board, DIFFICULTY_CONFIG.hard, quietRng)?.x).not.toBe(1)
  })

  it('breaks commitment for a predicted moving-player collision', () => {
    const board = snapshot({
      ai: cycle({ x: 200, y: 240 }, { x: 1, y: 0 }),
      player: cycle({ x: 240, y: 200 }, { x: 0, y: 1 }),
    })
    board.speed = 385
    board.distanceSinceTurn = 2
    board.lastTurnRotation = -1
    const settings = config({ decisionInterval: 0.12, minTurnBenefit: 200, lookahead: 2 })
    expect(chooseAiDirection(board, settings, quietRng)).not.toEqual({ x: 1, y: 0 })
  })

  it('rejects a one-cell pocket in favor of open space', () => {
    const walls = [
      occupyCell(9, 7),
      occupyCell(10, 7),
      occupyCell(10, 8),
      occupyCell(10, 9),
      occupyCell(9, 9),
    ]
    const chosen = chooseAiDirection(
      snapshot({
        ai: cycle(cellCenter(8, 8), { x: 1, y: 0 }, walls),
        player: cycle(cellCenter(2, 2), { x: 0, y: 1 }),
      }),
      config(),
      quietRng,
    )

    expect(chosen).not.toEqual({ x: 1, y: 0 })
  })

  it('does not cut into a dead alcove once the arena is split', () => {
    const divider = Array.from({ length: 20 }, (_, y) => occupyCell(10, y))
    const alcove = [
      occupyCell(7, 6),
      occupyCell(8, 6),
      occupyCell(9, 6),
      occupyCell(7, 7),
      occupyCell(9, 7),
    ]
    const chosen = chooseAiDirection(
      snapshot({
        ai: cycle(cellCenter(8, 8), { x: 0, y: -1 }, [...divider, ...alcove]),
        player: cycle(cellCenter(14, 8), { x: 0, y: 1 }, divider),
      }),
      config({ endgameWallBonus: 16 }),
      quietRng,
    )

    expect(chosen).not.toEqual({ x: 0, y: -1 })
  })

  it('takes a safe sealing move only when intercept is weighted', () => {
    const board = snapshot({
      ai: cycle(cellCenter(12, 11), { x: 1, y: 0 }),
      player: cycle(cellCenter(4, 12), { x: 1, y: 0 }),
    })

    const passive = chooseAiDirection(
      board,
      config({ minTurnBenefit: 40, interceptWeight: 0, territoryWeight: 0.2 }),
      quietRng,
    )
    const hunter = chooseAiDirection(
      board,
      config({ minTurnBenefit: 0, interceptWeight: 16, territoryWeight: 0.2 }),
      quietRng,
    )

    expect(passive).toEqual({ x: 1, y: 0 })
    expect(hunter).toEqual({ x: 0, y: 1 })
  })

  it('keeps going forward when a turn only buys a tiny benefit', () => {
    const chosen = chooseAiDirection(
      snapshot({
        ai: cycle(cellCenter(6, 10), { x: 1, y: 0 }),
        player: cycle(cellCenter(16, 10), { x: -1, y: 0 }),
      }),
      config({ minTurnBenefit: 80, territoryWeight: 0.4 }),
      quietRng,
    )

    expect(chosen).toEqual({ x: 1, y: 0 })
  })

  it('makes easy skip a cutoff that hard takes', () => {
    const board = snapshot({
      ai: cycle(cellCenter(12, 11), { x: 1, y: 0 }),
      player: cycle(cellCenter(4, 12), { x: 1, y: 0 }),
    })

    const easy = chooseAiDirection(board, { ...DIFFICULTY_CONFIG.easy, randomness: 0 }, quietRng)
    const hard = chooseAiDirection(board, { ...DIFFICULTY_CONFIG.hard, randomness: 0 }, quietRng)

    expect(easy).toEqual({ x: 1, y: 0 })
    expect(hard).toEqual({ x: 0, y: 1 })
  })

  it('lets easy noise flip a close call without picking a lethal heading', () => {
    const aiPos = cellCenter(8, 8)
    const board = snapshot({
      ai: cycle(aiPos, { x: 1, y: 0 }),
      player: cycle(cellCenter(2, 2), { x: 1, y: 0 }),
      wouldCollide: (point) => point.x >= aiPos.x + 6,
    })

    const values = [0, 1, 1]
    const noisy = chooseAiDirection(board, DIFFICULTY_CONFIG.easy, () => values.shift() ?? 0.5)
    const steady = chooseAiDirection(board, { ...DIFFICULTY_CONFIG.easy, randomness: 0 }, quietRng)

    expect(noisy).not.toBeNull()
    expect(noisy?.x).not.toBe(1)
    expect(steady?.x).not.toBe(1)
  })
})
