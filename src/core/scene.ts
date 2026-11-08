import { type ResolvedColorScale, resolveColorScale } from '../scales/color-scale'
import { combineExtents, type Extent, ExtentTracker, sameExtent } from '../scales/extent'
import { type ResolvedNumberScale, resolveNumberScale } from '../scales/number-scale'
import { defaults } from '../theme/tokens'
import type {
  ColorScale,
  ContainerShape,
  EdgeArrow,
  EdgeDash,
  EdgeMark,
  GraphDefinition,
  LabelPlacement,
  Mark,
  MarkName,
  NodeMark,
  NodeShape,
  NumberScale,
  ScalesOptions,
} from '../types'
import {
  arrowCodes,
  boxShape,
  containerCodes,
  containerShape,
  cornerCodes,
  dashCodes,
  EdgeColumns,
  type EdgeEnds,
  type NodeBadge,
  NodeColumns,
  noColor,
  placementCodes,
  shapeCodes,
} from './columns'
import {
  type CompiledEdgeMark,
  type CompiledEnd,
  type CompiledLabelText,
  type CompiledNodeMark,
  compileEdgeMark,
  compileNodeMark,
} from './compile-mark'
import { createEdgeLanes } from './edge-lanes'
import { flowSpeed } from './flow'
import type {
  EdgeRecord,
  ElementChanges,
  ElementKind,
  GraphChanges,
  NodeRecord,
} from './graph-model'
import { IndexSet } from './index-set'
import {
  boxPadding,
  estimateTextWidth,
  labelWidth,
  nodeLabelSize,
  primaryWeight,
  type TextWidth,
} from './label-width'
import { MarkLayers } from './mark-layers'
import { boxCornerShare } from './node-shape'
import { Palette } from './palette'
import { readMaxZoom, readMinZoom } from './zoom-range'

export interface Layer {
  readonly kind: ElementKind
  readonly slot: number
}

export interface SceneDirty {
  readonly nodes: IndexSet
  readonly edges: IndexSet
  readonly palette: boolean
  readonly layers: boolean
}

export interface SceneNodeRecord extends NodeRecord {
  readonly container?: boolean
  readonly screenUnits?: boolean
}

export interface SceneEdgeRecord extends EdgeRecord {
  readonly look?: EdgeMark<unknown>
}

export interface SceneModel {
  nodes(): Iterable<SceneNodeRecord>
  edges(): Iterable<SceneEdgeRecord>
  nodeAt(index: number): SceneNodeRecord | undefined
  edgeAt(index: number): SceneEdgeRecord | undefined
}

export interface SceneColorScale {
  readonly kind: 'nodes' | 'edges' | null
  readonly slot: number
  readonly scale: ResolvedColorScale
  readonly extent: Extent | null
}

export interface SceneNumberScale {
  readonly slot: number
  readonly scale: ResolvedNumberScale
  readonly extent: Extent | null
}

export interface SceneScales {
  readonly color: SceneColorScale
  readonly size: SceneNumberScale
  readonly width: SceneNumberScale
  readonly nodeColors: readonly (SceneColorScale | null)[]
  readonly edgeColors: readonly (SceneColorScale | null)[]
  readonly sizes: readonly (SceneNumberScale | null)[]
  readonly widths: readonly (SceneNumberScale | null)[]
  readonly nodeColor: readonly unknown[]
  readonly edgeColor: readonly unknown[]
  readonly endColor: readonly unknown[]
}

export interface Scene {
  readonly nodes: NodeColumns
  readonly edges: EdgeColumns
  readonly palette: Palette
  readonly layers: readonly Layer[]
  readonly markLayers: MarkLayers
  scales(): SceneScales
  setDefinition(definition: GraphDefinition): void
  apply(model: SceneModel, changes: GraphChanges): void
  remeasure(): boolean
  takeDirty(): SceneDirty
}

function sameList(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((value, index) => Object.is(value, b[index]))
}

function sameScale(a: ColorScale | NumberScale | undefined, b: typeof a): boolean {
  if (a === b) return true
  if (!a || !b || typeof a === 'function' || typeof b === 'function') return false
  return a.type === b.type && sameList(a.domain, b.domain) && sameList(a.range, b.range)
}

class ColorState {
  extent: Extent | null = null
  readonly nodes: ExtentTracker = new ExtentTracker()
  readonly edges: ExtentTracker = new ExtentTracker()
  readonly ends: ExtentTracker = new ExtentTracker()
  members: Map<unknown, number> | null = null
  readonly idle: Set<unknown> = new Set()

  constructor(
    public options: ColorScale | undefined,
    public scale: ResolvedColorScale,
    readonly kind: 'nodes' | 'edges' | null,
    public slot: number,
    public name: MarkName | undefined,
  ) {}

  dataExtent(ends: boolean): Extent | null {
    const own = combineExtents(this.nodes.extent, this.edges.extent)
    return ends ? combineExtents(own, this.ends.extent) : own
  }

  hold(value: unknown): void {
    const members = this.members
    if (!members || value === null || value === undefined) return
    members.set(value, (members.get(value) ?? 0) + 1)
  }

  release(value: unknown): void {
    const members = this.members
    if (!members || value === null || value === undefined) return
    const count = (members.get(value) ?? 0) - 1
    if (count > 0) {
      members.set(value, count)
      return
    }
    members.delete(value)
    this.idle.add(value)
  }

  settle(count: (state: ColorState, members: Map<unknown, number>) => void): void {
    const scale = this.scale
    if (scale.kind !== 'categorical' || scale.size() <= scale.range.length) return
    let members = this.members
    if (!members) {
      members = new Map()
      count(this, members)
      this.members = members
      for (const value of scale.categories()) if (!members.has(value)) this.idle.add(value)
    }
    for (const value of this.idle) {
      if (scale.size() <= scale.range.length) return
      this.idle.delete(value)
      if (!members.has(value)) scale.forget(value)
    }
  }

  recount(): void {
    this.members = null
    this.idle.clear()
  }

  clear(): void {
    this.extent = null
    this.nodes.clear()
    this.edges.clear()
    this.ends.clear()
  }
}

interface WantedColors {
  readonly options: readonly (ColorScale | undefined)[]
  readonly names: readonly (MarkName | undefined)[]
}

interface SlotColumns {
  readonly alive: Uint8Array
  readonly slot: Uint16Array
}

interface ColorFallbacks {
  readonly nodeFill: number
  readonly nodeStroke: number
  readonly nodeOutline: number
  readonly groupFill: number
  readonly groupStroke: number
  readonly edgeColor: number
  readonly badgeFill: number
  readonly badgeInk: number
  readonly badgeRing: number
  readonly labelBackground: number
}

class NumberState {
  domain: Extent | null = null
  readonly values: ExtentTracker = new ExtentTracker()
  readonly ends: ExtentTracker = new ExtentTracker()

  constructor(
    public options: NumberScale | undefined,
    public scale: ResolvedNumberScale,
    readonly slot: number,
  ) {}

  dataExtent(ends: boolean): Extent | null {
    return ends ? combineExtents(this.values.extent, this.ends.extent) : this.values.extent
  }

  clear(): void {
    this.domain = null
    this.values.clear()
    this.ends.clear()
  }
}

type Fallback = { readonly type: 'sqrt' | 'linear'; readonly range: Extent }
const sizeFallback: Fallback = { type: 'sqrt', range: defaults.nodeSizeRange }
const widthFallback: Fallback = { type: 'linear', range: defaults.edgeWidthRange }

function ownScales(
  marks: readonly Mark[],
  kind: 'nodes' | 'edges',
  channel: 'color' | 'size' | 'width',
): (ColorScale | NumberScale | undefined)[] {
  const own: (ColorScale | NumberScale | undefined)[] = []
  for (const mark of marks) {
    if (mark.type !== kind) continue
    const scales = (mark as NodeMark<unknown> | EdgeMark<unknown>).options.scales as
      | Readonly<Record<string, ColorScale | NumberScale | undefined>>
      | undefined
    own.push(scales?.[channel])
  }
  return own
}

function wantedColors(marks: readonly Mark[], kind: 'nodes' | 'edges'): WantedColors {
  const names: (MarkName | undefined)[] = []
  for (const mark of marks) {
    if (mark.type === kind) names.push((mark as NodeMark<unknown> | EdgeMark<unknown>).name)
  }
  return { options: ownScales(marks, kind, 'color') as (ColorScale | undefined)[], names }
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN
}

function toText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toColor(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function codeOf<T extends string>(codes: Readonly<Record<T, number>>, value: unknown): number {
  return typeof value === 'string' && Object.hasOwn(codes, value) ? codes[value as T] : 0
}

function swapColor(
  palette: Palette,
  previous: number,
  color: string | null,
  fallback: number,
): number {
  if (color === null && previous === fallback) return previous
  return palette.swap(previous, color, fallback)
}

function readBadges(
  mark: CompiledNodeMark,
  datum: unknown,
  palette: Palette,
  fallbacks: ColorFallbacks,
): NodeBadge[] | null {
  if (mark.badges.length === 0) return null
  const badges: NodeBadge[] = []
  for (const [corner, read] of mark.badges) {
    const badge = read(datum)
    if (typeof badge !== 'object' || badge === null) continue
    const { text, fill, color } = badge as Record<string, unknown>
    badges.push({
      corner: cornerCodes[corner],
      text: typeof text === 'number' ? String(text) : toText(text) || null,
      fill: swapColor(palette, noColor, toColor(fill), fallbacks.badgeFill),
      color: swapColor(palette, noColor, toColor(color), fallbacks.badgeInk),
      ring: fallbacks.badgeRing,
    })
  }
  return badges.length === 0 ? null : badges
}

function readBackground(
  previous: number,
  value: unknown,
  palette: Palette,
  fallbacks: ColorFallbacks,
): number {
  if (value === true) return swapColor(palette, previous, null, fallbacks.labelBackground)
  return swapColor(palette, previous, toColor(value), noColor)
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function readWeight(value: unknown): number {
  if (value === 'normal') return 400
  if (value === 'bold') return 700
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1000, Math.max(1, Math.round(value)))
    : 0
}

interface LabelTextColumns {
  readonly labelColor: Uint32Array
  readonly labelSize: Float32Array
  readonly labelWeight: Uint16Array
  readonly labelFont: (string | null)[]
  readonly labelMaxWidth: Float32Array
}

function writeLabelText(
  columns: LabelTextColumns,
  index: number,
  text: CompiledLabelText,
  datum: unknown,
  palette: Palette,
): void {
  const color = text.color ? toColor(text.color(datum)) : null
  columns.labelColor[index] = swapColor(
    palette,
    columns.labelColor[index] ?? noColor,
    color,
    noColor,
  )
  columns.labelSize[index] = positive(text.size?.(datum))
  columns.labelWeight[index] = readWeight(text.weight?.(datum))
  columns.labelFont[index] = text.font ? toColor(text.font(datum)) : null
  columns.labelMaxWidth[index] = positive(text.maxWidth?.(datum))
}

function readImage(value: unknown): { src: string; scale: number; color: string | null } | null {
  if (typeof value === 'string') return value === '' ? null : { src: value, scale: 1, color: null }
  if (typeof value !== 'object' || value === null) return null
  const { src, scale, color } = value as Record<string, unknown>
  if (typeof src !== 'string' || src === '') return null
  return { src, scale: Math.max(0, finiteOr(scale, 1)), color: toColor(color) }
}

class RecordBatch<R extends { readonly index: number }> {
  readonly records: R[] = []
  maxIndex = -1
  #stamps: Uint32Array = new Uint32Array(0)
  #generation = 0

  reset(): void {
    this.records.length = 0
    this.maxIndex = -1
    this.#generation = (this.#generation + 1) >>> 0
    if (this.#generation === 0) {
      this.#stamps.fill(0)
      this.#generation = 1
    }
  }

  has(index: number): boolean {
    return this.#stamps[index] === this.#generation
  }

  add(record: R): void {
    const index = record.index
    if (index >= this.#stamps.length) {
      const stamps = new Uint32Array(Math.max(64, this.#stamps.length * 2, index + 1))
      stamps.set(this.#stamps)
      this.#stamps = stamps
    }
    if (this.#stamps[index] === this.#generation) return
    this.#stamps[index] = this.#generation
    if (index > this.maxIndex) this.maxIndex = index
    this.records.push(record)
  }
}

function layersOf(marks: readonly Mark[]): Layer[] {
  const slots = { nodes: 0, edges: 0 }
  return marks.map((mark) => ({ kind: mark.type, slot: slots[mark.type]++ }))
}

function pinFallbacks(palette: Palette): ColorFallbacks {
  return {
    nodeFill: palette.id(defaults.nodeFill),
    nodeStroke: palette.id(defaults.nodeStroke),
    nodeOutline: palette.id(defaults.nodeOutline),
    groupFill: palette.id(defaults.groupFill),
    groupStroke: palette.id(defaults.groupStroke),
    edgeColor: palette.id(defaults.edgeColor),
    badgeFill: palette.id(defaults.badgeFill),
    badgeInk: palette.id(defaults.badgeInk),
    badgeRing: palette.id(defaults.badgeRing),
    labelBackground: palette.id(defaults.labelBackground),
  }
}

interface ClaimedColors {
  readonly states: (ColorState | null)[]
  readonly moved: boolean
  readonly rescaled: boolean
}

function claimColors(
  previous: readonly (ColorState | null)[],
  wanted: WantedColors,
  kind: 'nodes' | 'edges',
  columns: SlotColumns,
  changes: ElementChanges,
  slotAt: (index: number) => number,
): ClaimedColors {
  const { options, names } = wanted
  const states: (ColorState | null)[] = options.map(() => null)
  const claimed = new Set<ColorState>()
  const claim = (slot: number, state: ColorState | null | undefined): boolean => {
    if (!state || claimed.has(state)) return false
    states[slot] = state
    claimed.add(state)
    return true
  }
  options.forEach((scale, slot) => {
    const name = names[slot]
    if (scale === undefined || name === undefined) return
    claim(
      slot,
      previous.find((state) => state?.name === name && !claimed.has(state)),
    )
  })
  const open = options.flatMap((scale, slot) =>
    scale !== undefined && !states[slot] ? [slot] : [],
  )
  if (open.length > 0 && previous.some(Boolean)) {
    const left = slotCounts(columns)
    const votes = new Map<number, number>()
    for (const { index } of changes.removed) {
      if (columns.alive[index] !== 1) continue
      const from = columns.slot[index] ?? 0
      left[from] = (left[from] ?? 0) - 1
    }
    for (const { index } of changes.updated) {
      if (columns.alive[index] !== 1) continue
      const from = columns.slot[index] ?? 0
      const to = slotAt(index)
      if (to < 0 || to === from) continue
      left[from] = (left[from] ?? 0) - 1
      if (!votes.has(to)) votes.set(to, from)
    }
    for (const slot of open) {
      if ((left[slot] ?? 0) > 0 && claim(slot, previous[slot])) continue
      const from = votes.get(slot)
      if (from !== undefined) claim(slot, previous[from])
    }
  }
  let moved = previous.some((state) => state !== null && !claimed.has(state))
  let rescaled = false
  options.forEach((scale, slot) => {
    if (scale === undefined) return
    const state = states[slot]
    if (!state) {
      states[slot] = new ColorState(scale, resolveColorScale(scale), kind, slot, names[slot])
      moved = true
      return
    }
    if (state.slot !== slot) {
      state.slot = slot
      moved = true
    }
    state.name = names[slot]
    if (!sameScale(state.options, scale)) {
      state.scale = resolveColorScale(scale)
      rescaled = true
    }
    state.options = scale
  })
  return { states, moved, rescaled }
}

function slotCounts(columns: SlotColumns): number[] {
  const counts: number[] = []
  const { alive, slot } = columns
  for (let index = 0; index < alive.length; index++) {
    if (alive[index] !== 1) continue
    const at = slot[index] ?? 0
    counts[at] = (counts[at] ?? 0) + 1
  }
  return counts
}

export function createScene(textWidth: TextWidth = estimateTextWidth): Scene {
  const nodes = new NodeColumns()
  const edges = new EdgeColumns()
  const palette = new Palette()
  const fallbacks = pinFallbacks(palette)
  const lanes = createEdgeLanes()
  const markLayers = new MarkLayers()
  const slots = new Map<Mark, number>()
  const nodeBatch = new RecordBatch<SceneNodeRecord>()
  const edgeBatch = new RecordBatch<SceneEdgeRecord>()
  let compiledNodeMark: NodeMark<unknown> | null = null
  let compiledNode: CompiledNodeMark | null = null
  let compiledEdgeMark: EdgeMark<unknown> | null = null
  let compiledEdge: CompiledEdgeMark | null = null
  let layers: Layer[] = []
  let layersDirty = false
  let paletteVersion = 0
  let dirtyNodes = new IndexSet()
  let dirtyEdges = new IndexSet()
  let spareNodes = new IndexSet()
  let spareEdges = new IndexSet()
  let scales: ScalesOptions = {}
  let full = false
  let moved = false
  let wanted: { readonly nodes: WantedColors; readonly edges: WantedColors } | null = null
  const sharedColor = new ColorState(undefined, resolveColorScale(undefined), null, -1, undefined)
  const sharedSize = new NumberState(undefined, resolveNumberScale(undefined, sizeFallback), -1)
  const sharedWidth = new NumberState(undefined, resolveNumberScale(undefined, widthFallback), -1)
  let nodeColors: (ColorState | null)[] = []
  let edgeColors: (ColorState | null)[] = []
  let sizes: (NumberState | null)[] = []
  let widths: (NumberState | null)[] = []
  let ownNodeScales = false
  let ownEdgeScales = false
  let nodeColor: ColorState = sharedColor
  let nodeSize: NumberState = sharedSize
  let nodeSlot = 0
  let edgeColor: ColorState = sharedColor
  let edgeWidth: NumberState = sharedWidth
  let edgeSlot = 0
  const nodeColorValues: unknown[] = []
  const edgeColorValues: unknown[] = []
  const endColorValues: unknown[] = []
  let nodeHeld: unknown[] = []
  let edgeHeld: unknown[] = []
  let endHeld: unknown[] = []
  const sizeValues: number[] = []
  const widthValues: number[] = []
  const endWidthValues: number[] = []
  let endsSeen = false

  function track(tracker: ExtentTracker, index: number, value: unknown): void {
    if (typeof value === 'number' && Number.isFinite(value)) tracker.set(index, value)
    else tracker.delete(index)
  }

  function nodeMarkOf(record: NodeRecord): CompiledNodeMark {
    if (record.mark !== compiledNodeMark || !compiledNode) {
      compiledNodeMark = record.mark
      compiledNode = compileNodeMark(record.mark)
      nodeSlot = slots.get(record.mark) ?? 0
      nodeColor = nodeColors[nodeSlot] ?? sharedColor
      nodeSize = sizes[nodeSlot] ?? sharedSize
    }
    return compiledNode
  }

  function edgeMarkOf(record: SceneEdgeRecord): CompiledEdgeMark {
    const look = record.look ?? record.mark
    if (look !== compiledEdgeMark || !compiledEdge) {
      compiledEdgeMark = look
      compiledEdge = compileEdgeMark(look)
      edgeSlot = slots.get(record.mark) ?? 0
      edgeColor = edgeColors[edgeSlot] ?? sharedColor
      edgeWidth = widths[edgeSlot] ?? sharedWidth
    }
    return compiledEdge
  }

  function leaveNodeScales(index: number): void {
    if (nodes.alive[index] !== 1) return
    const slot = nodes.slot[index] ?? 0
    if (slot === nodeSlot) return
    ;(nodeColors[slot] ?? sharedColor).nodes.delete(index)
    ;(sizes[slot] ?? sharedSize).values.delete(index)
  }

  function leaveEdgeScales(index: number): void {
    if (edges.alive[index] !== 1) return
    const slot = edges.slot[index] ?? 0
    if (slot === edgeSlot) return
    const color = edgeColors[slot] ?? sharedColor
    const width = widths[slot] ?? sharedWidth
    color.edges.delete(index)
    width.values.delete(index)
    for (let id = index * 2; id < index * 2 + 2; id++) {
      color.ends.delete(id)
      width.ends.delete(id)
    }
  }

  function readNode(record: SceneNodeRecord): void {
    const index = record.index
    const mark = nodeMarkOf(record)
    nodes.reserve(index)
    if (ownNodeScales) leaveNodeScales(index)
    nodes.keys[index] = record.key
    if (record.container) {
      sizeValues[index] = Number.NaN
      nodeColorValues[index] = undefined
      nodeSize.values.delete(index)
      nodeColor.nodes.delete(index)
      return
    }
    const size = mark.size ? toNumber(mark.size(record.datum)) : Number.NaN
    const color = mark.colorRaw ? undefined : mark.color?.(record.datum)
    sizeValues[index] = size
    nodeColorValues[index] = color
    if (mark.sizeRaw) nodeSize.values.delete(index)
    else track(nodeSize.values, index, size)
    track(nodeColor.nodes, index, color)
  }

  function readEdge(record: EdgeRecord): void {
    const index = record.index
    const mark = edgeMarkOf(record)
    edges.reserve(index)
    if (ownEdgeScales) leaveEdgeScales(index)
    edges.keys[index] = record.key
    const width = mark.width ? toNumber(mark.width(record.datum)) : Number.NaN
    const color = mark.colorRaw ? undefined : mark.color?.(record.datum)
    widthValues[index] = width
    edgeColorValues[index] = color
    if (mark.widthRaw) edgeWidth.values.delete(index)
    else track(edgeWidth.values, index, width)
    track(edgeColor.edges, index, color)
    if (mark.ends) {
      endsSeen = true
      readEnd(index * 2, mark.ends.source, record.datum)
      readEnd(index * 2 + 1, mark.ends.target, record.datum)
    } else if (endsSeen) {
      forgetEnds(index, edgeColor, edgeWidth)
    }
  }

  function readEnd(id: number, end: CompiledEnd, datum: unknown): void {
    const width = end.width ? toNumber(end.width(datum)) : Number.NaN
    const color = end.colorRaw ? undefined : end.color?.(datum)
    endWidthValues[id] = width
    endColorValues[id] = color
    if (end.widthRaw) edgeWidth.ends.delete(id)
    else track(edgeWidth.ends, id, width)
    track(edgeColor.ends, id, color)
  }

  function forgetEnds(index: number, color: ColorState, width: NumberState): void {
    for (let id = index * 2; id < index * 2 + 2; id++) {
      endWidthValues[id] = Number.NaN
      endColorValues[id] = undefined
      width.ends.delete(id)
      color.ends.delete(id)
    }
  }

  function sizeOf(value: number, raw: boolean): number {
    if (Number.isNaN(value)) return defaults.nodeSize
    if (raw) return Math.max(0, value)
    const size = nodeSize.scale.map(value, nodeSize.domain)
    return Number.isFinite(size) ? Math.max(0, size) : defaults.nodeSize
  }

  function widthOf(value: number, raw: boolean, fallback: number): number {
    if (Number.isNaN(value)) return fallback
    if (raw) return Math.max(0, value)
    const width = edgeWidth.scale.map(value, edgeWidth.domain)
    return Number.isFinite(width) ? Math.max(0, width) : fallback
  }

  function dropNodeColors(index: number): void {
    palette.drop(nodes.fill[index] ?? noColor)
    palette.drop(nodes.stroke[index] ?? noColor)
    palette.drop(nodes.outline[index] ?? noColor)
    palette.drop(nodes.imageColor[index] ?? noColor)
    palette.drop(nodes.labelColor[index] ?? noColor)
    palette.drop(nodes.labelBackground[index] ?? noColor)
    dropBadges(index)
  }

  function dropBadges(index: number): void {
    const badges = nodes.badges[index]
    if (!badges) return
    for (const badge of badges) {
      palette.drop(badge.fill)
      palette.drop(badge.color)
    }
  }

  function dropEdgeColors(index: number): void {
    palette.drop(edges.color[index] ?? noColor)
    palette.drop(edges.labelColor[index] ?? noColor)
    palette.drop(edges.labelBackground[index] ?? noColor)
    dropEnds(index)
  }

  function dropEnds(index: number): void {
    const ends = edges.ends
    if (!ends || Number.isNaN(ends.split[index] ?? Number.NaN)) return
    for (let id = index * 2; id < index * 2 + 2; id++) {
      palette.drop(ends.color[id] ?? noColor)
      palette.drop(ends.labelColor[id] ?? noColor)
      palette.drop(ends.labelBackground[id] ?? noColor)
      ends.color[id] = noColor
      ends.labelColor[id] = noColor
      ends.labelBackground[id] = noColor
    }
  }

  function freshNodeColors(index: number): void {
    nodes.fill[index] = noColor
    nodes.stroke[index] = noColor
    nodes.outline[index] = noColor
    nodes.imageColor[index] = noColor
    nodes.labelColor[index] = noColor
    nodes.labelBackground[index] = noColor
  }

  function freshEdgeColors(index: number): void {
    edges.color[index] = noColor
    edges.labelColor[index] = noColor
    edges.labelBackground[index] = noColor
  }

  function writeNode(record: SceneNodeRecord): void {
    const index = record.index
    const mark = nodeMarkOf(record)
    const datum = record.datum
    const previousSlot = nodes.slot[index] ?? 0
    const before = nodeHeld[index]
    if (nodes.alive[index] === 1) dropBadges(index)
    else freshNodeColors(index)
    nodes.alive[index] = 1
    nodes.slot[index] = nodeSlot
    nodes.size[index] = sizeOf(sizeValues[index] ?? Number.NaN, mark.sizeRaw)
    const held = record.container
      ? writeContainer(index, mark, datum)
      : writeLook(index, mark, datum, record.screenUnits ?? mark.screenUnits)
    nodes.opacity[index] = Math.min(1, Math.max(0, finiteOr(mark.opacity?.(datum), 1)))
    nodes.zoom.set(index, readMinZoom(mark.minZoom?.(datum)), readMaxZoom(mark.maxZoom?.(datum)))
    if (mark.time) nodes.time.read(index, mark.time(datum))
    else nodes.time.clear(index)
    nodes.label[index] = toText(mark.label?.(datum))
    nodes.secondary[index] = toText(mark.secondary?.(datum))
    nodes.labelBackground[index] = readBackground(
      nodes.labelBackground[index] ?? noColor,
      mark.labelBackground?.(datum),
      palette,
      fallbacks,
    )
    writeLabelText(nodes, index, mark.labelText, datum, palette)
    nodes.labelPlacement[index] =
      record.container && !mark.labelPlacement
        ? placementCodes.top
        : !mark.labelPlacement && nodes.shape[index] === boxShape
          ? placementCodes.center
          : codeOf<LabelPlacement>(placementCodes, mark.labelPlacement?.(datum))
    nodes.labelMinScreenSize[index] = positive(mark.labelMinScreenSize?.(datum))
    writeBox(index, mark, datum)
    const previous = nodeColors[previousSlot] ?? sharedColor
    if (held !== before || previous !== nodeColor) {
      nodeHeld[index] = held
      nodeColor.hold(held)
      previous.release(before)
    }
    dirtyNodes.add(index)
  }

  function fitWidth(index: number): number {
    const size = nodes.size[index] ?? 0
    const label = nodes.label[index]
    const room = size * boxPadding * 2
    if (!label || nodes.labelPlacement[index] !== placementCodes.center) return size
    const text = labelWidth(
      textWidth,
      label,
      nodes.secondary[index] ?? null,
      nodes.labelWeight[index] || primaryWeight,
      nodes.labelFont[index] ?? null,
      nodes.labelMaxWidth[index] ?? 0,
      nodes.labelSize[index] || nodeLabelSize,
    )
    return Math.max(size, text + room)
  }

  function writeBox(index: number, mark: CompiledNodeMark, datum: unknown): void {
    if (nodes.shape[index] !== boxShape) {
      nodes.fitLabel[index] = 0
      nodes.width[index] = 0
      nodes.corner[index] = 0
      return
    }
    const size = nodes.size[index] ?? 0
    const wanted = mark.width?.(datum)
    const fixed = typeof wanted === 'number' && Number.isFinite(wanted) ? Math.max(0, wanted) : null
    const center = nodes.labelPlacement[index] === placementCodes.center
    if (fixed !== null && center && !mark.labelText.maxWidth) {
      nodes.labelMaxWidth[index] = Math.max(fixed - size * boxPadding * 2, 1e-3)
    }
    nodes.fitLabel[index] = fixed === null ? 1 : 0
    nodes.width[index] = fixed ?? fitWidth(index)
    nodes.corner[index] = Math.max(0, finiteOr(mark.cornerRadius?.(datum), size * boxCornerShare))
  }

  function remeasure(): boolean {
    let changed = false
    for (let index = 0; index < nodes.capacity; index++) {
      if (nodes.alive[index] !== 1 || nodes.fitLabel[index] !== 1) continue
      const width = fitWidth(index)
      if (width === nodes.width[index]) continue
      nodes.width[index] = width
      dirtyNodes.add(index)
      changed = true
    }
    return changed
  }

  function writeLook(
    index: number,
    mark: CompiledNodeMark,
    datum: unknown,
    screenUnits: boolean,
  ): unknown {
    let held: unknown
    let fill = toColor(mark.fill?.(datum))
    if (fill === null && mark.colorRaw) fill = toColor(mark.color?.(datum))
    else if (fill === null) {
      const value = nodeColorValues[index]
      fill = nodeColor.scale.map(value, nodeColor.extent)
      if (fill !== null) held = value
    }
    nodes.container[index] = 0
    nodes.shape[index] = codeOf<NodeShape>(shapeCodes, mark.shape?.(datum))
    nodes.fill[index] = swapColor(palette, nodes.fill[index] ?? noColor, fill, fallbacks.nodeFill)
    nodes.stroke[index] = swapColor(
      palette,
      nodes.stroke[index] ?? noColor,
      toColor(mark.stroke?.(datum)),
      fallbacks.nodeStroke,
    )
    nodes.strokeWidth[index] = Math.max(
      0,
      finiteOr(mark.strokeWidth?.(datum), defaults.nodeStrokeWidth),
    )
    const outline = mark.outline ? toColor(mark.outline(datum)) : null
    nodes.outline[index] = swapColor(
      palette,
      nodes.outline[index] ?? noColor,
      outline,
      fallbacks.nodeOutline,
    )
    nodes.outlineWidth[index] =
      mark.outline && !outline
        ? 0
        : Math.max(0, finiteOr(mark.outlineWidth?.(datum), outline ? defaults.nodeOutlineWidth : 0))
    nodes.screenUnits[index] = screenUnits ? 1 : 0
    const image = readImage(mark.image?.(datum))
    nodes.image[index] = image?.src ?? null
    nodes.imageScale[index] = image?.scale ?? 1
    nodes.imageColor[index] = swapColor(
      palette,
      nodes.imageColor[index] ?? noColor,
      image?.color ?? null,
      noColor,
    )
    nodes.badges[index] = readBadges(mark, datum, palette, fallbacks)
    return held
  }

  function writeContainer(index: number, mark: CompiledNodeMark, datum: unknown): undefined {
    const look = mark.container
    nodes.container[index] = codeOf<ContainerShape>(containerCodes, look.shape?.(datum)) || 1
    nodes.padding[index] = Math.max(0, finiteOr(look.padding?.(datum), defaults.groupPadding))
    nodes.shape[index] = containerShape
    nodes.fill[index] = swapColor(
      palette,
      nodes.fill[index] ?? noColor,
      toColor(look.fill?.(datum)),
      fallbacks.groupFill,
    )
    nodes.stroke[index] = swapColor(
      palette,
      nodes.stroke[index] ?? noColor,
      toColor(look.stroke?.(datum)),
      fallbacks.groupStroke,
    )
    nodes.strokeWidth[index] = Math.max(
      0,
      finiteOr(look.strokeWidth?.(datum), defaults.groupStrokeWidth),
    )
    nodes.outline[index] = swapColor(
      palette,
      nodes.outline[index] ?? noColor,
      null,
      fallbacks.nodeOutline,
    )
    nodes.outlineWidth[index] = 0
    nodes.screenUnits[index] = 0
    nodes.image[index] = null
    nodes.imageScale[index] = 1
    nodes.imageColor[index] = swapColor(palette, nodes.imageColor[index] ?? noColor, null, noColor)
    nodes.badges[index] = null
    return undefined
  }

  function writeEdge(record: SceneEdgeRecord): void {
    const index = record.index
    const mark = edgeMarkOf(record)
    const datum = record.datum
    const alive = edges.alive[index] === 1
    const previousSlot = edges.slot[index] ?? 0
    const before = edgeHeld[index]
    const nearBefore = endsSeen ? endHeld[index * 2] : undefined
    const farBefore = endsSeen ? endHeld[index * 2 + 1] : undefined
    if (alive) dropEnds(index)
    else freshEdgeColors(index)
    let held: unknown
    let color = toColor(mark.stroke?.(datum))
    if (color === null && mark.colorRaw) color = toColor(mark.color?.(datum))
    else if (color === null) {
      const value = edgeColorValues[index]
      color = edgeColor.scale.map(value, edgeColor.extent)
      if (color !== null) held = value
    }
    if (
      !alive ||
      edges.source[index] !== record.sourceIndex ||
      edges.target[index] !== record.targetIndex
    )
      edges.time.touch(index)
    edges.alive[index] = 1
    edges.slot[index] = edgeSlot
    edges.source[index] = record.sourceIndex
    edges.target[index] = record.targetIndex
    lanes.link(index, record.sourceIndex, record.targetIndex)
    edges.color[index] = swapColor(
      palette,
      edges.color[index] ?? noColor,
      color,
      fallbacks.edgeColor,
    )
    edges.width[index] = widthOf(
      widthValues[index] ?? Number.NaN,
      mark.widthRaw,
      defaults.edgeWidth,
    )
    edges.dash[index] = codeOf<EdgeDash>(dashCodes, mark.dash?.(datum))
    edges.arrow[index] = codeOf<EdgeArrow>(arrowCodes, mark.arrow?.(datum))
    edges.opacity[index] = Math.min(1, Math.max(0, finiteOr(mark.opacity?.(datum), 1)))
    edges.zoom.set(index, readMinZoom(mark.minZoom?.(datum)), readMaxZoom(mark.maxZoom?.(datum)))
    if (mark.time) edges.time.read(index, mark.time(datum))
    else edges.time.clear(index)
    edges.setFlow(index, mark.flow ? flowSpeed(mark.flow(datum)) : 0)
    const geodesic = mark.geodesic?.(datum) === true
    edges.geodesic[index] = geodesic ? 1 : 0
    const loop = record.sourceIndex === record.targetIndex
    edges.bundle[index] = !loop && !geodesic && mark.bundle?.(datum) !== false ? 1 : 0
    edges.route[index] = !loop && !geodesic && mark.route?.(datum) !== false ? 1 : 0
    edges.bridge[index] = !loop && !geodesic && mark.bridge?.(datum) !== false ? 1 : 0
    edges.label[index] = toText(mark.label?.(datum))
    edges.labelBackground[index] = readBackground(
      edges.labelBackground[index] ?? noColor,
      mark.labelBackground?.(datum),
      palette,
      fallbacks,
    )
    writeLabelText(edges, index, mark.labelText, datum, palette)
    if (mark.ends) writeEnds(index, mark, datum, edges.color[index] ?? fallbacks.edgeColor)
    else if (endsSeen) {
      edges.ends?.clear(index)
      endHeld[index * 2] = undefined
      endHeld[index * 2 + 1] = undefined
    }
    const previous = edgeColors[previousSlot] ?? sharedColor
    if (held !== before || previous !== edgeColor) {
      edgeHeld[index] = held
      edgeColor.hold(held)
      previous.release(before)
    }
    previous.release(nearBefore)
    previous.release(farBefore)
    dirtyEdges.add(index)
  }

  function writeEnds(index: number, mark: CompiledEdgeMark, datum: unknown, color: number): void {
    const compiled = mark.ends
    if (!compiled) return
    const ends = edges.useEnds()
    ends.split[index] = Math.min(1, Math.max(0, finiteOr(compiled.split?.(datum), 0.5)))
    const near = writeEnd(ends, index * 2, compiled.source, datum, color, index)
    const far = writeEnd(ends, index * 2 + 1, compiled.target, datum, color, index)
    ends.setStyled(index, compiled.styled)
    if (compiled.styled) edges.width[index] = Math.max(near, far)
  }

  function writeEnd(
    ends: EdgeEnds,
    id: number,
    end: CompiledEnd,
    datum: unknown,
    color: number,
    index: number,
  ): number {
    const value = endWidthValues[id] ?? Number.NaN
    let held: unknown = null
    let endColor = toColor(end.stroke?.(datum))
    if (endColor === null && end.colorRaw) endColor = toColor(end.color?.(datum))
    else if (endColor === null) {
      const read = endColorValues[id]
      endColor = edgeColor.scale.map(read, edgeColor.extent)
      held = endColor === null ? undefined : read
    }
    ends.color[id] = endColor === null ? palette.reuse(color) : palette.use(endColor)
    endHeld[id] = held
    edgeColor.hold(held)
    const fallback = edges.width[index] ?? defaults.edgeWidth
    const width = widthOf(value, end.widthRaw, fallback)
    ends.width[id] = width
    ends.dash[id] = end.dash
      ? codeOf<EdgeDash>(dashCodes, end.dash(datum))
      : (edges.dash[index] ?? 0)
    ends.setLabel(id, toText(end.label?.(datum)) || null)
    ends.labelBackground[id] = readBackground(
      noColor,
      end.labelBackground?.(datum),
      palette,
      fallbacks,
    )
    writeLabelText(ends, id, end.labelText, datum, palette)
    return width
  }

  function removeNode(index: number): void {
    const slot = nodes.slot[index] ?? 0
    if (nodes.alive[index] === 1) dropNodeColors(index)
    const color = nodeColors[slot] ?? sharedColor
    const held = nodeHeld[index]
    if (held !== undefined) {
      color.release(held)
      nodeHeld[index] = undefined
    }
    nodes.clear(index)
    sizeValues[index] = Number.NaN
    nodeColorValues[index] = undefined
    ;(sizes[slot] ?? sharedSize).values.delete(index)
    color.nodes.delete(index)
    dirtyNodes.add(index)
  }

  function removeEdge(index: number): void {
    const slot = edges.slot[index] ?? 0
    if (edges.alive[index] === 1) {
      edges.time.touch(index)
      dropEdgeColors(index)
    }
    const color = edgeColors[slot] ?? sharedColor
    const width = widths[slot] ?? sharedWidth
    const held = edgeHeld[index]
    if (held !== undefined) {
      color.release(held)
      edgeHeld[index] = undefined
    }
    if (endsSeen) {
      color.release(endHeld[index * 2])
      color.release(endHeld[index * 2 + 1])
      endHeld[index * 2] = undefined
      endHeld[index * 2 + 1] = undefined
    }
    lanes.unlink(index)
    edges.clear(index)
    widthValues[index] = Number.NaN
    edgeColorValues[index] = undefined
    width.values.delete(index)
    color.edges.delete(index)
    if (endsSeen) forgetEnds(index, color, width)
    dirtyEdges.add(index)
  }

  function countHeld(state: ColorState, members: Map<unknown, number>): void {
    const add = (value: unknown) => {
      if (value !== null && value !== undefined) members.set(value, (members.get(value) ?? 0) + 1)
    }
    for (let index = 0; index < nodes.capacity; index++) {
      if (nodes.alive[index] !== 1 || (nodeColors[nodes.slot[index] ?? 0] ?? sharedColor) !== state)
        continue
      add(nodeHeld[index])
    }
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1 || (edgeColors[edges.slot[index] ?? 0] ?? sharedColor) !== state)
        continue
      add(edgeHeld[index])
      if (!endsSeen) continue
      add(endHeld[index * 2])
      add(endHeld[index * 2 + 1])
    }
  }

  function colorStates(): ColorState[] {
    const states = [sharedColor]
    for (const state of nodeColors) if (state) states.push(state)
    for (const state of edgeColors) if (state) states.push(state)
    return states
  }

  function numberStates(shared: NumberState, own: readonly (NumberState | null)[]): NumberState[] {
    const states = [shared]
    for (const state of own) if (state) states.push(state)
    return states
  }

  function colorView(state: ColorState): SceneColorScale {
    return {
      kind: state.kind,
      slot: state.slot,
      scale: state.scale,
      extent: state.dataExtent(endsSeen),
    }
  }

  function numberView(state: NumberState, ends: boolean): SceneNumberScale {
    return { slot: state.slot, scale: state.scale, extent: state.dataExtent(ends) }
  }

  function syncNumbers(
    own: readonly (NumberState | null)[],
    given: readonly (ColorScale | NumberScale | undefined)[],
    fallback: Fallback,
  ): { states: (NumberState | null)[]; moved: boolean } {
    let moved = own.slice(given.length).some(Boolean)
    const states = given.map((options, slot) => {
      const before = own[slot] ?? null
      if (options === undefined) {
        if (before) moved = true
        return null
      }
      const scale = options as NumberScale
      if (!before) {
        moved = true
        return new NumberState(scale, resolveNumberScale(scale, fallback), slot)
      }
      if (!sameScale(before.options, scale)) {
        before.scale = resolveNumberScale(scale, fallback)
        full = true
      }
      before.options = scale
      return before
    })
    return { states, moved }
  }

  function claimAll(model: SceneModel, changes: GraphChanges): void {
    const next = wanted
    wanted = null
    if (!next) return
    const nodeSlotAt = (index: number) => {
      const record = model.nodeAt(index)
      return record ? (slots.get(record.mark) ?? -1) : -1
    }
    const edgeSlotAt = (index: number) => {
      const record = model.edgeAt(index)
      return record ? (slots.get(record.mark) ?? -1) : -1
    }
    const claimedNodes = claimColors(
      nodeColors,
      next.nodes,
      'nodes',
      nodes,
      changes.nodes,
      nodeSlotAt,
    )
    const claimedEdges = claimColors(
      edgeColors,
      next.edges,
      'edges',
      edges,
      changes.edges,
      edgeSlotAt,
    )
    nodeColors = claimedNodes.states
    edgeColors = claimedEdges.states
    if (claimedNodes.moved || claimedEdges.moved) moved = true
    if (claimedNodes.rescaled || claimedEdges.rescaled) full = true
    ownNodeScales = nodeColors.some(Boolean) || sizes.some(Boolean)
    ownEdgeScales = edgeColors.some(Boolean) || widths.some(Boolean)
  }

  function include<R extends { readonly index: number }>(
    batch: RecordBatch<R>,
    tracker: ExtentTracker,
    lookup: (index: number) => R | undefined,
    shift = 0,
  ): void {
    tracker.forEachId((id) => {
      const index = id >> shift
      if (batch.has(index)) return
      const record = lookup(index)
      if (record) batch.add(record)
    })
  }

  return {
    nodes,
    edges,
    palette,
    markLayers,
    remeasure,

    get layers() {
      return layers
    },

    scales() {
      return {
        color: colorView(sharedColor),
        size: numberView(sharedSize, false),
        width: numberView(sharedWidth, true),
        nodeColors: nodeColors.map((state) => state && colorView(state)),
        edgeColors: edgeColors.map((state) => state && colorView(state)),
        sizes: sizes.map((state) => state && numberView(state, false)),
        widths: widths.map((state) => state && numberView(state, true)),
        nodeColor: nodeHeld,
        edgeColor: edgeHeld,
        endColor: endHeld,
      }
    },

    setDefinition(definition) {
      const next = definition.scales
      if (!sameScale(next.color, scales.color)) {
        sharedColor.scale = resolveColorScale(next.color)
        full = true
      }
      if (!sameScale(next.size, scales.size)) {
        sharedSize.scale = resolveNumberScale(next.size, sizeFallback)
        full = true
      }
      if (!sameScale(next.width, scales.width)) {
        sharedWidth.scale = resolveNumberScale(next.width, widthFallback)
        full = true
      }
      scales = next
      const marks = definition.marks
      wanted = { nodes: wantedColors(marks, 'nodes'), edges: wantedColors(marks, 'edges') }
      const ownSizes = syncNumbers(sizes, ownScales(marks, 'nodes', 'size'), sizeFallback)
      const ownWidths = syncNumbers(widths, ownScales(marks, 'edges', 'width'), widthFallback)
      sizes = ownSizes.states
      widths = ownWidths.states
      if (ownSizes.moved || ownWidths.moved) moved = true
      compiledNodeMark = null
      compiledEdgeMark = null
      if (markLayers.setMarks(definition.marks)) lanes.setRanks(markLayers.edgeRanks)
      const nextLayers = layersOf(definition.marks)
      slots.clear()
      definition.marks.forEach((mark, position) => {
        slots.set(mark, nextLayers[position]?.slot ?? 0)
      })
      const changed =
        nextLayers.length !== layers.length ||
        nextLayers.some(
          (layer, i) => layer.kind !== layers[i]?.kind || layer.slot !== layers[i]?.slot,
        )
      if (changed) {
        layers = nextLayers
        layersDirty = true
      }
    },

    apply(model, changes) {
      claimAll(model, changes)
      for (const { index } of changes.nodes.removed) removeNode(index)
      for (const { index } of changes.edges.removed) removeEdge(index)
      if (moved) {
        for (const state of colorStates()) state.clear()
        for (const state of numberStates(sharedSize, sizes)) state.clear()
        for (const state of numberStates(sharedWidth, widths)) state.clear()
        moved = false
        full = true
      }

      nodeBatch.reset()
      edgeBatch.reset()
      if (full) {
        nodeHeld = []
        edgeHeld = []
        endHeld = []
        for (const state of colorStates()) state.recount()
        for (const record of model.nodes()) nodeBatch.add(record)
        for (const record of model.edges()) edgeBatch.add(record)
        full = false
      } else {
        for (const refs of [changes.nodes.added, changes.nodes.updated]) {
          for (const { index } of refs) {
            const record = model.nodeAt(index)
            if (record) nodeBatch.add(record)
          }
        }
        for (const refs of [changes.edges.added, changes.edges.updated]) {
          for (const { index } of refs) {
            const record = model.edgeAt(index)
            if (record) edgeBatch.add(record)
          }
        }
      }
      if (nodeBatch.maxIndex >= 0) nodes.reserve(nodeBatch.maxIndex)
      if (edgeBatch.maxIndex >= 0) edges.reserve(edgeBatch.maxIndex)
      for (const record of nodeBatch.records) readNode(record)
      for (const record of edgeBatch.records) readEdge(record)

      const nodeAt = (index: number) => model.nodeAt(index)
      const edgeAt = (index: number) => model.edgeAt(index)
      for (const state of colorStates()) {
        const next = state.scale.needsExtent ? state.dataExtent(endsSeen) : null
        if (sameExtent(next, state.extent)) continue
        state.extent = next
        include(nodeBatch, state.nodes, nodeAt)
        include(edgeBatch, state.edges, edgeAt)
        include(edgeBatch, state.ends, edgeAt, 1)
      }
      for (const state of numberStates(sharedSize, sizes)) {
        const next = state.scale.needsExtent ? state.dataExtent(false) : null
        if (sameExtent(next, state.domain)) continue
        state.domain = next
        include(nodeBatch, state.values, nodeAt)
      }
      for (const state of numberStates(sharedWidth, widths)) {
        const next = state.scale.needsExtent ? state.dataExtent(true) : null
        if (sameExtent(next, state.domain)) continue
        state.domain = next
        include(edgeBatch, state.values, edgeAt)
        include(edgeBatch, state.ends, edgeAt, 1)
      }

      for (const record of nodeBatch.records) writeNode(record)
      lanes.reserve(changes.edges.added.length)
      for (const record of edgeBatch.records) writeEdge(record)
      lanes.write(edges, dirtyEdges)
      for (const state of colorStates()) state.settle(countHeld)
    },

    takeDirty() {
      const dirty: SceneDirty = {
        nodes: dirtyNodes,
        edges: dirtyEdges,
        palette: palette.version !== paletteVersion,
        layers: layersDirty,
      }
      spareNodes.clear()
      spareEdges.clear()
      dirtyNodes = spareNodes
      dirtyEdges = spareEdges
      spareNodes = dirty.nodes
      spareEdges = dirty.edges
      paletteVersion = palette.version
      layersDirty = false
      return dirty
    },
  }
}
