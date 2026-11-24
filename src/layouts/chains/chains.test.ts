import { describe, expect, it } from 'vitest'
import type { Layout, LayoutGraph, LayoutListener, LayoutRun } from '../../types'
import { type ChainsOptions, chains } from './index'

function graphOf(
  count: number,
  pairs: readonly (readonly [number, number])[],
  options: {
    readonly fixed?: readonly number[]
    readonly xy?: Float32Array
    readonly radius?: number
    readonly datum?: (index: number) => unknown
  } = {},
): LayoutGraph {
  const movable = new Uint8Array(count).fill(1)
  for (const fixed of options.fixed ?? []) movable[fixed] = 0
  return {
    capacity: count,
    alive: new Uint8Array(count).fill(1),
    movable,
    xy: options.xy ?? new Float32Array(count * 2),
    radius: new Float32Array(count).fill(options.radius ?? 5),
    edges: Uint32Array.from(pairs.flat()),
    keys: Array.from({ length: count }, (_, index) => `n${index}`),
    datum: options.datum ?? (() => undefined),
    work: { slice: 50, workers: false },
  }
}

interface Outcome {
  readonly xy: Float32Array
  readonly failed: unknown
}

function runOf(layout: Layout, graph: LayoutGraph): Promise<Outcome> {
  return new Promise((resolve) => {
    layout.start(graph, {
      progress: () => {},
      end: (xy) => resolve({ xy, failed: undefined }),
      fail: (error) => resolve({ xy: Float32Array.from(graph.xy), failed: error }),
    })
  })
}

const at = (xy: Float32Array, index: number): readonly [number, number] => [
  xy[index * 2] ?? 0,
  xy[index * 2 + 1] ?? 0,
]

const dist = (a: readonly [number, number], b: readonly [number, number]): number =>
  Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0))

const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle))

function circumcenter(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): readonly [number, number] {
  const d =
    2 *
    ((a[0] ?? 0) * ((b[1] ?? 0) - (c[1] ?? 0)) +
      (b[0] ?? 0) * ((c[1] ?? 0) - (a[1] ?? 0)) +
      (c[0] ?? 0) * ((a[1] ?? 0) - (b[1] ?? 0)))
  const ux =
    (((a[0] ?? 0) ** 2 + (a[1] ?? 0) ** 2) * ((b[1] ?? 0) - (c[1] ?? 0)) +
      ((b[0] ?? 0) ** 2 + (b[1] ?? 0) ** 2) * ((c[1] ?? 0) - (a[1] ?? 0)) +
      ((c[0] ?? 0) ** 2 + (c[1] ?? 0) ** 2) * ((a[1] ?? 0) - (b[1] ?? 0))) /
    d
  const uy =
    (((a[0] ?? 0) ** 2 + (a[1] ?? 0) ** 2) * ((c[0] ?? 0) - (b[0] ?? 0)) +
      ((b[0] ?? 0) ** 2 + (b[1] ?? 0) ** 2) * ((a[0] ?? 0) - (c[0] ?? 0)) +
      ((c[0] ?? 0) ** 2 + (c[1] ?? 0) ** 2) * ((b[0] ?? 0) - (a[0] ?? 0))) /
    d
  return [ux, uy]
}

describe('chains layout', () => {
  it('has the instant contract', () => {
    const layout = chains({ exits: ['n0'] })
    expect(layout.name).toBe('chains')
    expect(layout.incremental).toBe(false)
    expect(layout.turns).toBe('none')
    expect(Object.isFrozen(layout.options)).toBe(true)
  })

  it('draws a covered chain as an arc of a circle through its two exits', async () => {
    const pairs: [number, number][] = [[0, 2]]
    for (let index = 2; index < 9; index++) pairs.push([index, index + 1])
    pairs.push([9, 1])
    const graph = graphOf(10, pairs)
    const { xy, failed } = await runOf(chains({ exits: ['n0', 'n1'], spacing: 10 }), graph)
    expect(failed).toBeUndefined()
    const step = 20
    const a = at(xy, 0)
    const b = at(xy, 1)
    expect(Math.abs(dist(a, b) - 1.6 * step)).toBeLessThan(1.6 * step * 0.03)
    const center = circumcenter(a, b, at(xy, 2))
    const radius = dist(center, a)
    const angleOf = (p: readonly [number, number]) =>
      Math.atan2((p[1] ?? 0) - (center[1] ?? 0), (p[0] ?? 0) - (center[0] ?? 0))
    for (let index = 2; index <= 9; index++) {
      expect(Math.abs(dist(center, at(xy, index)) - radius)).toBeLessThan(radius * 0.03)
    }
    expect(Math.abs(dist(center, b) - radius)).toBeLessThan(radius * 0.03)
    const path = [a, ...Array.from({ length: 8 }, (_, k) => at(xy, k + 2)), b]
    let arc = 0
    for (let k = 1; k < path.length; k++) {
      const before = path[k - 1] as readonly [number, number]
      const after = path[k] as readonly [number, number]
      expect(
        Math.abs(
          dist(before, after) -
            dist(path[0] as readonly [number, number], path[1] as readonly [number, number]),
        ),
      ).toBeLessThan(step * 0.03)
      arc += Math.abs(wrap(angleOf(after) - angleOf(before)))
    }
    expect(Math.abs(radius * arc - 9 * step)).toBeLessThan(9 * step * 0.03)
  })

  it('draws a straight segment when the arc would be shorter than the chord', async () => {
    const xy = new Float32Array(5 * 2)
    xy[0] = 0
    xy[1] = 0
    xy[2] = 1000
    xy[3] = 0
    const graph = graphOf(
      5,
      [
        [0, 2],
        [2, 3],
        [3, 4],
        [4, 1],
      ],
      {
        fixed: [0, 1],
        xy,
      },
    )
    const { xy: out, failed } = await runOf(chains({ exits: ['n0', 'n1'], spacing: 10 }), graph)
    expect(failed).toBeUndefined()
    expect(at(out, 0)).toEqual([0, 0])
    expect(at(out, 1)).toEqual([1000, 0])
    for (let index = 2; index <= 4; index++) {
      const [x, y] = at(out, index)
      expect(y).toBeCloseTo(0, 6)
      expect(x).toBeCloseTo((index - 1) * 250, 3)
    }
  })

  it('draws a self-returning chain as a circle through its exit', async () => {
    const graph = graphOf(4, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ])
    const { xy, failed } = await runOf(chains({ exits: ['n0'], spacing: 10 }), graph)
    expect(failed).toBeUndefined()
    const exit = at(xy, 0)
    const center = circumcenter(exit, at(xy, 1), at(xy, 2))
    const radius = dist(center, exit)
    expect(radius).toBeGreaterThanOrEqual((4 * 20) / (2 * Math.PI) - 1e-3)
    for (let index = 1; index <= 3; index++) {
      expect(Math.abs(dist(center, at(xy, index)) - radius)).toBeLessThan(radius * 0.03)
    }
  })

  it('keeps fixed nodes in place and uses a fixed exit as an anchor', async () => {
    const xy = new Float32Array(5 * 2)
    xy[0] = 100
    xy[1] = 50
    const pairs: [number, number][] = [
      [0, 2],
      [2, 3],
      [3, 4],
      [4, 1],
    ]
    const graph = graphOf(5, pairs, { fixed: [0], xy })
    const { xy: out, failed } = await runOf(chains({ exits: ['n0', 'n1'], spacing: 10 }), graph)
    expect(failed).toBeUndefined()
    expect(at(out, 0)).toEqual([100, 50])
    const other = at(out, 1)
    expect(Math.abs(dist(other, [100, 50]) - 1.6 * 20)).toBeLessThan(1.6 * 20 * 0.03)
  })

  it('moves only the movable nodes of a partial run', async () => {
    const xy = new Float32Array(5 * 2)
    xy[8] = -300
    xy[9] = 700
    const pairs: [number, number][] = [
      [0, 2],
      [2, 3],
      [3, 4],
      [4, 1],
    ]
    const graph = graphOf(5, pairs, { fixed: [4], xy })
    const { xy: out, failed } = await runOf(chains({ exits: ['n0', 'n1'], spacing: 10 }), graph)
    expect(failed).toBeUndefined()
    expect(at(out, 4)).toEqual([-300, 700])
    expect(Math.abs(dist(at(out, 0), at(out, 1)) - 1.6 * 20)).toBeLessThan(1.6 * 20 * 0.03)
  })

  it('is deterministic: two runs give the same bytes', async () => {
    const pairs: [number, number][] = [
      [0, 2],
      [2, 3],
      [3, 1],
      [1, 4],
      [4, 5],
      [5, 0],
      [0, 6],
      [6, 1],
    ]
    const first = await runOf(chains({ exits: ['n0', 'n1'], spacing: 10 }), graphOf(7, pairs))
    const second = await runOf(chains({ exits: ['n0', 'n1'], spacing: 10 }), graphOf(7, pairs))
    expect(Buffer.from(first.xy.buffer).equals(Buffer.from(second.xy.buffer))).toBe(true)
  })

  it('leaves no overlap at the end', async () => {
    const pairs: [number, number][] = [
      [0, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 1],
      [0, 10],
      [10, 11],
      [11, 12],
      [2, 12],
      [1, 13],
    ]
    const graph = graphOf(14, pairs)
    const { xy, failed } = await runOf(chains({ exits: ['n0', 'n1'], spacing: 10 }), graph)
    expect(failed).toBeUndefined()
    const step = 20
    const finalGap = Math.min(10, Math.max(0, 0.6 * step - 2 * 5))
    for (let a = 0; a < 14; a++) {
      for (let b = a + 1; b < 14; b++) {
        expect(dist(at(xy, a), at(xy, b))).toBeGreaterThanOrEqual(5 + 5 + finalGap - 0.05)
      }
    }
  })

  it('keeps every arc node on its circle after the final pass, with regular steps', async () => {
    const pairs: [number, number][] = [[0, 2]]
    for (let index = 2; index < 9; index++) pairs.push([index, index + 1])
    pairs.push([9, 1])
    const graph = graphOf(10, pairs)
    const { xy, failed } = await runOf(chains({ exits: ['n0', 'n1'], spacing: 10 }), graph)
    expect(failed).toBeUndefined()
    const a = at(xy, 0)
    const b = at(xy, 1)
    const center = circumcenter(a, b, at(xy, 2))
    const radius = dist(center, a)
    const path = [a, ...Array.from({ length: 8 }, (_, k) => at(xy, k + 2)), b]
    for (const point of path) {
      expect(Math.abs(dist(center, point) - radius)).toBeLessThan(0.02)
    }
    const segment = dist(path[0] as readonly [number, number], path[1] as readonly [number, number])
    for (let k = 2; k < path.length; k++) {
      const before = path[k - 1] as readonly [number, number]
      const after = path[k] as readonly [number, number]
      expect(Math.abs(dist(before, after) - segment)).toBeLessThan(0.02)
    }
  })

  it('lets a one-node self-returning chain keep its circle, the worst chord', async () => {
    const graph = graphOf(2, [
      [0, 1],
      [1, 0],
    ])
    const { xy, failed } = await runOf(chains({ exits: ['n0'], spacing: 10 }), graph)
    expect(failed).toBeUndefined()
    const step = 20
    expect(Math.abs(dist(at(xy, 0), at(xy, 1)) - (2 * step) / Math.PI)).toBeLessThan(0.02)
  })

  it('steps a one-child branch one step per node, like a chain', async () => {
    const graph = graphOf(4, [
      [0, 1],
      [1, 2],
      [2, 3],
    ])
    const { xy, failed } = await runOf(chains({ exits: ['n0'], spacing: 10 }), graph)
    expect(failed).toBeUndefined()
    const step = 20
    expect(Math.abs(dist(at(xy, 0), at(xy, 1)) - step)).toBeLessThan(0.05)
    expect(Math.abs(dist(at(xy, 1), at(xy, 2)) - step)).toBeLessThan(0.05)
    expect(Math.abs(dist(at(xy, 2), at(xy, 3)) - step)).toBeLessThan(0.05)
    expect(Math.abs(dist(at(xy, 0), at(xy, 3)) - 3 * step)).toBeLessThan(0.05)
  })

  it('accepts a function of the datum and key as exits', async () => {
    const graph = graphOf(
      4,
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
      {
        datum: (index) => ({ base: index === 0 || index === 3 }),
      },
    )
    const { xy, failed } = await runOf(
      chains({ exits: (datum) => (datum as { base: boolean }).base, spacing: 10 }),
      graph,
    )
    expect(failed).toBeUndefined()
    expect(Math.abs(dist(at(xy, 0), at(xy, 3)) - 1.6 * 20)).toBeLessThan(1.6 * 20 * 0.03)
  })

  it('keeps a file a file, linked exits or not', async () => {
    const pairs: [number, number][] = [
      [0, 3],
      [3, 4],
      [4, 1],
      [1, 5],
      [5, 6],
      [6, 2],
    ]
    const plain = await runOf(chains({ exits: ['n0', 'n1', 'n2'], spacing: 10 }), graphOf(7, pairs))
    const linked = await runOf(
      chains({ exits: ['n0', 'n1', 'n2'], spacing: 10 }),
      graphOf(7, [...pairs, [0, 1], [1, 2]]),
    )
    expect(plain.failed).toBeUndefined()
    expect(linked.failed).toBeUndefined()
    const centroidOf = (xy: Float32Array) => {
      let cx = 0
      let cy = 0
      for (const index of [0, 1, 2]) {
        cx += at(xy, index)[0] ?? 0
        cy += at(xy, index)[1] ?? 0
      }
      return [cx / 3, cy / 3] as const
    }
    const [px, py] = centroidOf(plain.xy)
    const [lx, ly] = centroidOf(linked.xy)
    for (const index of [0, 1, 2]) {
      const a = at(plain.xy, index)
      const b = at(linked.xy, index)
      expect(
        Math.hypot((a[0] ?? 0) - px - ((b[0] ?? 0) - lx), (a[1] ?? 0) - py - ((b[1] ?? 0) - ly)),
      ).toBeLessThan(1)
    }
  })

  it('keeps the arc side of a file when the edges are reversed', async () => {
    const pairs: [number, number][] = [
      [0, 3],
      [3, 4],
      [4, 1],
      [1, 5],
      [5, 6],
      [6, 2],
    ]
    const forward = await runOf(
      chains({ exits: ['n0', 'n1', 'n2'], spacing: 10 }),
      graphOf(7, pairs),
    )
    const reversedEdges = Uint32Array.from(pairs.flat().reverse())
    const backwardGraph = graphOf(7, pairs)
    backwardGraph.edges.set(reversedEdges)
    const backward = await runOf(chains({ exits: ['n0', 'n1', 'n2'], spacing: 10 }), backwardGraph)
    expect(forward.failed).toBeUndefined()
    expect(backward.failed).toBeUndefined()
    const lineY = (xy: Float32Array) => at(xy, 0)[1] ?? 0
    const sideOf = (xy: Float32Array, nodes: number[]) => {
      let sum = 0
      for (const node of nodes) sum += (at(xy, node)[1] ?? 0) - lineY(xy)
      return sum / nodes.length
    }
    expect(sideOf(forward.xy, [3, 4])).toBeGreaterThan(0)
    expect(sideOf(backward.xy, [3, 4])).toBeGreaterThan(0)
    expect(sideOf(forward.xy, [5, 6])).toBeGreaterThan(0)
    expect(sideOf(backward.xy, [5, 6])).toBeGreaterThan(0)
  })

  it('packs a component without exits as its own unit', async () => {
    const pairs: [number, number][] = [
      [0, 2],
      [2, 3],
      [3, 1],
      [10, 11],
      [11, 12],
      [12, 10],
    ]
    const { xy, failed } = await runOf(
      chains({ exits: ['n0', 'n1'], spacing: 10 }),
      graphOf(13, pairs),
    )
    expect(failed).toBeUndefined()
    const boxOf = (nodes: number[]) => {
      let left = Number.POSITIVE_INFINITY
      let right = Number.NEGATIVE_INFINITY
      let top = Number.POSITIVE_INFINITY
      let bottom = Number.NEGATIVE_INFINITY
      for (const node of nodes) {
        left = Math.min(left, at(xy, node)[0] ?? 0)
        right = Math.max(right, at(xy, node)[0] ?? 0)
        top = Math.min(top, at(xy, node)[1] ?? 0)
        bottom = Math.max(bottom, at(xy, node)[1] ?? 0)
      }
      return { left, right, top, bottom }
    }
    const main = boxOf([0, 1, 2, 3])
    const lonely = boxOf([10, 11, 12])
    const overlap =
      main.left <= lonely.right &&
      lonely.left <= main.right &&
      main.top <= lonely.bottom &&
      lonely.top <= main.bottom
    expect(overlap).toBe(false)
  })

  describe('core', () => {
    const pairs: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 0],
      [2, 4],
      [4, 3],
    ]

    function fakeCore(place: (graph: LayoutGraph) => Float32Array | 'fail'): {
      layout: Layout
      seen: LayoutGraph[]
      runs: LayoutRun[]
    } {
      const seen: LayoutGraph[] = []
      const runs: LayoutRun[] = []
      const layout: Layout = {
        name: 'core',
        options: {},
        start(graph, listener) {
          seen.push(graph)
          const run: LayoutRun = {
            pin() {},
            stop() {
              stopped = true
            },
          }
          let stopped = false
          runs.push(run)
          queueMicrotask(() => {
            if (stopped) return
            const placed = place(graph)
            if (placed === 'fail') listener.fail?.(new Error('boom'))
            else listener.end(placed)
          })
          return run
        },
      }
      return { layout, seen, runs }
    }

    it('runs the core on the heart exits alone, then places around', async () => {
      const core = fakeCore((graph) => {
        const xy = Float32Array.from(graph.xy)
        xy[0] = 0
        xy[1] = 0
        xy[2] = 40
        xy[3] = 0
        xy[4] = 80
        xy[5] = 0
        xy[6] = 40
        xy[7] = -40
        return xy
      })
      const graph = graphOf(5, pairs)
      const { xy, failed } = await runOf(
        chains({ exits: ['n0', 'n1', 'n2', 'n3'], spacing: 10, core: core.layout }),
        graph,
      )
      expect(failed).toBeUndefined()
      expect(core.seen.length).toBe(1)
      const seen = core.seen[0] as LayoutGraph
      const aliveKeys = seen.keys.filter((_, index) => seen.alive[index] === 1)
      expect(aliveKeys).toEqual(['n0', 'n1', 'n2', 'n3'])
      expect(dist(at(xy, 0), at(xy, 1))).toBeCloseTo(40, 3)
      expect(dist(at(xy, 1), at(xy, 2))).toBeCloseTo(40, 3)
      expect(dist(at(xy, 0), at(xy, 2))).toBeCloseTo(80, 3)
      expect(Number.isFinite(xy[6])).toBe(true)
      expect(Number.isFinite(xy[7])).toBe(true)
      expect(Number.isFinite(xy[8])).toBe(true)
    })

    it('stops the core run when the chains run stops', async () => {
      const core = fakeCore(() => {
        throw new Error('never')
      })
      const graph = graphOf(5, pairs)
      const layout = chains({ exits: ['n0', 'n1', 'n2', 'n3'], spacing: 10, core: core.layout })
      const events: string[] = []
      const run = layout.start(graph, {
        progress: () => {},
        end: () => events.push('end'),
        fail: () => events.push('fail'),
      } satisfies LayoutListener)
      run.stop()
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(core.seen.length).toBe(0)
      expect(events).toEqual([])
    })

    it('passes a core failure to the listener', async () => {
      const core = fakeCore(() => 'fail')
      const graph = graphOf(5, pairs)
      const { failed } = await runOf(
        chains({ exits: ['n0', 'n1', 'n2', 'n3'], spacing: 10, core: core.layout }),
        graph,
      )
      expect(failed).toBeInstanceOf(Error)
      expect((failed as Error).message).toBe('boom')
    })
  })

  describe('types', () => {
    it('refuses bad options', () => {
      const options: ChainsOptions = {
        // @ts-expect-error
        exits: 'n0',
      }
      void options
      // @ts-expect-error
      chains({})
    })
  })

  describe('fuzz', () => {
    it('never throws, keeps positions finite, fixed nodes still and nodes apart', async () => {
      let seed = 42
      const random = () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      let violations = 0
      for (let round = 0; round < 200; round++) {
        const count = 20 + Math.floor(random() * 40)
        const pairs: [number, number][] = []
        const edgeCount = count + Math.floor(random() * count)
        for (let edge = 0; edge < edgeCount; edge++) {
          const a = Math.floor(random() * count)
          const b = Math.floor(random() * count)
          if (a !== b) pairs.push([a, b])
        }
        const exitCount = 2 + Math.floor(random() * 5)
        const exitSet = new Set<number>()
        while (exitSet.size < exitCount) exitSet.add(Math.floor(random() * count))
        const fixedCount = Math.floor(random() * 4)
        const fixed = new Set<number>()
        while (fixed.size < fixedCount) fixed.add(Math.floor(random() * count))
        const xy = new Float32Array(count * 2)
        for (const index of fixed) {
          xy[index * 2] = 10000 + index * 100
          xy[index * 2 + 1] = 5000 + index * 100
        }
        const graph = graphOf(count, pairs, {
          fixed: [...fixed],
          xy,
          datum: (index) => ({ base: exitSet.has(index) }),
        })
        const options: ChainsOptions<{ base: boolean }> =
          round % 2 === 0
            ? { exits: (datum) => datum.base }
            : { exits: [...exitSet].map((index) => `n${index}`).concat(['missing']) }
        try {
          const { xy: out, failed } = await runOf(chains(options), graph)
          if (failed !== undefined) {
            violations++
            continue
          }
          for (let index = 0; index < count; index++) {
            if (!Number.isFinite(out[index * 2]) || !Number.isFinite(out[index * 2 + 1])) {
              violations++
            }
            if (fixed.has(index)) {
              if (out[index * 2] !== xy[index * 2] || out[index * 2 + 1] !== xy[index * 2 + 1]) {
                violations++
              }
            }
          }
          const fuzzStep = 34
          const finalGap = Math.min(fuzzStep - 10, Math.max(0, 0.6 * fuzzStep - 2 * 5))
          for (let a = 0; a < count; a++) {
            for (let b = a + 1; b < count; b++) {
              if (fixed.has(a) && fixed.has(b)) continue
              if (dist(at(out, a), at(out, b)) < 5 + 5 + finalGap - 0.05) violations++
            }
          }
        } catch {
          violations++
        }
      }
      expect(violations).toBe(0)
    })
  })
})
