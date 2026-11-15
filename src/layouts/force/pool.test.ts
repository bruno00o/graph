import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { packBatch, packResults, unpackBatch, unpackResults } from './batch'
import { ForcePool } from './pool'
import type { FromWorker, ToWorker } from './protocol'
import { ForceJob } from './runner'
import { type ForceGraph, type ForceSettings, resolveForce } from './simulation'

const settings: ForceSettings = { ...resolveForce({ steps: 60 }), gravity: 0.5 }

function graphOf(count: number, seed: number, grouped = false): ForceGraph {
  let state = seed
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
  const capacity = count + (grouped ? 1 : 0)
  const alive = new Uint8Array(capacity).fill(1, 0, count)
  const movable = new Uint8Array(capacity).fill(1, 0, count)
  const xy = new Float32Array(capacity * 2)
  const radius = new Float32Array(capacity).fill(5)
  const edges: number[] = []
  for (let index = 0; index < count; index++) {
    xy[index * 2] = next() * 200
    xy[index * 2 + 1] = next() * 200
    if (index > 0) edges.push(index, Math.floor(next() * index))
  }
  const graph: ForceGraph = {
    capacity,
    alive,
    movable,
    xy,
    radius,
    edges: Uint32Array.from(edges),
    mass: new Float32Array(capacity).fill(1),
  }
  if (!grouped) return graph
  const parent = new Int32Array(capacity).fill(-1)
  for (let index = 0; index < count / 2; index++) parent[index] = count
  return {
    ...graph,
    groups: {
      order: Uint32Array.of(count),
      parent,
      padding: new Float32Array(capacity).fill(8),
      circle: new Uint8Array(capacity),
      labelSpace: new Float32Array(capacity * 4).fill(2),
    },
  }
}

function inline(graph: ForceGraph, pins: readonly [number, number, number][] = []): Float32Array {
  const job = new ForceJob(graph, settings)
  for (const [index, x, y] of pins) job.pin(index, x, y)
  while (!job.advance(Number.POSITIVE_INFINITY)) {}
  return job.result()
}

const owners = new Map<number, FakeWorker>()
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

class FakeWorker {
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null
  onerror: ((event: { preventDefault(): void }) => void) | null = null
  readonly received: ToWorker[] = []
  terminated = false
  fail = false
  readonly #handler: (event: { data: ToWorker }) => void

  constructor(handler: (event: { data: ToWorker }) => void) {
    this.#handler = handler
  }

  static async create(): Promise<FakeWorker> {
    vi.resetModules()
    const scope = globalThis as unknown as { onmessage: unknown }
    await import('./worker')
    const handler = scope.onmessage as (event: { data: ToWorker }) => void
    scope.onmessage = null
    return new FakeWorker(handler)
  }

  postMessage(message: ToWorker): void {
    if (this.terminated) return
    this.received.push(message)
    if (message.type === 'batch') {
      for (let at = 0; at < message.header.length; at += 14) {
        owners.set(message.header[at] ?? 0, this)
      }
      if (this.fail) {
        queueMicrotask(() => this.onerror?.({ preventDefault() {} }))
        return
      }
    }
    this.#handler({ data: message })
  }

  terminate(): void {
    this.terminated = true
  }
}

function deliver(message: FromWorker): void {
  if (message.type !== 'done') return
  const owner = owners.get(message.ids[0] ?? 0)
  if (!owner?.terminated) owner?.onmessage?.({ data: message } as MessageEvent<FromWorker>)
}

async function workers(count: number): Promise<FakeWorker[]> {
  const made: FakeWorker[] = []
  for (let k = 0; k < count; k++) made.push(await FakeWorker.create())
  return made
}

function spawner(made: FakeWorker[]) {
  let next = 0
  return () => (made[next++] as unknown as Worker | undefined) ?? null
}

function submit(pool: ForcePool, graphs: readonly ForceGraph[]) {
  const ended = new Map<number, Float32Array>()
  const runs = graphs.map((graph, at) =>
    pool.run(graph, settings, {
      progress() {},
      end: (xy) => ended.set(at, Float32Array.from(xy)),
    }),
  )
  return { ended, runs }
}

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 2000 && !check(); attempt++) await settled()
}

function bytes(xy: Float32Array): Uint8Array {
  return new Uint8Array(xy.buffer, xy.byteOffset, xy.byteLength)
}

beforeEach(() => {
  owners.clear()
  vi.stubGlobal('postMessage', deliver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('packBatch', () => {
  it('carries every array of the jobs and their results unchanged', () => {
    const graphs = [graphOf(12, 1, true), graphOf(7, 2), graphOf(30, 3, true)]
    const { mass: _, ...plain } = graphOf(5, 4)
    graphs.push(plain)
    const packed = packBatch(graphs.map((graph, id) => ({ id: id + 10, graph, settings })))
    expect(packed.settings).toHaveLength(1)
    const jobs = unpackBatch(packed)
    expect(jobs.map((job) => job.id)).toEqual([10, 11, 12, 13])
    jobs.forEach((job, at) => {
      expect(job.graph).toEqual(graphs[at])
      expect(job.settings).toEqual(settings)
    })
    const results = packResults([
      [4, Float32Array.of(1, 2, 3, 4)],
      [9, Float32Array.of(5, 6)],
    ])
    const seen: [number, number[]][] = []
    unpackResults(results, (id, xy) => seen.push([id, [...xy]]))
    expect(seen).toEqual([
      [4, [1, 2, 3, 4]],
      [9, [5, 6]],
    ])
  })
})

describe('ForcePool', () => {
  it('spreads many jobs over its workers and ends each as the main thread would', async () => {
    const made = await workers(4)
    const pool = new ForcePool(spawner(made), 3)
    const graphs = Array.from({ length: 60 }, (_, at) => graphOf(100 + (at % 7) * 40, at + 1, at % 3 === 0))
    const { ended } = submit(pool, graphs)
    await until(() => ended.size === graphs.length)
    expect(ended.size).toBe(graphs.length)
    expect(pool.workers).toBeGreaterThan(1)
    expect(pool.workers).toBeLessThanOrEqual(3)
    expect(made[3]?.received).toHaveLength(0)
    const batches = made.flatMap((worker) => worker.received.filter((m) => m.type === 'batch'))
    expect(batches.length).toBeLessThan(graphs.length)
    graphs.forEach((graph, at) => {
      expect(bytes(ended.get(at) as Float32Array)).toEqual(bytes(inline(graph)))
    })
    pool.destroy()
    expect(made.slice(0, 3).every((worker) => worker.terminated)).toBe(true)
  })

  it('runs the jobs of a lost worker on another one', async () => {
    const made = await workers(2)
    const lost = made[0] as FakeWorker
    lost.fail = true
    const pool = new ForcePool(spawner(made), 2)
    const graphs = Array.from({ length: 20 }, (_, at) => graphOf(400, at + 7))
    const { ended } = submit(pool, graphs)
    await until(() => ended.size === graphs.length)
    expect(lost.terminated).toBe(true)
    expect(pool.workers).toBe(1)
    graphs.forEach((graph, at) => {
      expect(bytes(ended.get(at) as Float32Array)).toEqual(bytes(inline(graph)))
    })
    pool.destroy()
  })

  it('falls back to the main thread when every worker is lost or none starts', async () => {
    const made = await workers(1)
    ;(made[0] as FakeWorker).fail = true
    const failing = new ForcePool(spawner(made), 2)
    const none = new ForcePool(() => null, 4)
    const graphs = Array.from({ length: 6 }, (_, at) => graphOf(15, at + 30))
    const first = submit(failing, graphs)
    const second = submit(none, graphs)
    await until(() => first.ended.size === graphs.length && second.ended.size === graphs.length)
    expect(failing.workers).toBe(0)
    expect(none.workers).toBe(0)
    graphs.forEach((graph, at) => {
      const expected = bytes(inline(graph))
      expect(bytes(first.ended.get(at) as Float32Array)).toEqual(expected)
      expect(bytes(second.ended.get(at) as Float32Array)).toEqual(expected)
    })
  })

  it('cancels a job stopped in the middle of its batch and keeps the others', async () => {
    const made = await workers(1)
    const pool = new ForcePool(spawner(made), 1)
    const graphs = Array.from({ length: 8 }, (_, at) => graphOf(300, at + 50))
    const ended = new Map<number, Float32Array>()
    const runs = graphs.map((graph, at) =>
      pool.run(graph, settings, {
        progress() {},
        end: (xy) => {
          ended.set(at, xy)
          if (at !== 0) return
          runs[5]?.stop()
          runs[6]?.stop()
        },
      }),
    )
    await until(() => ended.size === graphs.length - 2)
    await settled()
    expect([...ended.keys()].sort()).toEqual([0, 1, 2, 3, 4, 7])
    const cancels = made[0]?.received.filter((message) => message.type === 'cancel')
    expect(cancels).toEqual([{ type: 'cancel', ids: [6, 7] }])
    expect(made[0]?.received[0]?.type).toBe('batch')
    pool.destroy()
  })

  it('passes pins to the job that holds the node', async () => {
    const made = await workers(1)
    const pool = new ForcePool(spawner(made), 1)
    const graph = graphOf(25, 99)
    const { ended, runs } = submit(pool, [graph])
    runs[0]?.pin(3, 40, -40)
    await until(() => ended.size === 1)
    const xy = ended.get(0) as Float32Array
    expect([xy[6], xy[7]]).toEqual([40, -40])
    expect(bytes(xy)).toEqual(bytes(inline(graph, [[3, 40, -40]])))
    pool.destroy()
  })

  it('stops its workers once it has been idle for a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const made = await workers(1)
      const pool = new ForcePool(spawner(made), 1)
      const { ended } = submit(pool, [graphOf(10, 5)])
      for (let attempt = 0; attempt < 200 && ended.size === 0; attempt++) {
        await vi.advanceTimersByTimeAsync(1)
      }
      expect(ended.size).toBe(1)
      expect(pool.workers).toBe(1)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(pool.workers).toBe(0)
      expect(made[0]?.terminated).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
