import { routeOrthogonal } from './orthogonal'
import type { FromWorker, ToWorker } from './protocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer: Transferable[]): void
}

const scope = globalThis as unknown as WorkerScope

scope.onmessage = (event) => {
  const { xy, extents, parents, ends, settings } = event.data
  const paths = routeOrthogonal({ xy, extents, parents, ends }, settings)
  scope.postMessage(paths, [paths.offsets.buffer, paths.points.buffer])
}
