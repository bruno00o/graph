import type { Key, Layout, LayoutGraph } from '../../types'
import { centroid, instant, movers } from '../shared'
import { distinct } from './adjacency'
import { acyclicRanks } from './cycles'
import { orderLayers } from './order'
import { placeNodes } from './place'
import { components, layerNodes } from './ranks'
import { expand, type Layered, sortAdjacency } from './structure'

export type LayersDirection = 'down' | 'up' | 'right' | 'left'

export interface LayersOptions {
  readonly direction?: LayersDirection
  readonly root?: Key | readonly Key[]
  readonly layerSpacing?: number
  readonly nodeSpacing?: number
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

function arrange(
  graph: LayoutGraph,
  indices: readonly number[],
  options: LayersOptions,
): Float64Array {
  const count = indices.length
  const local = new Int32Array(graph.capacity).fill(-1)
  const radius = new Float64Array(count)
  let largest = 0
  indices.forEach((index, at) => {
    local[index] = at
    radius[at] = Math.max(0, graph.radius[index] ?? 0)
    largest = Math.max(largest, (radius[at] ?? 0) * 2)
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
  const component = components(count, successors)
  const layer = layerNodes(count, successors, topological, component, pinned)
  const layered = expand(count, layer, component, successors, radius)
  orderLayers(layered)
  sortAdjacency(layered)
  const across = placeNodes(layered, nodeSpacing)
  return pack(layered, across, layerSpacing)
}

function pack(layered: Layered, across: Float64Array, layerSpacing: number): Float64Array {
  const { real, slots, order, half, componentSlots } = layered
  const componentCount = componentSlots.length - 1
  const along = new Float64Array(slots.length - 1)
  const width = new Float64Array(componentCount)
  const height = new Float64Array(componentCount)
  const left = new Float64Array(componentCount)
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
      for (let at = slots[slot] ?? 0; at < (slots[slot + 1] ?? 0); at++) {
        const node = order[at] ?? 0
        if (node >= real) continue
        thick = Math.max(thick, half[node] ?? 0)
        min = Math.min(min, (across[node] ?? 0) - (half[node] ?? 0))
        max = Math.max(max, (across[node] ?? 0) + (half[node] ?? 0))
        size[c] = (size[c] ?? 0) + 1
      }
      along[slot] = slot === first ? 0 : reach + layerSpacing + thick
      reach = (along[slot] ?? 0) + thick
      if (slot === first) firstHalf = thick
    }
    left[c] = min
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
    offsetAlong[c] = shelf
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

export function layers(options: LayersOptions = {}): Layout {
  return instant('layers', options, (graph) => {
    const xy = Float32Array.from(graph.xy)
    const indices = movers(graph)
    if (indices.length === 0) return xy
    const placed = arrange(graph, indices, options)
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
    return xy
  })
}
