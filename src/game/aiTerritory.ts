import type { Segment, Vec } from './collision'

export type Cell = { x: number; y: number }

export function indexOf(x: number, y: number, w: number) {
  return y * w + x
}

// Independent distance maps allow both searches to pass through contested cells.
export function computeTerritory(
  occupied: Uint8Array, w: number, h: number, ai: Cell, player: Cell,
) {
  const aiDist = distances(occupied, w, h, ai, player)
  const playerDist = distances(occupied, w, h, player, ai)
  let aiCells = 0
  let playerCells = 0
  let contested = 0
  for (let i = 0; i < aiDist.length; i += 1) {
    const a = aiDist[i]
    const b = playerDist[i]
    if (a < 0 && b < 0) continue
    if (b < 0 || (a >= 0 && a < b)) aiCells += 1
    else if (a < 0 || b < a) playerCells += 1
    else contested += 1
  }
  return { ai: aiCells, player: playerCells, contested, diff: aiCells - playerCells }
}

function distances(occupied: Uint8Array, w: number, h: number, start: Cell, other: Cell) {
  const dist = new Int32Array(w * h)
  dist.fill(-1)
  if (start.x < 0 || start.y < 0 || start.x >= w || start.y >= h) return dist
  const queue = new Int32Array(w * h)
  let head = 0
  let tail = 0
  const first = indexOf(start.x, start.y, w)
  dist[first] = 0
  queue[tail++] = first
  while (head < tail) {
    const i = queue[head++]
    const x = i % w
    const y = (i / w) | 0
    visit(x + 1, y)
    visit(x - 1, y)
    visit(x, y + 1)
    visit(x, y - 1)
    function visit(nx: number, ny: number) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return
      const ni = indexOf(nx, ny, w)
      if (dist[ni] >= 0 || (occupied[ni] && !(nx === other.x && ny === other.y))) return
      dist[ni] = dist[i] + 1
      queue[tail++] = ni
    }
  }
  return dist
}

// Count space and connectivity in one traversal. The other head is a reachable
// goal even when its trail occupies the cell, but its trail is not traversable.
export function reachableInfo(occupied: Uint8Array, w: number, h: number, start: Cell, goal: Cell) {
  const seen = new Uint8Array(w * h)
  const queue = new Int32Array(w * h)
  if (start.x < 0 || start.y < 0 || start.x >= w || start.y >= h) {
    return { space: 0, reachesGoal: false }
  }
  let head = 0
  let tail = 0
  const first = indexOf(start.x, start.y, w)
  seen[first] = 1
  queue[tail++] = first
  let reachesGoal = start.x === goal.x && start.y === goal.y
  while (head < tail) {
    const i = queue[head++]
    const x = i % w
    const y = (i / w) | 0
    visit(x + 1, y)
    visit(x - 1, y)
    visit(x, y + 1)
    visit(x, y - 1)
    function visit(nx: number, ny: number) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return
      const ni = indexOf(nx, ny, w)
      if (nx === goal.x && ny === goal.y) reachesGoal = true
      if (seen[ni] || occupied[ni]) return
      seen[ni] = 1
      queue[tail++] = ni
    }
  }
  return { space: tail, reachesGoal }
}

export function floodReachable(occupied: Uint8Array, w: number, h: number, start: Cell) {
  return reachableInfo(occupied, w, h, start, { x: -1, y: -1 }).space
}

export function canReach(occupied: Uint8Array, w: number, h: number, start: Cell, goal: Cell) {
  return reachableInfo(occupied, w, h, start, goal).reachesGoal
}

export function rayClearance(
  occupied: Uint8Array,
  w: number,
  h: number,
  start: Cell,
  dir: Vec,
) {
  let steps = 0
  let x = start.x + dir.x
  let y = start.y + dir.y
  while (x >= 0 && y >= 0 && x < w && y < h && !occupied[indexOf(x, y, w)]) {
    steps += 1
    x += dir.x
    y += dir.y
  }
  return steps
}

export function buildOccupiedGrid(
  aiSegments: Segment[],
  playerSegments: Segment[],
  w: number,
  h: number,
  cellSize: number,
) {
  const occupied = new Uint8Array(w * h)
  markSegments(occupied, aiSegments, w, h, cellSize)
  markSegments(occupied, playerSegments, w, h, cellSize)
  return occupied
}

function markSegments(
  occupied: Uint8Array,
  segments: Segment[],
  w: number,
  h: number,
  cellSize: number,
) {
  for (const segment of segments) {
    markSegment(occupied, segment.a, segment.b, w, h, cellSize)
  }
}

function markSegment(
  occupied: Uint8Array,
  a: Vec,
  b: Vec,
  w: number,
  h: number,
  cellSize: number,
) {
  let x0 = Math.floor(a.x / cellSize)
  let y0 = Math.floor(a.y / cellSize)
  const x1 = Math.floor(b.x / cellSize)
  const y1 = Math.floor(b.y / cellSize)
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy

  while (true) {
    if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h) {
      occupied[indexOf(x0, y0, w)] = 1
    }
    if (x0 === x1 && y0 === y1) {
      break
    }
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}

export function stepCell(
  from: Cell,
  dir: Vec,
  occupied: Uint8Array,
  w: number,
  h: number,
) {
  const x = from.x + dir.x
  const y = from.y + dir.y
  if (x < 0 || y < 0 || x >= w || y >= h) {
    return null
  }
  if (occupied[indexOf(x, y, w)]) {
    return null
  }
  return { x, y }
}

export function cellOnRay(
  occupied: Uint8Array,
  w: number,
  h: number,
  start: Cell,
  dir: Vec,
  target: Cell,
) {
  let x = start.x + dir.x
  let y = start.y + dir.y
  while (x >= 0 && y >= 0 && x < w && y < h && !occupied[indexOf(x, y, w)]) {
    if (x === target.x && y === target.y) {
      return true
    }
    x += dir.x
    y += dir.y
  }
  return false
}

export function wallNeighborCount(
  occupied: Uint8Array,
  w: number,
  h: number,
  cell: Cell,
  dir: Vec,
) {
  const sides = [
    { x: cell.x + dir.y, y: cell.y - dir.x },
    { x: cell.x - dir.y, y: cell.y + dir.x },
  ]
  let count = 0
  for (const side of sides) {
    if (side.x < 0 || side.y < 0 || side.x >= w || side.y >= h) {
      count += 1
      continue
    }
    if (occupied[indexOf(side.x, side.y, w)]) {
      count += 1
    }
  }
  return count
}
