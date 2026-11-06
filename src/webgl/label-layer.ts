import type { EdgeColumns, NodeColumns } from '../core/columns'
import { containerShape, noColor } from '../core/columns'
import { loopMinimum, loopReach } from '../core/edge-curve'
import type { Positions } from '../core/positions'
import type { LabelMode } from '../host/renderer'
import type { View } from '../types'
import { atlasFontSize, atlasWidth, type GlyphAtlas, type LineLayout } from './glyph-atlas'
import {
  edgeDescent,
  edgeLabelGap,
  edgeLabelSize,
  labelGap,
  nodeLabelSize,
  plateDrop,
  platePadX,
  uprightSlack,
} from './shaders'

export const glyphStride = 40
export const lineHeight = 1.25
export const secondaryFactor: number = 11 / 12
const primaryWeight = 500
const secondaryWeight = 400
const labelMin = 8
const cell = 8
const maxLabels = 4000
const cullMargin = 400
const forcedStates = 0b110
const edgeGlyph = 8
const platedGlyph = 4
const edgeGap = 8
const padUnits = platePadX * atlasFontSize

export interface LabelFrame {
  readonly nodes: NodeColumns
  readonly positions: Positions
  readonly view: View
  readonly width: number
  readonly height: number
  readonly nodeMask: Uint32Array
  readonly boxes?: Float32Array | null
  readonly labelFlags: Int8Array
  readonly highlighted: readonly number[]
  readonly order: Uint32Array
  readonly orderLength: number
  readonly screenLabels: boolean
  readonly largestLabel: number
  readonly edges: EdgeColumns
  readonly edgeMask: Uint32Array
  readonly edgeLabelFlags: Int8Array
  readonly highlightedEdges: readonly number[]
  readonly edgeOrder: Uint32Array
  readonly edgeOrderLength: number
  readonly largestEdgeLabel: number
  readonly mode?: LabelMode
  readonly sink?: LabelSink
}

export type TextMeasure = Pick<GlyphAtlas, 'height' | 'generation' | 'line' | 'fit'>

export interface PlacedLabel {
  readonly block: TextBlock
  readonly top: number
  readonly align: number
  readonly shift: number
  readonly placement: number
  readonly plate: {
    readonly cx: number
    readonly cy: number
    readonly hx: number
    readonly hy: number
  } | null
  readonly background: number
  readonly color: number
  readonly size: number
  readonly highlight: boolean
}

export interface LabelSink {
  node(index: number, label: PlacedLabel): void
  edge(index: number, label: PlacedLabel, anchor: Readonly<EdgeAnchor>): void
}

export interface EdgeAnchor {
  x: number
  y: number
  ax: number
  ay: number
  room: number
}

export interface TextLine {
  readonly text: string
  readonly layout: LineLayout
  readonly factor: number
  readonly kind: number
}

export interface TextBlock {
  readonly lines: readonly TextLine[]
  readonly width: number
  readonly height: number
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

  push(
    owner: number,
    kind: number,
    line: LineLayout,
    atlasHeight: number,
    x = 0,
    y = 0,
    factor = 1,
    color: number = noColor,
    size = 0,
  ): void {
    for (const placed of line.glyphs) {
      const glyph = placed.glyph
      const at = this.#next(owner, kind, color, size)
      this.#f32[at + 2] = placed.x * factor + x
      this.#f32[at + 3] = glyph.top * factor + y
      this.#f32[at + 4] = glyph.width * factor
      this.#f32[at + 5] = glyph.height * factor
      const uv = at * 2 + 12
      this.#u16[uv] = Math.round((glyph.x / atlasWidth) * 65535)
      this.#u16[uv + 1] = Math.round((glyph.y / atlasHeight) * 65535)
      this.#u16[uv + 2] = Math.round(((glyph.x + glyph.width) / atlasWidth) * 65535)
      this.#u16[uv + 3] = Math.round(((glyph.y + glyph.height) / atlasHeight) * 65535)
    }
  }

  pushPlate(
    owner: number,
    kind: number,
    cx: number,
    cy: number,
    hx: number,
    hy: number,
    color: number,
    size: number,
  ): void {
    const at = this.#next(owner, 3 | kind, color, size)
    this.#f32[at + 2] = cx
    this.#f32[at + 3] = cy
    this.#f32[at + 4] = hx
    this.#f32[at + 5] = hy
    this.#u32[at + 6] = 0
    this.#u32[at + 7] = 0
  }

  #next(owner: number, kind: number, color: number, size: number): number {
    if ((this.count + 1) * glyphStride > this.data.byteLength) this.#grow()
    const at = this.count * (glyphStride / 4)
    this.#u32[at] = owner
    this.#u32[at + 1] = kind
    this.#u32[at + 8] = color
    this.#f32[at + 9] = size
    this.count++
    return at
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

function screenDiameter(nodes: NodeColumns, index: number, zoom: number): number {
  const size = nodes.size[index] ?? 0
  return nodes.screenUnits[index] === 1 ? size : size * zoom
}

function screenRadius(nodes: NodeColumns, index: number, zoom: number): number {
  return Math.max(screenDiameter(nodes, index, zoom) / 2, 1.25)
}

function textBlock(
  atlas: TextMeasure,
  primary: string,
  secondary: string | null,
  weight: number,
  font: string | null,
  maxWidth: number,
  size: number,
): TextBlock {
  const lines: TextLine[] = []
  let width = 0
  let height = 0
  const add = (text: string, lineWeight: number, factor: number, kind: number) => {
    for (const part of text.split('\n')) {
      const fitted =
        maxWidth > 0
          ? atlas.fit(part, lineWeight, font, (maxWidth / size) * (atlasFontSize / factor))
          : part
      const layout = atlas.line(fitted, lineWeight, font)
      lines.push({ text: fitted, layout, factor, kind })
      width = Math.max(width, layout.width * factor)
      height += lineHeight * atlasFontSize * factor
    }
  }
  add(primary, weight, 1, 0)
  if (secondary) add(secondary, secondaryWeight, secondaryFactor, 1)
  return { lines, width, height }
}

function emit(
  target: GlyphBuffer,
  owner: number,
  flags: number,
  block: TextBlock,
  atlasHeight: number,
  top: number,
  align: number,
  shift: number,
  color: number,
  size: number,
): void {
  let y = top
  for (const line of block.lines) {
    const half = (line.layout.width * line.factor) / 2
    const x = shift + align * half
    const lineColor = line.kind === 0 ? color : noColor
    target.push(
      owner,
      line.kind | flags,
      line.layout,
      atlasHeight,
      x,
      y,
      line.factor,
      lineColor,
      size,
    )
    y += lineHeight * atlasFontSize * line.factor
  }
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
  const flip = ux < -uprightSlack || (Math.abs(ux) <= uprightSlack && uy < 0)
  out.ax = flip ? -ux : ux
  out.ay = flip ? -uy : uy
  out.room = length - sourceRadius - targetRadius
  return true
}

const placementDirections: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 0],
]

export class LabelLayer {
  readonly main: GlyphBuffer = new GlyphBuffer()
  readonly highlight: GlyphBuffer = new GlyphBuffer()
  readonly edgeMain: GlyphBuffer = new GlyphBuffer()
  readonly edgeHighlight: GlyphBuffer = new GlyphBuffer()
  nodeLabels = 0
  edgeLabels = 0
  #occupancy: Uint8Array = new Uint8Array(0)
  #cols = 0
  #rows = 0
  readonly #anchor: EdgeAnchor = { x: 0, y: 0, ax: 1, ay: 0, room: 0 }

  #claimBox(left: number, top: number, right: number, bottom: number, force: boolean): boolean {
    const cols = this.#cols
    const c0 = Math.max(0, Math.floor(left / cell))
    const c1 = Math.min(cols - 1, Math.floor(right / cell))
    const r0 = Math.max(0, Math.floor(top / cell))
    const r1 = Math.min(this.#rows - 1, Math.floor(bottom / cell))
    if (c1 < c0 || r1 < r0) return false
    const occupancy = this.#occupancy
    if (!force) {
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) if (occupancy[row * cols + col] === 1) return false
      }
    }
    for (let row = r0; row <= r1; row++) occupancy.fill(1, row * cols + c0, row * cols + c1 + 1)
    return true
  }

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

  select(frame: LabelFrame, atlas: TextMeasure): void {
    this.main.clear()
    this.highlight.clear()
    this.edgeMain.clear()
    this.edgeHighlight.clear()
    this.nodeLabels = 0
    this.edgeLabels = 0
    const { nodes, edges, positions, view, width, height } = frame
    this.#cols = Math.ceil(width / cell) + 1
    this.#rows = Math.ceil(height / cell) + 1
    const cells = this.#cols * this.#rows
    if (this.#occupancy.length < cells) this.#occupancy = new Uint8Array(cells)
    else this.#occupancy.fill(0, 0, cells)
    const highlighted = new Set(frame.highlighted)
    const highlightedEdges = new Set(frame.highlightedEdges)
    const shrink = Math.min(1, view.zoom)
    const all = frame.mode === 'all'
    const sink = frame.sink
    const limit = all ? Number.POSITIVE_INFINITY : maxLabels
    const minimumPixels = all ? 0 : labelMin
    let placed = 0
    if (frame.mode === 'none') return

    const forced = (index: number) => ((frame.nodeMask[index] ?? 0) & forcedStates) !== 0
    const edgeForced = (index: number) => ((frame.edgeMask[index] ?? 0) & forcedStates) !== 0

    const place = (index: number, highlight: boolean): void => {
      const force = highlight && forced(index)
      const label = nodes.label[index]
      if (!label || nodes.alive[index] !== 1) return
      if (!labelVisible(frame.nodeMask[index] ?? 0, frame.labelFlags)) return
      const screenUnits = nodes.screenUnits[index] === 1
      const size = nodes.labelSize[index] || nodeLabelSize
      const pixels = screenUnits ? size : size * shrink
      if (pixels < minimumPixels) return
      const minimum = nodes.labelMinScreenSize[index] ?? 0
      if (!force && !all && minimum > 0 && screenDiameter(nodes, index, view.zoom) < minimum) return
      const x = (positions.x(index) - view.x) * view.zoom + width / 2
      const y = (positions.y(index) - view.y) * view.zoom + height / 2
      const box = nodes.shape[index] === containerShape ? frame.boxes : null
      if (!box && (x < -cullMargin || x > width + cullMargin)) return
      if (!box && (y < -cullMargin || y > height + cullMargin)) return
      const block = textBlock(
        atlas,
        label,
        nodes.secondary[index] ?? null,
        nodes.labelWeight[index] || primaryWeight,
        nodes.labelFont[index] ?? null,
        nodes.labelMaxWidth[index] ?? 0,
        size,
      )
      const background = nodes.labelBackground[index] ?? noColor
      const plated = background !== noColor
      const placement = nodes.labelPlacement[index] ?? 0
      const [dx, dy] = placementDirections[placement] ?? [0, 1]
      const total = block.height + (plated ? plateDrop : 0)
      const top = placement === 0 ? 0 : placement === 1 ? -total : -total / 2
      const align = placement === 2 ? 1 : placement === 3 ? -1 : 0
      const shift = plated ? align * padUnits : 0
      const textLeft = shift + (align - 1) * (block.width / 2)
      const textRight = shift + (align + 1) * (block.width / 2)
      const hx = block.width / 2 + padUnits
      const hy = total / 2
      const cx = (textLeft + textRight) / 2
      const cy = top + hy
      const reach =
        placement === 4
          ? 0
          : (box
              ? (box[index * 4 + (dx !== 0 ? 0 : 1)] ?? 0) * view.zoom
              : screenRadius(nodes, index, view.zoom)) +
            (nodes.outlineWidth[index] ?? 0) +
            labelGap
      const ox = x + dx * reach
      const oy = y + dy * reach
      const scale = pixels / atlasFontSize
      const left = ox + (plated ? cx - hx : textLeft) * scale
      const right = ox + (plated ? cx + hx : textRight) * scale
      const boxTop = oy + top * scale
      const boxBottom = oy + (top + (plated ? total : block.height)) * scale
      if (right < 0 || left > width || boxBottom < 0 || boxTop > height) return
      if (!this.#claimBox(left, boxTop, right, boxBottom, force || all)) return
      const target = highlight ? this.highlight : this.main
      const flags = (placement << 4) | (plated ? platedGlyph : 0)
      if (plated) target.pushPlate(index, flags, cx, cy, hx, hy, background, size)
      const color = nodes.labelColor[index] ?? noColor
      emit(target, index, flags, block, atlas.height, top, align, shift, color, size)
      sink?.node(index, {
        block,
        top,
        align,
        shift,
        placement,
        plate: plated ? { cx, cy, hx, hy } : null,
        background,
        color,
        size,
        highlight,
      })
      placed++
      this.nodeLabels++
    }

    const anchor = this.#anchor
    const placeEdge = (index: number, highlight: boolean): void => {
      const label = edges.label[index]
      if (!label || edges.alive[index] !== 1) return
      const size = edges.labelSize[index] || edgeLabelSize
      const pixels = size * shrink
      if (pixels < minimumPixels) return
      if (!labelVisible(frame.edgeMask[index] ?? 0, frame.edgeLabelFlags)) return
      if (!edgeAnchor(frame, index, anchor)) return
      if (anchor.x < -cullMargin || anchor.x > width + cullMargin) return
      if (anchor.y < -cullMargin || anchor.y > height + cullMargin) return
      const block = textBlock(
        atlas,
        label,
        null,
        edges.labelWeight[index] || primaryWeight,
        edges.labelFont[index] ?? null,
        edges.labelMaxWidth[index] ?? 0,
        size,
      )
      const background = edges.labelBackground[index] ?? noColor
      const plated = background !== noColor
      const scale = pixels / atlasFontSize
      const half = (block.width / 2 + (plated ? padUnits : 0)) * scale
      if (!all && half * 2 + edgeGap > anchor.room) return
      const total = block.height + plateDrop
      const top = plated ? -total / 2 : edgeDescent - block.height
      const above = plated ? 0 : Math.max(edges.width[index] ?? 0, 0.5) / 2 + edgeLabelGap
      const low = plated ? (-total / 2) * scale : top * scale - above
      const high = plated ? (total / 2) * scale : (top + block.height) * scale - above
      if (!this.#claim(anchor, half, low, high, (highlight && edgeForced(index)) || all)) return
      const target = highlight ? this.edgeHighlight : this.edgeMain
      const flags = edgeGlyph | (plated ? platedGlyph : 0)
      if (plated) {
        target.pushPlate(
          index,
          flags,
          0,
          0,
          block.width / 2 + padUnits,
          total / 2,
          background,
          size,
        )
      }
      const color = edges.labelColor[index] ?? noColor
      emit(target, index, flags, block, atlas.height, top, 0, 0, color, size)
      sink?.edge(
        index,
        {
          block,
          top,
          align: 0,
          shift: 0,
          placement: 0,
          plate: plated ? { cx: 0, cy: 0, hx: block.width / 2 + padUnits, hy: total / 2 } : null,
          background,
          color,
          size,
          highlight,
        },
        anchor,
      )
      placed++
      this.edgeLabels++
    }

    for (const index of highlighted) if (forced(index)) place(index, true)
    for (const index of highlightedEdges) if (edgeForced(index)) placeEdge(index, true)
    for (const index of highlighted) if (!forced(index)) place(index, true)
    for (const index of highlightedEdges) if (!edgeForced(index)) placeEdge(index, true)

    const xy = positions.xy
    const centerX = view.x - positions.originX
    const centerY = view.y - positions.originY
    if (all || frame.screenLabels || frame.largestLabel * shrink >= labelMin) {
      const order = frame.order
      const largest = nodes.size[order[0] ?? 0] ?? 0
      const reach =
        (cullMargin + (frame.screenLabels ? largest : largest * view.zoom) / 2) / view.zoom
      const left = centerX - width / 2 / view.zoom - reach
      const right = centerX + width / 2 / view.zoom + reach
      const top = centerY - height / 2 / view.zoom - reach
      const bottom = centerY + height / 2 / view.zoom + reach
      for (let at = 0; at < frame.orderLength && placed < limit; at++) {
        const index = order[at] ?? 0
        const x = xy[index * 2] ?? 0
        const y = xy[index * 2 + 1] ?? 0
        if (x < left || x > right || y < top || y > bottom) continue
        if (!highlighted.has(index)) place(index, false)
      }
    }

    if (!all && frame.largestEdgeLabel * shrink < labelMin) return
    const { source, target } = edges
    const reach = cullMargin / view.zoom
    const left = centerX - width / 2 / view.zoom - reach
    const right = centerX + width / 2 / view.zoom + reach
    const top = centerY - height / 2 / view.zoom - reach
    const bottom = centerY + height / 2 / view.zoom + reach
    for (let at = 0; at < frame.edgeOrderLength && placed < limit; at++) {
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
}

export interface EdgeLabelOrder {
  readonly length: number
  readonly largest: number
}

export function sortEdgesByWidth(edges: EdgeColumns, order: Uint32Array): EdgeLabelOrder {
  let length = 0
  let largest = 0
  for (let index = 0; index < edges.capacity; index++) {
    if (edges.alive[index] === 1 && edges.label[index]) {
      order[length++] = index
      largest = Math.max(largest, edges.labelSize[index] || edgeLabelSize)
    }
  }
  sortDescending(order, length, edges.width)
  return { length, largest }
}

const radixBits = 11
const radixMask = (1 << radixBits) - 1
const lastKey = 0xffffffff

export function sortDescending(order: Uint32Array, length: number, values: Float32Array): void {
  if (length < 2) return
  const bits = new Uint32Array(values.buffer, values.byteOffset, values.length)
  let keys = new Uint32Array(length)
  let items = order.slice(0, length)
  for (let at = 0; at < length; at++) {
    const index = items[at] ?? 0
    keys[at] = (values[index] ?? 0) > 0 ? lastKey - (bits[index] ?? 0) : lastKey
  }
  let nextKeys = new Uint32Array(length)
  let nextItems = new Uint32Array(length)
  const counts = new Uint32Array(radixMask + 1)
  for (let shift = 0; shift < 32; shift += radixBits) {
    counts.fill(0)
    for (let at = 0; at < length; at++) {
      const digit = ((keys[at] ?? 0) >>> shift) & radixMask
      counts[digit] = (counts[digit] ?? 0) + 1
    }
    if (counts[((keys[0] ?? 0) >>> shift) & radixMask] === length) continue
    let sum = 0
    for (let digit = 0; digit <= radixMask; digit++) {
      const count = counts[digit] ?? 0
      counts[digit] = sum
      sum += count
    }
    for (let at = 0; at < length; at++) {
      const key = keys[at] ?? 0
      const digit = (key >>> shift) & radixMask
      const to = counts[digit] ?? 0
      counts[digit] = to + 1
      nextKeys[to] = key
      nextItems[to] = items[at] ?? 0
    }
    ;[keys, nextKeys] = [nextKeys, keys]
    ;[items, nextItems] = [nextItems, items]
  }
  order.set(items)
}

export interface LabelOrder {
  readonly length: number
  readonly screenLabels: boolean
  readonly largest: number
}

export function sortBySize(nodes: NodeColumns, order: Uint32Array): LabelOrder {
  let length = 0
  let screenLabels = false
  let largest = 0
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] === 1 && nodes.label[index]) {
      order[length++] = index
      if (nodes.screenUnits[index] === 1) screenLabels = true
      largest = Math.max(largest, nodes.labelSize[index] || nodeLabelSize)
    }
  }
  sortDescending(order, length, nodes.size)
  return { length, screenLabels, largest }
}
