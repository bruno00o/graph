import type { Adjacency } from './adjacency'
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
