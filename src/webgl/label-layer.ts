import type { EdgeColumns, NodeColumns } from '../core/columns'
import { containerShape, noColor } from '../core/columns'
import {
  crossCubic,
  loopCurve,
  loopMinimum,
  loopReach,
  parallelCurve,
  pointOnCubic,
  tangentOnCubic,
} from '../core/edge-curve'
import type { EdgePaths, PathPoint, PathSpot } from '../core/edge-paths'
import { type ArcFrame, arcPoint, edgeRoute, screenOf } from '../core/geo-arc'
import { type GlobeCamera, globeScale, globeScreen } from '../core/globe'
import { primaryWeight, secondaryFactor, secondaryWeight } from '../core/label-width'
import {
  isBox,
  loopShift,
  type NodeBox,
  nodeBox,
  nodeTrim,
  nodeUnit,
  textInside,
  trimsAsBox,
} from '../core/node-shape'
import type { Positions } from '../core/positions'
import type { ShapeStore } from '../core/shape-store'
import { labelAlways, maxStates, noPaint, stateRow, wordFloat } from '../core/state-buffers'
import { edgeShown, nodeShown, type Sight, shapeShown } from '../core/visibility'
import type { LabelMode } from '../host/renderer'
import type { View } from '../types'
import { atlasFontSize, atlasWidth, type GlyphAtlas, type LineLayout } from './glyph-atlas'
import { glyphStride } from './glyph-attributes'
import {
  edgeDescent,
  edgeLabelGap,
  edgeLabelSize,
  endLabelGap,
  endLabelWidthUnit,
  insideGlyph,
  labelGap,
  nodeLabelSize,
  plateDrop,
  platePadX,
  uprightSlack,
} from './shaders'

export const lineHeight = 1.25
export { glyphStride, secondaryFactor }

const labelMin = 8
const cell = 8
const maxLabels = 4000
const cullMargin = 400
const forcedStates = 0b110
const builtInRaise = 0b111
const edgeGlyph = 8
const platedGlyph = 4
const edgeGap = 8
const padUnits = platePadX * atlasFontSize
const planPlacement = 7
const planScreen = 8
const planContainer = 16
const planPlated = 32
const maxExtentUnits = 4095
const arcSamples = 16

export interface LabelFrame {
  readonly nodes: NodeColumns
  readonly positions: Positions
  readonly view: View
  readonly sight?: Sight
  readonly width: number
  readonly height: number
  readonly nodeMask: Uint32Array
  readonly boxes?: Float32Array | null
  readonly labelFlags: Int8Array
  readonly highlighted: readonly number[]
  readonly raise?: number
  readonly others?: number
  readonly always?: readonly number[]
  readonly order: Uint32Array
  readonly orderLength: number
  readonly plan?: LabelPlan | null
  readonly screenLabels: boolean
  readonly largestLabel: number
  readonly edges: EdgeColumns
  readonly edgeMask: Uint32Array
  readonly edgeLabelFlags: Int8Array
  readonly highlightedEdges: readonly number[]
  readonly edgeRaise?: number
  readonly edgeOthers?: number
  readonly alwaysEdges?: readonly number[]
  readonly edgeOrder: Uint32Array
  readonly edgeOrderLength: number
  readonly largestEdgeLabel: number
  readonly stateNumbers?: Float32Array
  readonly statePaint?: Uint32Array
  readonly mode?: LabelMode
  readonly sink?: LabelSink
  readonly paths?: EdgePaths | null
  readonly globe?: GlobeCamera | null
  readonly shapes?: ShapeLabelFrame | null
}

export interface ShapeLabelFrame {
  readonly store: ShapeStore
  readonly mask: Uint32Array
  readonly flags: Int8Array
  readonly highlighted: readonly number[]
  readonly raise: number
  readonly others: number
  readonly always: readonly number[]
}

export type TextMeasure = Pick<GlyphAtlas, 'height' | 'generation' | 'line' | 'fit'>

export interface PlacedLabel {
  readonly block: TextBlock
  readonly top: number
  readonly align: number
  readonly shift: number
  readonly placement: number
  readonly inside: boolean
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
  readonly end: number
  readonly pixels: number
}

export interface LabelSink {
  node(index: number, label: PlacedLabel): void
  edge(index: number, label: PlacedLabel, anchor: Readonly<EdgeAnchor>): void
  shape?(index: number, label: PlacedLabel, x: number, y: number): void
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

export function labelLevel(mask: number, flags: Int8Array, others = 0): number {
  let bits = (mask | others) >>> 0
  while (bits !== 0) {
    const bit = 31 - Math.clz32(bits & -bits)
    bits &= bits - 1
    const flag = flags[((mask >>> bit) & 1) === 1 ? bit : maxStates + bit] ?? -1
    if (flag >= 0) return flag
  }
  return 1
}

function levelBits(flags: Int8Array, from: number, bits = 0xffffffff): number {
  let found = 0
  for (let bit = 0; bit < maxStates; bit++) {
    if (((bits >>> bit) & 1) === 1 && flags[from + bit] === labelAlways) found |= 1 << bit
  }
  return found >>> 0
}

export function stateOutline(
  paint: Uint32Array | undefined,
  mask: number,
  others: number,
  base: number,
): number {
  let rest = (mask | others) >>> 0
  if (!paint) rest = 0
  while (rest !== 0) {
    const bit = 31 - Math.clz32(rest & -rest)
    rest &= rest - 1
    const word = paint?.[stateRow('nodes', bit, ((mask >>> bit) & 1) === 1) * 4 + 3] ?? noPaint
    if (word !== noPaint) return Math.max(wordFloat(word), 0)
  }
  return Math.max(base, 0)
}

export function stateStroke(
  numbers: Float32Array | undefined,
  mask: number,
  others: number,
  base: number,
): number {
  let rest = (mask | others) >>> 0
  if (!numbers) rest = 0
  while (rest !== 0) {
    const bit = 31 - Math.clz32(rest & -rest)
    rest &= rest - 1
    const width = numbers?.[stateRow('edges', bit, ((mask >>> bit) & 1) === 1) * 4 + 1] ?? -1
    if (width >= 0) return width
  }
  return base
}

function lifted(pixels: number, size: number, level: number, minimum: number): number {
  return level === labelAlways ? Math.max(pixels, Math.min(size, minimum)) : pixels
}

function screenDiameter(nodes: NodeColumns, index: number, zoom: number): number {
  const size = nodes.size[index] ?? 0
  return nodes.screenUnits[index] === 1 ? size : size * zoom
}

function screenRadius(nodes: NodeColumns, index: number, zoom: number): number {
  return Math.max(screenDiameter(nodes, index, zoom) / 2, 1.25)
}

const boxScratch: NodeBox = { halfWidth: 0, halfHeight: 0, corner: 0 }

function chordReach(
  nodes: NodeColumns,
  index: number,
  zoom: number,
  dx: number,
  dy: number,
): number {
  if (!trimsAsBox(nodes, index)) return screenRadius(nodes, index, zoom)
  const length = Math.hypot(dx, dy)
  return length > 0
    ? nodeTrim(nodes, index, zoom, dx / length, dy / length)
    : screenRadius(nodes, index, zoom)
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

const pathPoints: [PathPoint, PathPoint, PathPoint] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
]

function pathAnchor(
  frame: Pick<LabelFrame, 'nodes' | 'edges' | 'positions' | 'view' | 'width' | 'height'>,
  paths: EdgePaths,
  index: number,
  out: EdgeAnchor,
): boolean {
  const { nodes, edges, positions, view, width, height } = frame
  const source = edges.source[index] ?? 0
  const target = edges.target[index] ?? 0
  const sx = positions.x(source)
  const sy = positions.y(source)
  const tx = positions.x(target)
  const ty = positions.y(target)
  const bend = edges.bend[index] ?? 0
  const middle = (paths.count(index) - 1) >> 1
  const [before, at, after] = pathPoints
  paths.point(index, middle - 1, sx, sy, tx, ty, bend, paths.mix, before)
  paths.point(index, middle, sx, sy, tx, ty, bend, paths.mix, at)
  paths.point(index, middle + 1, sx, sy, tx, ty, bend, paths.mix, after)
  const dx = after.x - before.x
  const dy = after.y - before.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return false
  const ux = dx / length
  const uy = dy / length
  out.x = (at.x - view.x) * view.zoom + width / 2
  out.y = (at.y - view.y) * view.zoom + height / 2
  const flip = ux < -uprightSlack || (Math.abs(ux) <= uprightSlack && uy < 0)
  out.ax = flip ? -ux : ux
  out.ay = flip ? -uy : uy
  const room = paths.rooms[index] ?? 0
  out.room =
    room > 0
      ? room * view.zoom
      : paths.length(index) * view.zoom -
        chordReach(nodes, source, view.zoom, tx - sx, ty - sy) -
        chordReach(nodes, target, view.zoom, tx - sx, ty - sy)
  return true
}

const arcPoints: [PathPoint, PathPoint, PathPoint, PathPoint] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
]

function arcAnchor(
  frame: Pick<LabelFrame, 'nodes' | 'edges' | 'positions'>,
  arc: ArcFrame,
  index: number,
  geodesic: boolean,
  out: EdgeAnchor,
): boolean {
  const { nodes, edges, positions } = frame
  const source = edges.source[index] ?? 0
  const target = edges.target[index] ?? 0
  const ax = positions.x(source)
  const ay = positions.y(source)
  const dx = positions.x(target)
  const dy = positions.y(target)
  const bend = edges.bend[index] ?? 0
  const [point, before, after, previous] = arcPoints
  let length = 0
  for (let k = 0; k <= 4; k++) {
    arcPoint(ax, ay, dx, dy, k / 4, bend, geodesic, point)
    screenOf(arc, point.x, point.y, point)
    if (k > 0) length += Math.hypot(point.x - previous.x, point.y - previous.y)
    previous.x = point.x
    previous.y = point.y
  }
  arcPoint(ax, ay, dx, dy, 0.5, bend, geodesic, point)
  if (screenOf(arc, point.x, point.y, point) < 0) return false
  arcPoint(ax, ay, dx, dy, 0.5 - 1 / 16, bend, geodesic, before)
  screenOf(arc, before.x, before.y, before)
  arcPoint(ax, ay, dx, dy, 0.5 + 1 / 16, bend, geodesic, after)
  screenOf(arc, after.x, after.y, after)
  const tx = after.x - before.x
  const ty = after.y - before.y
  const span = Math.hypot(tx, ty)
  if (span === 0) return false
  const ux = tx / span
  const uy = ty / span
  out.x = point.x
  out.y = point.y
  const flip = ux < -uprightSlack || (Math.abs(ux) <= uprightSlack && uy < 0)
  out.ax = flip ? -ux : ux
  out.ay = flip ? -uy : uy
  const scale = (y: number) => (arc.globe ? globeScale(arc.globe, y) : arc.zoom)
  out.room =
    length -
    chordReach(nodes, source, scale(ay), dx - ax, dy - ay) -
    chordReach(nodes, target, scale(dy), dx - ax, dy - ay)
  return true
}

const fixedSpot: PathSpot = { x: 0, y: 0, dx: 0, dy: 0 }
const fixedPoints: [PathPoint, PathPoint, PathPoint, PathPoint] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
]

function fixedAnchor(
  frame: Pick<LabelFrame, 'nodes' | 'edges' | 'positions' | 'view' | 'width' | 'height' | 'globe'>,
  paths: EdgePaths,
  index: number,
  out: EdgeAnchor,
): boolean {
  const { nodes, edges, positions, view, width, height } = frame
  const globe = frame.globe && frame.globe.mix > 0 ? frame.globe : null
  const project = (x: number, y: number, at: PathPoint): boolean => {
    if (globe) return globeScreen(globe, x, y, at) >= 0
    at.x = (x - view.x) * view.zoom + width / 2
    at.y = (y - view.y) * view.zoom + height / 2
    return true
  }
  const source = edges.source[index] ?? 0
  const target = edges.target[index] ?? 0
  const sx = positions.x(source)
  const sy = positions.y(source)
  const tx = positions.x(target)
  const ty = positions.y(target)
  const count = paths.count(index)
  const [a, p, q, d] = fixedPoints
  paths.point(index, 1, sx, sy, tx, ty, 0, 1, p)
  paths.point(index, count - 2, sx, sy, tx, ty, 0, 1, q)
  paths.point(index, count - 1, sx, sy, tx, ty, 0, 1, d)
  const zoom = globe ? globeScale(globe, p.y) : view.zoom
  const start = chordReach(nodes, source, zoom, p.x - sx, p.y - sy)
  const end = chordReach(nodes, target, zoom, q.x - d.x, q.y - d.y)
  const total = paths.fixedLength(index, sx, sy, tx, ty)
  const goal = Math.min(total, Math.max(0, (total + (start - end) / zoom) / 2))
  paths.fixedAt(index, sx, sy, tx, ty, goal, fixedSpot)
  const span = Math.hypot(fixedSpot.dx, fixedSpot.dy)
  if (span === 0) return false
  const step = Math.min(span, 1 / zoom) / span
  if (!project(fixedSpot.x, fixedSpot.y, a)) return false
  project(fixedSpot.x - fixedSpot.dx * step, fixedSpot.y - fixedSpot.dy * step, p)
  project(fixedSpot.x + fixedSpot.dx * step, fixedSpot.y + fixedSpot.dy * step, q)
  const ux = q.x - p.x
  const uy = q.y - p.y
  const length = Math.hypot(ux, uy)
  if (length === 0) return false
  out.x = a.x
  out.y = a.y
  const flip = ux < -uprightSlack * length || (Math.abs(ux) <= uprightSlack * length && uy < 0)
  out.ax = (flip ? -ux : ux) / length
  out.ay = (flip ? -uy : uy) / length
  out.room = total * zoom - start - end
  return true
}

export function edgeAnchor(
  frame: Pick<
    LabelFrame,
    'nodes' | 'edges' | 'positions' | 'view' | 'width' | 'height' | 'paths' | 'globe'
  >,
  index: number,
  out: EdgeAnchor,
): boolean {
  const { nodes, edges, positions, view, width, height, paths } = frame
  if (paths?.isFixed(index)) return fixedAnchor(frame, paths, index, out)
  if (paths && paths.count(index) > 1) return pathAnchor(frame, paths, index, out)
  const source = edges.source[index] ?? 0
  const target = edges.target[index] ?? 0
  const globe = frame.globe && frame.globe.mix > 0 ? frame.globe : null
  const geodesic = edges.geodesic[index] === 1
  if (source !== target && (globe || geodesic)) {
    const arc: ArcFrame = { x: view.x, y: view.y, zoom: view.zoom, width, height, globe }
    const ax = positions.x(source)
    const ay = positions.y(source)
    const dx = positions.x(target)
    const dy = positions.y(target)
    const route = edgeRoute(arc, ax, ay, dx, dy, geodesic)
    if (route === 2) return false
    if (route === 1) return arcAnchor(frame, arc, index, geodesic, out)
  }
  const at = arcPoints[0]
  if (globe && globeScreen(globe, positions.x(source), positions.y(source), at) < 0) return false
  const sx = globe ? at.x : (positions.x(source) - view.x) * view.zoom + width / 2
  const sy = globe ? at.y : (positions.y(source) - view.y) * view.zoom + height / 2
  const sourceZoom = globe ? globeScale(globe, positions.y(source)) : view.zoom
  const sourceRadius = screenRadius(nodes, source, sourceZoom)
  const bend = edges.bend[index] ?? 0
  if (source === target) {
    const reach = loopReach(sourceRadius, bend, loopMinimum)
    out.x = sx + loopShift(nodes, source, sourceZoom) + reach * Math.SQRT1_2
    out.y = sy - reach * Math.SQRT1_2
    out.ax = Math.SQRT1_2
    out.ay = Math.SQRT1_2
    out.room = Number.POSITIVE_INFINITY
    return true
  }
  if (globe && globeScreen(globe, positions.x(target), positions.y(target), at) < 0) return false
  const tx = globe ? at.x : (positions.x(target) - view.x) * view.zoom + width / 2
  const ty = globe ? at.y : (positions.y(target) - view.y) * view.zoom + height / 2
  const length = Math.hypot(tx - sx, ty - sy)
  if (length === 0) return false
  const ux = (tx - sx) / length
  const uy = (ty - sy) / length
  const targetZoom = globe ? globeScale(globe, positions.y(target)) : view.zoom
  const sourceReach = trimsAsBox(nodes, source)
    ? nodeTrim(nodes, source, sourceZoom, ux, uy)
    : sourceRadius
  const targetReach = trimsAsBox(nodes, target)
    ? nodeTrim(nodes, target, targetZoom, ux, uy)
    : screenRadius(nodes, target, targetZoom)
  const shift = (sourceReach - targetReach) / 2
  out.x = (sx + tx) / 2 + ux * shift - uy * bend * length
  out.y = (sy + ty) / 2 + uy * shift + ux * bend * length
  const flip = ux < -uprightSlack || (Math.abs(ux) <= uprightSlack && uy < 0)
  out.ax = flip ? -ux : ux
  out.ay = flip ? -uy : uy
  out.room = length - sourceReach - targetReach
  return true
}

const endPoints: [PathPoint, PathPoint, PathPoint, PathPoint] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
]

function aim(out: EdgeAnchor, x: number, y: number, dx: number, dy: number): boolean {
  const length = Math.hypot(dx, dy)
  if (length === 0) return false
  const ux = dx / length
  const uy = dy / length
  const flip = ux < -uprightSlack || (Math.abs(ux) <= uprightSlack && uy < 0)
  out.x = x
  out.y = y
  out.ax = flip ? -ux : ux
  out.ay = flip ? -uy : uy
  return true
}

export function endAnchor(
  frame: Pick<
    LabelFrame,
    'nodes' | 'edges' | 'positions' | 'view' | 'width' | 'height' | 'paths' | 'globe'
  >,
  index: number,
  first: boolean,
  reach: number,
  out: EdgeAnchor,
): boolean {
  const { edges, positions, view, width, height, paths } = frame
  const source = edges.source[index] ?? 0
  const target = edges.target[index] ?? 0
  const globe = frame.globe && frame.globe.mix > 0 ? frame.globe : null
  const [a, d, point, previous] = endPoints
  const project = (x: number, y: number, at: PathPoint): boolean => {
    if (globe) return globeScreen(globe, x, y, at) >= 0
    at.x = (x - view.x) * view.zoom + width / 2
    at.y = (y - view.y) * view.zoom + height / 2
    return true
  }
  const ax = positions.x(source)
  const ay = positions.y(source)
  const dx = positions.x(target)
  const dy = positions.y(target)
  const frontA = project(ax, ay, a)
  const frontD = project(dx, dy, d)
  if (!(first ? frontA : frontD)) return false
  const cx = first ? a.x : d.x
  const cy = first ? a.y : d.y
  out.room = Number.POSITIVE_INFINITY
  const bend = edges.bend[index] ?? 0
  const geodesic = edges.geodesic[index] === 1
  const bundled = paths !== null && paths !== undefined && paths.count(index) > 1
  let route = 0
  if (!bundled && source !== target && (globe || geodesic)) {
    const arc: ArcFrame = { x: view.x, y: view.y, zoom: view.zoom, width, height, globe }
    route = edgeRoute(arc, ax, ay, dx, dy, geodesic)
    if (route === 2) return false
  }
  if (bundled || route === 1) {
    const arc: ArcFrame = { x: view.x, y: view.y, zoom: view.zoom, width, height, globe }
    const count = bundled ? paths.count(index) : arcSamples + 1
    const copy = bundled && !first ? paths.wraps(index, ax, dx, point) : null
    const shift = bundled
      ? copy
        ? copy.x - copy.y
        : 0
      : first
        ? 0
        : dx - arcPoint(ax, ay, dx, dy, 1, bend, geodesic, point).x
    previous.x = cx
    previous.y = cy
    let before = 0
    for (let k = 1; k < count; k++) {
      const at = first ? k : count - 1 - k
      if (bundled) {
        paths.point(index, at, ax, ay, dx, dy, bend, paths.mix, point)
        project(point.x + shift, point.y, point)
      } else {
        arcPoint(ax, ay, dx, dy, at / (count - 1), bend, geodesic, point)
        screenOf(arc, point.x + shift, point.y, point)
      }
      const gap = Math.hypot(point.x - cx, point.y - cy)
      if (gap >= reach || k === count - 1) {
        const f = gap > before ? Math.min(1, Math.max(0, (reach - before) / (gap - before))) : 1
        const sx = first ? point.x - previous.x : previous.x - point.x
        const sy = first ? point.y - previous.y : previous.y - point.y
        return aim(
          out,
          previous.x + (point.x - previous.x) * f,
          previous.y + (point.y - previous.y) * f,
          sx,
          sy,
        )
      }
      previous.x = point.x
      previous.y = point.y
      before = gap
    }
    return false
  }
  if (source === target || bend !== 0) {
    const sourceZoom = globe ? globeScale(globe, ay) : view.zoom
    const radius = screenRadius(frame.nodes, source, sourceZoom)
    if (source === target) {
      a.x += loopShift(frame.nodes, source, sourceZoom)
      d.x = a.x
      d.y = a.y
    }
    const curve =
      source === target
        ? loopCurve(a.x, a.y, loopReach(radius, bend, loopMinimum))
        : parallelCurve(a.x, a.y, d.x, d.y, bend)
    const apex = pointOnCubic(curve, 0.5)
    if (source === target && Math.hypot(apex.x - a.x, apex.y - a.y) < reach) return false
    const t = first
      ? crossCubic(curve, a.x, a.y, reach, 0, 0.5, true)
      : crossCubic(curve, d.x, d.y, reach, 0.5, 1, false)
    const at = pointOnCubic(curve, t)
    const tangent = tangentOnCubic(curve, t)
    return aim(out, at.x, at.y, tangent.x, tangent.y)
  }
  const ux = d.x - a.x
  const uy = d.y - a.y
  const length = Math.hypot(ux, uy)
  if (length === 0) return false
  const side = first ? reach : -reach
  return aim(out, cx + (ux / length) * side, cy + (uy / length) * side, ux, uy)
}

const placementDirections: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 0],
]

class TextExtents {
  #sizes: Float32Array = new Float32Array(0)
  #generation = -1

  prepare(capacity: number, generation: number): void {
    if (generation !== this.#generation) {
      this.#generation = generation
      this.#sizes.fill(Number.NaN)
    }
    if (this.#sizes.length >= capacity * 2) return
    const sizes = new Float32Array(Math.max(128, capacity * 2)).fill(Number.NaN)
    sizes.set(this.#sizes)
    this.#sizes = sizes
  }

  has(index: number): boolean {
    return !Number.isNaN(this.#sizes[index * 2] ?? Number.NaN)
  }

  width(index: number): number {
    return this.#sizes[index * 2] ?? 0
  }

  height(index: number): number {
    return this.#sizes[index * 2 + 1] ?? 0
  }

  set(index: number, block: TextBlock): void {
    if (index * 2 + 1 >= this.#sizes.length) return
    this.#sizes[index * 2] = block.width
    this.#sizes[index * 2 + 1] = block.height
  }

  forget(index: number): void {
    if (index * 2 < this.#sizes.length) this.#sizes[index * 2] = Number.NaN
  }

  reset(): void {
    this.#generation = -1
  }
}

interface BoxEdges {
  left: number
  top: number
  right: number
  bottom: number
}

function boxEdges(
  out: BoxEdges,
  ox: number,
  oy: number,
  placement: number,
  plated: boolean,
  blockWidth: number,
  blockHeight: number,
  scale: number,
): void {
  const total = blockHeight + (plated ? plateDrop : 0)
  const top = placement === 0 ? 0 : placement === 1 ? -total : -total / 2
  const align = placement === 2 ? 1 : placement === 3 ? -1 : 0
  const shift = plated ? align * padUnits : 0
  const textLeft = shift + (align - 1) * (blockWidth / 2)
  const textRight = shift + (align + 1) * (blockWidth / 2)
  const hx = blockWidth / 2 + padUnits
  const cx = (textLeft + textRight) / 2
  out.left = ox + (plated ? cx - hx : textLeft) * scale
  out.right = ox + (plated ? cx + hx : textRight) * scale
  out.top = oy + top * scale
  out.bottom = oy + (top + (plated ? total : blockHeight)) * scale
}

export class LabelLayer {
  readonly main: GlyphBuffer = new GlyphBuffer()
  readonly highlight: GlyphBuffer = new GlyphBuffer()
  readonly edgeMain: GlyphBuffer = new GlyphBuffer()
  readonly edgeHighlight: GlyphBuffer = new GlyphBuffer()
  readonly shapeMain: GlyphBuffer = new GlyphBuffer()
  readonly shapeHighlight: GlyphBuffer = new GlyphBuffer()
  nodeLabels = 0
  edgeLabels = 0
  shapeLabels = 0
  #occupancy: Uint8Array = new Uint8Array(0)
  #cols = 0
  #rows = 0
  readonly #anchor: EdgeAnchor = { x: 0, y: 0, ax: 1, ay: 0, room: 0 }
  readonly #end: EdgeAnchor = { x: 0, y: 0, ax: 1, ay: 0, room: 0 }
  readonly #box: BoxEdges = { left: 0, top: 0, right: 0, bottom: 0 }
  readonly #nodeExtents: TextExtents = new TextExtents()
  readonly #edgeExtents: TextExtents = new TextExtents()
  readonly #endExtents: TextExtents = new TextExtents()
  readonly #shapeExtents: TextExtents = new TextExtents()
  #shapeStore: ShapeStore | null = null
  #shapeLabelVersion = -1

  forgetNode(index: number): void {
    this.#nodeExtents.forget(index)
  }

  forgetEdge(index: number): void {
    this.#edgeExtents.forget(index)
    this.#endExtents.forget(index * 2)
    this.#endExtents.forget(index * 2 + 1)
  }

  #claimBox(left: number, top: number, right: number, bottom: number, force: boolean): boolean {
    const cols = this.#cols
    const c0 = Math.max(0, Math.floor(left / cell))
    const c1 = Math.min(cols - 1, Math.floor(right / cell))
    const r0 = Math.max(0, Math.floor(top / cell))
    const r1 = Math.min(this.#rows - 1, Math.floor(bottom / cell))
    if (c1 < c0 || r1 < r0) return false
    const occupancy = this.#occupancy
    if (!force) {
      if (occupancy[((r0 + r1) >> 1) * cols + ((c0 + c1) >> 1)] === 1) return false
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) if (occupancy[row * cols + col] === 1) return false
      }
    }
    for (let row = r0; row <= r1; row++) occupancy.fill(1, row * cols + c0, row * cols + c1 + 1)
    return true
  }

  #taken(left: number, top: number, right: number, bottom: number): boolean {
    const cols = this.#cols
    const c0 = Math.max(0, Math.floor(left / cell))
    const c1 = Math.min(cols - 1, Math.floor(right / cell))
    const r0 = Math.max(0, Math.floor(top / cell))
    const r1 = Math.min(this.#rows - 1, Math.floor(bottom / cell))
    if (c1 < c0 || r1 < r0) return true
    const occupancy = this.#occupancy
    if (occupancy[((r0 + r1) >> 1) * cols + ((c0 + c1) >> 1)] === 1) return true
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) if (occupancy[row * cols + col] === 1) return true
    }
    return false
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

  #blocked(
    plan: LabelPlan,
    at: number,
    x: number,
    y: number,
    zoom: number,
    shrink: number,
    level: number,
    lift: number,
  ): boolean {
    const meta = plan.meta[at] ?? 0
    if ((meta & planContainer) !== 0) return false
    const screenUnits = (meta & planScreen) !== 0
    const base = plan.pixels[at] ?? nodeLabelSize
    const pixels = lifted(base * (screenUnits ? 1 : shrink), base, level, labelMin)
    if (pixels < labelMin && level !== labelAlways) return true
    const size = plan.size[at] ?? 0
    const diameter = screenUnits ? size : size * zoom
    const minimum = plan.minimum[at] ?? 0
    if (minimum > 0 && diameter < minimum && level !== labelAlways) return true
    const placement = meta & planPlacement
    const [dx, dy] = placementDirections[placement] ?? [0, 1]
    const reach = placement === 4 ? 0 : Math.max(diameter / 2, 1.25) + lift
    const blockWidth = plan.width[at] ?? Number.NaN
    if (!Number.isNaN(blockWidth)) {
      const box = this.#box
      const plated = (meta & planPlated) !== 0
      boxEdges(
        box,
        x + dx * reach,
        y + dy * reach,
        placement,
        plated,
        blockWidth,
        plan.height[at] ?? 0,
        pixels / atlasFontSize,
      )
      return this.#taken(box.left, box.top, box.right, box.bottom)
    }
    const px = x + dx * (reach + 1)
    const py = y + dy * (reach + 1)
    if (px < 0 || py < 0) return false
    const col = Math.floor(px / cell)
    const row = Math.floor(py / cell)
    if (col >= this.#cols || row >= this.#rows) return false
    return this.#occupancy[row * this.#cols + col] === 1
  }

  select(frame: LabelFrame, atlas: TextMeasure): void {
    this.main.clear()
    this.highlight.clear()
    this.edgeMain.clear()
    this.edgeHighlight.clear()
    this.shapeMain.clear()
    this.shapeHighlight.clear()
    this.nodeLabels = 0
    this.edgeLabels = 0
    this.shapeLabels = 0
    const { nodes, edges, positions, view, width, height } = frame
    const sight: Sight = frame.sight ?? { zoom: view.zoom, time: null, layers: null, hide: null }
    this.#nodeExtents.prepare(nodes.capacity, atlas.generation)
    this.#edgeExtents.prepare(edges.capacity, atlas.generation)
    if (edges.ends) this.#endExtents.prepare(edges.capacity * 2, atlas.generation)
    this.#cols = Math.ceil(width / cell) + 1
    this.#rows = Math.ceil(height / cell) + 1
    const cells = this.#cols * this.#rows
    if (this.#occupancy.length < cells) this.#occupancy = new Uint8Array(cells)
    else this.#occupancy.fill(0, 0, cells)
    const highlighted = frame.highlighted
    const highlightedEdges = frame.highlightedEdges
    const raise = frame.raise ?? builtInRaise
    const edgeRaise = frame.edgeRaise ?? builtInRaise
    const raised = (index: number) => ((frame.nodeMask[index] ?? 0) & raise) !== 0
    const edgeRaised = (index: number) => ((frame.edgeMask[index] ?? 0) & edgeRaise) !== 0
    const others = frame.others ?? 0
    const edgeOthers = frame.edgeOthers ?? 0
    const outlineAt = (index: number): number =>
      stateOutline(
        frame.statePaint,
        frame.nodeMask[index] ?? 0,
        others,
        nodes.outlineWidth[index] ?? 0,
      )
    const strokeAt = (index: number, base: number): number =>
      stateStroke(frame.stateNumbers, frame.edgeMask[index] ?? 0, edgeOthers, base)
    const level = (index: number) =>
      labelLevel(frame.nodeMask[index] ?? 0, frame.labelFlags, others)
    const edgeLevel = (index: number) =>
      labelLevel(frame.edgeMask[index] ?? 0, frame.edgeLabelFlags, edgeOthers)
    const alwaysBits = levelBits(frame.labelFlags, 0)
    const edgeAlwaysBits = levelBits(frame.edgeLabelFlags, 0)
    const early = (index: number) =>
      ((frame.nodeMask[index] ?? 0) & alwaysBits) !== 0 && level(index) === labelAlways
    const edgeEarly = (index: number) =>
      ((frame.edgeMask[index] ?? 0) & edgeAlwaysBits) !== 0 && edgeLevel(index) === labelAlways
    const othersAlways = levelBits(frame.labelFlags, maxStates, others) !== 0
    const edgeOthersAlways = levelBits(frame.edgeLabelFlags, maxStates, edgeOthers) !== 0
    const shrink = Math.min(1, view.zoom)
    const all = frame.mode === 'all'
    const sink = frame.sink
    const limit = all ? Number.POSITIVE_INFINITY : maxLabels
    const minimumPixels = all ? 0 : labelMin
    let placed = 0
    if (frame.mode === 'none') return

    const forced = (index: number) => ((frame.nodeMask[index] ?? 0) & forcedStates) !== 0
    const edgeForced = (index: number) => ((frame.edgeMask[index] ?? 0) & forcedStates) !== 0

    const plan = all ? null : (frame.plan ?? null)
    const globe = frame.globe && frame.globe.mix > 0 ? frame.globe : null
    const projected = { x: 0, y: 0 }
    const place = (index: number, highlight: boolean, rank = -1, sx = 0, sy = 0): void => {
      const force = highlight && forced(index)
      const label = nodes.label[index]
      if (!label || nodes.alive[index] !== 1 || !nodeShown(nodes, index, sight)) return
      const shown = level(index)
      if (shown === 0) return
      const always = shown === labelAlways
      const screenUnits = nodes.screenUnits[index] === 1
      const size = nodes.labelSize[index] || nodeLabelSize
      const pixels = lifted(screenUnits ? size : size * shrink, size, shown, minimumPixels)
      if (pixels < minimumPixels && !always) return
      const zoom = globe ? globeScale(globe, positions.y(index)) : view.zoom
      const minimum = nodes.labelMinScreenSize[index] ?? 0
      const small = minimum > 0 && screenDiameter(nodes, index, zoom) < minimum
      if (!force && !all && !always && small) return
      if (rank < 0 && globe) {
        if (globeScreen(globe, positions.x(index), positions.y(index), projected) < 0) return
      }
      const flatX = (positions.x(index) - view.x) * view.zoom + width / 2
      const flatY = (positions.y(index) - view.y) * view.zoom + height / 2
      const x = rank >= 0 ? sx : globe ? projected.x : flatX
      const y = rank >= 0 ? sy : globe ? projected.y : flatY
      const box = nodes.shape[index] === containerShape ? frame.boxes : null
      if (!box && (x < -cullMargin || x > width + cullMargin)) return
      if (!box && (y < -cullMargin || y > height + cullMargin)) return
      const measure = (): TextBlock =>
        textBlock(
          atlas,
          label,
          nodes.secondary[index] ?? null,
          nodes.labelWeight[index] || primaryWeight,
          nodes.labelFont[index] ?? null,
          nodes.labelMaxWidth[index] ?? 0,
          size,
        )
      const extents = this.#nodeExtents
      let measured = extents.has(index) ? null : measure()
      if (measured) extents.set(index, measured)
      const blockWidth = extents.width(index)
      const blockHeight = extents.height(index)
      if (plan && rank >= 0) {
        plan.width[rank] = blockWidth
        plan.height[rank] = blockHeight
      }
      const background = nodes.labelBackground[index] ?? noColor
      const plated = background !== noColor
      const placement = nodes.labelPlacement[index] ?? 0
      const [dx, dy] = placementDirections[placement] ?? [0, 1]
      const total = blockHeight + (plated ? plateDrop : 0)
      const top = placement === 0 ? 0 : placement === 1 ? -total : -total / 2
      const align = placement === 2 ? 1 : placement === 3 ? -1 : 0
      const shift = plated ? align * padUnits : 0
      const textLeft = shift + (align - 1) * (blockWidth / 2)
      const textRight = shift + (align + 1) * (blockWidth / 2)
      const hx = blockWidth / 2 + padUnits
      const hy = total / 2
      const cx = (textLeft + textRight) / 2
      const cy = top + hy
      const reach =
        placement === 4
          ? 0
          : (box
              ? (box[index * 4 + (dx !== 0 ? 0 : 1)] ?? 0) * zoom
              : dx !== 0 && isBox(nodes, index)
                ? nodeBox(nodes, index, nodeUnit(nodes, index, zoom), boxScratch).halfWidth
                : screenRadius(nodes, index, zoom)) +
            outlineAt(index) +
            labelGap
      const scale = pixels / atlasFontSize
      const edges = this.#box
      boxEdges(
        edges,
        x + dx * reach,
        y + dy * reach,
        placement,
        plated,
        blockWidth,
        blockHeight,
        scale,
      )
      const { left, right, top: boxTop, bottom: boxBottom } = edges
      if (right < 0 || left > width || boxBottom < 0 || boxTop > height) return
      if (!this.#claimBox(left, boxTop, right, boxBottom, force || all)) return
      measured ??= measure()
      const block = measured
      const target = highlight ? this.highlight : this.main
      const inside =
        placement === 4 &&
        !plated &&
        !box &&
        textInside(nodes, index, zoom, blockWidth * scale, blockHeight * scale)
      const flags = (placement << 4) | (plated ? platedGlyph : 0) | (inside ? insideGlyph : 0)
      if (plated) target.pushPlate(index, flags, cx, cy, hx, hy, background, size)
      const color = nodes.labelColor[index] ?? noColor
      emit(target, index, flags, block, atlas.height, top, align, shift, color, size)
      sink?.node(index, {
        block,
        top,
        align,
        shift,
        placement,
        inside,
        plate: plated ? { cx, cy, hx, hy } : null,
        background,
        color,
        size,
        highlight,
        end: 0,
        pixels,
      })
      placed++
      this.nodeLabels++
    }

    const anchor = this.#anchor
    const endSpot = this.#end
    const placeEnd = (
      index: number,
      highlight: boolean,
      end: 1 | 2,
      room: number,
      shown: number,
    ): void => {
      const ends = edges.ends
      const id = index * 2 + end - 1
      const label = ends?.label[id]
      if (!ends || !label || placed >= limit) return
      const size = ends.labelSize[id] || edgeLabelSize
      const pixels = lifted(size * shrink, size, shown, minimumPixels)
      if (pixels < minimumPixels && shown !== labelAlways) return
      const measure = (): TextBlock =>
        textBlock(
          atlas,
          label,
          null,
          ends.labelWeight[id] || primaryWeight,
          ends.labelFont[id] ?? null,
          ends.labelMaxWidth[id] ?? 0,
          size,
        )
      const extents = this.#endExtents
      let measured = extents.has(id) ? null : measure()
      if (measured) extents.set(id, measured)
      const blockWidth = extents.width(id)
      const blockHeight = extents.height(id)
      const background = ends.labelBackground[id] ?? noColor
      const plated = background !== noColor
      const scale = pixels / atlasFontSize
      const units = Math.min(maxExtentUnits, Math.ceil(blockWidth / 2 + (plated ? padUnits : 0)))
      const half = units * scale
      const lineWidth = Math.max(ends.width[id] ?? 0, 0.5)
      const widthBits = Math.min(maxExtentUnits, Math.round(lineWidth * endLabelWidthUnit))
      const drawn = Math.max(strokeAt(index, widthBits / endLabelWidthUnit), 0.5)
      const headed = ((edges.arrow[index] ?? 0) & end) !== 0
      const arrow = headed ? Math.max(drawn * 4, 6) : 0
      if (!all && endLabelGap + arrow + half * 2 > room) return
      const node = (end === 1 ? edges.source[index] : edges.target[index]) ?? 0
      const zoom = globe ? globeScale(globe, positions.y(node)) : view.zoom
      const chordX = positions.x(edges.target[index] ?? 0) - positions.x(edges.source[index] ?? 0)
      const chordY = positions.y(edges.target[index] ?? 0) - positions.y(edges.source[index] ?? 0)
      const reach = chordReach(nodes, node, zoom, chordX, chordY) + endLabelGap + arrow + half
      if (!endAnchor(frame, index, end === 1, reach, endSpot)) return
      if (endSpot.x < -cullMargin || endSpot.x > width + cullMargin) return
      if (endSpot.y < -cullMargin || endSpot.y > height + cullMargin) return
      const total = blockHeight + plateDrop
      const top = plated ? -total / 2 : edgeDescent - blockHeight
      const above = plated ? 0 : drawn / 2 + edgeLabelGap
      const low = plated ? (-total / 2) * scale : top * scale - above
      const high = plated ? (total / 2) * scale : (top + blockHeight) * scale - above
      if (!this.#claim(endSpot, half, low, high, (highlight && edgeForced(index)) || all)) return
      measured ??= measure()
      const block = measured
      const target = highlight ? this.edgeHighlight : this.edgeMain
      const flags =
        edgeGlyph | (plated ? platedGlyph : 0) | (end << 4) | (units << 8) | (widthBits << 20)
      const hx = block.width / 2 + padUnits
      if (plated) target.pushPlate(index, flags, 0, 0, hx, total / 2, background, size)
      const color = ends.labelColor[id] ?? noColor
      emit(target, index, flags, block, atlas.height, top, 0, 0, color, size)
      sink?.edge(
        index,
        {
          block,
          top,
          align: 0,
          shift: 0,
          placement: 0,
          inside: false,
          plate: plated ? { cx: 0, cy: 0, hx, hy: total / 2 } : null,
          background,
          color,
          size,
          highlight,
          end,
          pixels,
        },
        endSpot,
      )
      placed++
      this.edgeLabels++
    }
    const placeEdge = (index: number, highlight: boolean): void => {
      const label = edges.label[index]
      const ends = edges.ends
      const endLabels =
        ends !== null && ends.labeled > 0 && !!(ends.label[index * 2] || ends.label[index * 2 + 1])
      if (!label && !endLabels) return
      if (edges.alive[index] !== 1 || !edgeShown(nodes, edges, index, sight)) return
      const shown = edgeLevel(index)
      if (shown === 0) return
      if (!edgeAnchor(frame, index, anchor)) return
      const room = anchor.room
      if (label) placeMiddle(index, highlight, label, shown)
      if (endLabels) {
        placeEnd(index, highlight, 1, room, shown)
        placeEnd(index, highlight, 2, room, shown)
      }
    }
    const placeMiddle = (index: number, highlight: boolean, label: string, shown: number): void => {
      const size = edges.labelSize[index] || edgeLabelSize
      const pixels = lifted(size * shrink, size, shown, minimumPixels)
      if (pixels < minimumPixels && shown !== labelAlways) return
      if (anchor.x < -cullMargin || anchor.x > width + cullMargin) return
      if (anchor.y < -cullMargin || anchor.y > height + cullMargin) return
      const measure = (): TextBlock =>
        textBlock(
          atlas,
          label,
          null,
          edges.labelWeight[index] || primaryWeight,
          edges.labelFont[index] ?? null,
          edges.labelMaxWidth[index] ?? 0,
          size,
        )
      const extents = this.#edgeExtents
      let measured = extents.has(index) ? null : measure()
      if (measured) extents.set(index, measured)
      const blockWidth = extents.width(index)
      const blockHeight = extents.height(index)
      const background = edges.labelBackground[index] ?? noColor
      const plated = background !== noColor
      const scale = pixels / atlasFontSize
      const half = (blockWidth / 2 + (plated ? padUnits : 0)) * scale
      if (!all && half * 2 + edgeGap > anchor.room) return
      const total = blockHeight + plateDrop
      const top = plated ? -total / 2 : edgeDescent - blockHeight
      const stroke = strokeAt(index, edges.width[index] ?? 0)
      const above = plated ? 0 : Math.max(stroke, 0.5) / 2 + edgeLabelGap
      const low = plated ? (-total / 2) * scale : top * scale - above
      const high = plated ? (total / 2) * scale : (top + blockHeight) * scale - above
      if (!this.#claim(anchor, half, low, high, (highlight && edgeForced(index)) || all)) return
      measured ??= measure()
      const block = measured
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
          inside: false,
          plate: plated ? { cx: 0, cy: 0, hx: block.width / 2 + padUnits, hy: total / 2 } : null,
          background,
          color,
          size,
          highlight,
          end: 0,
          pixels,
        },
        anchor,
      )
      placed++
      this.edgeLabels++
    }

    const shapeFrame = frame.shapes ?? null
    const store = shapeFrame?.store ?? null
    const texts = store?.labels ?? null
    const shapeMask = shapeFrame?.mask
    const shapeFlags = shapeFrame?.flags
    const shapeOthers = shapeFrame?.others ?? 0
    const shapeRaise = shapeFrame?.raise ?? builtInRaise
    const shapeLevel = (index: number) =>
      shapeFlags ? labelLevel(shapeMask?.[index] ?? 0, shapeFlags, shapeOthers) : 1
    const shapeAlwaysBits = shapeFlags ? levelBits(shapeFlags, 0) : 0
    const shapeOthersAlways =
      shapeFlags !== undefined && levelBits(shapeFlags, maxStates, shapeOthers) !== 0
    const shapeForced = (index: number) => ((shapeMask?.[index] ?? 0) & forcedStates) !== 0
    const shapeRaised = (index: number) => ((shapeMask?.[index] ?? 0) & shapeRaise) !== 0
    const shapeEarly = (index: number) =>
      ((shapeMask?.[index] ?? 0) & shapeAlwaysBits) !== 0 && shapeLevel(index) === labelAlways
    if (store && texts) {
      if (store !== this.#shapeStore || store.labelVersion !== this.#shapeLabelVersion) {
        this.#shapeStore = store
        this.#shapeLabelVersion = store.labelVersion
        this.#shapeExtents.reset()
      }
      this.#shapeExtents.prepare(store.capacity, atlas.generation)
    }
    const placeShape = (index: number, highlight: boolean): void => {
      const label = texts?.text[index]
      if (!store || !texts || !label || placed >= limit || store.alive[index] !== 1) return
      if (!shapeShown(store, index, sight)) return
      const shown = shapeLevel(index)
      if (shown === 0) return
      const size = texts.labelSize[index] || nodeLabelSize
      const pixels = lifted(size * shrink, size, shown, minimumPixels)
      if (pixels < minimumPixels && shown !== labelAlways) return
      if (!store.labelAnchor(index)) return
      const node = store.pinNode?.[index] ?? -1
      const wx = (texts.anchor[index * 2] ?? 0) + (node >= 0 ? positions.x(node) : 0)
      const wy = (texts.anchor[index * 2 + 1] ?? 0) + (node >= 0 ? positions.y(node) : 0)
      let x = (wx - view.x) * view.zoom + width / 2
      let y = (wy - view.y) * view.zoom + height / 2
      if (globe) {
        if (globeScreen(globe, wx, wy, projected) < 0) return
        x = projected.x
        y = projected.y
      }
      if (x < -cullMargin || x > width + cullMargin) return
      if (y < -cullMargin || y > height + cullMargin) return
      const measure = (): TextBlock =>
        textBlock(
          atlas,
          label,
          null,
          texts.labelWeight[index] || primaryWeight,
          texts.labelFont[index] ?? null,
          texts.labelMaxWidth[index] ?? 0,
          size,
        )
      const extents = this.#shapeExtents
      let measured = extents.has(index) ? null : measure()
      if (measured) extents.set(index, measured)
      const blockWidth = extents.width(index)
      const blockHeight = extents.height(index)
      const background = texts.labelBackground[index] ?? noColor
      const plated = background !== noColor
      const total = blockHeight + (plated ? plateDrop : 0)
      const top = -total / 2
      const hx = blockWidth / 2 + padUnits
      const hy = total / 2
      const box = this.#box
      boxEdges(box, x, y, 4, plated, blockWidth, blockHeight, pixels / atlasFontSize)
      if (box.right < 0 || box.left > width || box.bottom < 0 || box.top > height) return
      const force = (highlight && shapeForced(index)) || all
      if (!this.#claimBox(box.left, box.top, box.right, box.bottom, force)) return
      measured ??= measure()
      const block = measured
      const target = highlight ? this.shapeHighlight : this.shapeMain
      const flags = (4 << 4) | (plated ? platedGlyph : 0)
      if (plated) target.pushPlate(index, flags, 0, 0, hx, hy, background, size)
      const color = texts.labelColor[index] ?? noColor
      emit(target, index, flags, block, atlas.height, top, 0, 0, color, size)
      sink?.shape?.(
        index,
        {
          block,
          top,
          align: 0,
          shift: 0,
          placement: 4,
          inside: false,
          plate: plated ? { cx: 0, cy: 0, hx, hy } : null,
          background,
          color,
          size,
          highlight,
          end: 0,
          pixels,
        },
        x,
        y,
      )
      placed++
      this.shapeLabels++
    }
    const placeShapes = (): void => {
      if (!store || !texts || texts.count === 0) return
      if (!all && nodeLabelSize * shrink < labelMin && !shapeOthersAlways && !anyShapeSize()) {
        return
      }
      const reach = cullMargin / view.zoom
      const left = view.x - width / 2 / view.zoom - reach
      const right = view.x + width / 2 / view.zoom + reach
      const top = view.y - height / 2 / view.zoom - reach
      const bottom = view.y + height / 2 / view.zoom + reach
      const order = store.labelOrder()
      const boxes = store.labelBoxes()
      const pins = store.pinNode
      const anchors = texts.anchor
      const extents = this.#shapeExtents
      const halfWidth = width / 2
      const halfHeight = height / 2
      const skipped = shapeRaise | shapeAlwaysBits
      for (let at = 0; at < order.length && placed < limit; at++) {
        const index = order[at] ?? 0
        if (shapeMask && ((shapeMask[index] ?? 0) & skipped) !== 0) {
          if (shapeRaised(index) || shapeEarly(index)) continue
        }
        if (!globe) {
          const node = pins ? (pins[index] ?? -1) : -1
          const ox = node >= 0 ? positions.x(node) : 0
          const oy = node >= 0 ? positions.y(node) : 0
          if ((boxes[at * 4 + 2] ?? 0) + ox < left || (boxes[at * 4] ?? 0) + ox > right) continue
          if ((boxes[at * 4 + 3] ?? 0) + oy < top || (boxes[at * 4 + 1] ?? 0) + oy > bottom) {
            continue
          }
          const ax = anchors[index * 2] ?? Number.NaN
          const x = (ax + ox - view.x) * view.zoom + halfWidth
          const y = ((anchors[index * 2 + 1] ?? 0) + oy - view.y) * view.zoom + halfHeight
          if (x < -cullMargin || x > width + cullMargin) continue
          if (y < -cullMargin || y > height + cullMargin) continue
          if (!all && extents.has(index)) {
            const scale = ((texts.labelSize[index] || nodeLabelSize) * shrink) / atlasFontSize
            const textX = (extents.width(index) / 2) * scale
            const textY = (extents.height(index) / 2) * scale
            const reachX = textX + padUnits * scale
            const reachY = textY + plateDrop * scale
            if (x + reachX < 0 || x - reachX > width || y + reachY < 0 || y - reachY > height) {
              continue
            }
            const onScreen = x + textX >= 0 && x - textX <= width && y + textY >= 0
            if (
              onScreen &&
              y - textY <= height &&
              this.#taken(x - textX, y - textY, x + textX, y + textY)
            ) {
              continue
            }
          }
        }
        placeShape(index, false)
      }
    }
    const anyShapeSize = (): boolean => {
      if (!texts) return false
      for (let index = 0; index < texts.labelSize.length; index++) {
        if ((texts.labelSize[index] ?? 0) * shrink >= labelMin && texts.text[index]) return true
      }
      return false
    }

    for (const index of highlighted) if (forced(index)) place(index, true)
    for (const index of highlightedEdges) if (edgeForced(index)) placeEdge(index, true)
    for (const index of shapeFrame?.highlighted ?? []) {
      if (shapeForced(index)) placeShape(index, true)
    }
    for (const index of highlighted) if (!forced(index)) place(index, true)
    for (const index of highlightedEdges) if (!edgeForced(index)) placeEdge(index, true)
    for (const index of shapeFrame?.highlighted ?? []) {
      if (!shapeForced(index)) placeShape(index, true)
    }
    for (const index of frame.always ?? []) if (!raised(index) && early(index)) place(index, false)
    for (const index of frame.alwaysEdges ?? []) {
      if (!edgeRaised(index) && edgeEarly(index)) placeEdge(index, false)
    }
    for (const index of shapeFrame?.always ?? []) {
      if (!shapeRaised(index) && shapeEarly(index)) placeShape(index, false)
    }

    const xy = positions.xy
    const centerX = view.x - positions.originX
    const centerY = view.y - positions.originY
    const anyNode = frame.screenLabels || frame.largestLabel * shrink >= labelMin || othersAlways
    if (all || anyNode) {
      const order = frame.order
      const largest = nodes.size[order[0] ?? 0] ?? 0
      const reach =
        (cullMargin + (frame.screenLabels ? largest : largest * view.zoom) / 2) / view.zoom
      const left = centerX - width / 2 / view.zoom - reach
      const right = centerX + width / 2 / view.zoom + reach
      const top = centerY - height / 2 / view.zoom - reach
      const bottom = centerY + height / 2 / view.zoom + reach
      plan?.locate(positions, order)
      plan?.measured(atlas.generation)
      const xs = plan?.x
      const ys = plan?.y
      for (let at = 0; at < frame.orderLength && placed < limit; at++) {
        const index = order[at] ?? 0
        const x = (xs ? xs[at] : xy[index * 2]) ?? 0
        const y = (ys ? ys[at] : xy[index * 2 + 1]) ?? 0
        if (!globe && (x < left || x > right || y < top || y > bottom)) continue
        if (!nodeShown(nodes, index, sight)) continue
        if (globe) {
          const absoluteY = y + positions.originY
          if (globeScreen(globe, x + positions.originX, absoluteY, projected) < 0) continue
          if (projected.x < -cullMargin || projected.x > width + cullMargin) continue
          if (projected.y < -cullMargin || projected.y > height + cullMargin) continue
          if (raised(index) || early(index)) continue
          if (!plan) {
            place(index, false)
            continue
          }
          const scale = globeScale(globe, absoluteY)
          const shown = level(index)
          const lift = outlineAt(index) + labelGap
          if (this.#blocked(plan, at, projected.x, projected.y, scale, shrink, shown, lift)) {
            continue
          }
          place(index, false, at, projected.x, projected.y)
          continue
        }
        if (raised(index) || early(index)) continue
        if (!plan) {
          place(index, false)
          continue
        }
        const screenX = (x - centerX) * view.zoom + width / 2
        const screenY = (y - centerY) * view.zoom + height / 2
        const lift = outlineAt(index) + labelGap
        if (this.#blocked(plan, at, screenX, screenY, view.zoom, shrink, level(index), lift)) {
          continue
        }
        place(index, false, at, screenX, screenY)
      }
    }

    if (!all && frame.largestEdgeLabel * shrink < labelMin && !edgeOthersAlways) {
      placeShapes()
      return
    }
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
      const slack = frame.paths
        ? frame.paths.slack(
            index,
            ax + positions.originX,
            (xy[from + 1] ?? 0) + positions.originY,
            bx + positions.originX,
            (xy[to + 1] ?? 0) + positions.originY,
          )
        : 0
      const free = globe !== null || edges.geodesic[index] === 1
      const left2 = left - slack
      const right2 = right + slack
      if (!free && ((ax < left2 && bx < left2) || (ax > right2 && bx > right2))) continue
      const ay = xy[from + 1] ?? 0
      const by = xy[to + 1] ?? 0
      const top2 = top - slack
      const bottom2 = bottom + slack
      if (!free && ((ay < top2 && by < top2) || (ay > bottom2 && by > bottom2))) continue
      if (!edgeRaised(index) && !edgeEarly(index)) placeEdge(index, false)
    }
    placeShapes()
  }
}

export interface EdgeLabelOrder {
  readonly length: number
  readonly largest: number
}

export function sortEdgesByWidth(edges: EdgeColumns, order: Uint32Array): EdgeLabelOrder {
  let length = 0
  let largest = 0
  const ends = edges.ends?.labeled ? edges.ends : null
  for (let index = 0; index < edges.capacity; index++) {
    if (edges.alive[index] !== 1) continue
    const own = !!edges.label[index]
    const source = ends?.label[index * 2] ? 1 : 0
    const target = ends?.label[index * 2 + 1] ? 1 : 0
    if (!own && source + target === 0) continue
    order[length++] = index
    if (own) largest = Math.max(largest, edges.labelSize[index] || edgeLabelSize)
    if (source) largest = Math.max(largest, ends?.labelSize[index * 2] || edgeLabelSize)
    if (target) largest = Math.max(largest, ends?.labelSize[index * 2 + 1] || edgeLabelSize)
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

export class LabelPlan {
  size: Float32Array = new Float32Array(0)
  pixels: Float32Array = new Float32Array(0)
  minimum: Float32Array = new Float32Array(0)
  meta: Uint8Array = new Uint8Array(0)
  x: Float32Array = new Float32Array(0)
  y: Float32Array = new Float32Array(0)
  width: Float32Array = new Float32Array(0)
  height: Float32Array = new Float32Array(0)
  #length = 0
  #located = -1
  #source: Positions | null = null
  #generation = -1

  measured(generation: number): void {
    if (generation === this.#generation) return
    this.#generation = generation
    this.width.fill(Number.NaN, 0, this.#length)
  }

  locate(positions: Positions, order: Uint32Array): void {
    if (positions === this.#source && positions.version === this.#located) return
    this.#source = positions
    this.#located = positions.version
    const xy = positions.xy
    for (let at = 0; at < this.#length; at++) {
      const index = order[at] ?? 0
      this.x[at] = xy[index * 2] ?? 0
      this.y[at] = xy[index * 2 + 1] ?? 0
    }
  }

  fill(nodes: NodeColumns, order: Uint32Array, length: number): void {
    this.#length = length
    this.#located = -1
    if (this.meta.length < length) {
      const capacity = Math.max(64, length)
      this.x = new Float32Array(capacity)
      this.y = new Float32Array(capacity)
      this.width = new Float32Array(capacity)
      this.height = new Float32Array(capacity)
      this.size = new Float32Array(capacity)
      this.pixels = new Float32Array(capacity)
      this.minimum = new Float32Array(capacity)
      this.meta = new Uint8Array(capacity)
    }
    for (let at = 0; at < length; at++) {
      const index = order[at] ?? 0
      this.size[at] = nodes.size[index] ?? 0
      this.pixels[at] = nodes.labelSize[index] || nodeLabelSize
      this.minimum[at] = nodes.labelMinScreenSize[index] ?? 0
      this.meta[at] =
        (nodes.labelPlacement[index] ?? 0) |
        (nodes.screenUnits[index] === 1 ? planScreen : 0) |
        (nodes.shape[index] === containerShape ? planContainer : 0) |
        ((nodes.labelBackground[index] ?? noColor) !== noColor ? planPlated : 0)
    }
    this.width.fill(Number.NaN, 0, length)
  }
}

export function sortBySize(nodes: NodeColumns, order: Uint32Array, plan?: LabelPlan): LabelOrder {
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
  plan?.fill(nodes, order, length)
  return { length, screenLabels, largest }
}
