import type { LayoutRun } from '../../types'
import type { FromWorker, ToWorker } from './protocol'
import { runForce } from './runner'

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
  run = runForce(
    message.graph,
    message.settings,
    {
      progress: (xy, progress) =>
        scope.postMessage({ type: 'progress', xy, progress }, [xy.buffer]),
      end: (xy) => scope.postMessage({ type: 'end', xy }, [xy.buffer]),
    },
    16,
    (task) => {
      queued = task
      channel.port2.postMessage(null)
    },
  )
}
