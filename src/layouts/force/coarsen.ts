import { xorshift32 } from './random'
import type { ForceGraph } from './simulation'

export interface CoarseLevel {
  readonly graph: ForceGraph
  readonly mass: Float32Array
  readonly reach: Float32Array
  readonly up: Int32Array
  readonly links: Uint32Array
  readonly weights: Float32Array
}

export interface CoarsenOptions {
  readonly coarsest: number
  readonly stall: number
  readonly edgeLength: number
  readonly keep: number
}

export interface LooseParts {
  readonly nodes: Uint32Array
  readonly start: Uint32Array
}

export interface Adjacency {
  readonly start: Uint32Array
  readonly next: Uint32Array
  readonly edge: Uint32Array
}

export function adjacencyOf(graph: ForceGraph): Adjacency {
  return linksOf(graph.capacity, graph.alive, graph.edges)
}

function linksOf(capacity: number, alive: Uint8Array, edges: Uint32Array): Adjacency {
  const start = new Uint32Array(capacity + 1)
  for (let e = 0; e + 1 < edges.length; e += 2) {
    const s = edges[e] ?? 0
    const t = edges[e + 1] ?? 0
    if (s === t || alive[s] !== 1 || alive[t] !== 1) continue
    start[s + 1] = (start[s + 1] ?? 0) + 1
    start[t + 1] = (start[t + 1] ?? 0) + 1
  }
  for (let i = 0; i < capacity; i++) start[i + 1] = (start[i + 1] ?? 0) + (start[i] ?? 0)
  const fill = start.slice(0, capacity)
  const next = new Uint32Array(start[capacity] ?? 0)
  const edge = new Uint32Array(next.length)
  for (let e = 0; e + 1 < edges.length; e += 2) {
    const s = edges[e] ?? 0
    const t = edges[e + 1] ?? 0
    if (s === t || alive[s] !== 1 || alive[t] !== 1) continue
    edge[fill[s] ?? 0] = e >> 1
    next[fill[s] ?? 0] = t
    fill[s] = (fill[s] ?? 0) + 1
    edge[fill[t] ?? 0] = e >> 1
    next[fill[t] ?? 0] = s
    fill[t] = (fill[t] ?? 0) + 1
  }
  return { start, next, edge }
}

function shuffled(graph: ForceGraph, seed: number): Uint32Array {
  let count = 0
  for (let i = 0; i < graph.capacity; i++) count += graph.alive[i] === 1 ? 1 : 0
  const order = new Uint32Array(count)
  let at = 0
  for (let i = 0; i < graph.capacity; i++) if (graph.alive[i] === 1) order[at++] = i
  const random = xorshift32(seed)
  for (let k = count - 1; k > 0; k--) {
    const j = Math.floor(random() * (k + 1))
    const swap = order[k] ?? 0
    order[k] = order[j] ?? 0
    order[j] = swap
  }
  return order
}

function clusters(
  graph: ForceGraph,
  adjacency: Adjacency,
  mass: Float32Array,
  seed: number,
): { readonly up: Int32Array; readonly count: number } {
  const { capacity, alive, movable } = graph
  const { start, next } = adjacency
  const order = shuffled(graph, seed)
  const up = new Int32Array(capacity).fill(-1)
  const weight = new Float64Array(capacity)
  const free = (i: number) => alive[i] === 1 && movable[i] === 1
  let count = 0
  for (const v of order) {
    if (up[v] !== -1 || !free(v)) continue
    let best = -1
    let lightest = Number.POSITIVE_INFINITY
    for (let k = start[v] ?? 0; k < (start[v + 1] ?? 0); k++) {
      const u = next[k] ?? 0
      if (up[u] !== -1 || !free(u)) continue
      const w = mass[u] ?? 1
      if (w < lightest) {
        lightest = w
        best = u
      }
    }
    if (best < 0) continue
    up[v] = count
    up[best] = count
    weight[count] = (mass[v] ?? 1) + (mass[best] ?? 1)
    count++
  }
  const lightestAround = (v: number) => {
    let best = -1
    let lightest = Number.POSITIVE_INFINITY
    for (let k = start[v] ?? 0; k < (start[v + 1] ?? 0); k++) {
      const u = next[k] ?? 0
      const c = up[u] ?? -1
      if (c < 0 || !free(u)) continue
      const w = weight[c] ?? 0
      if (w < lightest) {
        lightest = w
        best = c
      }
    }
    return best
  }
  for (const v of order) {
    if (up[v] !== -1) continue
    const best = free(v) ? lightestAround(v) : -1
    if (best >= 0) {
      up[v] = best
      weight[best] = (weight[best] ?? 0) + (mass[v] ?? 1)
      continue
    }
    weight[count] = mass[v] ?? 1
    up[v] = count++
  }
  return { up, count }
}

export function looseParts(
  graph: ForceGraph,
  adjacency: Adjacency,
  limit: number,
): LooseParts | null {
  const { capacity, alive, movable } = graph
  const { start, next } = adjacency
  const seen = new Uint8Array(capacity)
  const queue = new Uint32Array(capacity)
  const nodes = new Uint32Array(capacity)
  const bounds = [0]
  let length = 0
  for (let root = 0; root < capacity; root++) {
    if (seen[root] === 1 || alive[root] !== 1) continue
    seen[root] = 1
    queue[0] = root
    let head = 0
    let tail = 1
    let anchored = movable[root] !== 1
    while (head < tail) {
      const v = queue[head++] ?? 0
      for (let k = start[v] ?? 0; k < (start[v + 1] ?? 0); k++) {
        const u = next[k] ?? 0
        if (seen[u] === 1) continue
        seen[u] = 1
        queue[tail++] = u
        if (movable[u] !== 1) anchored = true
      }
    }
    if (anchored || tail > limit) continue
    nodes.set(queue.subarray(0, tail), length)
    length += tail
    bounds.push(length)
  }
  if (bounds.length === 1) return null
  return { nodes: nodes.slice(0, length), start: Uint32Array.from(bounds) }
}

export function coarsenOnce(
  graph: ForceGraph,
  mass: Float32Array,
  reach: Float32Array,
  weights: Float32Array | null,
  options: CoarsenOptions,
  seed: number,
): CoarseLevel {
  const { capacity, alive, movable, xy } = graph
  const half = options.edgeLength / 2
  const adjacency = linksOf(capacity, alive, graph.edges)
  const { up, count } = clusters(graph, adjacency, mass, seed)
  const coarseMass = new Float32Array(count)
  const area = new Float64Array(count)
  const sumX = new Float64Array(count)
  const sumY = new Float64Array(count)
  const coarseMovable = new Uint8Array(count).fill(1)
  const coarseXy = new Float32Array(count * 2)
  for (let i = 0; i < capacity; i++) {
    const c = up[i] ?? -1
    if (c < 0) continue
    const w = mass[i] ?? 1
    const span = reach[i] ?? 0
    coarseMass[c] = (coarseMass[c] ?? 0) + w
    area[c] = (area[c] ?? 0) + span * span
    sumX[c] = (sumX[c] ?? 0) + (xy[i * 2] ?? 0) * w
    sumY[c] = (sumY[c] ?? 0) + (xy[i * 2 + 1] ?? 0) * w
    if (alive[i] !== 1 || movable[i] !== 1) {
      coarseMovable[c] = 0
      coarseXy[c * 2] = xy[i * 2] ?? 0
      coarseXy[c * 2 + 1] = xy[i * 2 + 1] ?? 0
    }
  }
  const coarseRadius = new Float32Array(count)
  const coarseReach = new Float32Array(count)
  for (let c = 0; c < count; c++) {
    const span = Math.sqrt(area[c] ?? 0)
    coarseReach[c] = span
    coarseRadius[c] = Math.max(0, span - half)
    if (coarseMovable[c] !== 1) continue
    const w = coarseMass[c] ?? 1
    coarseXy[c * 2] = (sumX[c] ?? 0) / w
    coarseXy[c * 2 + 1] = (sumY[c] ?? 0) / w
  }
  const merged = coarseEdges(adjacency, weights, up, count)
  return {
    graph: {
      capacity: count,
      alive: new Uint8Array(count).fill(1),
      movable: coarseMovable,
      xy: coarseXy,
      radius: coarseRadius,
      edges: strongest(merged.links, merged.weights, count, options.keep),
    },
    mass: coarseMass,
    reach: coarseReach,
    up,
    links: merged.links,
    weights: merged.weights,
  }
}

function coarseEdges(
  adjacency: Adjacency,
  weights: Float32Array | null,
  up: Int32Array,
  count: number,
): { readonly links: Uint32Array; readonly weights: Float32Array } {
  const { start, next, edge } = adjacency
  const members = new Uint32Array(count + 1)
  for (const c of up) if (c >= 0) members[c + 1] = (members[c + 1] ?? 0) + 1
  for (let c = 0; c < count; c++) members[c + 1] = (members[c + 1] ?? 0) + (members[c] ?? 0)
  const slots = members.slice(0, count)
  const list = new Uint32Array(members[count] ?? 0)
  up.forEach((c, i) => {
    if (c < 0) return
    list[slots[c] ?? 0] = i
    slots[c] = (slots[c] ?? 0) + 1
  })
  const seen = new Int32Array(count).fill(-1)
  const slot = new Uint32Array(count)
  const pairs = new Uint32Array(next.length)
  const sums = new Float32Array(next.length >> 1)
  let length = 0
  for (let c = 0; c < count; c++) {
    for (let m = members[c] ?? 0; m < (members[c + 1] ?? 0); m++) {
      const v = list[m] ?? 0
      for (let k = start[v] ?? 0; k < (start[v + 1] ?? 0); k++) {
        const d = up[next[k] ?? 0] ?? -1
        if (d <= c) continue
        const w = weights ? (weights[edge[k] ?? 0] ?? 1) : 1
        if (seen[d] === c) {
          const at = slot[d] ?? 0
          sums[at] = (sums[at] ?? 0) + w
          continue
        }
        seen[d] = c
        slot[d] = length >> 1
        sums[length >> 1] = w
        pairs[length++] = c
        pairs[length++] = d
      }
    }
  }
  return { links: pairs.slice(0, length), weights: sums.slice(0, length >> 1) }
}

function strongest(
  links: Uint32Array,
  weights: Float32Array,
  count: number,
  keep: number,
): Uint32Array {
  const edges = weights.length
  const start = new Uint32Array(count + 1)
  for (let e = 0; e < edges; e++) {
    const s = links[e * 2] ?? 0
    const t = links[e * 2 + 1] ?? 0
    start[s + 1] = (start[s + 1] ?? 0) + 1
    start[t + 1] = (start[t + 1] ?? 0) + 1
  }
  let crowded = false
  for (let v = 0; v < count; v++) {
    if ((start[v + 1] ?? 0) > keep) crowded = true
    start[v + 1] = (start[v + 1] ?? 0) + (start[v] ?? 0)
  }
  if (!crowded) return links
  const fill = start.slice(0, count)
  const incident = new Uint32Array(edges * 2)
  for (let e = 0; e < edges; e++) {
    const s = links[e * 2] ?? 0
    const t = links[e * 2 + 1] ?? 0
    incident[fill[s] ?? 0] = e
    fill[s] = (fill[s] ?? 0) + 1
    incident[fill[t] ?? 0] = e
    fill[t] = (fill[t] ?? 0) + 1
  }
  const kept = new Uint8Array(edges)
  const heavier = (a: number, b: number) => (weights[b] ?? 0) - (weights[a] ?? 0) || a - b
  for (let v = 0; v < count; v++) {
    const from = start[v] ?? 0
    const to = start[v + 1] ?? 0
    const list = incident.subarray(from, to)
    if (to - from > keep) list.sort(heavier)
    for (let k = 0; k < Math.min(keep, list.length); k++) kept[list[k] ?? 0] = 1
  }
  let total = 0
  for (const flag of kept) total += flag
  const out = new Uint32Array(total * 2)
  let at = 0
  for (let e = 0; e < edges; e++) {
    if (kept[e] !== 1) continue
    out[at++] = links[e * 2] ?? 0
    out[at++] = links[e * 2 + 1] ?? 0
  }
  return out
}

export function coarsen(graph: ForceGraph, options: CoarsenOptions): CoarseLevel[] {
  const levels: CoarseLevel[] = []
  const half = options.edgeLength / 2
  let current = graph
  let mass: Float32Array = new Float32Array(graph.capacity).fill(1)
  let reach: Float32Array = new Float32Array(graph.capacity)
  let weights: Float32Array | null = null
  let movers = 0
  for (let i = 0; i < graph.capacity; i++) {
    reach[i] = (graph.radius[i] ?? 0) + half
    if (graph.alive[i] === 1 && graph.movable[i] === 1) movers++
  }
  while (movers > options.coarsest) {
    const level = coarsenOnce(current, mass, reach, weights, options, levels.length + 1)
    let coarseMovers = 0
    for (let c = 0; c < level.graph.capacity; c++) coarseMovers += level.graph.movable[c] ?? 0
    if (coarseMovers > movers * options.stall) break
    levels.push(level)
    current = { ...level.graph, edges: level.links }
    mass = level.mass
    reach = level.reach
    weights = level.weights
    movers = coarseMovers
  }
  return levels
}
