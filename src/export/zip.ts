export interface ZipEntry {
  readonly name: string
  readonly data: Uint8Array
}

const table = new Uint32Array(256)
for (let index = 0; index < 256; index++) {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  table[index] = value >>> 0
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < data.length; index++) {
    crc = (table[(crc ^ (data[index] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const stream = new Blob([data as Uint8Array<ArrayBuffer>])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

interface Packed {
  readonly name: Uint8Array
  readonly crc: number
  readonly method: number
  readonly body: Uint8Array
  readonly size: number
  readonly offset: number
}

const dosDate = (1 << 5) | 1

export async function zip(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const packed: Packed[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const squeezed = await deflate(entry.data)
    const deflated = squeezed !== null && squeezed.length < entry.data.length
    const body = deflated ? squeezed : entry.data
    packed.push({
      name,
      crc: crc32(entry.data),
      method: deflated ? 8 : 0,
      body,
      size: entry.data.length,
      offset,
    })
    offset += 30 + name.length + body.length
  }
  const directory = packed.reduce((sum, item) => sum + 46 + item.name.length, 0)
  const output = new Uint8Array(offset + directory + 22)
  const view = new DataView(output.buffer)
  let at = 0
  const header = (item: Packed, central: boolean) => {
    view.setUint32(at, central ? 0x02014b50 : 0x04034b50, true)
    at += 4
    if (central) {
      view.setUint16(at, 20, true)
      at += 2
    }
    view.setUint16(at, 20, true)
    view.setUint16(at + 2, 0, true)
    view.setUint16(at + 4, item.method, true)
    view.setUint16(at + 6, 0, true)
    view.setUint16(at + 8, dosDate, true)
    view.setUint32(at + 10, item.crc, true)
    view.setUint32(at + 14, item.body.length, true)
    view.setUint32(at + 18, item.size, true)
    view.setUint16(at + 22, item.name.length, true)
    view.setUint16(at + 24, 0, true)
    at += 26
    if (central) {
      view.setUint16(at, 0, true)
      view.setUint16(at + 2, 0, true)
      view.setUint16(at + 4, 0, true)
      view.setUint32(at + 6, 0, true)
      view.setUint32(at + 10, item.offset, true)
      at += 14
    }
    output.set(item.name, at)
    at += item.name.length
  }
  for (const item of packed) {
    header(item, false)
    output.set(item.body, at)
    at += item.body.length
  }
  const start = at
  for (const item of packed) header(item, true)
  view.setUint32(at, 0x06054b50, true)
  view.setUint16(at + 4, 0, true)
  view.setUint16(at + 6, 0, true)
  view.setUint16(at + 8, packed.length, true)
  view.setUint16(at + 10, packed.length, true)
  view.setUint32(at + 12, at - start, true)
  view.setUint32(at + 16, start, true)
  view.setUint16(at + 20, 0, true)
  return output
}
