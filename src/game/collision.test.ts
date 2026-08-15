import { describe, expect, it } from 'vitest'
import { pointHitsSegments } from './collision'

describe('trail sampling', () => {
  it('a long jump can miss a thin trail that short steps catch', () => {
    const wall = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 } }]
    const radius = 6
    const startX = 40
    const endX = 62

    expect(pointHitsSegments({ x: endX, y: 50 }, wall, radius)).toBe(false)

    let steppedHit = false
    for (let x = startX; x <= endX; x += 6) {
      if (pointHitsSegments({ x, y: 50 }, wall, radius)) {
        steppedHit = true
      }
    }
    expect(steppedHit).toBe(true)
  })
})
