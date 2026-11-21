import { inflateSync } from 'node:zlib'

const headerSize = 44
const entrySize = 20

export function unwrapWoff(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0) !== 0x774f4646) throw new TypeError('not a WOFF file')
  const count = view.getUint16(12)
  const entries = Array.from({ length: count }, (_, index) => {
    const at = headerSize + index * entrySize
    const offset = view.getUint32(at + 4)
    const packed = view.getUint32(at + 8)
    const length = view.getUint32(at + 12)
    const raw = bytes.subarray(offset, offset + packed)
    return {
      tag: view.getUint32(at),
      checksum: view.getUint32(at + 16),
      data: packed < length ? new Uint8Array(inflateSync(raw)) : raw,
    }
  })
  const directory = 12 + count * 16
  const padded = (size: number): number => (size + 3) & ~3
  const total = entries.reduce((sum, entry) => sum + padded(entry.data.length), directory)
  const out = new Uint8Array(total)
  const target = new DataView(out.buffer)
  let power = 1
  let log = 0
  while (power * 2 <= count) {
    power *= 2
    log++
  }
  target.setUint32(0, view.getUint32(4))
  target.setUint16(4, count)
  target.setUint16(6, power * 16)
  target.setUint16(8, log)
  target.setUint16(10, count * 16 - power * 16)
  let offset = directory
  entries.forEach((entry, index) => {
    const at = 12 + index * 16
    target.setUint32(at, entry.tag)
    target.setUint32(at + 4, entry.checksum)
    target.setUint32(at + 8, offset)
    target.setUint32(at + 12, entry.data.length)
    out.set(entry.data, offset)
    offset += padded(entry.data.length)
  })
  return out
}
