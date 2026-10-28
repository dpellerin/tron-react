export type Vec = {
  x: number
  y: number
}

export type Segment = {
  a: Vec
  b: Vec
}

export function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function distancePointToSegment(p: Vec, a: Vec, b: Vec) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = p.x - a.x
  const apy = p.y - a.y
  const abLenSq = abx * abx + aby * aby

  if (abLenSq === 0) {
    return Math.hypot(apx, apy)
  }

  let t = (apx * abx + apy * aby) / abLenSq
  t = Math.max(0, Math.min(1, t))
  return distance(p, { x: a.x + abx * t, y: a.y + aby * t })
}

export function pointHitsSegments(point: Vec, segments: Segment[], radius: number, count = segments.length) {
  for (let i = 0; i < count; i += 1) {
    const segment = segments[i]
    if (distancePointToSegment(point, segment.a, segment.b) <= radius) {
      return true
    }
  }
  return false
}
