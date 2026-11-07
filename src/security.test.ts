import lockfile from '../package-lock.json?raw'
import { describe, expect, it } from 'vitest'

// Check every installed path, not just hoisted packages: nested vulnerable copies
// must not reappear when the lockfile is refreshed by dependency automation.
const lock = JSON.parse(lockfile)
const minimums: Record<string, number[]> = {
  vite: [7, 3, 7],
  vitest: [4, 1, 12],
  '@vitest/mocker': [4, 1, 12],
  postcss: [8, 5, 23],
  'source-map-js': [1, 2, 2],
  rollup: [4, 59, 0],
}

function atLeast(version: string, minimum: number[]) {
  const parts = version.split('.').map(Number)
  for (let i = 0; i < minimum.length; i++) {
    if (parts[i] !== minimum[i]) return parts[i] > minimum[i]
  }
  return true
}

describe('security dependency baseline', () => {
  for (const [name, minimum] of Object.entries(minimums)) {
    it(`keeps every ${name} copy at the patched baseline`, () => {
      const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`)
      expect(copies.length).toBeGreaterThan(0)
      for (const [path, entry] of copies) {
        const version = (entry as { version: string }).version
        expect(atLeast(version, minimum), `${path}@${version}`).toBe(true)
      }
    })
  }

  it('excludes minimatch versions affected by globparts amplification', () => {
    const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith('/minimatch'))
    expect(copies.length).toBeGreaterThan(0)
    for (const [path, entry] of copies) {
      const version = (entry as { version: string }).version
      const major = Number(version.split('.')[0])
      expect(major < 7 ? atLeast(version, [3, 1, 4]) : atLeast(version, [11, 0, 1]), `${path}@${version}`).toBe(true)
    }
  })
})
