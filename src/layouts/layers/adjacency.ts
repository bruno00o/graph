export interface Adjacency {
  readonly start: Int32Array
  readonly items: Int32Array
}

export function adjacency(
  count: number,
  keys: Int32Array,
  values: Int32Array,
  length: number = keys.length,
): Adjacency {
  const start = new Int32Array(count + 1)
  for (let at = 0; at < length; at++) {
    const slot = (keys[at] ?? 0) + 1
    start[slot] = (start[slot] ?? 0) + 1
  }
  for (let node = 0; node < count; node++) {
    start[node + 1] = (start[node + 1] ?? 0) + (start[node] ?? 0)
  }
  const fill = start.slice(0, count)
  const items = new Int32Array(start[count] ?? 0)
  for (let at = 0; at < length; at++) {
    const key = keys[at] ?? 0
    const slot = fill[key] ?? 0
    items[slot] = values[at] ?? 0
    fill[key] = slot + 1
  }
  return { start, items }
}

export function distinct(
  count: number,
  from: Int32Array,
  to: Int32Array,
  length: number,
): Adjacency {
  const all = adjacency(count, from, to, length)
  const start = new Int32Array(count + 1)
  const items = new Int32Array(all.items.length)
  const seen = new Int32Array(count).fill(-1)
  let size = 0
  for (let node = 0; node < count; node++) {
    start[node] = size
    for (let at = all.start[node] ?? 0; at < (all.start[node + 1] ?? 0); at++) {
      const target = all.items[at] ?? 0
      if (seen[target] === node) continue
      seen[target] = node
      items[size++] = target
    }
  }
  start[count] = size
  return { start, items: items.slice(0, size) }
}

export function degree(graph: Adjacency, node: number): number {
  return (graph.start[node + 1] ?? 0) - (graph.start[node] ?? 0)
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
