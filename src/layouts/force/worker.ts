import type { LayoutListener, LayoutRun } from '../../types'
import { GpuForce } from './gpu'
import type { FromWorker, ToWorker } from './protocol'
import { runForce, runGpuForce } from './runner'
import { prefersGpu } from './simulation'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer: Transferable[]): void
}

const scope = globalThis as unknown as WorkerScope
const channel = new MessageChannel()
let queued: (() => void) | null = null
channel.port1.onmessage = () => {
  const task = queued
  queued = null
  task?.()
}
let run: LayoutRun | null = null

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'pin') {
    run?.pin(message.index, message.x, message.y)
    return
  }
  run?.stop()
  const { graph, settings } = message
  const listener: LayoutListener = {
    progress: (xy, progress) => scope.postMessage({ type: 'progress', xy, progress }, [xy.buffer]),
    end: (xy) => scope.postMessage({ type: 'end', xy }, [xy.buffer]),
  }
  const schedule = (task: () => void) => {
    queued = task
    channel.port2.postMessage(null)
  }
  const cpu = (xy: Float32Array) => runForce({ ...graph, xy }, settings, listener, 16, schedule)
  const gpu = prefersGpu(graph, settings) ? GpuForce.create(graph, settings) : null
  run = gpu ? runGpuForce(gpu, graph, settings, listener, cpu) : cpu(graph.xy)
}
