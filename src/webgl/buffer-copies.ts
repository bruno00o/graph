import type { Attribute } from './gl'

export interface BufferCopy {
  readonly words: Uint32Array
  readonly version: number
}

export class BufferCopies {
  readonly buffers: Map<WebGLBuffer, BufferCopy> = new Map()
  readonly arrays: Map<WebGLVertexArrayObject, readonly Attribute[]> = new Map()

  keep(buffer: WebGLBuffer, data: ArrayBufferView): void {
    const words = new Uint32Array((data.byteLength + 3) >> 2)
    new Uint8Array(words.buffer).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    this.buffers.set(buffer, { words, version: (this.buffers.get(buffer)?.version ?? -1) + 1 })
  }
}
