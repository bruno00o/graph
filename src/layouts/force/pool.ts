import type { LayoutListener, LayoutRun } from '../../types'
import { type Slice, sliced } from '../scope-runs'
import { costOf, type PackedResults, packBatch, unpackResults } from './batch'
import type { FromWorker, ToWorker } from './protocol'
import { ForceJob } from './runner'
import type { ForceGraph, ForceSettings } from './simulation'

export type Spawn = () => Worker | null

interface Job {
  readonly id: number
  readonly graph: ForceGraph
  readonly settings: ForceSettings
  readonly listener: LayoutListener
  readonly cost: number
  readonly pins: Map<number, readonly [number, number]>
  holder: Holder | null
  slice: Slice | null
  inline: ForceJob | null
  over: boolean
}

interface Holder {
  readonly worker: Worker
  readonly jobs: Map<number, Job>
  load: number
  cancelled: number[]
}

const chunkCost = 250_000
const idleDelay = 10_000

export class ForcePool {
  readonly #spawn: Spawn
  readonly #limit: number
  readonly #queue: Job[] = []
  readonly #holders: Holder[] = []
  #next = 1
  #broken = false
  #flushing = false
  #idle: ReturnType<typeof setTimeout> | undefined

  constructor(spawn: Spawn, limit: number) {
    this.#spawn = spawn
    this.#limit = Math.max(1, limit)
  }

  get workers(): number {
    return this.#holders.length
  }

  run(graph: ForceGraph, settings: ForceSettings, listener: LayoutListener): LayoutRun {
    const job: Job = {
      id: this.#next++,
      graph,
      settings,
      listener,
      cost: costOf(graph, settings),
      pins: new Map(),
      holder: null,
      slice: null,
      inline: null,
      over: false,
    }
    clearTimeout(this.#idle)
    this.#idle = undefined
    this.#queue.push(job)
    this.#later()
    return {
      pin: (index, x, y) => this.#pin(job, index, x, y),
      stop: () => this.#stop(job),
    }
  }

  destroy(): void {
    for (const holder of this.#holders) holder.worker.terminate()
    this.#holders.length = 0
    clearTimeout(this.#idle)
    this.#idle = undefined
  }

  #pin(job: Job, index: number, x: number, y: number): void {
    if (job.over) return
    job.pins.set(index, [x, y])
    if (job.inline) job.inline.pin(index, x, y)
    else if (job.holder) this.#post(job.holder, { type: 'pinJob', id: job.id, index, x, y })
  }

  #stop(job: Job): void {
    if (job.over) return
    job.over = true
    job.slice?.stop()
    const holder = job.holder
    if (holder) {
      holder.jobs.delete(job.id)
      holder.load -= job.cost
      holder.cancelled.push(job.id)
      if (holder.cancelled.length === 1) {
        queueMicrotask(() => {
          if (holder.cancelled.length === 0) return
          this.#post(holder, { type: 'cancel', ids: holder.cancelled })
          holder.cancelled = []
        })
      }
    }
    this.#later()
  }

  #later(): void {
    if (this.#flushing) return
    this.#flushing = true
    queueMicrotask(() => {
      this.#flushing = false
      this.#flush()
    })
  }

  #flush(): void {
    this.#drop()
    if (this.#queue.length > 0) this.#grow()
    if (this.#holders.length === 0) {
      for (const job of this.#queue.splice(0)) this.#inline(job)
    } else {
      for (const holder of [...this.#holders].sort((a, b) => a.load - b.load)) {
        if (this.#queue.length === 0) break
        if (holder.load < chunkCost) this.#send(holder)
      }
    }
    this.#rest()
  }

  #drop(): void {
    let kept = 0
    for (const job of this.#queue) if (!job.over) this.#queue[kept++] = job
    this.#queue.length = kept
  }

  #grow(): void {
    if (this.#broken) return
    let waiting = 0
    for (const job of this.#queue) waiting += job.cost
    let capacity = 0
    for (const holder of this.#holders) capacity += Math.max(0, chunkCost * 2 - holder.load)
    while (this.#holders.length < this.#limit && capacity < waiting) {
      const worker = this.#spawn()
      if (!worker) {
        this.#broken = true
        return
      }
      const holder: Holder = { worker, jobs: new Map(), load: 0, cancelled: [] }
      worker.onmessage = (event: MessageEvent<FromWorker>) => {
        if (event.data.type === 'done') this.#answer(holder, event.data)
      }
      worker.onerror = (event) => {
        event.preventDefault()
        this.#lose(holder)
      }
      this.#holders.push(holder)
      capacity += chunkCost * 2
    }
  }

  #send(holder: Holder): void {
    const chosen: Job[] = []
    let cost = 0
    while (this.#queue.length > 0 && (chosen.length === 0 || cost < chunkCost)) {
      const job = this.#queue.shift() as Job
      chosen.push(job)
      cost += job.cost
    }
    for (const job of chosen) {
      job.holder = holder
      holder.jobs.set(job.id, job)
    }
    holder.load += cost
    const batch = packBatch(chosen)
    this.#post(holder, batch, [batch.header.buffer, batch.data])
    for (const job of chosen) {
      for (const [index, [x, y]] of job.pins) {
        this.#post(holder, { type: 'pinJob', id: job.id, index, x, y })
      }
    }
  }

  #post(holder: Holder, message: ToWorker, transfer: Transferable[] = []): void {
    try {
      holder.worker.postMessage(message, transfer)
    } catch {
      this.#lose(holder)
    }
  }

  #answer(holder: Holder, results: PackedResults): void {
    const ended: [Job, Float32Array][] = []
    unpackResults(results, (id, xy) => {
      const job = holder.jobs.get(id)
      if (!job) return
      holder.jobs.delete(id)
      holder.load -= job.cost
      if (!job.over) ended.push([job, xy])
    })
    for (const [job, xy] of ended) {
      job.over = true
      job.holder = null
      job.listener.end(xy)
    }
    this.#flush()
  }

  #lose(holder: Holder): void {
    const at = this.#holders.indexOf(holder)
    if (at < 0) return
    this.#holders.splice(at, 1)
    holder.worker.terminate()
    this.#broken = true
    const pending = [...holder.jobs.values()].filter((job) => !job.over)
    holder.jobs.clear()
    for (const job of pending) job.holder = null
    this.#queue.unshift(...pending)
    this.#later()
  }

  #inline(job: Job): void {
    if (job.over) return
    const running = new ForceJob(job.graph, job.settings)
    for (const [index, [x, y]] of job.pins) running.pin(index, x, y)
    job.inline = running
    job.slice = sliced({
      step: (until) => {
        if (job.over) return true
        if (!running.advance(until)) return false
        job.over = true
        job.listener.end(running.result())
        return true
      },
    })
  }

  #rest(): void {
    if (this.#queue.length > 0 || this.#holders.some((holder) => holder.jobs.size > 0)) return
    if (this.#holders.length === 0 || this.#idle !== undefined) return
    this.#idle = setTimeout(() => {
      this.#idle = undefined
      if (this.#queue.length > 0 || this.#holders.some((holder) => holder.jobs.size > 0)) return
      this.destroy()
    }, idleDelay)
  }
}
