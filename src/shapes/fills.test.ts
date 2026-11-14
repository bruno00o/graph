import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type Filled,
  type FillInput,
  fillShape,
  type PackedAnswer,
  type PackedJob,
  packAnswer,
  unpackJob,
} from './fill'

class FakeFillWorker {
  static live = 0
  static failing = false
  onmessage: ((event: { data: PackedAnswer }) => void) | null = null
  onerror: ((event: { preventDefault(): void }) => void) | null = null
  terminated = false

  constructor() {
    FakeFillWorker.live++
  }

  postMessage(job: PackedJob): void {
    setTimeout(() => {
      if (this.terminated) return
      if (FakeFillWorker.failing) {
        this.onerror?.({ preventDefault: () => {} })
        return
      }
      this.onmessage?.({ data: packAnswer(job.id, unpackJob(job).map(fillShape)) })
    }, 0)
  }

  terminate(): void {
    if (!this.terminated) FakeFillWorker.live--
    this.terminated = true
  }
}

vi.mock('./fill-worker?worker&inline', () => ({ default: FakeFillWorker }))

const { FillPool } = await import('./fills')

function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function input(seed: number): FillInput {
  const next = random(seed)
  const parts = 1 + Math.floor(next() * 3)
  const points: number[] = []
  const rings: number[] = []
  const polygons: number[] = []
  for (let part = 0; part < parts; part++) {
    polygons.push(rings.length)
    const count = 3 + Math.floor(next() * (seed % 3 === 0 ? 900 : 60))
    for (let k = 0; k < count; k++) {
      const angle = ((k + 0.5 * next()) / count) * Math.PI * 2
      const reach = 100 * (0.5 + 0.5 * next())
      points.push(part * 300 + Math.cos(angle) * reach, Math.sin(angle) * reach)
    }
    rings.push(points.length / 2)
  }
  const polygon = seed % 4 !== 1
  return {
    points: Float64Array.from(points),
    rings: Uint32Array.from(rings),
    polygons: Uint32Array.from(polygons),
    polygon,
    closed: polygon,
  }
}

function run(jobs: readonly (readonly FillInput[])[]): Promise<Map<number, readonly Filled[]>> {
  return new Promise((done) => {
    const results = new Map<number, readonly Filled[]>()
    const pool = new FillPool((id, filled) => {
      results.set(id, filled)
      if (results.size === jobs.length) {
        pool.destroy()
        done(results)
      }
    })
    jobs.forEach((shapes, id) => {
      pool.send(id, shapes)
    })
  })
}

function jobs(): FillInput[][] {
  return Array.from({ length: 6 }, (_, job) =>
    Array.from({ length: 1 + (job % 4) }, (_, at) => input(job * 10 + at + 1)),
  )
}

afterEach(() => {
  FakeFillWorker.failing = false
  vi.unstubAllGlobals()
})

describe('FillPool', () => {
  it('answers every job as the main thread would, in workers', async () => {
    vi.stubGlobal('Worker', FakeFillWorker)
    const work = jobs()
    const results = await run(work)
    work.forEach((shapes, id) => {
      expect(results.get(id)).toEqual(shapes.map(fillShape))
    })
    expect(FakeFillWorker.live).toBe(0)
  })

  it('answers every job on the main thread without workers', async () => {
    vi.stubGlobal('Worker', undefined)
    const work = jobs()
    const results = await run(work)
    work.forEach((shapes, id) => {
      expect(results.get(id)).toEqual(shapes.map(fillShape))
    })
  })

  it('falls back to the main thread when a worker fails', async () => {
    vi.stubGlobal('Worker', FakeFillWorker)
    FakeFillWorker.failing = true
    const work = jobs()
    const results = await run(work)
    work.forEach((shapes, id) => {
      expect(results.get(id)).toEqual(shapes.map(fillShape))
    })
    expect(FakeFillWorker.live).toBe(0)
  })

  it('answers nothing once destroyed', async () => {
    vi.stubGlobal('Worker', FakeFillWorker)
    const answered: number[] = []
    const pool = new FillPool((id) => answered.push(id))
    pool.send(0, [input(1)])
    pool.destroy()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(answered).toEqual([])
    expect(FakeFillWorker.live).toBe(0)
  })

  it('answers nothing once destroyed while filling on the main thread', async () => {
    vi.stubGlobal('Worker', undefined)
    const answered: number[] = []
    const pool = new FillPool((id) => answered.push(id))
    pool.send(0, [input(3), input(6)])
    pool.destroy()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(answered).toEqual([])
  })
})
