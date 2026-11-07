import { describe, expect, it } from 'vitest'
import { BridgeFinder, BridgeSet, type BridgeSource, bridgeRadiusAt } from './bridges'
import { EdgeColumns } from './columns'
import { Positions } from './positions'

type Point = readonly [number, number]

function scene(points: readonly Point[], links: readonly (readonly [number, number])[]) {
  const positions = new Positions()
  points.forEach(([x, y], index) => {
    positions.set(index, x, y)
  })
  const edges = new EdgeColumns()
  edges.reserve(links.length)
  links.forEach(([source, target], index) => {
    edges.alive[index] = 1
    edges.bridge[index] = 1
    edges.source[index] = source
    edges.target[index] = target
  })
  return { positions, edges }
}

function find(source: Partial<BridgeSource> & Pick<BridgeSource, 'edges' | 'positions'>) {
  const set = new BridgeSet()
  const finder = new BridgeFinder({
    paths: null,
    radius: () => 5,
    shown: () => true,
    maxEdges: 1000,
    ...source,
  })
  finder.step(Number.POSITIVE_INFINITY, set)
  return { set, finder }
}

function bridgesOf(set: BridgeSet, edge: number): number[][] {
  const first = set.firstOf(edge)
  return Array.from({ length: set.countOf(edge) }, (_, k) =>
    Array.from(set.data.subarray((first + k) * 4, (first + k) * 4 + 3)),
  )
}

const cross: Point[] = [
  [-100, 0],
  [100, 0],
  [0, -100],
  [0, 100],
]

describe('BridgeFinder', () => {
  it('makes the horizontal edge jump over the vertical one', () => {
    for (const links of [
      [
        [0, 1],
        [2, 3],
      ],
      [
        [2, 3],
        [0, 1],
      ],
    ] as const) {
      const { positions, edges } = scene(cross, links)
      const { set } = find({ positions, edges })
      const horizontal = links[0][0] === 0 ? 0 : 1
      expect(set.count).toBe(1)
      expect(bridgesOf(set, horizontal)).toEqual([[1 - horizontal, 0, 0]])
      expect(set.countOf(1 - horizontal)).toBe(0)
    }
  })

  it('lets the later edge jump between slanted edges', () => {
    const { positions, edges } = scene(
      [
        [-100, -50],
        [100, 50],
        [-100, 60],
        [100, -40],
      ],
      [
        [0, 1],
        [2, 3],
      ],
    )
    const { set } = find({ positions, edges })
    expect(bridgesOf(set, 1)).toEqual([[0, 0, 0]])
    edges.slot[0] = 1
    expect(bridgesOf(find({ positions, edges }).set, 0)).toEqual([[1, 0, 0]])
  })

  it('ignores crossings inside an end node, curves, loops and edges left out', () => {
    const { positions, edges } = scene(
      [...cross, [20, -60], [20, 60]],
      [
        [0, 1],
        [4, 5],
      ],
    )
    expect(find({ positions, edges, radius: (node) => (node === 0 ? 130 : 5) }).set.count).toBe(0)
    expect(find({ positions, edges }).set.count).toBe(1)
    edges.bend[1] = 0.1
    expect(find({ positions, edges }).set.count).toBe(0)
    edges.bend[1] = 0
    edges.bridge[1] = 0
    expect(find({ positions, edges }).set.count).toBe(0)
    edges.bridge[1] = 1
    expect(find({ positions, edges, shown: (edge) => edge !== 0 }).set.count).toBe(0)
  })

  it('finds every crossing of a grid of edges, capped per segment', () => {
    const points: Point[] = []
    const links: [number, number][] = []
    for (let k = 0; k < 12; k++) {
      points.push([-10, k * 10], [200, k * 10], [k * 10 + 5, -10], [k * 10 + 5, 200])
      links.push([k * 4, k * 4 + 1], [k * 4 + 2, k * 4 + 3])
    }
    const { positions, edges } = scene(points, links)
    const { set } = find({ positions, edges, radius: () => 1 })
    expect(set.count).toBe(12 * 8)
    expect(set.countOf(0)).toBe(8)
    expect(set.countOf(1)).toBe(0)
  })

  it('gives up above maxEdges', () => {
    const { positions, edges } = scene(cross, [
      [0, 1],
      [2, 3],
    ])
    const { set, finder } = find({ positions, edges, maxEdges: 1 })
    expect(finder.over).toBe(true)
    expect(set.count).toBe(0)
  })

  it('works in slices', () => {
    const points: Point[] = []
    const links: [number, number][] = []
    for (let k = 0; k < 400; k++) {
      points.push([Math.cos(k) * 500, Math.sin(k * 1.3) * 500])
      if (k > 0) links.push([k - 1, k])
    }
    const { positions, edges } = scene(points, links)
    const whole = find({ positions, edges }).set
    const set = new BridgeSet()
    const finder = new BridgeFinder({
      edges,
      positions,
      paths: null,
      radius: () => 5,
      shown: () => true,
      maxEdges: 1000,
    })
    let slices = 1
    while (!finder.step(performance.now() - 1, set)) slices++
    expect(slices).toBeGreaterThan(1)
    expect(set.count).toBe(whole.count)
    expect(Array.from(set.data)).toEqual(Array.from(whole.data))
  })
})

describe('bridgeRadiusAt', () => {
  it('shrinks with the zoom below 1 and vanishes under a pixel', () => {
    expect(bridgeRadiusAt(8, 2)).toBe(4)
    expect(bridgeRadiusAt(8, 0.5)).toBe(2)
    expect(bridgeRadiusAt(8, 0.2)).toBe(0)
  })
})
