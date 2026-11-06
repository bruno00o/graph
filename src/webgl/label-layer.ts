import type { EdgeColumns, NodeColumns } from '../core/columns'
import { noColor } from '../core/columns'
import { loopMinimum, loopReach } from '../core/edge-curve'
import type { Positions } from '../core/positions'
import type { View } from '../types'
import { atlasFontSize, atlasWidth, type GlyphAtlas, type LineLayout } from './glyph-atlas'
import {
  edgeLabelGap,
  edgeLabelSize,
  edgeLift,
  plateHalfOne,
  plateHalfTwo,
  platePadX,
  textMiddle,
} from './shaders'

export const glyphStride = 32
const primarySize = 12
const lineHeight = 1.25
const labelMin = 8
const cell = 8
const maxLabels = 4000
const cullMargin = 400
const forcedStates = 0b110
const edgeGlyph = 8
const edgeGap = 8

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
  readonly edges: EdgeColumns
  readonly edgeMask: Uint32Array
  readonly edgeLabelFlags: Int8Array
  readonly highlightedEdges: readonly number[]
  readonly edgeOrder: Uint32Array
  readonly edgeOrderLength: number
}

export interface EdgeAnchor {
  x: number
  y: number
  ax: number
  ay: number
  room: number
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

  pushPlate(node: number, color: number, width: number, lines: number, flags = 0): void {
    if ((this.count + 1) * glyphStride > this.data.byteLength) this.#grow()
    const at = this.count * (glyphStride / 4)
    this.#u32[at] = node
    this.#u32[at + 1] = 3 | flags | (color << 4)
    this.#f32[at + 2] = width
    this.#f32[at + 3] = lines
    this.#f32[at + 4] = 0
    this.#f32[at + 5] = 0
    this.#u32[at + 6] = 0
    this.#u32[at + 7] = 0
    this.count++
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

function screenRadius(nodes: NodeColumns, index: number, zoom: number): number {
  const size = nodes.size[index] ?? 0
  return Math.max((nodes.screenUnits[index] === 1 ? size : size * zoom) / 2, 1.25)
}

export function edgeAnchor(
  frame: Pick<LabelFrame, 'nodes' | 'edges' | 'positions' | 'view' | 'width' | 'height'>,
  index: number,
  out: EdgeAnchor,
): boolean {
  const { nodes, edges, positions, view, width, height } = frame
  const source = edges.source[index] ?? 0
  const target = edges.target[index] ?? 0
  const sx = (positions.x(source) - view.x) * view.zoom + width / 2
  const sy = (positions.y(source) - view.y) * view.zoom + height / 2
  const sourceRadius = screenRadius(nodes, source, view.zoom)
  const bend = edges.bend[index] ?? 0
  if (source === target) {
    const reach = loopReach(sourceRadius, bend, loopMinimum)
    out.x = sx + reach * Math.SQRT1_2
    out.y = sy - reach * Math.SQRT1_2
    out.ax = Math.SQRT1_2
    out.ay = Math.SQRT1_2
    out.room = Number.POSITIVE_INFINITY
    return true
  }
  const tx = (positions.x(target) - view.x) * view.zoom + width / 2
  const ty = (positions.y(target) - view.y) * view.zoom + height / 2
  const length = Math.hypot(tx - sx, ty - sy)
  if (length === 0) return false
  const ux = (tx - sx) / length
  const uy = (ty - sy) / length
  const targetRadius = screenRadius(nodes, target, view.zoom)
  const shift = (sourceRadius - targetRadius) / 2
  out.x = (sx + tx) / 2 + ux * shift - uy * bend * length
  out.y = (sy + ty) / 2 + uy * shift + ux * bend * length
  const flip = ux < 0 || (ux === 0 && uy < 0)
  out.ax = flip ? -ux : ux
  out.ay = flip ? -uy : uy
  out.room = length - sourceRadius - targetRadius
  return true
}

export class LabelLayer {
  readonly main: GlyphBuffer = new GlyphBuffer()
  readonly highlight: GlyphBuffer = new GlyphBuffer()
  readonly edgeMain: GlyphBuffer = new GlyphBuffer()
  readonly edgeHighlight: GlyphBuffer = new GlyphBuffer()
  #occupancy: Uint8Array = new Uint8Array(0)
  #cols = 0
  #rows = 0
  readonly #anchor: EdgeAnchor = { x: 0, y: 0, ax: 1, ay: 0, room: 0 }

  #claim(anchor: EdgeAnchor, half: number, low: number, high: number, force: boolean): boolean {
    const { x, y, ax, ay } = anchor
    const reachX = Math.abs(ax) * half + Math.abs(ay) * Math.max(-low, high)
    const reachY = Math.abs(ay) * half + Math.abs(ax) * Math.max(-low, high)
    const cols = this.#cols
    const c0 = Math.max(0, Math.floor((x - reachX) / cell))
    const c1 = Math.min(cols - 1, Math.floor((x + reachX) / cell))
    const r0 = Math.max(0, Math.floor((y - reachY) / cell))
    const r1 = Math.min(this.#rows - 1, Math.floor((y + reachY) / cell))
    if (c1 < c0 || r1 < r0) return false
    const margin = cell / 2
    const occupancy = this.#occupancy
    for (let pass = force ? 1 : 0; pass < 2; pass++) {
      for (let row = r0; row <= r1; row++) {
        const dy = (row + 0.5) * cell - y
        for (let col = c0; col <= c1; col++) {
          const dx = (col + 0.5) * cell - x
          const along = dx * ax + dy * ay
          const across = dy * ax - dx * ay
          if (Math.abs(along) > half + margin) continue
          if (across < low - margin || across > high + margin) continue
          if (pass === 0 && occupancy[row * cols + col] === 1) return false
          if (pass === 1) occupancy[row * cols + col] = 1
        }
      }
    }
    return true
  }

  select(frame: LabelFrame, atlas: GlyphAtlas): void {
    this.main.clear()
    this.highlight.clear()
    this.edgeMain.clear()
    this.edgeHighlight.clear()
    const { nodes, positions, view, width, height } = frame
    const cols = Math.ceil(width / cell) + 1
    const rows = Math.ceil(height / cell) + 1
    this.#cols = cols
    this.#rows = rows
    if (this.#occupancy.length < cols * rows) this.#occupancy = new Uint8Array(cols * rows)
    else this.#occupancy.fill(0, 0, cols * rows)
    const occupancy = this.#occupancy
    const highlighted = new Set(frame.highlighted)
    const worldPrimary = primarySize * Math.min(1, view.zoom)
    let placed = 0

    const forced = (index: number) => ((frame.nodeMask[index] ?? 0) & forcedStates) !== 0

    const place = (index: number, highlight: boolean): void => {
      const force = highlight && forced(index)
      const label = nodes.label[index]
      if (!label || nodes.alive[index] !== 1) return
      if (!labelVisible(frame.nodeMask[index] ?? 0, frame.labelFlags)) return
      const screenUnits = nodes.screenUnits[index] === 1
      const primary = screenUnits ? primarySize : worldPrimary
      if (primary < labelMin) return
      const radius = screenRadius(nodes, index, view.zoom) + (nodes.outlineWidth[index] ?? 0)
      const x = (positions.x(index) - view.x) * view.zoom + width / 2
      const y = (positions.y(index) - view.y) * view.zoom + height / 2
      if (x < -cullMargin || x > width + cullMargin) return
      if (y + radius > height || y + radius + primary * lineHeight * 3 < -3) return
      const line = atlas.line(label, '500')
      const secondaryText = nodes.secondary[index]
      const secondary = secondaryText ? atlas.line(secondaryText, '400') : null
      const scale = primary / atlasFontSize
      const textUnits = Math.max(line.width, secondary ? (secondary.width * 11) / 12 : 0)
      const background = nodes.labelBackground[index] ?? noColor
      const plated = background !== noColor
      const pad = plated ? primary * platePadX : 0
      const lines = secondary ? 2 : 1
      const top = y + radius + 3
      const bottom =
        top +
        (plated
          ? primary * 2 * (secondary ? plateHalfTwo : plateHalfOne)
          : primary * lineHeight * lines)
      const left = x - (textUnits * scale) / 2 - pad
      const right = x + (textUnits * scale) / 2 + pad
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
      const target = highlight ? this.highlight : this.main
      const plate = plated ? 4 : 0
      if (plated) target.pushPlate(index, background, textUnits, lines)
      target.push(index, plate, line, atlas.height)
      if (secondary) target.push(index, 1 | plate, secondary, atlas.height)
      placed++
    }

    const edgeSize = edgeLabelSize * Math.min(1, view.zoom)
    const edgeScale = edgeSize / atlasFontSize
    const edgeForced = (index: number) => ((frame.edgeMask[index] ?? 0) & forcedStates) !== 0
    const anchor = this.#anchor

    const placeEdge = (index: number, highlight: boolean): void => {
      const { edges } = frame
      const label = edges.label[index]
      if (!label || edges.alive[index] !== 1 || edgeSize < labelMin) return
      if (!labelVisible(frame.edgeMask[index] ?? 0, frame.edgeLabelFlags)) return
      if (!edgeAnchor(frame, index, anchor)) return
      if (anchor.x < -cullMargin || anchor.x > width + cullMargin) return
      if (anchor.y < -cullMargin || anchor.y > height + cullMargin) return
      const line = atlas.line(label, '500')
      const background = edges.labelBackground[index] ?? noColor
      const plated = background !== noColor
      const half = (line.width * edgeScale) / 2 + (plated ? edgeSize * platePadX : 0)
      if (half * 2 + edgeGap > anchor.room) return
      const above = Math.max(edges.width[index] ?? 0, 0.5) / 2 + edgeLabelGap
      const low = plated ? -textMiddle * edgeSize : -above - edgeLift * edgeSize
      const high = plated
        ? (2 * plateHalfOne - textMiddle) * edgeSize
        : -above + (lineHeight - edgeLift) * edgeSize
      if (!this.#claim(anchor, half, low, high, highlight && edgeForced(index))) return
      const target = highlight ? this.edgeHighlight : this.edgeMain
      if (plated) target.pushPlate(index, background, line.width, 1, edgeGlyph)
      target.push(index, edgeGlyph | (plated ? 4 : 0), line, atlas.height)
      placed++
    }

    for (const index of highlighted) if (forced(index)) place(index, true)
    for (const index of frame.highlightedEdges) if (edgeForced(index)) placeEdge(index, true)
    for (const index of highlighted) if (!forced(index)) place(index, true)
    for (const index of frame.highlightedEdges) if (!edgeForced(index)) placeEdge(index, true)
    const highlightedEdges = new Set(frame.highlightedEdges)
    const placeEdges = (): void => {
      if (edgeSize < labelMin) return
      const xy = positions.xy
      const { source, target } = frame.edges
      const reach = cullMargin / view.zoom
      const left = view.x - width / 2 / view.zoom - reach
      const right = view.x + width / 2 / view.zoom + reach
      const top = view.y - height / 2 / view.zoom - reach
      const bottom = view.y + height / 2 / view.zoom + reach
      for (let at = 0; at < frame.edgeOrderLength && placed < maxLabels; at++) {
        const index = frame.edgeOrder[at] ?? 0
        const from = (source[index] ?? 0) * 2
        const to = (target[index] ?? 0) * 2
        const ax = xy[from] ?? 0
        const bx = xy[to] ?? 0
        if ((ax < left && bx < left) || (ax > right && bx > right)) continue
        const ay = xy[from + 1] ?? 0
        const by = xy[to + 1] ?? 0
        if ((ay < top && by < top) || (ay > bottom && by > bottom)) continue
        if (!highlightedEdges.has(index)) placeEdge(index, false)
      }
    }
    if (worldPrimary < labelMin && !frame.screenLabels) {
      placeEdges()
      return
    }
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
    placeEdges()
  }
}

export function sortEdgesByWidth(edges: EdgeColumns, order: Uint32Array): number {
  let length = 0
  for (let index = 0; index < edges.capacity; index++) {
    if (edges.alive[index] === 1 && edges.label[index]) order[length++] = index
  }
  const widths = edges.width
  order.subarray(0, length).sort((a, b) => (widths[b] ?? 0) - (widths[a] ?? 0) || a - b)
  return length
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
