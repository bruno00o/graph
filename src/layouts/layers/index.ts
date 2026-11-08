import { groupGap, separateGroups } from '../../core/group-separation'
import { groupTree } from '../../core/group-tree'
import type { Key, Layout, LayoutGraph } from '../../types'
import { centroid, instant, movers } from '../shared'
import { components, distinct } from './adjacency'
import { acyclicRanks } from './cycles'
import { orderNested } from './nested-order'
import {
  type Clusters,
  clustersOf,
  type Extents,
  expandNested,
  extentsOf,
  type Sides,
  separations,
} from './nesting'
import { orderLayers } from './order'
import { placeNodes } from './place'
import { layerNodes, nestedLayers } from './ranks'
import { expand, type Layered, sortAdjacency } from './structure'

/** Where edges point. `'down'` puts the first layer at the top, `'right'` at the left. */
export type LayersDirection = 'down' | 'up' | 'right' | 'left'

/** Options of `layers`. */
export interface LayersOptions {
  /**
   * Where edges point: `'down'` puts the first layer at the top, `'right'` at the left.
   * @default 'down'
   */
  readonly direction?: LayersDirection | undefined
  /**
   * Nodes forced onto the first layer, the nodes without incoming edges by default. Edges into them
   * are turned around, and edges between two roots are left out.
   */
  readonly root?: Key | readonly Key[] | undefined
  /**
   * Gap between two layers, from the borders of their largest nodes, in world units. Defaults to
   * twice the largest diameter, and at least that diameter plus 24. The diameter of a box is the
   * smaller of its width and height.
   */
  readonly layerSpacing?: number | undefined
  /**
   * Gap between the borders of two neighboring nodes of a layer, in world units. Defaults to the
   * largest diameter, and at least 8.
   */
  readonly nodeSpacing?: number | undefined
}

function gapOf(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback
}

function pinnedOf(
  graph: LayoutGraph,
  indices: readonly number[],
  root: LayersOptions['root'],
): Uint8Array {
  const pinned = new Uint8Array(indices.length)
  if (root === undefined) return pinned
  const keys = new Set<Key>(Array.isArray(root) ? root : [root as Key])
  indices.forEach((index, at) => {
    const key = graph.keys[index]
    if (key !== undefined && keys.has(key)) pinned[at] = 1
  })
  return pinned
}

const sidesOf: Readonly<Record<LayersDirection, Sides>> = {
  down: [0, 2, 3, 1],
  up: [2, 0, 3, 1],
  right: [3, 1, 0, 2],
  left: [1, 3, 0, 2],
}

interface Arranged {
  readonly placed: Float64Array
  readonly clusters: Clusters | null
}

function arrange(graph: LayoutGraph, indices: readonly number[], options: LayersOptions): Arranged {
  const count = indices.length
  const local = new Int32Array(graph.capacity).fill(-1)
  const radius = new Float64Array(count)
  const depth = new Float64Array(count)
  const extents = graph.extents
  const sideways = options.direction === 'left' || options.direction === 'right'
  let largest = 0
  indices.forEach((index, at) => {
    local[index] = at
    const own = Math.max(0, graph.radius[index] ?? 0)
    const halfWidth = extents ? Math.max(0, extents[index * 2] ?? 0) : own
    const halfHeight = extents ? Math.max(0, extents[index * 2 + 1] ?? 0) : own
    radius[at] = sideways ? halfHeight : halfWidth
    depth[at] = sideways ? halfWidth : halfHeight
    largest = Math.max(largest, Math.min(halfWidth, halfHeight) * 2)
  })
  const nodeSpacing = gapOf(options.nodeSpacing, Math.max(largest, 8))
  const layerSpacing = gapOf(options.layerSpacing, Math.max(largest * 2, largest + 24))
  const pinned = pinnedOf(graph, indices, options.root)
  const from = new Int32Array(graph.edges.length / 2)
  const to = new Int32Array(graph.edges.length / 2)
  let edgeCount = 0
  for (let at = 0; at + 1 < graph.edges.length; at += 2) {
    const source = local[graph.edges[at] ?? 0] ?? -1
    const target = local[graph.edges[at + 1] ?? 0] ?? -1
    if (source < 0 || target < 0 || source === target) continue
    if (pinned[source] === 1 && pinned[target] === 1) continue
    from[edgeCount] = source
    to[edgeCount] = target
    edgeCount++
  }
  const roots = Int32Array.from(indices.keys()).filter((at) => pinned[at] === 1)
  const rank = acyclicRanks(count, from.subarray(0, edgeCount), to.subarray(0, edgeCount), roots)
  for (let edge = 0; edge < edgeCount; edge++) {
    const source = from[edge] ?? 0
    const target = to[edge] ?? 0
    if ((rank[source] ?? 0) > (rank[target] ?? 0)) {
      from[edge] = target
      to[edge] = source
    }
  }
  const successors = distinct(count, from, to, edgeCount)
  const topological = new Int32Array(count)
  for (let node = 0; node < count; node++) topological[rank[node] ?? 0] = node
  const clusters = clustersOf(graph, indices, sidesOf[options.direction ?? 'down'])
  if (clusters) {
    const nested = nestedLayers(count, successors, topological, pinned, clusters)
    const { layered, nest } = expandNested(
      count,
      nested.layer,
      nested.component,
      successors,
      radius,
      clusters,
    )
    orderNested(layered, nest)
    sortAdjacency(layered)
    const separation = separations(layered, nest, nodeSpacing)
    const across = placeNodes(layered, nodeSpacing, {
      separation,
      above: nest.above,
      below: nest.below,
    })
    return {
      placed: pack(
        layered,
        across,
        layerSpacing,
        depth,
        nest.side,
        extentsOf(layered, nest, depth),
      ),
      clusters,
    }
  }
  const component = components(count, successors)
  const layer = layerNodes(count, successors, topological, component, pinned)
  const layered = expand(count, layer, component, successors, radius)
  orderLayers(layered)
  sortAdjacency(layered)
  const across = placeNodes(layered, nodeSpacing)
  return { placed: pack(layered, across, layerSpacing, depth), clusters: null }
}

function pack(
  layered: Layered,
  across: Float64Array,
  layerSpacing: number,
  depth: Float64Array,
  side: Uint8Array | null = null,
  extents: Extents | null = null,
): Float64Array {
  const { real, slots, order, half, componentSlots } = layered
  const componentCount = componentSlots.length - 1
  const along = new Float64Array(slots.length - 1)
  const width = new Float64Array(componentCount)
  const height = new Float64Array(componentCount)
  const left = new Float64Array(componentCount)
  const lead = new Float64Array(componentCount)
  const size = new Int32Array(componentCount)
  for (let c = 0; c < componentCount; c++) {
    const first = componentSlots[c] ?? 0
    const last = componentSlots[c + 1] ?? 0
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    let firstHalf = 0
    let reach = 0
    for (let slot = first; slot < last; slot++) {
      let thick = 0
      let tail = 0
      for (let at = slots[slot] ?? 0; at < (slots[slot + 1] ?? 0); at++) {
        const node = order[at] ?? 0
        if (node >= real && (!side || side[node] === 0)) continue
        if (extents) {
          thick = Math.max(thick, extents.before[node] ?? 0)
          tail = Math.max(tail, extents.after[node] ?? 0)
          min = Math.min(min, (across[node] ?? 0) - (extents.left[node] ?? 0))
          max = Math.max(max, (across[node] ?? 0) + (extents.right[node] ?? 0))
        } else {
          thick = Math.max(thick, node < real ? (depth[node] ?? 0) : (half[node] ?? 0))
          min = Math.min(min, (across[node] ?? 0) - (half[node] ?? 0))
          max = Math.max(max, (across[node] ?? 0) + (half[node] ?? 0))
        }
        if (node < real) size[c] = (size[c] ?? 0) + 1
      }
      along[slot] = slot === first ? 0 : reach + layerSpacing + thick
      reach = (along[slot] ?? 0) + (extents ? tail : thick)
      if (slot === first) firstHalf = thick
    }
    left[c] = min
    lead[c] = extents ? firstHalf : 0
    width[c] = max - min
    height[c] = reach + firstHalf
  }
  const sorted = Array.from({ length: componentCount }, (_, c) => c)
  sorted.sort((a, b) => (size[b] ?? 0) - (size[a] ?? 0) || a - b)
  let area = 0
  let widest = 0
  for (let c = 0; c < componentCount; c++) {
    area += ((width[c] ?? 0) + layerSpacing) * ((height[c] ?? 0) + layerSpacing)
    widest = Math.max(widest, width[c] ?? 0)
  }
  const limit = Math.max(widest, Math.sqrt(area * 4))
  const offsetAcross = new Float64Array(componentCount)
  const offsetAlong = new Float64Array(componentCount)
  let cursor = 0
  let shelf = 0
  let shelfHeight = 0
  for (const c of sorted) {
    if (cursor > 0 && cursor + (width[c] ?? 0) > limit) {
      shelf += shelfHeight + layerSpacing
      cursor = 0
      shelfHeight = 0
    }
    offsetAcross[c] = cursor - (left[c] ?? 0)
    offsetAlong[c] = shelf + (lead[c] ?? 0)
    cursor += (width[c] ?? 0) + layerSpacing
    shelfHeight = Math.max(shelfHeight, height[c] ?? 0)
  }
  const placed = new Float64Array(real * 2)
  for (let c = 0; c < componentCount; c++) {
    const first = componentSlots[c] ?? 0
    const last = componentSlots[c + 1] ?? 0
    for (let slot = first; slot < last; slot++) {
      for (let at = slots[slot] ?? 0; at < (slots[slot + 1] ?? 0); at++) {
        const node = order[at] ?? 0
        if (node >= real) continue
        placed[node * 2] = (across[node] ?? 0) + (offsetAcross[c] ?? 0)
        placed[node * 2 + 1] = (along[slot] ?? 0) + (offsetAlong[c] ?? 0)
      }
    }
  }
  return placed
}

/**
 * A layout that draws a directed graph in layers, every edge between moving nodes pointing from one
 * layer to a later one. It ends at once, and nodes glide to their place. Fixed nodes stay put and
 * push moving nodes aside across the layers; where they leave too little room, overlaps may remain.
 */
export function layers(options: LayersOptions = {}): Layout {
  return instant(
    'layers',
    options,
    (graph) => {
      const xy = Float32Array.from(graph.xy)
      const indices = movers(graph)
      if (indices.length === 0) return xy
      const { placed, clusters } = arrange(graph, indices, options)
      const direction = options.direction ?? 'down'
      const sideways = direction === 'right' || direction === 'left'
      const flip = direction === 'up' || direction === 'left' ? -1 : 1
      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      for (let at = 0; at < indices.length; at++) {
        const across = placed[at * 2] ?? 0
        const along = (placed[at * 2 + 1] ?? 0) * flip
        const x = sideways ? along : across
        const y = sideways ? across : along
        placed[at * 2] = x
        placed[at * 2 + 1] = y
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      const [cx, cy] = centroid(graph, indices)
      const dx = cx - (minX + maxX) / 2
      const dy = cy - (minY + maxY) / 2
      indices.forEach((index, at) => {
        xy[index * 2] = (placed[at * 2] ?? 0) + dx
        xy[index * 2 + 1] = (placed[at * 2 + 1] ?? 0) + dy
      })
      if (clusters && (clusters.round || indices.length < countAlive(graph))) {
        separate(graph, xy, sideways ? 'y' : 'x')
      }
      return xy
    },
    false,
  )
}

function countAlive(graph: LayoutGraph): number {
  let count = 0
  for (let index = 0; index < graph.capacity; index++) if (graph.alive[index] === 1) count++
  return count
}

function separate(graph: LayoutGraph, xy: Float32Array, axis: 'x' | 'y'): void {
  const tree = groupTree(graph.capacity, graph.alive, graph.groups)
  if (!tree) return
  const fixed = new Uint8Array(graph.capacity)
  for (let index = 0; index < graph.capacity; index++) {
    fixed[index] = graph.movable[index] === 1 ? 0 : 1
  }
  separateGroups(tree, graph.alive, graph.radius, fixed, xy, {
    spacing: 0,
    groupSpacing: groupGap,
    rounds: 64,
    nodes: 'moved',
    axis,
  })
}
