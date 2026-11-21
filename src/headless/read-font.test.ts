import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readFont } from './read-font'
import { sansTextWidth } from './text-estimate'

class Bytes {
  readonly values: number[] = []

  u8(value: number): this {
    this.values.push(value & 0xff)
    return this
  }

  u16(value: number): this {
    return this.u8(value >> 8).u8(value)
  }

  u32(value: number): this {
    return this.u16(value >>> 16).u16(value)
  }

  tag(text: string): this {
    for (const char of text) this.u8(char.charCodeAt(0))
    return this
  }

  utf16(text: string): this {
    for (const char of text) this.u16(char.charCodeAt(0))
    return this
  }

  pad(): this {
    while (this.values.length % 4 !== 0) this.u8(0)
    return this
  }
}

interface Face {
  readonly family: string
  readonly typographic?: string
  readonly unitsPerEm: number
  readonly advances: ReadonlyMap<number, number>
  readonly format: 4 | 12
  readonly metrics?: number
}

function cmapOf(codes: readonly number[], format: 4 | 12): Bytes {
  const table = new Bytes()
    .u16(0)
    .u16(1)
    .u16(3)
    .u16(format === 12 ? 10 : 1)
    .u32(12)
  if (format === 12) {
    table
      .u16(12)
      .u16(0)
      .u32(16 + codes.length * 12)
      .u32(0)
      .u32(codes.length)
    for (const [at, code] of codes.entries())
      table
        .u32(code)
        .u32(code)
        .u32(at + 1)
    return table
  }
  const ranged = codes.slice(0, 2)
  const single = codes.slice(2)
  const segments = 2 + single.length
  table
    .u16(4)
    .u16(0)
    .u16(0)
    .u16(segments * 2)
    .u16(0)
    .u16(0)
    .u16(0)
  table.u16(ranged[1] ?? 0)
  for (const code of single) table.u16(code)
  table.u16(0xffff).u16(0)
  table.u16(ranged[0] ?? 0)
  for (const code of single) table.u16(code)
  table.u16(0xffff)
  table.u16(0)
  for (const [at, code] of single.entries()) table.u16((at + 3 - code) & 0xffff)
  table.u16(1)
  table.u16(segments * 2)
  for (const _ of single) table.u16(0)
  table.u16(0)
  for (let code = ranged[0] ?? 0; code <= (ranged[1] ?? 0); code++) {
    table.u16(code === ranged[0] ? 1 : code === ranged[1] ? 2 : 0)
  }
  return table
}

function nameOf(face: Face): Bytes {
  const names: [number, number, string][] = [
    [1, 1, face.family],
    [3, 1, face.family],
  ]
  if (face.typographic) names.push([3, 16, face.typographic])
  const strings = new Bytes()
  const table = new Bytes()
    .u16(0)
    .u16(names.length)
    .u16(6 + names.length * 12)
  for (const [platform, id, text] of names) {
    const start = strings.values.length
    if (platform === 3) strings.utf16(text)
    else strings.tag(text)
    table
      .u16(platform)
      .u16(platform === 3 ? 1 : 0)
      .u16(platform === 3 ? 0x409 : 0)
      .u16(id)
    table.u16(strings.values.length - start).u16(start)
  }
  table.values.push(...strings.values)
  return table
}

function tablesOf(face: Face): [string, Bytes][] {
  const codes = [...face.advances.keys()]
  const glyphs = codes.length + 1
  const head = new Bytes()
  for (let at = 0; at < 18; at++) head.u8(0)
  head.u16(face.unitsPerEm)
  for (let at = 20; at < 54; at++) head.u8(0)
  const hhea = new Bytes()
  for (let at = 0; at < 34; at++) hhea.u8(0)
  hhea.u16(face.metrics ?? glyphs - 1)
  const hmtx = new Bytes().u16(face.unitsPerEm / 2).u16(0)
  const advances = [...face.advances.values()]
  for (const advance of advances.slice(0, -1)) hmtx.u16(advance).u16(0)
  hmtx.u16(0)
  return [
    ['cmap', cmapOf(codes, face.format)],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
    ['name', nameOf(face)],
  ]
}

function fontAt(face: Face, base: number): number[] {
  const tables = tablesOf(face)
  const directory = new Bytes().u32(0x00010000).u16(tables.length).u16(0).u16(0).u16(0)
  let offset = base + 12 + tables.length * 16
  const body = new Bytes()
  for (const [tag, table] of tables) {
    directory.tag(tag).u32(0).u32(offset).u32(table.values.length)
    body.values.push(...table.pad().values)
    offset += table.values.length
  }
  return [...directory.values, ...body.values]
}

function fontFile(face: Face): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(fontAt(face, 0))
}

function collection(faces: readonly Face[]): Uint8Array {
  const header = new Bytes().tag('ttcf').u32(0x00010000).u32(faces.length)
  let offset = 12 + faces.length * 4
  const fonts: number[] = []
  for (const face of faces) {
    header.u32(offset)
    const font = fontAt(face, offset)
    fonts.push(...font)
    offset += font.length
  }
  return Uint8Array.from([...header.values, ...fonts])
}

const sample: Face = {
  family: 'Sample Sans',
  unitsPerEm: 2048,
  format: 4,
  advances: new Map([
    [0x41, 1366],
    [0x43, 1479],
    [0x61, 1139],
    [0xe9, 1139],
    [0x2014, 2048],
    [0x20ac, 2048],
  ]),
}

describe('readFont', () => {
  it('reads the advances of a TrueType file through a format 4 character map', () => {
    const font = readFont(fontFile(sample))
    expect(font.family).toBe('Sample Sans')
    expect(font.width('A', 400, null)).toBe(1366 / 2048)
    expect(font.width('C', 400, null)).toBe(1479 / 2048)
    expect(font.width('é', 400, null)).toBe(1139 / 2048)
    expect(font.width('\u2014', 400, null)).toBe(1)
    expect(font.width('€', 400, null)).toBe(1)
    expect(font.width('B', 400, null)).toBe(0.5)
    expect(font.width('AaC', 700, 'Other')).toBe((1366 + 1139 + 1479) / 2048)
  })

  it('reads a format 12 character map and the typographic family', () => {
    const face: Face = {
      ...sample,
      family: 'Sample Sans Light',
      typographic: 'Sample Sans',
      format: 12,
      unitsPerEm: 1000,
      advances: new Map([
        [0x61, 500],
        [0x1f600, 1200],
        [0x1f601, 1200],
      ]),
    }
    const font = readFont(fontFile(face).buffer)
    expect(font.family).toBe('Sample Sans')
    expect(font.width('a😀', 400, null)).toBe(0.5 + 1.2)
    expect(font.width('😁😁', 400, null)).toBe(2.4)
  })

  it('reads one face of a collection', () => {
    const other: Face = { ...sample, family: 'Sample Serif', advances: new Map([[0x41, 1024]]) }
    const file = collection([sample, other])
    expect(readFont(file).family).toBe('Sample Sans')
    const second = readFont(file, { face: 1 })
    expect(second.family).toBe('Sample Serif')
    expect(second.width('AA', 400, null)).toBe(1)
    expect(() => readFont(file, { face: 2 })).toThrow(RangeError)
  })

  it('refuses what is not a font file', () => {
    expect(() => readFont(new Uint8Array(4))).toThrow(TypeError)
    const woff = Uint8Array.from([0x77, 0x4f, 0x46, 0x46, 0, 1, 0, 0, 0, 0, 0, 0])
    expect(() => readFont(woff)).toThrow('readFont: not a TrueType, OpenType or collection file')
  })

  function damage(file: Uint8Array): unknown[] {
    const escaped: unknown[] = []
    try {
      const font = readFont(file)
      const width = font.width('AaC€B😀', 400, null)
      if (!Number.isFinite(width)) escaped.push(width)
    } catch (error) {
      if (!(error instanceof TypeError && error.message.startsWith('readFont: '))) {
        escaped.push(error)
      }
    }
    return escaped
  }

  it('throws a readFont TypeError for a truncated file, never a DataView error', () => {
    const files = [fontFile(sample), fontFile({ ...sample, format: 12 }), collection([sample])]
    const escaped: unknown[] = []
    let refused = 0
    for (const file of files) {
      for (let length = 12; length < file.length; length++) {
        const cut = file.slice(0, length)
        escaped.push(...damage(cut))
        try {
          readFont(cut)
        } catch {
          refused++
        }
      }
    }
    expect(escaped).toEqual([])
    expect(refused).toBeGreaterThan(0)
    expect(() => readFont(fontFile(sample).slice(0, 40))).toThrow(
      'readFont: the file is truncated or corrupt',
    )
  })

  it('throws a readFont TypeError for corrupt bytes, never a DataView error', () => {
    const files = [fontFile(sample), fontFile({ ...sample, format: 12 }), collection([sample])]
    const escaped: unknown[] = []
    let seed = 7
    const next = () => {
      seed = (seed * 1103515245 + 12345) >>> 0
      return seed / 2 ** 32
    }
    for (const file of files) {
      for (let round = 0; round < 3000; round++) {
        const copy = file.slice()
        const hits = 1 + Math.floor(next() * 4)
        for (let hit = 0; hit < hits; hit++) {
          copy[Math.floor(next() * copy.length)] = Math.floor(next() * 256)
        }
        escaped.push(...damage(copy))
      }
    }
    expect(escaped).toEqual([])
  })

  it('refuses a font without horizontal metrics or units per em', () => {
    expect(() => readFont(fontFile({ ...sample, metrics: 0 }))).toThrow(
      'readFont: the hhea table gives no horizontal metrics',
    )
    expect(() => readFont(fontFile({ ...sample, unitsPerEm: 0 }))).toThrow(TypeError)
  })

  const arial = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf',
  ]
    .map((path) => new URL(`file://${path}`))
    .find((url) => existsSync(url))

  it.skipIf(!arial)('gives the advances of the Arial table for Arial or Liberation Sans', () => {
    const font = readFont(readFileSync(arial as URL))
    let printable = ''
    for (let code = 32; code < 127; code++) printable += String.fromCharCode(code)
    for (const char of printable) {
      expect(font.width(char, 400, null)).toBeCloseTo(sansTextWidth(char, 400, null), 3)
    }
  })
})
