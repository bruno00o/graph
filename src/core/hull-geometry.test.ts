import { describe, expect, it } from 'vitest'
import { convexHull, HullScratch, hullOutline, Outline, outlineStride } from './hull-geometry'

function scratchOf(disks: ReadonlyArray<readonly [number, number, number]>): HullScratch {
  const scratch = new HullScratch()
  scratch.reserve(disks.length)
  scratch.count = disks.length
  disks.forEach(([x, y, r], i) => {
    scratch.x[i] = x
    scratch.y[i] = y
    scratch.r[i] = r
  })
  return scratch
}

function points(outline: Outline, padding = 0): Array<readonly [number, number]> {
  const result: Array<readonly [number, number]> = []
  for (let k = 0; k < outline.length; k++) {
    const at = k * outlineStride
    const [qx = 0, qy = 0, nx = 0, ny = 0, offset = 0] = outline.data.subarray(at, at + 5)
    result.push([qx + nx * (offset + padding), qy + ny * (offset + padding)])
  }
  return result
}

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function expectConvexAround(
  polygon: ReadonlyArray<readonly [number, number]>,
  disks: ReadonlyArray<readonly [number, number, number]>,
  tolerance: number,
): void {
  const n = polygon.length
  for (let k = 0; k < n; k++) {
    const [ax, ay] = polygon[k] ?? [0, 0]
    const [bx, by] = polygon[(k + 1) % n] ?? [0, 0]
    const [cx, cy] = polygon[(k + 2) % n] ?? [0, 0]
    expect((bx - ax) * (cy - by) - (by - ay) * (cx - bx)).toBeGreaterThanOrEqual(-1e-6)
    const length = Math.hypot(bx - ax, by - ay)
    if (length < 1e-9) continue
    for (const [x, y, r] of disks) {
      const inside = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / length
      expect(inside).toBeGreaterThanOrEqual(r - tolerance)
    }
  }
}

describe('convexHull', () => {
  it('keeps the corners in counterclockwise order and drops inner and collinear points', () => {
    const scratch = scratchOf([
      [0, 0, 0],
      [10, 0, 0],
      [5, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
      [5, 5, 0],
      [3, 7, 0],
    ])
    const size = convexHull(scratch.x, scratch.y, scratch.count, scratch.order, scratch.hull)
    const corners = Array.from(scratch.hull.subarray(0, size))
    expect(corners).toEqual([0, 1, 3, 4])
  })

  it('handles a single point, duplicates and two points', () => {
    const one = scratchOf([[4, 4, 0]])
    expect(convexHull(one.x, one.y, 1, one.order, one.hull)).toBe(1)
    const same = scratchOf([
      [4, 4, 0],
      [4, 4, 0],
      [4, 4, 0],
    ])
    expect(convexHull(same.x, same.y, 3, same.order, same.hull)).toBe(1)
    const two = scratchOf([
      [0, 0, 0],
      [5, 1, 0],
    ])
    expect(convexHull(two.x, two.y, 2, two.order, two.hull)).toBe(2)
  })
})

describe('hullOutline', () => {
  it('draws a circle around a single node', () => {
    const outline = new Outline()
    hullOutline(scratchOf([[3, 4, 5]]), 'rounded', outline)
    const ring = points(outline)
    expect(ring.length).toBeGreaterThan(32)
    for (const [x, y] of ring) expect(Math.hypot(x - 3, y - 4)).toBeCloseTo(5, 5)
  })

  it('touches the disks it encloses, with padding added along the normals', () => {
    const disks = [
      [0, 0, 8],
      [200, 0, 8],
      [100, 150, 8],
      [100, 50, 8],
    ] as const
    const outline = new Outline()
    hullOutline(scratchOf(disks), 'rounded', outline)
    const ring = points(outline, 12)
    expectConvexAround(ring, disks, 0.1)
    const nearest = Math.min(...ring.map(([x, y]) => Math.hypot(x, y)))
    expect(nearest).toBeCloseTo(20, 1)
  })

  it('encloses disks of different sizes', () => {
    const disks = [
      [0, 0, 2],
      [100, 0, 2],
      [50, 6, 30],
      [50, 80, 4],
      [40, 30, 12],
    ] as const
    const outline = new Outline()
    hullOutline(scratchOf(disks), 'rounded', outline)
    expectConvexAround(points(outline), disks, 0.2)
    const top = Math.min(...points(outline).map(([, y]) => y))
    expect(top).toBeCloseTo(-24, 0)
  })

  it('bends the sides of a smooth outline outward and keeps every disk inside', () => {
    const disks = [
      [0, 0, 8],
      [400, 0, 8],
      [200, 300, 8],
    ] as const
    const rounded = new Outline()
    const smooth = new Outline()
    hullOutline(scratchOf(disks), 'rounded', rounded)
    hullOutline(scratchOf(disks), 'smooth', smooth)
    expectConvexAround(points(smooth), disks, 0.1)
    const lowest = (outline: Outline) => Math.min(...points(outline).map(([, y]) => y))
    expect(lowest(rounded)).toBeCloseTo(-8, 1)
    expect(lowest(smooth)).toBeLessThan(-30)
  })

  it('stays convex and encloses random sets', () => {
    const next = random(3)
    for (let round = 0; round < 40; round++) {
      const count = 1 + Math.floor(next() * 60)
      const disks = Array.from(
        { length: count },
        () => [next() * 500, next() * 300, round % 2 === 0 ? 6 : 2 + next() * 20] as const,
      )
      for (const shape of ['rounded', 'smooth'] as const) {
        const outline = new Outline()
        hullOutline(scratchOf(disks), shape, outline)
        expectConvexAround(points(outline, 4), disks, 0.25)
      }
    }
  })
})
