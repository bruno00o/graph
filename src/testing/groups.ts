import type { LayoutGraph } from '../types'

export interface GroupedSample {
  readonly graph: LayoutGraph
  readonly members: readonly (readonly number[])[]
}

export function groupedGraph(seed = 3): GroupedSample {
  let state = seed
  const random = () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
  const containers = [
    { parent: -1, size: 0 },
    { parent: 0, size: 10 },
    { parent: 0, size: 8 },
    { parent: -1, size: 12 },
    { parent: -1, size: 9 },
  ]
  const loose = 6
  const leaves = containers.reduce((total, group) => total + group.size, 0) + loose
  const capacity = containers.length + leaves
  const parent = new Int32Array(capacity).fill(-1)
  const alive = new Uint8Array(capacity)
  const xy = new Float32Array(capacity * 2)
  const radius = new Float32Array(capacity)
  const members: number[][] = containers.map(() => [])
  const edges: number[] = []
  containers.forEach((group, at) => {
    parent[at] = group.parent
  })
  let index = containers.length
  const place = (group: number) => {
    alive[index] = 1
    parent[index] = group
    radius[index] = 4 + random() * 6
    xy[index * 2] = (random() - 0.5) * 120
    xy[index * 2 + 1] = (random() - 0.5) * 120
    if (group >= 0) {
      const previous = members[group]?.at(-1)
      if (previous !== undefined) edges.push(previous, index)
      for (let at = group; at >= 0; at = containers[at]?.parent ?? -1) members[at]?.push(index)
    }
    index++
  }
  containers.forEach((group, at) => {
    for (let k = 0; k < group.size; k++) place(at)
  })
  for (let k = 0; k < loose; k++) place(-1)
  for (let k = 0; k < 12; k++) {
    const a = containers.length + Math.floor(random() * leaves)
    const b = containers.length + Math.floor(random() * leaves)
    if (a !== b) edges.push(a, b)
  }
  const graph: LayoutGraph = {
    capacity,
    alive,
    movable: alive.slice(),
    xy,
    radius,
    edges: Uint32Array.from(edges),
    groups: {
      order: Uint32Array.from([0, 3, 4, 1, 2]),
      parent,
      padding: new Float32Array(capacity).fill(12),
      circle: new Uint8Array(capacity),
    },
    keys: Array.from({ length: capacity }, (_, at) => `n${at}`),
    datum: () => undefined,
  }
  return { graph, members }
}

interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export function smallestGap(graph: LayoutGraph, xy: Float32Array): number {
  const groups = graph.groups
  if (!groups) return Number.POSITIVE_INFINITY
  const boxes = new Map<number, Box>()
  const boxOf = (index: number): Box | null => {
    if (graph.alive[index] === 1) {
      const r = graph.radius[index] ?? 0
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r }
    }
    return boxes.get(index) ?? null
  }
  for (const group of [...groups.order].reverse()) {
    let box: Box | null = null
    for (let index = 0; index < graph.capacity; index++) {
      if (groups.parent[index] !== group) continue
      const inner = boxOf(index)
      if (!inner) continue
      box = box
        ? {
            minX: Math.min(box.minX, inner.minX),
            minY: Math.min(box.minY, inner.minY),
            maxX: Math.max(box.maxX, inner.maxX),
            maxY: Math.max(box.maxY, inner.maxY),
          }
        : inner
    }
    const pad = groups.padding[group] ?? 0
    if (box) {
      boxes.set(group, {
        minX: box.minX - pad,
        minY: box.minY - pad,
        maxX: box.maxX + pad,
        maxY: box.maxY + pad,
      })
    }
  }
  let smallest = Number.POSITIVE_INFINITY
  for (const [group, box] of boxes) {
    for (let other = 0; other < graph.capacity; other++) {
      if (other === group || groups.parent[other] !== groups.parent[group]) continue
      const next = boxOf(other)
      if (!next) continue
      const gap = Math.max(
        next.minX - box.maxX,
        box.minX - next.maxX,
        next.minY - box.maxY,
        box.minY - next.maxY,
      )
      smallest = Math.min(smallest, gap)
    }
  }
  return smallest
}

export function spread(xy: Float32Array, members: readonly number[]): number {
  let x = 0
  let y = 0
  for (const index of members) {
    x += xy[index * 2] ?? 0
    y += xy[index * 2 + 1] ?? 0
  }
  x /= members.length
  y /= members.length
  let total = 0
  for (const index of members) {
    total += Math.hypot((xy[index * 2] ?? 0) - x, (xy[index * 2 + 1] ?? 0) - y)
  }
  return total / members.length
}
