import { containerShape, noColor } from '../core/columns'
import type { Scene, SceneColorScale, SceneNumberScale, SceneScales } from '../core/scene'
import { edgeShown, nodeShown, type Sight } from '../core/visibility'
import type {
  EdgeDash,
  EdgeMark,
  Key,
  Mark,
  MarkLayer,
  MarkName,
  NodeMark,
  NodeShape,
} from '../types'

/** A value of the `color` channel, as read from an item. */
export type LegendValue = string | number | boolean

/** A category of a categorical or function color scale, with what the graph draws of it. */
export interface LegendCategory {
  /**
   * Identifies the item across updates: `c:`, the type of the value, `:` and the value, such as
   * `c:string:north`. A category of the own scale of a mark has the id of the mark after `c:`, such
   * as `c:n1:string:north`.
   */
  readonly id: string
  /** Always `'category'`. */
  readonly kind: 'category'
  /** Value of the `color` channel. */
  readonly value: LegendValue
  /** CSS color the scale gives the value, such as `var(--graph-cat-1)`. */
  readonly color: string
  /** Number of nodes drawn with this value. */
  readonly nodes: number
  /** Number of edges drawn with this value. */
  readonly edges: number
  /** `true` while the item is switched off. */
  readonly off: boolean
}

/** Legend of a categorical color scale, or of a function, by distinct value. */
export interface LegendCategories {
  /** Always `'categories'`. */
  readonly type: 'categories'
  /**
   * Categories in the order of their colors: the values of the domain, then the values drawn, in
   * order of appearance. At most 64, plus the items switched off.
   */
  readonly items: readonly LegendCategory[]
}

/** Legend of a sequential color scale: a ramp between two values. */
export interface LegendRamp {
  /** Always `'ramp'`. */
  readonly type: 'ramp'
  /** Values at both ends: the domain of the scale, or the extent of the data. */
  readonly domain: readonly [number, number]
  /** CSS colors spread evenly from one end to the other, mixed in the Oklab space. */
  readonly stops: readonly string[]
}

/** Legend of the `color` scale: categories or a ramp. */
export type LegendColor = LegendCategories | LegendRamp

/** A value of a number scale and what it becomes. */
export interface LegendSize {
  /** Value of the channel. */
  readonly value: number
  /** Diameter of a node in world units, or width of an edge in screen pixels. */
  readonly size: number
}

/** Legend of the `size` or `width` scale: a few values, from the smallest to the largest. */
export interface LegendSizes {
  /** Values at both ends: the domain of the scale, or the extent of the data. */
  readonly domain: readonly [number, number]
  /** The ends of the domain, and a rounded value between them when they differ. */
  readonly items: readonly LegendSize[]
}

/** The nodes of a mark drawn with one shape and one image. `N` is the name of the mark. */
export interface LegendNodeLook<N extends MarkName = MarkName> {
  /** Identifies the item across updates. */
  readonly id: string
  /** Always `'nodes'`. */
  readonly kind: 'nodes'
  /** Name of the mark, or `undefined` for a mark without one. */
  readonly mark: N
  /** Shape of these nodes. */
  readonly shape: NodeShape
  /** URL of their image, or `null`. Images are left out of the looks when a mark has many. */
  readonly image: string | null
  /** CSS color their image is drawn in, or `null` for its own colors. */
  readonly imageColor: string | null
  /** Number of nodes drawn with this look. */
  readonly count: number
  /** `true` while the item is switched off. */
  readonly off: boolean
}

/** The edges of a mark drawn with one line pattern. `N` is the name of the mark. */
export interface LegendEdgeLook<N extends MarkName = MarkName> {
  /** Identifies the item across updates. */
  readonly id: string
  /** Always `'edges'`. */
  readonly kind: 'edges'
  /** Name of the mark, or `undefined` for a mark without one. */
  readonly mark: N
  /** Line pattern of these edges. */
  readonly dash: EdgeDash
  /** Number of edges drawn with this look. */
  readonly count: number
  /** `true` while the item is switched off. */
  readonly off: boolean
}

/**
 * Legend of the scales of one mark that has scales of its own, set by its `scales` option. `N` is
 * the name of the mark.
 */
export interface LegendMarkScales<N extends MarkName = MarkName> {
  /**
   * Identifies the mark across updates: `n` for a node mark or `e` for an edge mark, then the
   * position of the mark among the marks of its kind, from 0, such as `n1`.
   */
  readonly id: string
  /** Kind of the elements of the mark. */
  readonly kind: 'nodes' | 'edges'
  /** Name of the mark, or `undefined` for a mark without one. */
  readonly mark: N
  /** Legend of the own `color` scale of the mark, or `null` without one or without a value. */
  readonly color: LegendColor | null
  /** Legend of the own `size` scale of a node mark, or `null` without one or without a value. */
  readonly size: LegendSizes | null
  /** Legend of the own `width` scale of an edge mark, or `null` without one or without a value. */
  readonly width: LegendSizes | null
}

/** Legend of the own scales of one mark of `M`, with the name of that mark. */
export type LegendScalesOf<M extends Mark = Mark> =
  M extends NodeMark<infer _T, infer N, MarkLayer>
    ? LegendMarkScales<N>
    : M extends EdgeMark<infer _T, infer N, MarkLayer>
      ? LegendMarkScales<N>
      : LegendMarkScales

/** Look of the elements of one mark of `M`: shape and image for nodes, line pattern for edges. */
export type LegendLook<M extends Mark = Mark> =
  M extends NodeMark<infer _T, infer N, MarkLayer>
    ? LegendNodeLook<N>
    : M extends EdgeMark<infer _T, infer N, MarkLayer>
      ? LegendEdgeLook<N>
      : LegendNodeLook | LegendEdgeLook

/** An item that stands for a set of nodes and edges: a category or a look. */
export type LegendItem<M extends Mark = Mark> = LegendCategory | LegendLook<M>

export interface LegendReading {
  readonly color: LegendColor | null
  readonly size: LegendSizes | null
  readonly width: LegendSizes | null
  readonly marks: readonly LegendMarkScales[]
  readonly looks: readonly (LegendNodeLook | LegendEdgeLook)[]
  readonly crowded: ReadonlySet<number>
}

export interface LegendKeys {
  readonly nodes: Key[]
  readonly edges: Key[]
}

interface Count {
  nodes: number
  edges: number
}

interface NodeLookCount {
  readonly slot: number
  readonly shape: number
  readonly image: string | null
  readonly color: number
  count: number
}

interface EdgeLookCount {
  readonly slot: number
  readonly dash: number
  count: number
}

const maxValues = 64
const maxImages = 8
const shapes: readonly NodeShape[] = ['circle', 'square', 'diamond', 'circle', 'box']
const dashes: readonly EdgeDash[] = ['solid', 'dashed', 'dotted']

export function categoryId(value: unknown, mark = ''): string {
  return mark === ''
    ? `c:${typeof value}:${String(value)}`
    : `c:${mark}:${typeof value}:${String(value)}`
}

const ownCategory = /^c:([ne]\d+):/

export function categoryMark(id: string): string {
  return ownCategory.exec(id)?.[1] ?? ''
}

function markId(kind: 'nodes' | 'edges' | null, slot: number): string {
  return kind === null ? '' : `${kind === 'nodes' ? 'n' : 'e'}${slot}`
}

class ColorOwners {
  readonly #nodes: readonly string[]
  readonly #edges: readonly string[]
  readonly own: boolean

  constructor(scales: SceneScales) {
    this.#nodes = scales.nodeColors.map((scale, slot) => (scale ? markId('nodes', slot) : ''))
    this.#edges = scales.edgeColors.map((scale, slot) => (scale ? markId('edges', slot) : ''))
    this.own = this.#nodes.some(Boolean) || this.#edges.some(Boolean)
  }

  node(slot: number): string {
    return this.#nodes[slot] ?? ''
  }

  edge(slot: number): string {
    return this.#edges[slot] ?? ''
  }
}

function nodeLookId(slot: number, shape: number, image: string | null): string {
  return image === null ? `n:${slot}:${shape}` : `n:${slot}:${shape}:${image}`
}

function edgeLookId(slot: number, dash: number): string {
  return `e:${slot}:${dash}`
}

function isValue(value: unknown): value is LegendValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function between(d0: number, d1: number): number | null {
  const rounded = Number(((d0 + d1) / 2).toPrecision(2))
  return rounded > d0 && rounded < d1 ? rounded : null
}

function readSizes({ scale, extent }: SceneNumberScale): LegendSizes | null {
  const domain = scale.domain ?? extent
  if (domain === null) return null
  const low = Math.min(domain[0], domain[1])
  const high = Math.max(domain[0], domain[1])
  const middle = low === high ? null : between(low, high)
  const values = low === high ? [low] : middle === null ? [low, high] : [low, middle, high]
  return {
    domain: [domain[0], domain[1]],
    items: values.map((value) => ({ value, size: scale.map(value, extent) })),
  }
}

export function markNames(marks: readonly Mark[]): {
  readonly nodes: MarkName[]
  readonly edges: MarkName[]
} {
  const names: { nodes: MarkName[]; edges: MarkName[] } = { nodes: [], edges: [] }
  for (const mark of marks) names[mark.type].push((mark as { readonly name?: MarkName }).name)
  return names
}

function countValues(
  scene: Scene,
  scales: SceneScales,
  owners: ColorOwners,
  sight: Sight,
): Map<string, Map<unknown, Count>> {
  const { nodes, edges } = scene
  const { nodeColor, edgeColor, endColor } = scales
  const split = endColor.length > 0
  const counts = new Map<string, Map<unknown, Count>>()
  let lastMark = ''
  let lastValues: Map<unknown, Count> | undefined
  let last: unknown
  let lastCount: Count | undefined
  const entry = (mark: string, value: unknown): Count => {
    if (lastCount && value === last && mark === lastMark) return lastCount
    if (!lastValues || mark !== lastMark) {
      lastValues = counts.get(mark)
      if (!lastValues) {
        lastValues = new Map()
        counts.set(mark, lastValues)
      }
      lastMark = mark
    }
    let count = lastValues.get(value)
    if (!count) {
      count = { nodes: 0, edges: 0 }
      lastValues.set(value, count)
    }
    last = value
    lastCount = count
    return count
  }
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1 || nodes.shape[index] === containerShape) continue
    if (!nodeShown(nodes, index, sight)) continue
    const value = nodeColor[index]
    if (value === null || value === undefined) continue
    entry(owners.own ? owners.node(nodes.slot[index] ?? 0) : '', value).nodes++
  }
  for (let index = 0; index < edges.capacity; index++) {
    if (edges.alive[index] !== 1 || !edgeShown(nodes, edges, index, sight)) continue
    const mark = owners.own ? owners.edge(edges.slot[index] ?? 0) : ''
    const value = edgeColor[index]
    const near = split ? (endColor[index * 2] ?? value) : value
    const far = split ? (endColor[index * 2 + 1] ?? value) : value
    if (near !== null && near !== undefined) entry(mark, near).edges++
    if (far !== near && far !== null && far !== undefined) entry(mark, far).edges++
  }
  return counts
}

const noCounts: ReadonlyMap<unknown, Count> = new Map()

function readColor(
  { scale, extent }: SceneColorScale,
  mark: string,
  counts: ReadonlyMap<unknown, Count>,
  off: ReadonlySet<string>,
  known: ReadonlyMap<string, LegendCategory>,
): LegendColor | null {
  if (scale.kind === 'sequential') {
    const domain = scale.domain ?? extent
    return domain ? { type: 'ramp', domain: [domain[0], domain[1]], stops: scale.range } : null
  }
  const items: LegendCategory[] = []
  const seen = new Set<string>()
  const push = (value: unknown, listed: boolean, color: string | null) => {
    if (!isValue(value)) return
    const id = categoryId(value, mark)
    if (seen.has(id) || color === null) return
    const count = counts.get(value)
    const isOff = off.has(id)
    if (!count && !isOff && !listed) return
    seen.add(id)
    items.push({
      id,
      kind: 'category',
      value,
      color,
      nodes: count?.nodes ?? 0,
      edges: count?.edges ?? 0,
      off: isOff,
    })
  }
  if (scale.kind === 'categorical') {
    const listed = new Set(scale.listed)
    for (const value of scale.categories()) {
      if (items.length >= maxValues) break
      push(value, listed.has(value), scale.map(value, null))
    }
  } else {
    for (const value of counts.keys()) {
      if (items.length >= maxValues) break
      push(value, false, scale.map(value, null))
    }
  }
  for (const item of known.values()) {
    if (off.has(item.id) && categoryMark(item.id) === mark) push(item.value, true, item.color)
  }
  return items.length > 0 ? { type: 'categories', items } : null
}

function readMarks(
  scales: SceneScales,
  marks: readonly Mark[],
  counts: ReadonlyMap<string, ReadonlyMap<unknown, Count>>,
  off: ReadonlySet<string>,
  known: ReadonlyMap<string, LegendCategory>,
): LegendMarkScales[] {
  const names = markNames(marks)
  const read: LegendMarkScales[] = []
  const add = (kind: 'nodes' | 'edges', slot: number) => {
    const id = markId(kind, slot)
    const own = kind === 'nodes' ? scales.nodeColors[slot] : scales.edgeColors[slot]
    const sizes = (kind === 'nodes' ? scales.sizes : scales.widths)[slot]
    const values = counts.get(id)
    const used =
      own?.scale.kind === 'sequential'
        ? own.extent !== null
        : values !== undefined || hasOff(off, id)
    const color = own && used ? readColor(own, id, values ?? noCounts, off, known) : null
    const size = sizes && sizes.extent !== null ? readSizes(sizes) : null
    if (color === null && size === null) return
    read.push({
      id,
      kind,
      mark: names[kind][slot],
      color,
      size: kind === 'nodes' ? size : null,
      width: kind === 'edges' ? size : null,
    })
  }
  const nodeSlots = Math.max(scales.nodeColors.length, scales.sizes.length)
  const edgeSlots = Math.max(scales.edgeColors.length, scales.widths.length)
  for (let slot = 0; slot < nodeSlots; slot++) add('nodes', slot)
  for (let slot = 0; slot < edgeSlots; slot++) add('edges', slot)
  return read
}

function hasOff(off: ReadonlySet<string>, mark: string): boolean {
  for (const id of off) if (id.startsWith('c:') && categoryMark(id) === mark) return true
  return false
}

function crowdedSlots(scene: Scene): Set<number> {
  const { nodes } = scene
  const images = new Map<number, Set<string>>()
  const crowded = new Set<number>()
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1 || nodes.shape[index] === containerShape) continue
    const image = nodes.image[index] ?? null
    const slot = nodes.slot[index] ?? 0
    if (image === null || crowded.has(slot)) continue
    let set = images.get(slot)
    if (!set) {
      set = new Set()
      images.set(slot, set)
    }
    set.add(image)
    if (set.size > maxImages) crowded.add(slot)
  }
  return crowded
}

function nodeLookOf(nodes: Scene['nodes'], index: number, crowded: ReadonlySet<number>): string {
  const slot = nodes.slot[index] ?? 0
  const image = crowded.has(slot) ? null : (nodes.image[index] ?? null)
  return nodeLookId(slot, nodes.shape[index] ?? 0, image)
}

function readLooks(
  scene: Scene,
  marks: readonly Mark[],
  off: ReadonlySet<string>,
  crowded: ReadonlySet<number>,
  sight: Sight,
): (LegendNodeLook | LegendEdgeLook)[] {
  const names = markNames(marks)
  const { nodes, edges, palette } = scene
  const nodeLooks = new Map<string, NodeLookCount>()
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1 || !nodeShown(nodes, index, sight)) continue
    const shape = nodes.shape[index] ?? 0
    if (shape === containerShape) continue
    const id = nodeLookOf(nodes, index, crowded)
    const look = nodeLooks.get(id)
    if (look) {
      look.count++
      continue
    }
    const slot = nodes.slot[index] ?? 0
    const image = crowded.has(slot) ? null : (nodes.image[index] ?? null)
    const color = image === null ? noColor : (nodes.imageColor[index] ?? noColor)
    nodeLooks.set(id, { slot, shape, image, color, count: 1 })
  }
  const edgeLooks = new Map<string, EdgeLookCount>()
  for (let index = 0; index < edges.capacity; index++) {
    if (edges.alive[index] !== 1 || !edgeShown(nodes, edges, index, sight)) continue
    const slot = edges.slot[index] ?? 0
    const dash = edges.dash[index] ?? 0
    const id = edgeLookId(slot, dash)
    const look = edgeLooks.get(id)
    if (look) look.count++
    else edgeLooks.set(id, { slot, dash, count: 1 })
  }
  const nodeItems: LegendNodeLook[] = []
  for (const [id, look] of nodeLooks) {
    nodeItems.push({
      id,
      kind: 'nodes',
      mark: names.nodes[look.slot],
      shape: shapes[look.shape] ?? 'circle',
      image: look.image,
      imageColor: look.color === noColor ? null : (palette.colors[look.color] ?? null),
      count: look.count,
      off: off.has(id),
    })
  }
  const edgeItems: LegendEdgeLook[] = []
  for (const [id, look] of edgeLooks) {
    edgeItems.push({
      id,
      kind: 'edges',
      mark: names.edges[look.slot],
      dash: dashes[look.dash] ?? 'solid',
      count: look.count,
      off: off.has(id),
    })
  }
  const order = (a: { readonly id: string }, b: { readonly id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  return [...nodeItems.sort(order), ...edgeItems.sort(order)]
}

export function readLegend(
  scene: Scene,
  marks: readonly Mark[],
  off: ReadonlySet<string>,
  known: ReadonlyMap<string, LegendCategory>,
  sight: Sight,
): LegendReading {
  const scales = scene.scales()
  const crowded = crowdedSlots(scene)
  const owners = new ColorOwners(scales)
  const counts = countValues(scene, scales, owners, sight)
  return {
    color: readColor(scales.color, '', counts.get('') ?? noCounts, off, known),
    size: readSizes(scales.size),
    width: readSizes(scales.width),
    marks:
      owners.own || scales.sizes.some(Boolean) || scales.widths.some(Boolean)
        ? readMarks(scales, marks, counts, off, known)
        : [],
    looks: readLooks(scene, marks, off, crowded, sight),
    crowded,
  }
}

export const layerPrefix = 'l:'

function layerSlots(layers: Int32Array, names: readonly string[], ids: ReadonlySet<string>) {
  return Uint8Array.from(layers, (layer) =>
    layer >= 0 && ids.has(layerPrefix + names[layer]) ? 1 : 0,
  )
}

export interface KeyScope {
  readonly members?: ((index: number) => readonly Key[] | null) | undefined
  readonly nodes?: readonly number[] | undefined
  readonly edges?: readonly number[] | undefined
}

export function keysOf(
  scene: Scene,
  ids: ReadonlySet<string>,
  crowded: ReadonlySet<number>,
  scope: KeyScope = {},
): LegendKeys {
  const { nodes, edges } = scene
  const scales = scene.scales()
  const { nodeColor, edgeColor, endColor } = scales
  const owners = new ColorOwners(scales)
  const split = endColor.length > 0
  const keys: LegendKeys = { nodes: [], edges: [] }
  if (ids.size === 0) return keys
  let looks = false
  for (const id of ids) if (!id.startsWith('c:') && !id.startsWith(layerPrefix)) looks = true
  const { names, nodeLayers, edgeLayers } = scene.markLayers
  const nodeSlots = layerSlots(nodeLayers, names, ids)
  const edgeSlots = layerSlots(edgeLayers, names, ids)
  let lastValue: unknown
  let lastMark = ''
  let lastMatch = false
  const matches = (value: unknown, mark: string) => {
    if (value === null || value === undefined) return false
    if (value !== lastValue || mark !== lastMark) {
      lastValue = value
      lastMark = mark
      lastMatch = ids.has(categoryId(value, mark))
    }
    return lastMatch
  }
  const visitNode = (index: number) => {
    if (nodes.alive[index] !== 1 || nodes.shape[index] === containerShape) return
    const key = nodes.keys[index]
    if (key === undefined) return
    const slot = nodes.slot[index] ?? 0
    if (
      nodeSlots[slot] === 1 ||
      matches(nodeColor[index], owners.own ? owners.node(slot) : '') ||
      (looks && ids.has(nodeLookOf(nodes, index, crowded)))
    ) {
      keys.nodes.push(key)
    }
  }
  const visitEdge = (index: number) => {
    if (edges.alive[index] !== 1) return
    const key = edges.keys[index]
    if (key === undefined) return
    const slot = edges.slot[index] ?? 0
    const look = looks && ids.has(edgeLookId(slot, edges.dash[index] ?? 0))
    const mark = owners.own ? owners.edge(slot) : ''
    const value = edgeColor[index]
    const hit = split
      ? matches(endColor[index * 2] ?? value, mark) ||
        matches(endColor[index * 2 + 1] ?? value, mark)
      : matches(value, mark)
    if (edgeSlots[slot] !== 1 && !look && !hit) return
    const members = scope.members?.(index)
    if (members) for (const member of members) keys.edges.push(member)
    else keys.edges.push(key)
  }
  if (scope.nodes) for (const index of scope.nodes) visitNode(index)
  else for (let index = 0; index < nodes.capacity; index++) visitNode(index)
  if (scope.edges) for (const index of scope.edges) visitEdge(index)
  else for (let index = 0; index < edges.capacity; index++) visitEdge(index)
  return keys
}
