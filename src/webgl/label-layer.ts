import type { NodeColumns } from '../core/columns'
import type { Positions } from '../core/positions'
import type { View } from '../types'
import { atlasFontSize, atlasWidth, type GlyphAtlas, type LineLayout } from './glyph-atlas'

export const glyphStride = 32
const primarySize = 12
const lineHeight = 1.25
const labelMin = 8
const cell = 8
const maxLabels = 4000
const cullMargin = 400

export interface LabelFrame {
  readonly nodes: NodeColumns
  readonly positions: Positions
  readonly view: View
  readonly width: number
  readonly height: number
  readonly nodeMask: Uint32Array
  readonly labelFlags: Int8Array
  readonly highlighted: readonly number[]
  readonly order: Uint32Array
  readonly orderLength: number
  readonly screenLabels: boolean
}

export class GlyphBuffer {
  data: ArrayBuffer = new ArrayBuffer(glyphStride * 256)
  count = 0
  #u32: Uint32Array = new Uint32Array(this.data)
  #f32: Float32Array = new Float32Array(this.data)
  #u16: Uint16Array = new Uint16Array(this.data)

  clear(): void {
    this.count = 0
  }

  push(node: number, kind: number, line: LineLayout, atlasHeight: number): void {
    for (const { glyph, x } of line.glyphs) {
      if ((this.count + 1) * glyphStride > this.data.byteLength) this.#grow()
      const at = this.count * (glyphStride / 4)
      this.#u32[at] = node
      this.#u32[at + 1] = kind
      this.#f32[at + 2] = x
      this.#f32[at + 3] = glyph.top
      this.#f32[at + 4] = glyph.width
      this.#f32[at + 5] = glyph.height
      const uv = at * 2 + 12
      this.#u16[uv] = Math.round((glyph.x / atlasWidth) * 65535)
      this.#u16[uv + 1] = Math.round((glyph.y / atlasHeight) * 65535)
      this.#u16[uv + 2] = Math.round(((glyph.x + glyph.width) / atlasWidth) * 65535)
      this.#u16[uv + 3] = Math.round(((glyph.y + glyph.height) / atlasHeight) * 65535)
      this.count++
    }
  }

  #grow(): void {
    const data = new ArrayBuffer(this.data.byteLength * 2)
    new Uint8Array(data).set(new Uint8Array(this.data))
    this.data = data
    this.#u32 = new Uint32Array(data)
    this.#f32 = new Float32Array(data)
    this.#u16 = new Uint16Array(data)
  }
}

export function labelVisible(mask: number, flags: Int8Array): boolean {
  let bits = mask >>> 0
  while (bits !== 0) {
    const bit = 31 - Math.clz32(bits & -bits)
    bits &= bits - 1
    const flag = flags[bit] ?? -1
    if (flag >= 0) return flag === 1
  }
  return true
}

export class LabelLayer {
  readonly main: GlyphBuffer = new GlyphBuffer()
  readonly highlight: GlyphBuffer = new GlyphBuffer()
  #occupancy: Uint8Array = new Uint8Array(0)

  select(frame: LabelFrame, atlas: GlyphAtlas): void {
    this.main.clear()
    this.highlight.clear()
    const { nodes, positions, view, width, height } = frame
    const cols = Math.ceil(width / cell) + 1
    const rows = Math.ceil(height / cell) + 1
    if (this.#occupancy.length < cols * rows) this.#occupancy = new Uint8Array(cols * rows)
    else this.#occupancy.fill(0, 0, cols * rows)
    const occupancy = this.#occupancy
    const highlighted = new Set(frame.highlighted)
    const worldPrimary = primarySize * Math.min(1, view.zoom)
    let placed = 0

    const place = (index: number, force: boolean): void => {
      const label = nodes.label[index]
      if (!label || nodes.alive[index] !== 1) return
      if (!labelVisible(frame.nodeMask[index] ?? 0, frame.labelFlags)) return
      const screenUnits = nodes.screenUnits[index] === 1
      const primary = screenUnits ? primarySize : worldPrimary
      if (primary < labelMin) return
      const diameter = screenUnits ? (nodes.size[index] ?? 0) : (nodes.size[index] ?? 0) * view.zoom
      const radius = Math.max(diameter / 2, 1.25)
      const x = (positions.x(index) - view.x) * view.zoom + width / 2
      const y = (positions.y(index) - view.y) * view.zoom + height / 2
      if (x < -cullMargin || x > width + cullMargin) return
      if (y + radius > height || y + radius + primary * lineHeight * 2 < -3) return
      const line = atlas.line(label, '500')
      const secondaryText = nodes.secondary[index]
      const secondary = secondaryText ? atlas.line(secondaryText, '400') : null
      const scale = primary / atlasFontSize
      const textWidth = Math.max(
        line.width * scale,
        secondary ? (secondary.width * scale * 11) / 12 : 0,
      )
      const top = y + radius + 3
      const bottom = top + primary * lineHeight * (secondary ? 2 : 1)
      const left = x - textWidth / 2
      const right = x + textWidth / 2
      if (right < 0 || left > width || bottom < 0 || top > height) return
      const c0 = Math.max(0, Math.floor(left / cell))
      const c1 = Math.min(cols - 1, Math.floor(right / cell))
      const r0 = Math.max(0, Math.floor(top / cell))
      const r1 = Math.min(rows - 1, Math.floor(bottom / cell))
      if (!force) {
        for (let row = r0; row <= r1; row++) {
          for (let col = c0; col <= c1; col++) if (occupancy[row * cols + col] === 1) return
        }
      }
      for (let row = r0; row <= r1; row++) occupancy.fill(1, row * cols + c0, row * cols + c1 + 1)
      const target = force ? this.highlight : this.main
      target.push(index, 0, line, atlas.height)
      if (secondary) target.push(index, 1, secondary, atlas.height)
      placed++
    }

    for (const index of highlighted) place(index, true)
    if (worldPrimary < labelMin && !frame.screenLabels) return
    const xy = positions.xy
    const order = frame.order
    const left = view.x - (width / 2 + cullMargin) / view.zoom
    const right = view.x + (width / 2 + cullMargin) / view.zoom
    const largest = nodes.size[order[0] ?? 0] ?? 0
    const reach = cullMargin + (frame.screenLabels ? largest : largest * view.zoom) / 2
    const top = view.y - (height / 2 + reach) / view.zoom
    const bottom = view.y + height / 2 / view.zoom
    for (let at = 0; at < frame.orderLength && placed < maxLabels; at++) {
      const index = order[at] ?? 0
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      if (x < left || x > right || y < top || y > bottom) continue
      if (!highlighted.has(index)) place(index, false)
    }
  }
}

export interface LabelOrder {
  readonly length: number
  readonly screenLabels: boolean
}

export function sortBySize(nodes: NodeColumns, order: Uint32Array): LabelOrder {
  let length = 0
  let screenLabels = false
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] === 1 && nodes.label[index]) {
      order[length++] = index
      if (nodes.screenUnits[index] === 1) screenLabels = true
    }
  }
  const sizes = nodes.size
  order.subarray(0, length).sort((a, b) => (sizes[b] ?? 0) - (sizes[a] ?? 0))
  return { length, screenLabels }
}
