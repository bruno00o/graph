import { describe, expect, it } from 'vitest'
import { OrthogonalRouter, type RouteInput, type RouteOutput, routeOrthogonal } from './orthogonal'

interface Box {
  readonly x: number
  readonly y: number
  readonly half?: number
}

function input(boxes: readonly Box[], ends: readonly number[]): RouteInput {
  return {
    xy: new Float32Array(boxes.flatMap((box) => [box.x, box.y])),
    extents: new Float32Array(boxes.flatMap((box) => [box.half ?? 10, box.half ?? 10])),
    parents: null,
    ends: new Uint32Array(ends),
  }
}

function route(result: RouteOutput, edge: number): [number, number][] {
  const points: [number, number][] = []
  for (let k = result.offsets[edge] ?? 0; k < (result.offsets[edge + 1] ?? 0); k++) {
    points.push([result.points[k * 2] ?? 0, result.points[k * 2 + 1] ?? 0])
  }
  return points
}

function orthogonal(points: readonly [number, number][]): boolean {
  return points.every(([x, y], k) => {
    const next = points[k + 1]
    return !next || Math.abs(next[0] - x) < 1e-3 || Math.abs(next[1] - y) < 1e-3
  })
}

function crosses(points: readonly [number, number][], box: Box): boolean {
  const half = box.half ?? 10
  return points.some(([x0, y0], k) => {
    const next = points[k + 1]
    if (!next) return false
    const [x1, y1] = next
    return (
      Math.max(x0, x1) > box.x - half &&
      Math.min(x0, x1) < box.x + half &&
      Math.max(y0, y1) > box.y - half &&
      Math.min(y0, y1) < box.y + half
    )
  })
}

const settings = { gap: 8, spacing: 6, axis: 'auto' } as const

describe('routeOrthogonal', () => {
  it('draws horizontal and vertical segments from center to center', () => {
    const boxes = [
      { x: 0, y: 0 },
      { x: 200, y: 150 },
    ]
    const result = routeOrthogonal(input(boxes, [0, 1]), settings)
    const points = route(result, 0)
    expect(orthogonal(points)).toBe(true)
    expect(points[0]).toEqual([0, 0])
    expect(points.at(-1)).toEqual([200, 150])
    expect(points.length).toBeLessThanOrEqual(4)
  })

  it('goes around the nodes in the way', () => {
    const wall = { x: 0, y: 100, half: 40 }
    const boxes = [{ x: 0, y: 0 }, wall, { x: 0, y: 200 }]
    const result = routeOrthogonal(input(boxes, [0, 2]), settings)
    const points = route(result, 0)
    expect(orthogonal(points)).toBe(true)
    expect(crosses(points, wall)).toBe(false)
  })

  it('finds a way through a maze of nodes', () => {
    const boxes: Box[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
    ]
    for (let row = -3; row <= 3; row++) boxes.push({ x: 200, y: row * 30, half: 12 })
    boxes.push({ x: 120, y: 0, half: 12 })
    const stats = { simple: 0, searched: 0, blocked: 0, expansions: 0, nudging: 0 }
    const result = routeOrthogonal(input(boxes, [0, 1]), settings, stats)
    expect(stats.searched).toBe(1)
    const points = route(result, 0)
    expect(orthogonal(points)).toBe(true)
    for (const box of boxes.slice(2)) expect(crosses(points, box)).toBe(false)
  })

  it('leaves along the main axis when one is set', () => {
    const boxes = [
      { x: 0, y: 0 },
      { x: 300, y: 100 },
    ]
    const down = route(routeOrthogonal(input(boxes, [0, 1]), { ...settings, axis: 'vertical' }), 0)
    expect(down[1]?.[0]).toBeCloseTo(0)
    const across = route(
      routeOrthogonal(input(boxes, [0, 1]), { ...settings, axis: 'horizontal' }),
      0,
    )
    expect(across[1]?.[1]).toBeCloseTo(0)
  })

  it('leaves and enters through the sides of the axis when the ends are aligned across it', () => {
    const horizontal = { ...settings, axis: 'horizontal' } as const
    const stacked = [
      { x: 0, y: 0 },
      { x: 4, y: 200 },
    ]
    const free = route(routeOrthogonal(input(stacked, [0, 1]), horizontal), 0)
    expect(orthogonal(free)).toBe(true)
    expect(free[1]?.[1]).toBeCloseTo(0)
    expect(Math.abs((free[1]?.[0] ?? 0) - 0)).toBeGreaterThan(10)
    expect(free.at(-2)?.[1]).toBeCloseTo(200)
    expect(Math.abs((free.at(-2)?.[0] ?? 0) - 4)).toBeGreaterThan(10)
    const vertical = { ...settings, axis: 'vertical' } as const
    const side = route(
      routeOrthogonal(
        input(
          [
            { x: 0, y: 0 },
            { x: 200, y: 4 },
          ],
          [0, 1],
        ),
        vertical,
      ),
      0,
    )
    expect(side[1]?.[0]).toBeCloseTo(0)
    expect(Math.abs(side[1]?.[1] ?? 0)).toBeGreaterThan(10)
  })

  it('turns only once outside the end nodes when it goes around an obstacle', () => {
    const horizontal = { ...settings, axis: 'horizontal' } as const
    const wall = { x: 50, y: 100, half: 40 }
    const boxes = [{ x: 0, y: 0 }, wall, { x: 100, y: 200 }]
    const stats = { simple: 0, searched: 0, blocked: 0, expansions: 0, nudging: 0 }
    const points = route(routeOrthogonal(input(boxes, [0, 2]), horizontal, stats), 0)
    expect(stats.searched).toBe(1)
    expect(orthogonal(points)).toBe(true)
    expect(crosses(points, wall)).toBe(false)
    expect(points[1]?.[1]).toBeCloseTo(0)
    expect(Math.abs(points[1]?.[0] ?? 0)).toBeGreaterThan(10)
    expect(points.at(-2)?.[1]).toBeCloseTo(200)
    expect(Math.abs((points.at(-2)?.[0] ?? 0) - 100)).toBeGreaterThan(10)
  })

  it('pulls apart segments that would overlap, and spreads their ports', () => {
    const boxes = [
      { x: 0, y: 0, half: 20 },
      { x: -100, y: 200 },
      { x: 100, y: 200 },
    ]
    const result = routeOrthogonal(input(boxes, [0, 1, 0, 2]), { ...settings, axis: 'vertical' })
    const left = route(result, 0)
    const right = route(result, 1)
    expect(orthogonal(left)).toBe(true)
    expect(orthogonal(right)).toBe(true)
    const leftX = left[0]?.[0] ?? 0
    const rightX = right[0]?.[0] ?? 0
    expect(Math.abs(leftX - rightX)).toBeGreaterThanOrEqual(6 - 1e-6)
    expect(Math.abs(leftX)).toBeLessThan(20)
    expect(Math.abs(rightX)).toBeLessThan(20)
    expect(leftX).toBeLessThan(rightX)
  })

  it('separates parallel edges between the same nodes', () => {
    const boxes = [
      { x: 0, y: 0, half: 20 },
      { x: 300, y: 200, half: 20 },
    ]
    const result = routeOrthogonal(input(boxes, [0, 1, 1, 0]), { ...settings, axis: 'vertical' })
    const there = route(result, 0)
    const back = route(result, 1)
    const middle = (points: [number, number][]) => points[1]?.[1] ?? 0
    expect(Math.abs(middle(there) - middle(back))).toBeGreaterThanOrEqual(6 - 1e-6)
  })

  it('routes in slices and gives the same result', () => {
    const boxes: Box[] = []
    const ends: number[] = []
    for (let k = 0; k < 300; k++) {
      boxes.push({ x: (k % 20) * 60, y: Math.floor(k / 20) * 60 })
      if (k > 0) ends.push(k - 1, (k * 7) % 300)
    }
    const whole = routeOrthogonal(input(boxes, ends), settings)
    const router = new OrthogonalRouter(input(boxes, ends), settings)
    let result: RouteOutput | null = null
    let slices = 0
    while (!result) {
      result = router.step(performance.now() - 1)
      slices++
    }
    expect(slices).toBeGreaterThan(1)
    expect(router.done).toBe(true)
    expect(Array.from(result.offsets)).toEqual(Array.from(whole.offsets))
    expect(Array.from(result.points)).toEqual(Array.from(whole.points))
  })

  it('spreads the channels over several slices and gives the same result', () => {
    const boxes: Box[] = []
    const ends: number[] = []
    for (let k = 0; k < 10; k++) {
      boxes.push({ x: k * 100, y: 0 }, { x: k * 100, y: 300 })
      for (let copy = 0; copy < 5; copy++) ends.push(k * 2, k * 2 + 1)
    }
    const whole = routeOrthogonal(input(boxes, ends), settings)
    const router = new OrthogonalRouter(input(boxes, ends), settings)
    let result: RouteOutput | null = null
    let slices = 0
    while (!result) {
      result = router.step(performance.now() - 1)
      slices++
    }
    const sliced = result
    expect(slices).toBeGreaterThan(10)
    expect(Array.from(sliced.points)).toEqual(Array.from(whole.points))
    expect(new Set(Array.from({ length: 5 }, (_, edge) => route(sliced, edge)[0]?.[0])).size).toBe(
      5,
    )
  })
})
