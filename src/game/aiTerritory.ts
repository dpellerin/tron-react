import type { Segment, Vec } from './collision'

export type Cell = { x: number; y: number }

const OWNER_AI = 1
const OWNER_PLAYER = 2
const OWNER_TIE = 3

export function indexOf(x: number, y: number, w: number) {
  return y * w + x
}

export function computeTerritory(
  occupied: Uint8Array,
  w: number,
  h: number,
  ai: Cell,
  player: Cell,
) {
  const owner = new Uint8Array(w * h)
  const dist = new Int16Array(w * h)
  dist.fill(-1)

  const queue = new Int32Array(w * h * 2)
  let head = 0
  let tail = 0

  const enqueue = (x: number, y: number, who: number, d: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) {
      return
    }
    const i = indexOf(x, y, w)
    if (dist[i] === -1) {
      dist[i] = d
      owner[i] = who
      queue[tail++] = i
      return
    }
    if (dist[i] === d && owner[i] !== who && owner[i] !== OWNER_TIE) {
      owner[i] = OWNER_TIE
    }
  }

  enqueue(ai.x, ai.y, OWNER_AI, 0)
  enqueue(player.x, player.y, OWNER_PLAYER, 0)

  while (head < tail) {
    const i = queue[head++]
    if (owner[i] === OWNER_TIE) {
      continue
    }
    const x = i % w
    const y = (i / w) | 0
    const nextDist = dist[i] + 1
    const who = owner[i]
    visitNeighbor(x + 1, y)
    visitNeighbor(x - 1, y)
    visitNeighbor(x, y + 1)
    visitNeighbor(x, y - 1)

    function visitNeighbor(nx: number, ny: number) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        return
      }
      const ni = indexOf(nx, ny, w)
      if (occupied[ni] && !(nx === ai.x && ny === ai.y) && !(nx === player.x && ny === player.y)) {
        return
      }
      enqueue(nx, ny, who, nextDist)
    }
  }

  let aiCells = 0
  let playerCells = 0
  let contested = 0
  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i] === OWNER_AI) aiCells += 1
    else if (owner[i] === OWNER_PLAYER) playerCells += 1
    else if (owner[i] === OWNER_TIE) contested += 1
  }

  return { ai: aiCells, player: playerCells, contested, diff: aiCells - playerCells }
}

export function floodReachable(occupied: Uint8Array, w: number, h: number, start: Cell) {
  return walkFrom(occupied, w, h, start, null)
}

export function canReach(occupied: Uint8Array, w: number, h: number, start: Cell, goal: Cell) {
  return walkFrom(occupied, w, h, start, goal) >= 0
}

function walkFrom(
  occupied: Uint8Array,
  w: number,
  h: number,
  start: Cell,
  goal: Cell | null,
) {
  if (start.x < 0 || start.y < 0 || start.x >= w || start.y >= h) {
    return goal ? -1 : 0
  }
  const seen = new Uint8Array(w * h)
  const queue = new Int32Array(w * h)
  let head = 0
  let tail = 0
  const startIndex = indexOf(start.x, start.y, w)
  seen[startIndex] = 1
  queue[tail++] = startIndex
  let count = 0

  while (head < tail) {
    const i = queue[head++]
    const x = i % w
    const y = (i / w) | 0
    if (goal && x === goal.x && y === goal.y) {
      return count + 1
    }
    count += 1
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }

  return goal ? -1 : count

  function push(nx: number, ny: number) {
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
      return
    }
    const ni = indexOf(nx, ny, w)
    const isGoal = Boolean(goal && nx === goal.x && ny === goal.y)
    if (seen[ni] || (occupied[ni] && !isGoal)) {
      return
    }
    seen[ni] = 1
    queue[tail++] = ni
  }
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
