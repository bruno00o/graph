import { type Adjacency, linkStride } from './graph-model'

export interface PathGroups {
  representative(index: number): number
  forEachMember(index: number, visit: (member: number) => void): void
}

export interface PathRules {
  readonly direction: -1 | 0 | 1
  readonly weighted: boolean
  readonly cost: ((id: number) => number) | null
  readonly node: ((index: number) => boolean) | null
  readonly groups: PathGroups | null
}

export interface FoundPath {
  readonly nodes: number[]
  readonly edges: number[]
  readonly costs: number[]
}

export interface Reached {
  readonly nodes: number[]
  readonly costs: number[]
  readonly edges: number[]
}

const sweepRatio = 8

interface Meeting {
  best: number
  near: number
  far: number
  edge: number
}

function grownStamps(array: Uint32Array, length: number): Uint32Array {
  if (array.length >= length) return array
  const next = new Uint32Array(Math.max(64, array.length * 2, length))
  next.set(array)
  return next
}

function grownFloats(array: Float64Array, length: number): Float64Array {
  if (array.length >= length) return array
  return new Float64Array(Math.max(64, array.length * 2, length))
}

function grownIndices(array: Int32Array, length: number): Int32Array {
  if (array.length >= length) return array
  return new Int32Array(Math.max(64, array.length * 2, length))
}

class Frontier {
  labeled: Uint32Array = new Uint32Array(0)
  settled: Uint32Array = new Uint32Array(0)
  dist: Float64Array = new Float64Array(0)
  from: Int32Array = new Int32Array(0)
  via: Int32Array = new Int32Array(0)
  items: Int32Array = new Int32Array(0)
  place: Int32Array = new Int32Array(0)
  head = 0
  size = 0
  heap = false

  reserve(length: number): void {
    this.labeled = grownStamps(this.labeled, length)
    this.settled = grownStamps(this.settled, length)
    this.dist = grownFloats(this.dist, length)
    this.from = grownIndices(this.from, length)
    this.via = grownIndices(this.via, length)
    this.items = grownIndices(this.items, length)
    this.place = grownIndices(this.place, length)
  }

  reset(heap: boolean): void {
    this.head = 0
    this.size = 0
    this.heap = heap
  }

  clearStamps(): void {
    this.labeled.fill(0)
    this.settled.fill(0)
  }

  get pending(): number {
    return this.size - this.head
  }

  top(): number {
    if (this.size <= this.head) return Number.POSITIVE_INFINITY
    return this.dist[this.items[this.head] ?? 0] ?? Number.POSITIVE_INFINITY
  }

  push(item: number): void {
    if (!this.heap) {
      this.items[this.size++] = item
      return
    }
    this.items[this.size] = item
    this.up(this.size++)
  }

  pop(): number {
    const items = this.items
    if (!this.heap) return items[this.head++] ?? -1
    const top = items[0] ?? -1
    const last = items[--this.size] ?? -1
    if (this.size > 0) {
      items[0] = last
      this.down(0)
    }
    return top
  }

  up(position: number): void {
    const { items, place, dist } = this
    const item = items[position] ?? 0
    const value = dist[item] ?? 0
    let at = position
    while (at > 0) {
      const parent = (at - 1) >> 1
      const above = items[parent] ?? 0
      if ((dist[above] ?? 0) <= value) break
      items[at] = above
      place[above] = at
      at = parent
    }
    items[at] = item
    place[item] = at
  }

  down(position: number): void {
    const { items, place, dist } = this
    const size = this.size
    const item = items[position] ?? 0
    const value = dist[item] ?? 0
    const half = size >> 1
    let at = position
    while (at < half) {
      let child = 2 * at + 1
      let below = items[child] ?? 0
      const right = child + 1
      if (right < size && (dist[items[right] ?? 0] ?? 0) < (dist[below] ?? 0)) {
        child = right
        below = items[right] ?? 0
      }
      if ((dist[below] ?? 0) >= value) break
      items[at] = below
      place[below] = at
      at = child
    }
    items[at] = item
    place[item] = at
  }
}

export class PathSearch {
  readonly #forward = new Frontier()
  readonly #backward = new Frontier()
  #generation = 0
  #costStamp: Uint32Array = new Uint32Array(0)
  #costs: Float64Array = new Float64Array(0)
  #takenStamp: Uint32Array = new Uint32Array(0)
  #nodeStamp: Uint32Array = new Uint32Array(0)
  #nodeAllowed: Uint8Array = new Uint8Array(0)
  #graph: Adjacency | null = null
  #rules: PathRules | null = null
  #side: Frontier = this.#forward
  #other: Frontier | null = null
  #meeting: Meeting | null = null
  #ahead = true
  #limit = Number.POSITIVE_INFINITY
  #found: Reached | null = null

  shortest(graph: Adjacency, rules: PathRules, from: number, to: number): FoundPath | null {
    this.#begin(graph, rules)
    const start = this.#represent(from)
    const goal = this.#represent(to)
    if (start < 0 || goal < 0 || !this.#allowed(start) || !this.#allowed(goal)) return null
    if (start === goal) return { nodes: [start], edges: [], costs: [0] }
    const generation = this.#generation
    const forward = this.#forward
    const backward = this.#backward
    forward.reset(rules.weighted)
    backward.reset(rules.weighted)
    this.#label(forward, start, 0, -1, -1)
    this.#label(backward, goal, 0, -1, -1)
    const meeting: Meeting = { best: Number.POSITIVE_INFINITY, near: -1, far: -1, edge: -1 }
    this.#meeting = meeting
    this.#limit = Number.POSITIVE_INFINITY
    for (;;) {
      if (forward.top() + backward.top() >= meeting.best) break
      const ahead = forward.pending <= backward.pending
      const side = ahead ? forward : backward
      const node = side.pop()
      if (side.settled[node] === generation) continue
      side.settled[node] = generation
      this.#side = side
      this.#other = ahead ? backward : forward
      this.#ahead = ahead
      this.#scan(node)
    }
    this.#meeting = null
    this.#other = null
    if (meeting.edge < 0) return null
    const nodes: number[] = []
    const edges: number[] = []
    const costs: number[] = []
    for (let node = meeting.near; node >= 0; node = forward.from[node] ?? -1) {
      nodes.push(node)
      costs.push(forward.dist[node] ?? 0)
      const via = forward.via[node] ?? -1
      if (via >= 0) edges.push(via)
    }
    nodes.reverse()
    costs.reverse()
    edges.reverse()
    edges.push(meeting.edge)
    for (let node = meeting.far; node >= 0; node = backward.from[node] ?? -1) {
      nodes.push(node)
      costs.push(meeting.best - (backward.dist[node] ?? 0))
      const via = backward.via[node] ?? -1
      if (via >= 0) edges.push(via)
    }
    return { nodes, edges, costs }
  }

  reach(graph: Adjacency, rules: PathRules, from: number, limit: number): Reached {
    this.#begin(graph, rules)
    const start = this.#represent(from)
    const found: Reached = { nodes: [], costs: [], edges: [] }
    if (start < 0 || !this.#allowed(start) || !(limit >= 0)) return found
    const generation = this.#generation
    const side = this.#forward
    side.reset(rules.weighted)
    this.#label(side, start, 0, -1, -1)
    this.#side = side
    this.#other = null
    this.#meeting = null
    this.#ahead = true
    this.#limit = limit
    while (side.pending > 0) {
      const node = side.pop()
      if (side.settled[node] === generation) continue
      side.settled[node] = generation
      found.nodes.push(node)
      found.costs.push(side.dist[node] ?? 0)
      this.#scan(node)
    }
    if (found.nodes.length * sweepRatio > graph.nodeEnd.length) {
      this.#sweep(found)
      return found
    }
    this.#found = found
    for (const node of found.nodes) this.#each(node, this.#collect)
    this.#found = null
    return found
  }

  #sweep(found: Reached): void {
    const graph = this.#graph
    const rules = this.#rules
    if (!graph || !rules) return
    const { endNode, links } = graph
    const { groups } = rules
    const generation = this.#generation
    const reached = this.#forward.settled
    const count = links.length / linkStride
    for (let id = 0; id < count; id++) {
      const at = id * linkStride
      const source = links[at] ?? -1
      const target = links[at + 1] ?? -1
      if (source < 0 || target < 0) continue
      let from = endNode[source] ?? -1
      let to = endNode[target] ?? -1
      if (from < 0 || to < 0) continue
      if (groups) {
        from = groups.representative(from)
        to = groups.representative(to)
        if (from < 0 || to < 0 || (from === to && source !== target)) continue
      }
      if (reached[from] !== generation || reached[to] !== generation) continue
      if (!graph.edgeAt(id) || !(this.#cost(id) >= 0)) continue
      found.edges.push(id)
    }
  }

  #begin(graph: Adjacency, rules: PathRules): void {
    this.#graph = graph
    this.#rules = rules
    const length = graph.nodeEnd.length
    this.#forward.reserve(length)
    this.#backward.reserve(length)
    this.#nodeStamp = grownStamps(this.#nodeStamp, length)
    if (this.#nodeAllowed.length < this.#nodeStamp.length) {
      this.#nodeAllowed = new Uint8Array(this.#nodeStamp.length)
    }
    const edges = graph.links.length / linkStride
    this.#costStamp = grownStamps(this.#costStamp, edges)
    this.#takenStamp = grownStamps(this.#takenStamp, edges)
    this.#costs = grownFloats(this.#costs, this.#costStamp.length)
    this.#generation = (this.#generation + 1) >>> 0
    if (this.#generation === 0) {
      this.#forward.clearStamps()
      this.#backward.clearStamps()
      this.#nodeStamp.fill(0)
      this.#costStamp.fill(0)
      this.#takenStamp.fill(0)
      this.#generation = 1
    }
  }

  #represent(index: number): number {
    const groups = this.#rules?.groups
    return groups ? groups.representative(index) : index
  }

  #allowed(index: number): boolean {
    const check = this.#rules?.node
    if (!check) return true
    if (this.#nodeStamp[index] === this.#generation) return this.#nodeAllowed[index] === 1
    const allowed = check(index)
    this.#nodeStamp[index] = this.#generation
    this.#nodeAllowed[index] = allowed ? 1 : 0
    return allowed
  }

  #cost(id: number): number {
    const cost = this.#rules?.cost
    if (!cost) return 1
    if (this.#costStamp[id] === this.#generation) return this.#costs[id] ?? Number.NaN
    const value = cost(id)
    this.#costStamp[id] = this.#generation
    this.#costs[id] = value
    return value
  }

  #label(side: Frontier, node: number, dist: number, from: number, via: number): void {
    side.labeled[node] = this.#generation
    side.dist[node] = dist
    side.from[node] = from
    side.via[node] = via
    side.push(node)
  }

  #each(node: number, visit: (node: number, end: number) => void): void {
    const graph = this.#graph
    if (!graph) return
    visit(node, graph.nodeEnd[node] ?? -1)
    this.#rules?.groups?.forEachMember(node, (member) => visit(node, graph.nodeEnd[member] ?? -1))
  }

  #scan(node: number): void {
    const graph = this.#graph
    if (!graph) return
    if (this.#rules?.groups) this.#each(node, this.#relax)
    else this.#relax(node, graph.nodeEnd[node] ?? -1)
  }

  readonly #relax = (node: number, end: number): void => {
    const graph = this.#graph
    const rules = this.#rules
    if (!graph || !rules || end < 0) return
    const { endNode, endHead, links } = graph
    const { direction, groups } = rules
    const generation = this.#generation
    const side = this.#side
    const other = this.#other
    const meeting = this.#meeting
    const forward = this.#ahead
    const along = direction > 0 ? forward : !forward
    const limit = this.#limit
    const base = side.dist[node] ?? 0
    let next = -1
    for (let id = endHead[end] ?? -1; id !== -1; id = next) {
      const at = id * linkStride
      const source = links[at] ?? -1
      const target = links[at + 1] ?? -1
      const outgoing = source === end
      next = links[at + (outgoing ? 2 : 4)] ?? -1
      if (source === target || (direction !== 0 && outgoing !== along)) continue
      let neighbor = endNode[outgoing ? target : source] ?? -1
      if (neighbor < 0) continue
      if (groups) {
        neighbor = groups.representative(neighbor)
        if (neighbor < 0 || neighbor === node) continue
      }
      const settled = side.settled[neighbor] === generation
      if (settled && !meeting) continue
      const step = this.#cost(id)
      if (!(step >= 0)) continue
      const dist = base + step
      if (dist > limit || !this.#allowed(neighbor)) continue
      if (meeting && other && other.labeled[neighbor] === generation) {
        const total = dist + (other.dist[neighbor] ?? 0)
        if (total < meeting.best) {
          meeting.best = total
          meeting.near = forward ? node : neighbor
          meeting.far = forward ? neighbor : node
          meeting.edge = id
        }
      }
      if (settled) continue
      if (side.labeled[neighbor] !== generation) {
        this.#label(side, neighbor, dist, node, id)
      } else if (side.heap && dist < (side.dist[neighbor] ?? 0)) {
        side.dist[neighbor] = dist
        side.from[neighbor] = node
        side.via[neighbor] = id
        side.up(side.place[neighbor] ?? 0)
      }
    }
  }

  readonly #collect = (node: number, end: number): void => {
    const graph = this.#graph
    const rules = this.#rules
    const found = this.#found
    if (!graph || !rules || !found || end < 0) return
    const { endNode, endHead, links } = graph
    const { direction, groups } = rules
    const generation = this.#generation
    const reached = this.#forward.settled
    const taken = this.#takenStamp
    let next = -1
    for (let id = endHead[end] ?? -1; id !== -1; id = next) {
      const at = id * linkStride
      const source = links[at] ?? -1
      const target = links[at + 1] ?? -1
      const outgoing = source === end
      next = links[at + (outgoing ? 2 : 4)] ?? -1
      const against = direction > 0 ? !outgoing : direction < 0 && outgoing && source !== target
      if (against || taken[id] === generation) continue
      let neighbor = endNode[outgoing ? target : source] ?? -1
      if (neighbor < 0) continue
      if (groups) {
        neighbor = groups.representative(neighbor)
        if (neighbor < 0 || (neighbor === node && source !== target)) continue
      }
      if (reached[neighbor] !== generation || !(this.#cost(id) >= 0)) continue
      if (!this.#allowed(neighbor)) continue
      taken[id] = generation
      found.edges.push(id)
    }
  }
}
