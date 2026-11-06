const signature = [137, 80, 78, 71, 13, 10, 26, 10]
const inchesPerMeter = 39.3701
const cssPixelsPerInch = 96

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array, from: number, to: number): number {
  let crc = 0xffffffff
  for (let at = from; at < to; at++) {
    crc = (crcTable[(crc ^ (bytes[at] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(data.length + 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, data.length)
  for (let at = 0; at < 4; at++) bytes[4 + at] = type.charCodeAt(at)
  bytes.set(data, 8)
  view.setUint32(8 + data.length, crc32(bytes, 4, 8 + data.length))
  return bytes
}

function header(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13)
  const view = new DataView(data.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  data[8] = 8
  data[9] = 6
  return data
}

function density(pixelRatio: number): Uint8Array {
  const data = new Uint8Array(9)
  const view = new DataView(data.buffer)
  const perMeter = Math.round(pixelRatio * cssPixelsPerInch * inchesPerMeter)
  view.setUint32(0, perMeter)
  view.setUint32(4, perMeter)
  data[8] = 1
  return data
}

export class PngWriter {
  readonly #width: number
  readonly #height: number
  readonly #pixelRatio: number
  readonly #stride: number
  readonly #writer: WritableStreamDefaultWriter<Uint8Array<ArrayBuffer>>
  readonly #output: Promise<Uint8Array[]>
  #previous: Uint8Array
  #written = 0

  constructor(width: number, height: number, pixelRatio: number) {
    this.#width = width
    this.#height = height
    this.#pixelRatio = pixelRatio
    this.#stride = width * 4
    this.#previous = new Uint8Array(this.#stride)
    const stream = new CompressionStream('deflate')
    this.#writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()
    this.#output = (async () => {
      const parts: Uint8Array[] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return parts
        parts.push(value)
      }
    })()
  }

  async write(pixels: Uint8Array, rows: number): Promise<void> {
    const stride = this.#stride
    const line = stride + 1
    const filtered = new Uint8Array(rows * line)
    let previous = this.#previous
    for (let row = 0; row < rows; row++) {
      const current = pixels.subarray(row * stride, (row + 1) * stride)
      const out = filtered.subarray(row * line + 1, (row + 1) * line)
      let up = 0
      let sub = 0
      for (let at = 0; at < stride; at++) {
        const value = current[at] as number
        const above = (value - (previous[at] as number)) & 0xff
        const left = (value - (at < 4 ? 0 : (current[at - 4] as number))) & 0xff
        out[at] = above
        up += above < 128 ? above : 256 - above
        sub += left < 128 ? left : 256 - left
      }
      if (sub < up) {
        filtered[row * line] = 1
        out.set(current.subarray(0, 4))
        for (let at = 4; at < stride; at++)
          out[at] = (current[at] as number) - (current[at - 4] as number)
      } else {
        filtered[row * line] = 2
      }
      previous = current
    }
    this.#previous = previous.slice()
    this.#written += rows
    await this.#writer.ready
    void this.#writer.write(filtered)
  }

  async finish(): Promise<Blob> {
    if (this.#written !== this.#height) {
      throw new Error(`graph: the image has ${this.#written} rows out of ${this.#height}`)
    }
    await this.#writer.close()
    const compressed = await this.#output
    const parts: BlobPart[] = [
      new Uint8Array(signature),
      chunk('IHDR', header(this.#width, this.#height)),
      chunk('pHYs', density(this.#pixelRatio)),
    ]
    for (const part of compressed) parts.push(chunk('IDAT', part))
    parts.push(chunk('IEND', new Uint8Array(0)))
    return new Blob(parts, { type: 'image/png' })
  }
}
