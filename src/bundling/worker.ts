import { DensityBundler } from './density'
import type { FromWorker, ToWorker } from './protocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer: Transferable[]): void
}

const scope = globalThis as unknown as WorkerScope

scope.onmessage = (event) => {
  const { xy, ends, settings } = event.data
  const paths = new DensityBundler(xy, ends, settings).run()
  scope.postMessage(paths, [paths.offsets.buffer, paths.points.buffer])
}
