import type { Key, Layout, LayoutGraph } from '../types'
import { centroid, degrees, indexOfKey, instant, movers, spacingOf } from './shared'

/** Options of `radial`. */
export interface RadialOptions {
  /**
   * Start of the walk, the free node with the most edges by default. Several roots share the inner
   * ring, and a single fixed root keeps its place.
   */
  readonly root?: Key | readonly Key[] | undefined
  /**
   * Smallest gap between two rings, and between two nodes of a ring, from the borders of the
   * largest nodes, in world units. Defaults to the largest diameter, and at least 24.
   */
  readonly spacing?: number | undefined
}

interface Tree {
  readonly level: Int32Array
  readonly parent: Int32Array
  readonly order: Int32Array
  readonly reached: number
}

function rootsOf(graph: LayoutGraph, indices: readonly number[], root: RadialOptions['root']) {
  const keys = root === undefined ? [] : Array.isArray(root) ? root : [root as Key]
  const found = keys.map((key) => indexOfKey(graph, key)).filter((index) => index >= 0)
  if (found.length > 0) return [...new Set(found)]
  const degree = degrees(graph)
  let best = indices[0] ?? -1
  for (const index of indices) {
    if ((degree[index] ?? 0) > (degree[best] ?? 0)) best = index
  }
  return best < 0 ? [] : [best]
}

function breadthFirst(graph: LayoutGraph, roots: readonly number[]): Tree {
  const capacity = graph.capacity
  const degree = degrees(graph)
  const offsets = new Uint32Array(capacity + 1)
  for (let index = 0; index < capacity; index++) {
    offsets[index + 1] = (offsets[index] ?? 0) + (degree[index] ?? 0)
  }
  const fill = offsets.slice(0, capacity)
  const neighbors = new Uint32Array(graph.edges.length)
  for (let at = 0; at < graph.edges.length; at += 2) {
    const a = graph.edges[at] ?? 0
    const b = graph.edges[at + 1] ?? 0
    const atA = fill[a] ?? 0
    const atB = fill[b] ?? 0
    neighbors[atA] = b
    neighbors[atB] = a
    fill[a] = atA + 1
    fill[b] = atB + 1
  }
  const level = new Int32Array(capacity).fill(-1)
  const parent = new Int32Array(capacity).fill(-1)
  const order = new Int32Array(capacity)
  let tail = 0
  for (const root of roots) {
    level[root] = 0
    order[tail++] = root
  }
  for (let head = 0; head < tail; head++) {
    const node = order[head] ?? 0
    for (let at = offsets[node] ?? 0; at < (offsets[node + 1] ?? 0); at++) {
      const next = neighbors[at] ?? 0
      if (graph.movable[next] !== 1 || (level[next] ?? 0) >= 0) continue
      level[next] = (level[node] ?? 0) + 1
      parent[next] = node
      order[tail++] = next
    }
  }
  return { level, parent, order, reached: tail }
}

function spread(layer: readonly number[], angle: Float64Array, gap: number): number[] {
  const order = layer.map((_, at) => at)
  order.sort((a, b) => (angle[layer[a] ?? 0] ?? 0) - (angle[layer[b] ?? 0] ?? 0))
  const desired = order.map((at) => angle[layer[at] ?? 0] ?? 0)
  let cut = 0
  let widest = -1
  for (let at = 0; at < desired.length; at++) {
    const next = at + 1 < desired.length ? (desired[at + 1] ?? 0) : (desired[0] ?? 0) + 2 * Math.PI
    if (next - (desired[at] ?? 0) > widest) {
      widest = next - (desired[at] ?? 0)
      cut = (at + 1) % desired.length
    }
  }
  const line = desired.map((_, at) => {
    const from = (cut + at) % desired.length
    return (desired[from] ?? 0) + (from < cut ? 2 * Math.PI : 0)
  })
  const clusters: { count: number; sum: number }[] = []
  for (const value of line) {
    let cluster = { count: 1, sum: value }
    for (;;) {
      const previous = clusters[clusters.length - 1]
      if (!previous) break
      const end = previous.sum / previous.count + previous.count * gap
      if (end <= cluster.sum / cluster.count) break
      clusters.pop()
      cluster = {
        count: previous.count + cluster.count,
        sum: previous.sum + cluster.sum - cluster.count * previous.count * gap,
      }
    }
    clusters.push(cluster)
  }
  const placed = new Array<number>(layer.length)
  let at = 0
  for (const cluster of clusters) {
    const first = cluster.sum / cluster.count
    for (let k = 0; k < cluster.count; k++) {
      const slot = order[(cut + at) % desired.length] ?? 0
      placed[slot] = first + k * gap
      at++
    }
  }
  return placed
}

/**
 * A layout that walks the graph from its roots and puts each node on the ring of its distance,
 * next to the node it was reached from. It ends at once, and nodes glide to their place.
 */
export function radial(options: RadialOptions = {}): Layout {
  return instant('radial', options, (graph) => {
    const xy = Float32Array.from(graph.xy)
    const indices = movers(graph)
    if (indices.length === 0) return xy
    const spacing = spacingOf(graph, indices, options.spacing)
    const roots = rootsOf(graph, indices, options.root)
    const tree = breadthFirst(graph, roots)
    let [x, y] = centroid(graph, indices)
    const lone = roots.length === 1 ? (roots[0] ?? -1) : -1
    if (lone >= 0 && graph.movable[lone] !== 1) {
      x = graph.xy[lone * 2] ?? 0
      y = graph.xy[lone * 2 + 1] ?? 0
    }
    const leaves = new Float64Array(graph.capacity)
    for (let at = tree.reached - 1; at >= 0; at--) {
      const index = tree.order[at] ?? 0
      leaves[index] = Math.max(1, leaves[index] ?? 0)
      const parent = tree.parent[index] ?? -1
      if (parent >= 0) leaves[parent] = (leaves[parent] ?? 0) + (leaves[index] ?? 0)
    }
    let total = 0
    for (const root of roots) total += leaves[root] ?? 0
    const start = new Float64Array(graph.capacity)
    const angle = new Float64Array(graph.capacity)
    let cursor = -Math.PI / 2
    for (const root of roots) {
      const wedge = (2 * Math.PI * (leaves[root] ?? 0)) / total
      start[root] = cursor
      angle[root] = roots.length === 1 ? -Math.PI / 2 : cursor + wedge / 2
      cursor += wedge
    }
    const fill = Float64Array.from(start)
    let deepest = 0
    for (let at = 0; at < tree.reached; at++) {
      const index = tree.order[at] ?? 0
      deepest = Math.max(deepest, tree.level[index] ?? 0)
      const parent = tree.parent[index] ?? -1
      if (parent < 0) continue
      const wedge = (2 * Math.PI * (leaves[index] ?? 0)) / total
      start[index] = fill[parent] ?? 0
      fill[index] = start[index] ?? 0
      fill[parent] = (fill[parent] ?? 0) + wedge
      angle[index] = (start[index] ?? 0) + wedge / 2
    }
    const layers: number[][] = Array.from({ length: deepest + 1 }, () => [])
    for (let at = 0; at < tree.reached; at++) {
      const index = tree.order[at] ?? 0
      layers[tree.level[index] ?? 0]?.push(index)
    }
    let radius = -spacing
    for (const [depth, layer] of layers.entries()) {
      const lonely = depth === 0 && layer.length === 1
      radius = lonely ? 0 : Math.max(radius + spacing, (layer.length * spacing) / (2 * Math.PI))
      const placed = lonely ? [angle[layer[0] ?? 0] ?? 0] : spread(layer, angle, spacing / radius)
      layer.forEach((index, at) => {
        if (graph.movable[index] !== 1) return
        const theta = placed[at] ?? 0
        xy[index * 2] = x + Math.cos(theta) * radius
        xy[index * 2 + 1] = y + Math.sin(theta) * radius
      })
    }
    const strays = indices.filter((index) => (tree.level[index] ?? -1) < 0)
    if (strays.length > 0) {
      const outer = Math.max(radius + spacing, (strays.length * spacing) / (2 * Math.PI))
      strays.forEach((index, at) => {
        const theta = -Math.PI / 2 + (2 * Math.PI * at) / strays.length
        xy[index * 2] = x + Math.cos(theta) * outer
        xy[index * 2 + 1] = y + Math.sin(theta) * outer
      })
    }
    return xy
  })
}
