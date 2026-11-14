import {
  answerTransfers,
  fillShape,
  type PackedAnswer,
  type PackedJob,
  packAnswer,
  unpackJob,
} from './fill'

interface WorkerScope {
  onmessage: ((event: MessageEvent<PackedJob>) => void) | null
  postMessage(message: PackedAnswer, transfer: Transferable[]): void
}

const scope = globalThis as unknown as WorkerScope

scope.onmessage = (event) => {
  const answer = packAnswer(event.data.id, unpackJob(event.data).map(fillShape))
  scope.postMessage(answer, answerTransfers(answer))
}
