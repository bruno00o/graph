import { MinimapPainter } from './painter'
import type { DrawnMessage, ToMinimapWorker } from './protocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToMinimapWorker>) => void) | null
  postMessage(message: DrawnMessage): void
}

const scope = globalThis as unknown as WorkerScope
let painter: MinimapPainter | null = null

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'canvas') {
    painter = new MinimapPainter(message.canvas, message.canvas.getContext('2d'))
    return
  }
  if (!painter) return
  scope.postMessage({ type: 'drawn', fit: painter.draw(message) })
}
