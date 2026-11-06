import { type Adjacency, adjacency } from './adjacency'

const up = 1
const down = -1

interface Network {
  readonly source: Int32Array
  readonly target: Int32Array
  readonly cost: Int32Array
  readonly flow: Int32Array
  readonly state: Int8Array
  readonly parent: Int32Array
  readonly pred: Int32Array
  readonly direction: Int8Array
  readonly thread: Int32Array
  readonly back: Int32Array
  readonly size: Int32Array
  readonly last: Int32Array
  readonly potential: Int32Array
  readonly dirty: Int32Array
  iterations: number
  enter: number
  join: number
  inner: number
  outer: number
  leave: number
  delta: number
}

function network(
  count: number,
  arcCount: number,
  tail: Int32Array,
  head: Int32Array,
  length: Int32Array,
): Network {
  const all = arcCount + count
  const nodes = count + 1
  const net: Network = {
    source: new Int32Array(all),
    target: new Int32Array(all),
    cost: new Int32Array(all),
    flow: new Int32Array(all),
    state: new Int8Array(all),
    parent: new Int32Array(nodes),
    pred: new Int32Array(nodes),
    direction: new Int8Array(nodes),
    thread: new Int32Array(nodes),
    back: new Int32Array(nodes),
    size: new Int32Array(nodes),
    last: new Int32Array(nodes),
    potential: new Int32Array(nodes),
    dirty: new Int32Array(nodes),
    iterations: 0,
    enter: -1,
    join: -1,
    inner: -1,
    outer: -1,
    leave: -1,
    delta: 0,
  }
  const { source, target, cost, flow, state, parent, pred, direction, thread, back, size, last } =
    net
  const supply = new Int32Array(count)
  for (let arc = 0; arc < arcCount; arc++) {
    const from = tail[arc] ?? 0
    const to = head[arc] ?? 0
    source[arc] = from
    target[arc] = to
    cost[arc] = -(length[arc] ?? 0)
    state[arc] = 1
    supply[from] = (supply[from] ?? 0) + 1
    supply[to] = (supply[to] ?? 0) - 1
  }
  const root = count
  parent[root] = -1
  pred[root] = -1
  thread[root] = 0
  back[0] = root
  size[root] = nodes
  last[root] = root - 1
  for (let node = 0, arc = arcCount; node < count; node++, arc++) {
    parent[node] = root
    pred[node] = arc
    thread[node] = node + 1
    back[node + 1] = node
    size[node] = 1
    last[node] = node
    const amount = supply[node] ?? 0
    direction[node] = amount >= 0 ? up : down
    source[arc] = amount >= 0 ? node : root
    target[arc] = amount >= 0 ? root : node
    flow[arc] = Math.abs(amount)
  }
  return net
}

function findJoin(net: Network): void {
  const { parent, size } = net
  let u = net.source[net.enter] ?? 0
  let v = net.target[net.enter] ?? 0
  while (u !== v) {
    if ((size[u] ?? 0) < (size[v] ?? 0)) u = parent[u] ?? 0
    else v = parent[v] ?? 0
  }
  net.join = u
}

function findLeaving(net: Network): boolean {
  const { parent, pred, direction, flow, join } = net
  const first = net.source[net.enter] ?? 0
  const second = net.target[net.enter] ?? 0
  let delta = Number.POSITIVE_INFINITY
  let side = 0
  for (let u = first; u !== join; u = parent[u] ?? 0) {
    if (direction[u] !== up) continue
    const amount = flow[pred[u] ?? 0] ?? 0
    if (amount < delta) {
      delta = amount
      net.leave = u
      side = 1
    }
  }
  for (let u = second; u !== join; u = parent[u] ?? 0) {
    if (direction[u] !== down) continue
    const amount = flow[pred[u] ?? 0] ?? 0
    if (amount <= delta) {
      delta = amount
      net.leave = u
      side = 2
    }
  }
  if (side === 0) return false
  net.delta = delta
  net.inner = side === 1 ? first : second
  net.outer = side === 1 ? second : first
  return true
}

function changeFlow(net: Network): void {
  const { parent, pred, direction, flow, join, enter, delta } = net
  if (delta > 0) {
    flow[enter] = (flow[enter] ?? 0) + delta
    for (let u = net.source[enter] ?? 0; u !== join; u = parent[u] ?? 0) {
      const arc = pred[u] ?? 0
      flow[arc] = (flow[arc] ?? 0) - (direction[u] ?? 0) * delta
    }
    for (let u = net.target[enter] ?? 0; u !== join; u = parent[u] ?? 0) {
      const arc = pred[u] ?? 0
      flow[arc] = (flow[arc] ?? 0) + (direction[u] ?? 0) * delta
    }
  }
  net.state[enter] = 0
  net.state[pred[net.leave] ?? 0] = 1
}

function updateTree(net: Network): void {
  const { parent, pred, direction, thread, back, size, last, dirty, join, inner, outer, leave } =
    net
  const enter = net.enter
  const oldBack = back[leave] ?? 0
  const oldSize = size[leave] ?? 0
  const oldLast = last[leave] ?? 0
  const above = parent[leave] ?? 0
  if (inner === leave) {
    parent[inner] = outer
    pred[inner] = enter
    direction[inner] = inner === net.source[enter] ? up : down
    if (thread[outer] !== leave) {
      let after = thread[oldLast] ?? 0
      thread[oldBack] = after
      back[after] = oldBack
      after = thread[outer] ?? 0
      thread[outer] = leave
      back[leave] = outer
      thread[oldLast] = after
      back[after] = oldLast
    }
  } else {
    const resume = oldBack === outer ? (thread[oldLast] ?? 0) : (thread[outer] ?? 0)
    let stem = inner
    let stemParent = outer
    let tail = last[inner] ?? 0
    let after = thread[tail] ?? 0
    thread[outer] = inner
    let dirtyCount = 0
    dirty[dirtyCount++] = outer
    while (stem !== leave) {
      const nextStem = parent[stem] ?? 0
      thread[tail] = nextStem
      dirty[dirtyCount++] = tail
      const before = back[stem] ?? 0
      thread[before] = after
      back[after] = before
      parent[stem] = stemParent
      stemParent = stem
      stem = nextStem
      tail = last[stem] === last[stemParent] ? (back[stemParent] ?? 0) : (last[stem] ?? 0)
      after = thread[tail] ?? 0
    }
    parent[leave] = stemParent
    thread[tail] = resume
    back[resume] = tail
    last[leave] = tail
    if (oldBack !== outer) {
      thread[oldBack] = after
      back[after] = oldBack
    }
    for (let at = 0; at < dirtyCount; at++) {
      const u = dirty[at] ?? 0
      back[thread[u] ?? 0] = u
    }
    let carried = 0
    for (let u = leave, p = parent[u] ?? 0; u !== inner; u = p, p = parent[u] ?? 0) {
      pred[u] = pred[p] ?? 0
      direction[u] = -(direction[p] ?? 0)
      carried += (size[u] ?? 0) - (size[p] ?? 0)
      size[u] = carried
      last[p] = tail
    }
    pred[inner] = enter
    direction[inner] = inner === net.source[enter] ? up : down
    size[inner] = oldSize
  }
  const limit = last[join] === outer ? join : -1
  const lastOut = last[leave] ?? 0
  for (let u = outer; u !== -1 && last[u] === outer; u = parent[u] ?? -1) last[u] = lastOut
  if (join !== oldBack && outer !== oldBack) {
    for (let u = above; u !== limit && last[u] === oldLast; u = parent[u] ?? -1) last[u] = oldBack
  } else if (lastOut !== oldLast) {
    for (let u = above; u !== limit && last[u] === oldLast; u = parent[u] ?? -1) last[u] = lastOut
  }
  for (let u = outer; u !== join; u = parent[u] ?? 0) size[u] = (size[u] ?? 0) + oldSize
  for (let u = above; u !== join; u = parent[u] ?? 0) size[u] = (size[u] ?? 0) - oldSize
}

function updatePotential(net: Network): void {
  const { potential, thread, inner, outer, enter } = net
  const shift =
    (potential[outer] ?? 0) -
    (potential[inner] ?? 0) -
    (net.direction[inner] ?? 0) * (net.cost[enter] ?? 0)
  const end = thread[net.last[inner] ?? 0] ?? 0
  const moved = net.size[inner] ?? 0
  if (moved * 2 <= potential.length) {
    for (let u = inner; u !== end; u = thread[u] ?? 0) potential[u] = (potential[u] ?? 0) + shift
  } else {
    for (let u = end; u !== inner; u = thread[u] ?? 0) potential[u] = (potential[u] ?? 0) - shift
  }
}

function solve(net: Network, arcCount: number, maxIterations: number): boolean {
  const { source, target, cost, state, potential } = net
  const block = Math.max(10, Math.floor(Math.sqrt(arcCount)))
  let next = 0
  for (;;) {
    let least = 0
    let enter = -1
    let budget = block
    let arc = next
    for (let scanned = 0; scanned < arcCount; scanned++) {
      if (state[arc] === 1) {
        const reduced =
          (cost[arc] ?? 0) + (potential[source[arc] ?? 0] ?? 0) - (potential[target[arc] ?? 0] ?? 0)
        if (reduced < least) {
          least = reduced
          enter = arc
        }
      }
      arc = arc + 1 === arcCount ? 0 : arc + 1
      if (--budget === 0) {
        if (enter >= 0) break
        budget = block
      }
    }
    if (enter < 0) return true
    if (net.iterations++ === maxIterations) return false
    next = arc
    net.enter = enter
    findJoin(net)
    if (!findLeaving(net)) return false
    changeFlow(net)
    updateTree(net)
    updatePotential(net)
  }
}

function price(
  net: Network,
  count: number,
  arcCount: number,
  anchor: Int32Array,
  margin: number,
): void {
  const { cost, potential, thread, parent, pred, direction } = net
  for (let node = 0; node < count; node++) {
    const at = anchor[node] ?? 0
    cost[arcCount + node] = (direction[node] === up ? at : -at) + margin
  }
  const root = count
  potential[root] = 0
  for (let u = thread[root] ?? 0; u !== root; u = thread[u] ?? 0) {
    const step = (direction[u] ?? 0) * (cost[pred[u] ?? 0] ?? 0)
    potential[u] = (potential[parent[u] ?? 0] ?? 0) - step
  }
}

function optimize(
  net: Network,
  count: number,
  arcCount: number,
  anchor: Int32Array,
  maxIterations: number,
): boolean {
  let limit = 1
  for (let arc = 0; arc < arcCount; arc++) limit -= net.cost[arc] ?? 0
  for (let node = 0; node < count; node++) limit = Math.max(limit, anchor[node] ?? 0)
  for (let margin = 1; ; margin = Math.min(margin * 4, limit * 2)) {
    price(net, count, arcCount, anchor, margin)
    if (!solve(net, arcCount, maxIterations)) return false
    let carried = false
    for (let arc = arcCount; arc < net.flow.length; arc++)
      if ((net.flow[arc] ?? 0) !== 0) carried = true
    if (!carried) return true
    if (margin >= limit * 2) return false
  }
}

interface Reduction {
  readonly alive: Uint8Array
  readonly removed: Int32Array
  readonly host: Int32Array
  readonly offset: Int32Array
  readonly first: Int32Array
  readonly next: Int32Array
  readonly arcAlive: Uint8Array
  count: number
}

function reduce(count: number, tail: Int32Array, head: Int32Array, length: Int32Array): Reduction {
  const arcCount = tail.length
  const first = new Int32Array(count).fill(-1)
  const next = new Int32Array(arcCount * 2)
  const previous = new Int32Array(arcCount * 2)
  const ins = new Int32Array(count)
  const outs = new Int32Array(count)
  const link = (slot: number, node: number) => {
    const top = first[node] ?? -1
    previous[slot] = -1
    next[slot] = top
    if (top >= 0) previous[top] = slot
    first[node] = slot
  }
  const unlink = (slot: number, node: number) => {
    const before = previous[slot] ?? -1
    const after = next[slot] ?? -1
    if (before >= 0) next[before] = after
    else first[node] = after
    if (after >= 0) previous[after] = before
  }
  for (let arc = arcCount - 1; arc >= 0; arc--) {
    const from = tail[arc] ?? 0
    const to = head[arc] ?? 0
    link(arc * 2, from)
    link(arc * 2 + 1, to)
    outs[from] = (outs[from] ?? 0) + 1
    ins[to] = (ins[to] ?? 0) + 1
  }
  const reduction: Reduction = {
    alive: new Uint8Array(count).fill(1),
    removed: new Int32Array(count),
    host: new Int32Array(count),
    offset: new Int32Array(count),
    first,
    next,
    arcAlive: new Uint8Array(arcCount).fill(1),
    count: 0,
  }
  const { alive, removed, host, offset, arcAlive } = reduction
  const reducible = (node: number) => {
    const a = ins[node] ?? 0
    const b = outs[node] ?? 0
    return a + b === 1 || (a === 1 && b === 1)
  }
  const stack: number[] = []
  for (let node = count - 1; node >= 0; node--) if (reducible(node)) stack.push(node)
  while (stack.length > 0) {
    const node = stack.pop() ?? 0
    if (alive[node] !== 1 || !reducible(node)) continue
    alive[node] = 0
    removed[reduction.count++] = node
    if ((ins[node] ?? 0) + (outs[node] ?? 0) === 1) {
      const slot = first[node] ?? 0
      const arc = slot >> 1
      const into = (slot & 1) === 1
      const other = into ? (tail[arc] ?? 0) : (head[arc] ?? 0)
      host[node] = other
      offset[node] = into ? (length[arc] ?? 0) : -(length[arc] ?? 0)
      unlink(slot ^ 1, other)
      arcAlive[arc] = 0
      if (into) outs[other] = (outs[other] ?? 0) - 1
      else ins[other] = (ins[other] ?? 0) - 1
      if (alive[other] === 1 && reducible(other)) stack.push(other)
    } else {
      const slot = first[node] ?? 0
      const pair = next[slot] ?? 0
      const inward = (slot & 1) === 1 ? slot >> 1 : pair >> 1
      const outward = (slot & 1) === 1 ? pair >> 1 : slot >> 1
      const above = tail[inward] ?? 0
      const below = head[outward] ?? 0
      host[node] = above
      offset[node] = length[inward] ?? 0
      unlink(outward * 2 + 1, below)
      arcAlive[outward] = 0
      head[inward] = below
      length[inward] = (length[inward] ?? 0) + (length[outward] ?? 0)
      link(inward * 2 + 1, below)
    }
  }
  return reduction
}

class EdgeHeap {
  readonly #items: Int32Array
  readonly #keys: Float64Array
  #size = 0

  constructor(capacity: number, keys: Float64Array) {
    this.#items = new Int32Array(capacity)
    this.#keys = keys
  }

  get size(): number {
    return this.#size
  }

  clear(): void {
    this.#size = 0
  }

  top(): number {
    return this.#items[0] ?? -1
  }

  push(edge: number): void {
    const items = this.#items
    const keys = this.#keys
    const key = keys[edge] ?? 0
    let at = this.#size++
    while (at > 0) {
      const parent = (at - 1) >> 1
      const above = items[parent] ?? 0
      if ((keys[above] ?? 0) <= key) break
      items[at] = above
      at = parent
    }
    items[at] = edge
  }

  pop(): void {
    const items = this.#items
    const keys = this.#keys
    const last = items[--this.#size] ?? 0
    const key = keys[last] ?? 0
    const size = this.#size
    let at = 0
    for (;;) {
      let child = at * 2 + 1
      if (child >= size) break
      if (child + 1 < size && (keys[items[child + 1] ?? 0] ?? 0) < (keys[items[child] ?? 0] ?? 0)) {
        child++
      }
      if ((keys[items[child] ?? 0] ?? 0) >= key) break
      items[at] = items[child] ?? 0
      at = child
    }
    items[at] = last
  }
}

function tighten(count: number, tail: Int32Array, head: Int32Array, rank: Float64Array): void {
  const edgeCount = tail.length
  const ends = new Int32Array(edgeCount * 2)
  const ids = new Int32Array(edgeCount * 2)
  for (let edge = 0; edge < edgeCount; edge++) {
    ends[edge * 2] = tail[edge] ?? 0
    ends[edge * 2 + 1] = head[edge] ?? 0
    ids[edge * 2] = edge
    ids[edge * 2 + 1] = edge
  }
  const incident = adjacency(count, ends, ids)
  const keys = new Float64Array(edgeCount)
  const below = new EdgeHeap(edgeCount, keys)
  const above = new EdgeHeap(edgeCount, keys)
  const reached = new Uint8Array(count)
  const members = new Int32Array(count)
  let offset = 0
  let size = 0
  const actual = (node: number) => (rank[node] ?? 0) + (reached[node] === 1 ? offset : 0)
  const gap = (edge: number) => actual(head[edge] ?? 0) - actual(tail[edge] ?? 0) - 1
  const join = (node: number) => {
    rank[node] = (rank[node] ?? 0) - offset
    reached[node] = 1
    members[size++] = node
  }
  for (let start = 0; start < count; start++) {
    if (reached[start] === 1) continue
    offset = 0
    size = 0
    let scan = 0
    join(start)
    for (;;) {
      for (; scan < size; scan++) {
        const node = members[scan] ?? 0
        for (let k = incident.start[node] ?? 0; k < (incident.start[node + 1] ?? 0); k++) {
          const edge = incident.items[k] ?? 0
          const from = tail[edge] ?? 0
          const next = from === node ? (head[edge] ?? 0) : from
          if (reached[next] === 1) continue
          const value = gap(edge)
          if (value === 0) {
            join(next)
          } else if (from === node) {
            keys[edge] = value + offset
            below.push(edge)
          } else {
            keys[edge] = value - offset
            above.push(edge)
          }
        }
      }
      while (below.size > 0 && reached[head[below.top()] ?? 0] === 1) below.pop()
      while (above.size > 0 && reached[tail[above.top()] ?? 0] === 1) above.pop()
      if (below.size === 0 && above.size === 0) break
      const fall = below.size > 0 ? (keys[below.top()] ?? 0) - offset : Number.POSITIVE_INFINITY
      const rise = above.size > 0 ? (keys[above.top()] ?? 0) + offset : Number.POSITIVE_INFINITY
      if (fall <= rise) {
        const edge = below.top()
        below.pop()
        offset += fall
        join(head[edge] ?? 0)
      } else {
        const edge = above.top()
        above.pop()
        offset -= rise
        join(tail[edge] ?? 0)
      }
    }
    for (let at = 0; at < size; at++) {
      const node = members[at] ?? 0
      rank[node] = (rank[node] ?? 0) + offset
    }
    below.clear()
    above.clear()
  }
}

export function simplex(
  count: number,
  successors: Adjacency,
  topological: Int32Array,
  maxIterations: number,
): Int32Array {
  const arcCount = successors.items.length
  const tail = new Int32Array(arcCount)
  for (let node = 0; node < count; node++) {
    for (let arc = successors.start[node] ?? 0; arc < (successors.start[node + 1] ?? 0); arc++) {
      tail[arc] = node
    }
  }
  const head = Int32Array.from(successors.items)
  const length = new Int32Array(arcCount).fill(1)
  const reduction = reduce(count, tail, head, length)
  const { alive, arcAlive } = reduction
  const index = new Int32Array(count).fill(-1)
  let coreCount = 0
  for (let node = 0; node < count; node++) if (alive[node] === 1) index[node] = coreCount++
  let coreArcs = 0
  for (let arc = 0; arc < arcCount; arc++) coreArcs += arcAlive[arc] ?? 0
  const coreTail = new Int32Array(coreArcs)
  const coreHead = new Int32Array(coreArcs)
  const coreLength = new Int32Array(coreArcs)
  for (let arc = 0, at = 0; arc < arcCount; arc++) {
    if (arcAlive[arc] !== 1) continue
    coreTail[at] = index[tail[arc] ?? 0] ?? 0
    coreHead[at] = index[head[arc] ?? 0] ?? 0
    coreLength[at] = length[arc] ?? 0
    at++
  }
  const start = new Int32Array(coreCount + 1)
  for (let arc = 0; arc < coreArcs; arc++) {
    const slot = (coreTail[arc] ?? 0) + 1
    start[slot] = (start[slot] ?? 0) + 1
  }
  for (let node = 0; node < coreCount; node++) {
    start[node + 1] = (start[node + 1] ?? 0) + (start[node] ?? 0)
  }
  const anchor = new Int32Array(coreCount)
  for (const node of topological) {
    if (alive[node] !== 1) continue
    const from = index[node] ?? 0
    for (let arc = start[from] ?? 0; arc < (start[from + 1] ?? 0); arc++) {
      const to = coreHead[arc] ?? 0
      anchor[to] = Math.max(anchor[to] ?? 0, (anchor[from] ?? 0) + (coreLength[arc] ?? 0))
    }
  }
  const net = network(coreCount, coreArcs, coreTail, coreHead, coreLength)
  const solved = optimize(net, coreCount, coreArcs, anchor, maxIterations)
  const rank = new Float64Array(count)
  for (let node = 0; node < count; node++) {
    if (alive[node] === 1) rank[node] = -(net.potential[index[node] ?? 0] ?? 0)
  }
  if (!solved) {
    for (const node of topological) {
      if (alive[node] !== 1) continue
      for (let slot = reduction.first[node] ?? -1; slot >= 0; slot = reduction.next[slot] ?? -1) {
        if ((slot & 1) === 1) continue
        const arc = slot >> 1
        const to = head[arc] ?? 0
        rank[to] = Math.max(rank[to] ?? 0, (rank[node] ?? 0) + (length[arc] ?? 0))
      }
    }
  }
  for (let at = reduction.count - 1; at >= 0; at--) {
    const node = reduction.removed[at] ?? 0
    rank[node] = (rank[reduction.host[node] ?? 0] ?? 0) + (reduction.offset[node] ?? 0)
  }
  tighten(count, tail, successors.items, rank)
  return Int32Array.from(rank)
}
