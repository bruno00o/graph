import type { TextWidth } from '../core/label-width'

/** A font file read by `readFont`. */
export interface FontFile {
  /** Family name of the face, as CSS knows it: the typographic family, else the family. */
  readonly family: string
  /**
   * Width of a text in this face, in em: the sum of the advances of its characters, without
   * kerning or shaping. Pass it as `measureText`.
   */
  readonly width: TextWidth
}

/** Options of `readFont`. */
export interface ReadFontOptions {
  /**
   * Index of the face to read in a font collection (a `.ttc` or `.otc` file). A file that is not a
   * collection ignores it. An index the collection does not have throws a `RangeError`.
   * @default 0
   */
  readonly face?: number | undefined
}

const collectionTag = 0x74746366
const faceTags = new Set([0x00010000, 0x4f54544f, 0x74727565])

function need(view: DataView, at: number, length: number): void {
  if (!(at >= 0 && length >= 0 && at + length <= view.byteLength)) {
    throw new TypeError('readFont: the file is truncated or corrupt')
  }
}

function tablesAt(view: DataView, at: number): Map<string, number> {
  const found = new Map<string, number>()
  need(view, at, 12)
  const count = view.getUint16(at + 4)
  need(view, at + 12, count * 16)
  for (let index = 0; index < count; index++) {
    const record = at + 12 + index * 16
    let tag = ''
    for (let byte = 0; byte < 4; byte++) tag += String.fromCharCode(view.getUint8(record + byte))
    found.set(tag, view.getUint32(record + 8))
  }
  return found
}

function segmentGlyphs(view: DataView, at: number): (code: number) => number {
  need(view, at, 14)
  const segments = view.getUint16(at + 6) >> 1
  const ends = at + 14
  const starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2
  const offsets = deltas + segments * 2
  need(view, ends, segments * 8 + 2)
  return (code) => {
    if (code > 0xffff || segments === 0) return 0
    let low = 0
    let high = segments - 1
    while (low < high) {
      const middle = (low + high) >> 1
      if (view.getUint16(ends + middle * 2) < code) low = middle + 1
      else high = middle
    }
    const start = view.getUint16(starts + low * 2)
    if (start > code || view.getUint16(ends + low * 2) < code) return 0
    const delta = view.getUint16(deltas + low * 2)
    const offset = view.getUint16(offsets + low * 2)
    if (offset === 0) return (code + delta) & 0xffff
    const address = offsets + low * 2 + offset + (code - start) * 2
    if (address + 2 > view.byteLength) return 0
    const glyph = view.getUint16(address)
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff
  }
}

function groupGlyphs(view: DataView, at: number): (code: number) => number {
  need(view, at, 16)
  const groups = view.getUint32(at + 12)
  need(view, at + 16, groups * 12)
  return (code) => {
    let low = 0
    let high = groups - 1
    while (low <= high) {
      const middle = (low + high) >> 1
      const group = at + 16 + middle * 12
      if (code < view.getUint32(group)) high = middle - 1
      else if (code > view.getUint32(group + 4)) low = middle + 1
      else return view.getUint32(group + 8) + code - view.getUint32(group)
    }
    return 0
  }
}

function glyphsOf(view: DataView, cmap: number): (code: number) => number {
  let segments = -1
  need(view, cmap, 4)
  const count = view.getUint16(cmap + 2)
  need(view, cmap + 4, count * 8)
  for (let index = 0; index < count; index++) {
    const record = cmap + 4 + index * 8
    const platform = view.getUint16(record)
    const encoding = view.getUint16(record + 2)
    if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue
    const at = cmap + view.getUint32(record + 4)
    need(view, at, 2)
    const format = view.getUint16(at)
    if (format === 12) return groupGlyphs(view, at)
    if (format === 4 && segments < 0) segments = at
  }
  return segments < 0 ? () => 0 : segmentGlyphs(view, segments)
}

function familyOf(view: DataView, name: number | undefined): string {
  if (name === undefined) return ''
  need(view, name, 6)
  const count = view.getUint16(name + 2)
  const strings = name + view.getUint16(name + 4)
  need(view, name + 6, count * 12)
  let best = ''
  let rank = 0
  for (let index = 0; index < count; index++) {
    const record = name + 6 + index * 12
    const platform = view.getUint16(record)
    const id = view.getUint16(record + 6)
    if (id !== 1 && id !== 16) continue
    const wide = platform === 0 || platform === 3
    const score = (id === 16 ? 2 : 0) + (wide ? 1 : 0) + 1
    if (score <= rank) continue
    const length = view.getUint16(record + 8)
    const at = strings + view.getUint16(record + 10)
    need(view, at, length)
    let text = ''
    if (wide) {
      for (let byte = 0; byte + 1 < length; byte += 2) {
        text += String.fromCharCode(view.getUint16(at + byte))
      }
    } else {
      for (let byte = 0; byte < length; byte++)
        text += String.fromCharCode(view.getUint8(at + byte))
    }
    best = text
    rank = score
  }
  return best
}

/**
 * Reads the family name and the advance widths of a TrueType or OpenType font file, or of one face
 * of a collection, so that a graph made by `createGraph` sizes its labels for the font that draws
 * them. WOFF and WOFF2 files are not read: decompress them first.
 */
export function readFont(bytes: Uint8Array | ArrayBuffer, options: ReadFontOptions = {}): FontFile {
  const face = options.face ?? 0
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const tag = data.byteLength >= 12 ? view.getUint32(0) : 0
  const collection = tag === collectionTag
  if (!collection && !faceTags.has(tag)) {
    throw new TypeError('readFont: not a TrueType, OpenType or collection file')
  }
  if (collection && !(Number.isInteger(face) && face >= 0 && face < view.getUint32(8))) {
    throw new RangeError(`readFont: the collection has no face ${face}`)
  }
  if (collection) need(view, 12 + face * 4, 4)
  const tables = tablesAt(view, collection ? view.getUint32(12 + face * 4) : 0)
  const head = tables.get('head')
  const hhea = tables.get('hhea')
  const hmtx = tables.get('hmtx')
  const cmap = tables.get('cmap')
  if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined) {
    throw new TypeError('readFont: the font has no head, hhea, hmtx or cmap table')
  }
  need(view, head, 20)
  need(view, hhea, 36)
  const unitsPerEm = view.getUint16(head + 18)
  if (unitsPerEm === 0) throw new TypeError('readFont: the head table gives 0 units per em')
  const metrics = view.getUint16(hhea + 34)
  if (metrics === 0) throw new TypeError('readFont: the hhea table gives no horizontal metrics')
  need(view, hmtx, metrics * 4)
  const last = metrics - 1
  const glyph = glyphsOf(view, cmap)
  const family = familyOf(view, tables.get('name'))
  const advances = new Map<number, number>()
  const advance = (code: number): number => {
    let found = advances.get(code)
    if (found === undefined) {
      found = view.getUint16(hmtx + Math.min(glyph(code), last) * 4) / unitsPerEm
      advances.set(code, found)
    }
    return found
  }
  return {
    family,
    width: (text) => {
      let total = 0
      for (const char of text) total += advance(char.codePointAt(0) ?? 0)
      return total
    },
  }
}
