import type { LayoutListener, LayoutRun } from '../../types'
import { type BatchJob, packResults, unpackBatch } from './batch'
import { GpuForce } from './gpu'
import type { FromWorker, ToWorker } from './protocol'
import { type PooledJob, pooledJob, runForce, runGpuForce, runMultilevelForce } from './runner'
import {
  type ForceGraph,
  type ForceSettings,
  type LevelRun,
  prefersGpu,
  prefersMultilevel,
} from './simulation'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer: Transferable[]): void
}

interface Queued {
  readonly job: BatchJob
  running: PooledJob | null
}

const scope = globalThis as unknown as WorkerScope
const channel = new MessageChannel()
const tasks: (() => void)[] = []
channel.port1.onmessage = () => {
  tasks.shift()?.()
}
const schedule = (task: () => void) => {
  tasks.push(task)
  channel.port2.postMessage(null)
}
const sliceBudget = 16
let run: LayoutRun | null = null
const jobs: Queued[] = []
const byId = new Map<number, Queued>()
const pins = new Map<number, [number, number, number][]>()
let working = false

function work(): void {
  const until = performance.now() + sliceBudget
  const finished: [number, Float32Array][] = []
  while (jobs.length > 0) {
    const queued = jobs[0] as Queued
    if (!queued.running) {
      queued.running = pooledJob(queued.job.graph, queued.job.settings)
      for (const [index, x, y] of pins.get(queued.job.id) ?? []) queued.running.pin(index, x, y)
      pins.delete(queued.job.id)
    }
    if (!queued.running.advance(until)) break
    jobs.shift()
    byId.delete(queued.job.id)
    finished.push([queued.job.id, queued.running.result()])
    if (performance.now() >= until) break
  }
  if (finished.length > 0) {
    const results = packResults(finished)
    scope.postMessage(results, [results.ids.buffer, results.data.buffer])
  }
  if (jobs.length > 0) schedule(work)
  else working = false
}

function wake(): void {
  if (working || jobs.length === 0) return
  working = true
  schedule(work)
}

function startRun(graph: ForceGraph, settings: ForceSettings): void {
  run?.stop()
  const listener: LayoutListener = {
    progress: (xy, progress) => scope.postMessage({ type: 'progress', xy, progress }, [xy.buffer]),
    end: (xy) => scope.postMessage({ type: 'end', xy }, [xy.buffer]),
  }
  const useGpu = prefersGpu(graph, settings)
  if (prefersMultilevel(graph, settings)) {
    const engine = useGpu
      ? (level: ForceGraph, plan: LevelRun) => GpuForce.create(level, settings, plan)
      : null
    run = runMultilevelForce(graph, settings, listener, 16, schedule, engine)
    return
  }
  const cpu = (xy: Float32Array) => runForce({ ...graph, xy }, settings, listener, 16, schedule)
  const gpu = useGpu ? GpuForce.create(graph, settings) : null
  run = gpu ? runGpuForce(gpu, graph, settings, listener, cpu) : cpu(graph.xy)
}

function pinJob(id: number, index: number, x: number, y: number): void {
  const queued = byId.get(id)
  if (!queued) return
  if (queued.running) {
    queued.running.pin(index, x, y)
    return
  }
  const list = pins.get(id) ?? []
  list.push([index, x, y])
  pins.set(id, list)
}

function cancel(ids: readonly number[]): void {
  for (const id of ids) {
    const queued = byId.get(id)
    if (!queued) continue
    byId.delete(id)
    pins.delete(id)
    const at = jobs.indexOf(queued)
    if (at >= 0) jobs.splice(at, 1)
  }
}

scope.onmessage = (event) => {
  const message = event.data
  switch (message.type) {
    case 'pin':
      run?.pin(message.index, message.x, message.y)
      return
    case 'start':
      startRun(message.graph, message.settings)
      return
    case 'batch':
      for (const job of unpackBatch(message)) {
        const queued: Queued = { job, running: null }
        jobs.push(queued)
        byId.set(job.id, queued)
      }
      wake()
      return
    case 'pinJob':
      pinJob(message.id, message.index, message.x, message.y)
      return
    case 'cancel':
      cancel(message.ids)
      return
  }
}
