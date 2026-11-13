import { type FillAnswer, type Filled, type FillInput, type FillJob, fillShape } from './fill'
import FillWorker from './fill-worker?worker&inline'

const sliceBudget = 8

type Done = (id: number, filled: readonly Filled[]) => void

function spawn(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new FillWorker({ name: 'graph-shapes' })
  } catch {
    return null
  }
}

export class FillPool {
  readonly #done: Done
  readonly #jobs = new Map<number, FillJob>()
  readonly #queue: FillJob[] = []
  #workers: Worker[] = []
  #next = 0
  #inline = false
  #timer: ReturnType<typeof setTimeout> | undefined
  #partial: Filled[] = []
  #destroyed = false

  constructor(done: Done) {
    this.#done = done
  }

  send(id: number, shapes: readonly FillInput[]): void {
    const job: FillJob = { id, shapes }
    this.#jobs.set(id, job)
    const worker = this.#inline ? null : this.#worker()
    if (worker) worker.postMessage(job)
    else this.#enqueue(job)
  }

  destroy(): void {
    this.#destroyed = true
    for (const worker of this.#workers) worker.terminate()
    this.#workers = []
    clearTimeout(this.#timer)
    this.#jobs.clear()
    this.#queue.length = 0
  }

  #worker(): Worker | null {
    const limit = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1))
    if (this.#workers.length < limit) {
      const worker = spawn()
      if (worker) {
        worker.onmessage = (event: MessageEvent<FillAnswer>) => this.#answer(event.data)
        worker.onerror = (event) => {
          event.preventDefault()
          this.#fallBack()
        }
        this.#workers.push(worker)
      } else if (this.#workers.length === 0) {
        this.#inline = true
        return null
      }
    }
    return this.#workers[this.#next++ % this.#workers.length] ?? null
  }

  #answer(answer: FillAnswer): void {
    if (this.#destroyed || !this.#jobs.delete(answer.id)) return
    this.#done(answer.id, answer.filled)
  }

  #fallBack(): void {
    for (const worker of this.#workers) worker.terminate()
    this.#workers = []
    this.#inline = true
    const waiting = [...this.#jobs.values()].filter((job) => !this.#queue.includes(job))
    for (const job of waiting) this.#enqueue(job)
  }

  #enqueue(job: FillJob): void {
    this.#queue.push(job)
    this.#timer ??= setTimeout(this.#step, 0)
  }

  readonly #step = (): void => {
    this.#timer = undefined
    if (this.#destroyed) return
    const until = performance.now() + sliceBudget
    while (this.#queue.length > 0 && performance.now() < until) {
      const job = this.#queue[0] as FillJob
      const shape = job.shapes[this.#partial.length]
      if (shape) this.#partial.push(fillShape(shape))
      if (this.#partial.length >= job.shapes.length) {
        this.#queue.shift()
        const filled = this.#partial
        this.#partial = []
        this.#answer({ id: job.id, filled })
      }
    }
    if (this.#queue.length > 0) this.#timer = setTimeout(this.#step, 0)
  }
}
