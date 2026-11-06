import { describe, expect, it } from 'vitest'
import { separate } from './collider'

function overlaps(xy: Float32Array, radius: Float32Array): number {
  let count = 0
  for (let a = 0; a < radius.length; a++) {
    for (let b = a + 1; b < radius.length; b++) {
      const d = Math.hypot(
        (xy[a * 2] ?? 0) - (xy[b * 2] ?? 0),
        (xy[a * 2 + 1] ?? 0) - (xy[b * 2 + 1] ?? 0),
      )
      if (d < (radius[a] ?? 0) + (radius[b] ?? 0)) count++
    }
  }
  return count
}

describe('separate', () => {
  it('pushes overlapping nodes apart and leaves fixed and dead nodes in place', () => {
    const count = 60
    const radius = new Float32Array(count).fill(5)
    const xy = Float32Array.from({ length: count * 2 }, (_, at) => ((at * 7919) % 97) - 48)
    const alive = new Uint8Array(count).fill(1)
    alive[1] = 0
    const fixed = new Uint8Array(count)
    fixed[0] = 1
    fixed[1] = 1
    const before = xy.slice()
    expect(overlaps(xy, radius)).toBeGreaterThan(10)
    separate(radius, alive, fixed, xy, 2, 40)
    const living = (array: Float32Array) => array.filter((_, at) => Math.floor(at / 2) !== 1)
    expect(overlaps(xy, radius) - overlaps(before, radius)).toBeLessThan(0)
    expect(overlaps(Float32Array.from(living(xy)), radius.subarray(1))).toBe(0)
    expect(Array.from(xy.subarray(0, 4))).toEqual(Array.from(before.subarray(0, 4)))
  })

  it('does nothing without movable nodes', () => {
    const xy = Float32Array.from([0, 0, 0, 0])
    separate(
      new Float32Array(2).fill(5),
      Uint8Array.from([1, 1]),
      Uint8Array.from([1, 1]),
      xy,
      2,
      10,
    )
    expect(Array.from(xy)).toEqual([0, 0, 0, 0])
  })
})
