import { MinimapPainter } from './painter'
import type { DrawnMessage, ToMinimapWorker } from './protocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToMinimapWorker>) => void) | null
  postMessage(message: DrawnMessage, transfer: Transferable[]): void
}

const scope = globalThis as unknown as WorkerScope
let canvas: OffscreenCanvas | null = null
let painter: MinimapPainter | null = null

function surface(): { canvas: OffscreenCanvas; painter: MinimapPainter } {
  if (canvas && painter) return { canvas, painter }
  const next = new OffscreenCanvas(1, 1)
  const context = next.getContext('2d')
  if (!context) throw new Error('graph: the minimap worker has no 2D canvas')
  canvas = next
  painter = new MinimapPainter(next, context)
  return { canvas: next, painter }
}

scope.onmessage = (event) => {
  const target = surface()
  const fit = target.painter.draw(event.data)
  const frame = target.canvas.transferToImageBitmap()
  scope.postMessage({ type: 'drawn', fit, frame }, [frame])
}
