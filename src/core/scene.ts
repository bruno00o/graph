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
  NodeMark,
  NodeShape,
  NumberScale,
  ScalesOptions,
} from '../types'
import {
  arrowCodes,
  containerCodes,
  containerShape,
  cornerCodes,
  dashCodes,
  EdgeColumns,
  type NodeBadge,
  NodeColumns,
  noColor,
  placementCodes,
  shapeCodes,
} from './columns'
import {
  type CompiledEdgeMark,
  type CompiledLabelText,
  type CompiledNodeMark,
  compileEdgeMark,
  compileNodeMark,
} from './compile-mark'
import { createEdgeLanes } from './edge-lanes'
import { flowSpeed } from './flow'
import type { EdgeRecord, ElementKind, GraphChanges, NodeRecord } from './graph-model'
import { IndexSet } from './index-set'
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

export interface SceneScales {
  readonly color: ResolvedColorScale
  readonly colorExtent: Extent | null
  readonly size: ResolvedNumberScale
  readonly sizeExtent: Extent | null
  readonly width: ResolvedNumberScale
  readonly widthExtent: Extent | null
  readonly nodeColor: readonly unknown[]
  readonly edgeColor: readonly unknown[]
}

export interface Scene {
  readonly nodes: NodeColumns
  readonly edges: EdgeColumns
  readonly palette: Palette
  readonly layers: readonly Layer[]
  scales(): SceneScales
  setDefinition(definition: GraphDefinition): void
  apply(model: SceneModel, changes: GraphChanges): void
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

function readBadges(mark: CompiledNodeMark, datum: unknown, palette: Palette): NodeBadge[] | null {
  if (mark.badges.length === 0) return null
  const badges: NodeBadge[] = []
  for (const [corner, read] of mark.badges) {
    const badge = read(datum)
    if (typeof badge !== 'object' || badge === null) continue
    const { text, fill, color } = badge as Record<string, unknown>
    badges.push({
      corner: cornerCodes[corner],
      text: typeof text === 'number' ? String(text) : toText(text) || null,
      fill: palette.id(toColor(fill) ?? defaults.badgeFill),
      color: palette.id(toColor(color) ?? defaults.badgeInk),
      ring: palette.id(defaults.badgeRing),
    })
  }
  return badges.length === 0 ? null : badges
}

function readBackground(value: unknown, palette: Palette): number {
  if (value === true) return palette.id(defaults.labelBackground)
  const color = toColor(value)
  return color ? palette.id(color) : noColor
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
  columns.labelColor[index] = color ? palette.id(color) : noColor
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

export function createScene(): Scene {
  const nodes = new NodeColumns()
  const edges = new EdgeColumns()
  const palette = new Palette()
  const lanes = createEdgeLanes()
  const slots = new Map<Mark, number>()
  const nodeBatch = new RecordBatch<SceneNodeRecord>()
  const edgeBatch = new RecordBatch<SceneEdgeRecord>()
  let compiledNodeMark: NodeMark<unknown> | null = null
  let compiledNode: CompiledNodeMark | null = null
  let compiledEdgeMark: EdgeMark<unknown> | null = null
  let compiledEdge: CompiledEdgeMark | null = null
  let slotMark: Mark | null = null
  let slotOfMark = 0
  let layers: Layer[] = []
  let layersDirty = false
  let paletteVersion = 0
  let dirtyNodes = new IndexSet()
  let dirtyEdges = new IndexSet()
  let spareNodes = new IndexSet()
  let spareEdges = new IndexSet()
  let scales: ScalesOptions = {}
  let colorScale: ResolvedColorScale = resolveColorScale(undefined)
  let sizeScale: ResolvedNumberScale = resolveNumberScale(undefined, {
    type: 'sqrt',
    range: defaults.nodeSizeRange,
  })
  let widthScale: ResolvedNumberScale = resolveNumberScale(undefined, {
    type: 'linear',
    range: defaults.edgeWidthRange,
  })
  let full = false
  const nodeColorValues: unknown[] = []
  const edgeColorValues: unknown[] = []
  const sizeValues: number[] = []
  const widthValues: number[] = []
  const nodeColorExtent = new ExtentTracker()
  const edgeColorExtent = new ExtentTracker()
  const sizeExtent = new ExtentTracker()
  const widthExtent = new ExtentTracker()
  let colorExtent: Extent | null = null
  let sizeDomain: Extent | null = null
  let widthDomain: Extent | null = null

  function track(tracker: ExtentTracker, index: number, value: unknown): void {
    if (typeof value === 'number' && Number.isFinite(value)) tracker.set(index, value)
    else tracker.delete(index)
  }

  function nodeMarkOf(record: NodeRecord): CompiledNodeMark {
    if (record.mark !== compiledNodeMark || !compiledNode) {
      compiledNodeMark = record.mark
      compiledNode = compileNodeMark(record.mark)
    }
    return compiledNode
  }

  function edgeMarkOf(record: SceneEdgeRecord): CompiledEdgeMark {
    const look = record.look ?? record.mark
    if (look !== compiledEdgeMark || !compiledEdge) {
      compiledEdgeMark = look
      compiledEdge = compileEdgeMark(look)
    }
    return compiledEdge
  }

  function slotOf(mark: Mark): number {
    if (mark !== slotMark) {
      slotMark = mark
      slotOfMark = slots.get(mark) ?? 0
    }
    return slotOfMark
  }

  function readNode(record: NodeRecord): void {
    const index = record.index
    const mark = nodeMarkOf(record)
    nodes.reserve(index)
    nodes.keys[index] = record.key
    const size = mark.size ? toNumber(mark.size(record.datum)) : Number.NaN
    const color = mark.color?.(record.datum)
    sizeValues[index] = size
    nodeColorValues[index] = color
    track(sizeExtent, index, size)
    track(nodeColorExtent, index, color)
  }

  function readEdge(record: EdgeRecord): void {
    const index = record.index
    const mark = edgeMarkOf(record)
    edges.reserve(index)
    edges.keys[index] = record.key
    const width = mark.width ? toNumber(mark.width(record.datum)) : Number.NaN
    const color = mark.color?.(record.datum)
    widthValues[index] = width
    edgeColorValues[index] = color
    track(widthExtent, index, width)
    track(edgeColorExtent, index, color)
  }

  function writeNode(record: SceneNodeRecord): void {
    const index = record.index
    const mark = nodeMarkOf(record)
    const datum = record.datum
    const size = sizeValues[index] ?? Number.NaN
    const fill =
      toColor(mark.fill?.(datum)) ??
      colorScale.map(nodeColorValues[index], colorExtent) ??
      defaults.nodeFill
    nodes.alive[index] = 1
    nodes.slot[index] = slotOf(record.mark)
    nodes.size[index] = Number.isNaN(size) ? defaults.nodeSize : sizeScale.map(size, sizeDomain)
    nodes.shape[index] = codeOf<NodeShape>(shapeCodes, mark.shape?.(datum))
    nodes.fill[index] = palette.id(fill)
    nodes.stroke[index] = palette.id(toColor(mark.stroke?.(datum)) ?? defaults.nodeStroke)
    nodes.strokeWidth[index] = finiteOr(mark.strokeWidth?.(datum), defaults.nodeStrokeWidth)
    const outline = mark.outline ? toColor(mark.outline(datum)) : null
    nodes.outline[index] = palette.id(outline ?? defaults.nodeOutline)
    nodes.outlineWidth[index] =
      mark.outline && !outline
        ? 0
        : Math.max(0, finiteOr(mark.outlineWidth?.(datum), outline ? defaults.nodeOutlineWidth : 0))
    nodes.opacity[index] = Math.min(1, Math.max(0, finiteOr(mark.opacity?.(datum), 1)))
    nodes.zoom.set(index, readMinZoom(mark.minZoom?.(datum)), readMaxZoom(mark.maxZoom?.(datum)))
    nodes.screenUnits[index] = mark.screenUnits ? 1 : 0
    nodes.label[index] = toText(mark.label?.(datum))
    nodes.secondary[index] = toText(mark.secondary?.(datum))
    nodes.labelBackground[index] = readBackground(mark.labelBackground?.(datum), palette)
    writeLabelText(nodes, index, mark.labelText, datum, palette)
    nodes.labelPlacement[index] = codeOf<LabelPlacement>(
      placementCodes,
      mark.labelPlacement?.(datum),
    )
    nodes.labelMinScreenSize[index] = positive(mark.labelMinScreenSize?.(datum))
    const image = readImage(mark.image?.(datum))
    nodes.image[index] = image?.src ?? null
    nodes.imageScale[index] = image?.scale ?? 1
    nodes.imageColor[index] = image?.color ? palette.id(image.color) : noColor
    nodes.badges[index] = readBadges(mark, datum, palette)
    nodes.container[index] = 0
    if (record.container) writeContainer(index, mark, datum)
    dirtyNodes.add(index)
  }

  function writeContainer(index: number, mark: CompiledNodeMark, datum: unknown): void {
    const look = mark.container
    nodes.container[index] = codeOf<ContainerShape>(containerCodes, look.shape?.(datum)) || 1
    nodes.padding[index] = Math.max(0, finiteOr(look.padding?.(datum), defaults.groupPadding))
    nodes.shape[index] = containerShape
    nodes.fill[index] = palette.id(toColor(look.fill?.(datum)) ?? defaults.groupFill)
    nodes.stroke[index] = palette.id(toColor(look.stroke?.(datum)) ?? defaults.groupStroke)
    nodes.strokeWidth[index] = Math.max(
      0,
      finiteOr(look.strokeWidth?.(datum), defaults.groupStrokeWidth),
    )
    nodes.outlineWidth[index] = 0
    nodes.screenUnits[index] = 0
    nodes.image[index] = null
    nodes.imageColor[index] = noColor
    nodes.badges[index] = null
    if (!mark.labelPlacement) nodes.labelPlacement[index] = placementCodes.top
  }

  function writeEdge(record: SceneEdgeRecord): void {
    const index = record.index
    const mark = edgeMarkOf(record)
    const datum = record.datum
    const width = widthValues[index] ?? Number.NaN
    const color =
      toColor(mark.stroke?.(datum)) ??
      colorScale.map(edgeColorValues[index], colorExtent) ??
      defaults.edgeColor
    edges.alive[index] = 1
    edges.slot[index] = slotOf(record.mark)
    edges.source[index] = record.sourceIndex
    edges.target[index] = record.targetIndex
    lanes.link(index, record.sourceIndex, record.targetIndex)
    edges.color[index] = palette.id(color)
    edges.width[index] = Number.isNaN(width)
      ? defaults.edgeWidth
      : widthScale.map(width, widthDomain)
    edges.dash[index] = codeOf<EdgeDash>(dashCodes, mark.dash?.(datum))
    edges.arrow[index] = codeOf<EdgeArrow>(arrowCodes, mark.arrow?.(datum))
    edges.opacity[index] = Math.min(1, Math.max(0, finiteOr(mark.opacity?.(datum), 1)))
    edges.zoom.set(index, readMinZoom(mark.minZoom?.(datum)), readMaxZoom(mark.maxZoom?.(datum)))
    edges.setFlow(index, mark.flow ? flowSpeed(mark.flow(datum)) : 0)
    const geodesic = mark.geodesic?.(datum) === true
    edges.geodesic[index] = geodesic ? 1 : 0
    edges.bundle[index] =
      record.sourceIndex !== record.targetIndex && !geodesic && mark.bundle?.(datum) !== false
        ? 1
        : 0
    edges.label[index] = toText(mark.label?.(datum))
    edges.labelBackground[index] = readBackground(mark.labelBackground?.(datum), palette)
    writeLabelText(edges, index, mark.labelText, datum, palette)
    dirtyEdges.add(index)
  }

  function removeNode(index: number): void {
    nodes.clear(index)
    sizeValues[index] = Number.NaN
    nodeColorValues[index] = undefined
    sizeExtent.delete(index)
    nodeColorExtent.delete(index)
    dirtyNodes.add(index)
  }

  function removeEdge(index: number): void {
    lanes.unlink(index)
    edges.clear(index)
    widthValues[index] = Number.NaN
    edgeColorValues[index] = undefined
    widthExtent.delete(index)
    edgeColorExtent.delete(index)
    dirtyEdges.add(index)
  }

  function include<R extends { readonly index: number }>(
    batch: RecordBatch<R>,
    tracker: ExtentTracker,
    lookup: (index: number) => R | undefined,
  ): void {
    tracker.forEachId((index) => {
      if (batch.has(index)) return
      const record = lookup(index)
      if (record) batch.add(record)
    })
  }

  return {
    nodes,
    edges,
    palette,

    get layers() {
      return layers
    },

    scales() {
      return {
        color: colorScale,
        colorExtent: combineExtents(nodeColorExtent.extent, edgeColorExtent.extent),
        size: sizeScale,
        sizeExtent: sizeExtent.extent,
        width: widthScale,
        widthExtent: widthExtent.extent,
        nodeColor: nodeColorValues,
        edgeColor: edgeColorValues,
      }
    },

    setDefinition(definition) {
      const next = definition.scales
      if (!sameScale(next.color, scales.color)) {
        colorScale = resolveColorScale(next.color)
        full = true
      }
      if (!sameScale(next.size, scales.size)) {
        sizeScale = resolveNumberScale(next.size, { type: 'sqrt', range: defaults.nodeSizeRange })
        full = true
      }
      if (!sameScale(next.width, scales.width)) {
        widthScale = resolveNumberScale(next.width, {
          type: 'linear',
          range: defaults.edgeWidthRange,
        })
        full = true
      }
      scales = next
      const nextLayers = layersOf(definition.marks)
      slots.clear()
      slotMark = null
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
      for (const { index } of changes.nodes.removed) removeNode(index)
      for (const { index } of changes.edges.removed) removeEdge(index)

      nodeBatch.reset()
      edgeBatch.reset()
      if (full) {
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

      const nextColor = colorScale.needsExtent
        ? combineExtents(nodeColorExtent.extent, edgeColorExtent.extent)
        : null
      if (!sameExtent(nextColor, colorExtent)) {
        colorExtent = nextColor
        include(nodeBatch, nodeColorExtent, (index) => model.nodeAt(index))
        include(edgeBatch, edgeColorExtent, (index) => model.edgeAt(index))
      }
      const nextSize = sizeScale.needsExtent ? sizeExtent.extent : null
      if (!sameExtent(nextSize, sizeDomain)) {
        sizeDomain = nextSize
        include(nodeBatch, sizeExtent, (index) => model.nodeAt(index))
      }
      const nextWidth = widthScale.needsExtent ? widthExtent.extent : null
      if (!sameExtent(nextWidth, widthDomain)) {
        widthDomain = nextWidth
        include(edgeBatch, widthExtent, (index) => model.edgeAt(index))
      }

      for (const record of nodeBatch.records) writeNode(record)
      lanes.reserve(changes.edges.added.length)
      for (const record of edgeBatch.records) writeEdge(record)
      lanes.write(edges, dirtyEdges)
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
