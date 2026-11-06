import { type Adjacency, components } from './adjacency'
import { type Clusters, nestingGraph } from './nesting'
import { simplex } from './simplex'

const maxIterations = 20

export function layerNodes(
  count: number,
  successors: Adjacency,
  topological: Int32Array,
  component: Int32Array,
  pinned: Uint8Array,
): Int32Array {
  const layer = simplex(count, successors, topological, maxIterations * count + 100)
  const top = new Int32Array(count).fill(Number.MAX_SAFE_INTEGER)
  for (let node = 0; node < count; node++) {
    const c = component[node] ?? 0
    top[c] = Math.min(top[c] ?? 0, layer[node] ?? 0)
  }
  for (let node = 0; node < count; node++) {
    const c = component[node] ?? 0
    layer[node] = pinned[node] === 1 ? 0 : (layer[node] ?? 0) - (top[c] ?? 0)
  }
  return layer
}

export function nestedLayers(
  real: number,
  successors: Adjacency,
  topological: Int32Array,
  pinned: Uint8Array,
  clusters: Clusters,
): { layer: Int32Array; component: Int32Array } {
  const nested = nestingGraph(real, successors, topological, clusters)
  const { count } = nested
  const ranked = simplex(
    count,
    nested.successors,
    nested.topological,
    maxIterations * count + 100,
    nested.lengths,
  )
  const part = components(count, nested.successors)
  const top = new Int32Array(count).fill(0x7fffffff)
  for (let node = 0; node < real; node++) {
    const c = part[node] ?? 0
    top[c] = Math.min(top[c] ?? 0, ranked[node] ?? 0)
  }
  const layer = new Int32Array(real)
  for (let node = 0; node < real; node++) {
    layer[node] = pinned[node] === 1 ? 0 : (ranked[node] ?? 0) - (top[part[node] ?? 0] ?? 0)
  }
  return { layer, component: part.slice(0, real) }
}
