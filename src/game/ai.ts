import { distance, distancePointToSegment, pointHitsSegments, type Segment, type Vec } from './collision'
import {
  buildOccupiedGrid,
  cellOnRay,
  computeTerritory,
  indexOf,
  rayClearance,
  reachableInfo,
  stepCell,
  wallNeighborCount,
  type Cell,
} from './aiTerritory'

export { computeTerritory, floodReachable, rayClearance } from './aiTerritory'

export type Difficulty = 'easy' | 'normal' | 'hard'

export type DifficultyConfig = {
  decisionInterval: number
  randomness: number
  minTurnBenefit: number
  interceptWeight: number
  territoryWeight: number
  spaceWeight: number
  endgameWallBonus: number
  lookahead: 1 | 2
}

export const AI_CELL_SIZE = 24
export const AI_TURN_COMMIT_DISTANCE = AI_CELL_SIZE * 2

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    decisionInterval: 0.22,
    randomness: 28,
    minTurnBenefit: 32,
    interceptWeight: 0,
    territoryWeight: 0.6,
    spaceWeight: 2.2,
    endgameWallBonus: 4,
    lookahead: 1,
  },
  normal: {
    decisionInterval: 0.12,
    randomness: 6,
    minTurnBenefit: 12,
    interceptWeight: 8,
    territoryWeight: 1.4,
    spaceWeight: 2.4,
    endgameWallBonus: 10,
    lookahead: 1,
  },
  hard: {
    decisionInterval: 0.07,
    randomness: 1.5,
    minTurnBenefit: 5,
    interceptWeight: 16,
    territoryWeight: 2.0,
    spaceWeight: 2.6,
    endgameWallBonus: 16,
    lookahead: 2,
  },
}

export type CycleView = {
  pos: Vec
  dir: Vec
  segments: Segment[]
}

export type AiSnapshot = {
  width: number
  height: number
  speed: number
  distanceSinceTurn?: number
  lastTurnRotation?: number
  ai: CycleView
  player: CycleView
  wouldCollide: (point: Vec) => boolean
}

const DIR_RIGHT = { x: 1, y: 0 }
const DIR_LEFT = { x: -1, y: 0 }
const DIR_DOWN = { x: 0, y: 1 }
const DIR_UP = { x: 0, y: -1 }

export function chooseAiDirection(
  snapshot: AiSnapshot,
  config: DifficultyConfig,
  rng: () => number = Math.random,
): Vec | null {
  const cellSize = AI_CELL_SIZE
  const gridW = Math.max(4, Math.floor(snapshot.width / cellSize))
  const gridH = Math.max(4, Math.floor(snapshot.height / cellSize))
  const occupied = buildOccupiedGrid(
    snapshot.ai.segments,
    snapshot.player.segments,
    gridW,
    gridH,
    cellSize,
  )

  const aiCell = toCell(snapshot.ai.pos, cellSize, gridW, gridH)
  const playerCell = toCell(snapshot.player.pos, cellSize, gridW, gridH)
  const aiDir = toGridDir(snapshot.ai.dir)
  const playerDir = toGridDir(snapshot.player.dir)
  const playerClearBefore = rayClearance(occupied, gridW, gridH, playerCell, playerDir)

  type Candidate = {
    dir: Vec
    score: number
    space: number
    alive: boolean
    probe: number
  }
  const candidates: Candidate[] = []

  for (const move of legalMoves(aiDir)) {
    const probe = survivalProbe(snapshot, move, config.decisionInterval)
    const stepped = stepCell(aiCell, move, occupied, gridW, gridH)
    if (probe.hit || !stepped) {
      candidates.push({
        dir: move,
        score: Number.NEGATIVE_INFINITY,
        space: 0,
        alive: false,
        probe: probe.distance,
      })
      continue
    }

    const evaluated = evaluateAfterStep({
      occupied,
      gridW,
      gridH,
      aiFrom: aiCell,
      aiTo: stepped,
      aiDir: move,
      playerCell,
      playerDir,
      playerClearBefore,
      config,
    })

    const turning = move.x !== aiDir.x || move.y !== aiDir.y
    let score = evaluated.score
    if (turning) {
      score -= config.minTurnBenefit
    }
    if (config.lookahead > 1 && predictedCollision(snapshot, move, config.decisionInterval)) {
      // The player may turn, so treat a predicted collision as a strong warning,
      // not an absolute rejection of an otherwise safe escape.
      score -= 1000
    }
    score += (rng() - 0.5) * 2 * config.randomness

    candidates.push({
      dir: move,
      score,
      space: evaluated.space,
      alive: true,
      probe: probe.distance,
    })
  }

  const living = candidates.filter((candidate) => candidate.alive)
  if (living.length === 0) {
    let best = candidates[0]
    for (const candidate of candidates) {
      if (!best || candidate.probe > best.probe) {
        best = candidate
      }
    }
    return best ? gridDirToVec(best.dir) : null
  }

  const maxSpace = living.reduce((max, candidate) => Math.max(max, candidate.space), 0)
  for (const candidate of living) {
    if (candidate.space < 3) {
      candidate.score -= 1000
    } else if (maxSpace >= 10 && candidate.space < maxSpace * 0.2) {
      candidate.score -= 800
    }
  }

  let best = living[0]
  for (const candidate of living) {
    if (candidate.score > best.score) {
      best = candidate
    }
  }

  // A quick turn in the same rotational direction can be a useful U-turn.
  // Only suppress a rapid reversal of turn direction (left-right zigzags).
  const forward = living.find((candidate) => candidate.dir.x === aiDir.x && candidate.dir.y === aiDir.y)
  const rotation = aiDir.x * best.dir.y - aiDir.y * best.dir.x
  if (forward && rotation !== 0 && rotation === -(snapshot.lastTurnRotation ?? 0) &&
    (snapshot.distanceSinceTurn ?? Infinity) < AI_TURN_COMMIT_DISTANCE &&
    forward.space >= 3 && !(maxSpace >= 10 && forward.space < maxSpace * 0.2) &&
    !(config.lookahead > 1 && predictedCollision(snapshot, aiDir, config.decisionInterval))) {
    return gridDirToVec(aiDir)
  }
  return gridDirToVec(best.dir)
}

type EvalArgs = {
  occupied: Uint8Array
  gridW: number
  gridH: number
  aiFrom: Cell
  aiTo: Cell
  aiDir: Vec
  playerCell: Cell
  playerDir: Vec
  playerClearBefore: number
  config: DifficultyConfig
}

function evaluateAfterStep(args: EvalArgs): { score: number; space: number } {
  const nextOccupied = args.occupied.slice()
  nextOccupied[indexOf(args.aiFrom.x, args.aiFrom.y, args.gridW)] = 1

  return scorePosition(nextOccupied, args)
}

function scorePosition(occupied: Uint8Array, args: EvalArgs): { score: number; space: number } {
  const { gridW, gridH, aiTo, aiDir, playerCell, playerDir, config } = args
  const { space, reachesGoal } = reachableInfo(occupied, gridW, gridH, aiTo, playerCell)
  const disconnected = !reachesGoal
  const wallHug = wallNeighborCount(occupied, gridW, gridH, aiTo, aiDir)

  if (disconnected) {
    return {
      score: space * config.spaceWeight + wallHug * config.endgameWallBonus,
      space,
    }
  }

  const territory = computeTerritory(occupied, gridW, gridH, aiTo, playerCell)
  let intercept = 0
  if (config.interceptWeight > 0 && space >= 6) {
    const blocked = occupied.slice()
    blocked[indexOf(aiTo.x, aiTo.y, gridW)] = 1
    const playerClearAfter = rayClearance(blocked, gridW, gridH, playerCell, playerDir)
    intercept = args.playerClearBefore - playerClearAfter
    if (cellOnRay(occupied, gridW, gridH, playerCell, playerDir, aiTo)) {
      intercept += 8
    }
  }

  return {
    score:
      space * config.spaceWeight +
      territory.diff * config.territoryWeight +
      intercept * config.interceptWeight,
    space,
  }
}

function survivalProbe(snapshot: AiSnapshot, dir: Vec, decisionInterval: number) {
  const step = 4
  const maxDist = Math.max(AI_CELL_SIZE, snapshot.speed * (decisionInterval + 0.05))
  let distance = 0
  while (distance < maxDist) {
    distance += step
    const point = {
      x: snapshot.ai.pos.x + dir.x * distance,
      y: snapshot.ai.pos.y + dir.y * distance,
    }
    if (snapshot.wouldCollide(point)) {
      return { hit: true, distance }
    }
  }
  return { hit: false, distance: maxDist }
}

// Simulate both heads over the next decision interval. The player is assumed
// to continue straight; this is a warning, since their next input is unknown.
function predictedCollision(snapshot: AiSnapshot, dir: Vec, interval: number) {
  const steps = Math.max(1, Math.ceil(snapshot.speed * interval / 4))
  const start = snapshot.player.pos
  for (let i = 1; i <= steps; i += 1) {
    const travel = snapshot.speed * interval * i / steps
    const player = { x: start.x + snapshot.player.dir.x * travel, y: start.y + snapshot.player.dir.y * travel }
    const ai = { x: snapshot.ai.pos.x + dir.x * travel, y: snapshot.ai.pos.y + dir.y * travel }
    // Do not extrapolate a player who would already have crashed.
    if (player.x <= 6 || player.y <= 6 || player.x >= snapshot.width - 6 || player.y >= snapshot.height - 6 ||
      pointHitsSegments(player, snapshot.ai.segments, 6) ||
      pointHitsSegments(player, snapshot.player.segments, 6, Math.max(0, snapshot.player.segments.length - 2))) break
    if (distance(ai, player) <= 10 || distancePointToSegment(ai, start, player) <= 6) return true
  }
  return false
}

function legalMoves(dir: Vec): Vec[] {
  if (dir.x === 1) return [DIR_RIGHT, DIR_UP, DIR_DOWN]
  if (dir.x === -1) return [DIR_LEFT, DIR_DOWN, DIR_UP]
  if (dir.y === 1) return [DIR_DOWN, DIR_RIGHT, DIR_LEFT]
  return [DIR_UP, DIR_LEFT, DIR_RIGHT]
}

function toGridDir(dir: Vec): Vec {
  if (Math.abs(dir.x) > Math.abs(dir.y)) {
    return dir.x > 0 ? DIR_RIGHT : DIR_LEFT
  }
  return dir.y > 0 ? DIR_DOWN : DIR_UP
}

function gridDirToVec(dir: Vec): Vec {
  if (dir.x === 1) return { ...DIR_RIGHT }
  if (dir.x === -1) return { ...DIR_LEFT }
  if (dir.y === 1) return { ...DIR_DOWN }
  return { ...DIR_UP }
}

function toCell(pos: Vec, cellSize: number, w: number, h: number): Cell {
  return {
    x: clamp(Math.floor(pos.x / cellSize), 0, w - 1),
    y: clamp(Math.floor(pos.y / cellSize), 0, h - 1),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
