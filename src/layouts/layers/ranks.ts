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
  const layer = simplex(count, successors, topological, component, maxIterations * count + 100)
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

export function components(count: number, successors: Adjacency): Int32Array {
  const parent = new Int32Array(count)
  for (let node = 0; node < count; node++) parent[node] = node
  const find = (node: number): number => {
    let at = node
    while ((parent[at] ?? at) !== at) {
      const up = parent[at] ?? at
      parent[at] = parent[up] ?? up
      at = up
    }
    return at
  }
  for (let node = 0; node < count; node++) {
    for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
      const a = find(node)
      const b = find(successors.items[k] ?? 0)
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b)
    }
  }
  const id = new Int32Array(count).fill(-1)
  const component = new Int32Array(count)
  let next = 0
  for (let node = 0; node < count; node++) {
    const top = find(node)
    if ((id[top] ?? -1) < 0) id[top] = next++
    component[node] = id[top] ?? 0
  }
  return component
}
