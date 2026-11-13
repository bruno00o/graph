import { type FillAnswer, type FillJob, fillShape, transfers } from './fill'

interface WorkerScope {
  onmessage: ((event: MessageEvent<FillJob>) => void) | null
  postMessage(message: FillAnswer, transfer: Transferable[]): void
}

const scope = globalThis as unknown as WorkerScope

scope.onmessage = (event) => {
  const answer: FillAnswer = { id: event.data.id, filled: event.data.shapes.map(fillShape) }
  scope.postMessage(answer, transfers(answer))
}
