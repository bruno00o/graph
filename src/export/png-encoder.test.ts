import { describe, expect, it } from 'vitest'
import { composite } from './png'
import { PngWriter } from './png-encoder'

interface Chunk {
  readonly type: string
  readonly data: Uint8Array
}

function chunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const found: Chunk[] = []
  let at = 8
  while (at < bytes.length) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const data = bytes.subarray(at + 8, at + 8 + length)
    if (type === 'IEND') expect(view.getUint32(at + 8 + length)).toBe(0xae426082)
    found.push({ type, data })
    at += length + 12
  }
  return found
}

function unfilter(raw: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4
  const pixels = new Uint8Array(stride * height)
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)]
    for (let at = 0; at < stride; at++) {
      const value = raw[row * (stride + 1) + 1 + at] ?? 0
      const left = at >= 4 ? (pixels[row * stride + at - 4] ?? 0) : 0
      const up = row > 0 ? (pixels[(row - 1) * stride + at] ?? 0) : 0
      pixels[row * stride + at] = value + (filter === 1 ? left : filter === 2 ? up : 0)
    }
  }
  return pixels
}

describe('PngWriter', () => {
  it('writes a valid PNG in strips that decodes to the same pixels', async () => {
    const width = 5
    const height = 4
    const pixels = new Uint8Array(width * height * 4)
    for (let at = 0; at < pixels.length; at++) pixels[at] = (at * 37) % 256
    const writer = new PngWriter(width, height, 2)
    await writer.write(pixels.subarray(0, width * 3 * 4), 3)
    await writer.write(pixels.subarray(width * 3 * 4), 1)
    const blob = await writer.finish()
    expect(blob.type).toBe('image/png')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const parts = chunks(bytes)
    expect(parts.map((part) => part.type).filter((type) => type !== 'IDAT')).toEqual([
      'IHDR',
      'pHYs',
      'IEND',
    ])
    const header = new DataView(
      parts[0]?.data.buffer ?? new ArrayBuffer(13),
      parts[0]?.data.byteOffset,
    )
    expect([
      header.getUint32(0),
      header.getUint32(4),
      header.getUint8(8),
      header.getUint8(9),
    ]).toEqual([5, 4, 8, 6])
    const density = parts[1]?.data ?? new Uint8Array(9)
    expect(new DataView(density.buffer, density.byteOffset).getUint32(0)).toBe(7559)
    const idat = parts.filter((part) => part.type === 'IDAT').map((part) => part.data)
    const joined = new Uint8Array(idat.reduce((total, part) => total + part.length, 0))
    let offset = 0
    for (const part of idat) {
      joined.set(part, offset)
      offset += part.length
    }
    const inflated = new Uint8Array(
      await new Response(
        new Blob([joined]).stream().pipeThrough(new DecompressionStream('deflate')),
      ).arrayBuffer(),
    )
    expect(Array.from(unfilter(inflated, width, height))).toEqual(Array.from(pixels))
  })

  it('refuses to finish an image with missing rows', async () => {
    const writer = new PngWriter(2, 2, 1)
    await writer.write(new Uint8Array(8), 1)
    await expect(writer.finish()).rejects.toThrow('1 rows out of 2')
  })
})

describe('composite', () => {
  it('lays premultiplied pixels over an opaque background', () => {
    const pixels = new Uint8Array([0, 0, 0, 0, 128, 0, 0, 128, 10, 20, 30, 255])
    composite(pixels, pixels.length, [255, 255, 255, 255])
    expect(Array.from(pixels)).toEqual([255, 255, 255, 255, 255, 127, 127, 255, 10, 20, 30, 255])
  })

  it('turns premultiplied pixels into straight alpha without a background', () => {
    const pixels = new Uint8Array([0, 0, 0, 0, 64, 32, 0, 128])
    composite(pixels, pixels.length, [0, 0, 0, 0])
    expect(Array.from(pixels)).toEqual([0, 0, 0, 0, 128, 64, 0, 128])
  })
})
