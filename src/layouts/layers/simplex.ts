import { type Adjacency, adjacency, components } from './adjacency'

interface Reduction {
  readonly kept: Int32Array
  readonly local: Int32Array
  readonly tail: Int32Array
  readonly head: Int32Array
  readonly length: Int32Array
  readonly removed: Int32Array
  readonly anchor: Int32Array
  readonly offset: Int32Array
}

function reduce(count: number, successors: Adjacency, lengths: Int32Array | null): Reduction {
  const edgeCount = successors.items.length
  const capacity = edgeCount + count
  const tail = new Int32Array(capacity)
  const head = new Int32Array(capacity)
  const span = new Int32Array(capacity)
  const alive = new Uint8Array(capacity)
  const first = new Int32Array(count).fill(-1)
  const next = new Int32Array(capacity * 2)
  const ins = new Int32Array(count)
  const outs = new Int32Array(count)
  let arcs = 0
  const link = (from: number, to: number, length: number) => {
    const arc = arcs++
    tail[arc] = from
    head[arc] = to
    span[arc] = length
    alive[arc] = 1
    next[arc * 2] = first[from] ?? -1
    first[from] = arc * 2
    next[arc * 2 + 1] = first[to] ?? -1
    first[to] = arc * 2 + 1
    outs[from] = (outs[from] ?? 0) + 1
    ins[to] = (ins[to] ?? 0) + 1
  }
  const drop = (arc: number) => {
    alive[arc] = 0
    const from = tail[arc] ?? 0
    const to = head[arc] ?? 0
    outs[from] = (outs[from] ?? 0) - 1
    ins[to] = (ins[to] ?? 0) - 1
  }
  const live = (node: number) => {
    let end = first[node] ?? -1
    while (end >= 0 && alive[end >> 1] === 0) end = next[end] ?? -1
    first[node] = end
    return end
  }
  for (let node = 0; node < count; node++) {
    for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
      const target = successors.items[k] ?? 0
      if (target !== node) link(node, target, lengths ? (lengths[k] ?? 1) : 1)
    }
  }
  const stack = new Int32Array(count)
  const waiting = new Uint8Array(count).fill(1)
  let depth = 0
  for (let node = count - 1; node >= 0; node--) stack[depth++] = node
  const gone = new Uint8Array(count)
  const removed = new Int32Array(count)
  const anchor = new Int32Array(count).fill(-1)
  const offset = new Int32Array(count)
  let removedCount = 0
  while (depth > 0) {
    const node = stack[--depth] ?? 0
    waiting[node] = 0
    const inDegree = ins[node] ?? 0
    const outDegree = outs[node] ?? 0
    if (inDegree + outDegree === 1) {
      const end = live(node)
      const arc = end >> 1
      const leaving = (end & 1) === 0
      const far = (leaving ? head[arc] : tail[arc]) ?? 0
      anchor[node] = far
      offset[node] = leaving ? -(span[arc] ?? 0) : (span[arc] ?? 0)
      drop(arc)
      gone[node] = 1
      removed[removedCount++] = node
      if (waiting[far] === 0) {
        waiting[far] = 1
        stack[depth++] = far
      }
    } else if (inDegree === 1 && outDegree === 1) {
      let into = -1
      let out = -1
      for (let end = live(node); end >= 0; end = next[end] ?? -1) {
        const arc = end >> 1
        if (alive[arc] === 0) continue
        if ((end & 1) === 0) out = arc
        else into = arc
      }
      anchor[node] = tail[into] ?? 0
      offset[node] = span[into] ?? 0
      drop(into)
      drop(out)
      gone[node] = 1
      removed[removedCount++] = node
      link(tail[into] ?? 0, head[out] ?? 0, (span[into] ?? 0) + (span[out] ?? 0))
    }
  }
  const local = new Int32Array(count).fill(-1)
  const kept = new Int32Array(count - removedCount)
  let size = 0
  for (let node = 0; node < count; node++) {
    if (gone[node] === 1) continue
    local[node] = size
    kept[size++] = node
  }
  let arcCount = 0
  for (let arc = 0; arc < arcs; arc++) if (alive[arc] === 1) arcCount++
  const reducedTail = new Int32Array(arcCount)
  const reducedHead = new Int32Array(arcCount)
  const reducedLength = new Int32Array(arcCount)
  let at = 0
  for (let arc = 0; arc < arcs; arc++) {
    if (alive[arc] === 0) continue
    reducedTail[at] = local[tail[arc] ?? 0] ?? 0
    reducedHead[at] = local[head[arc] ?? 0] ?? 0
    reducedLength[at] = span[arc] ?? 0
    at++
  }
  return {
    kept,
    local,
    tail: reducedTail,
    head: reducedHead,
    length: reducedLength,
    removed: removed.subarray(0, removedCount),
    anchor,
    offset,
  }
}

interface FlowTree {
  readonly count: number
  readonly arcCount: number
  readonly component: Int32Array
  readonly source: Int32Array
  readonly target: Int32Array
  readonly length: Float64Array
  readonly flow: Int32Array
  readonly potential: Float64Array
  readonly parent: Int32Array
  readonly parentArc: Int32Array
  readonly size: Int32Array
  readonly next: Int32Array
  readonly previous: Int32Array
  readonly last: Int32Array
  readonly path: Int32Array
  readonly pathLast: Int32Array
  readonly pathPrevious: Int32Array
  readonly pathAfter: Int32Array
}

function flowTree(count: number, tail: Int32Array, head: Int32Array, span: Int32Array): FlowTree {
  const arcCount = tail.length
  const component = components(count, adjacency(count, tail, head))
  let groups = 0
  for (let node = 0; node < count; node++) groups = Math.max(groups, (component[node] ?? 0) + 1)
  const total = count + groups
  const source = new Int32Array(arcCount + count)
  const target = new Int32Array(arcCount + count)
  const length = new Float64Array(arcCount + count)
  source.set(tail)
  target.set(head)
  length.set(span)
  return {
    count,
    arcCount,
    component,
    source,
    target,
    length,
    flow: new Int32Array(arcCount + count),
    potential: new Float64Array(total),
    parent: new Int32Array(total).fill(-1),
    parentArc: new Int32Array(total).fill(-1),
    size: new Int32Array(total).fill(1),
    next: new Int32Array(total).fill(-1),
    previous: new Int32Array(total).fill(-1),
    last: Int32Array.from({ length: total }, (_, node) => node),
    path: new Int32Array(total),
    pathLast: new Int32Array(total),
    pathPrevious: new Int32Array(total),
    pathAfter: new Int32Array(total),
  }
}

function attach(tree: FlowTree, node: number, above: number, arc: number): void {
  const { next, previous, last } = tree
  tree.parent[node] = above
  tree.parentArc[node] = arc
  const end = last[node] ?? node
  const after = next[above] ?? -1
  next[above] = node
  previous[node] = above
  next[end] = after
  if (after >= 0) previous[after] = end
  if (last[above] === above) last[above] = end
}

function shift(tree: FlowTree, start: number, skip: number, amount: number): void {
  const { next, last, potential } = tree
  const stop = last[start] ?? start
  for (let node = start; ; node = next[node] ?? 0) {
    if (node === skip) node = last[skip] ?? skip
    else potential[node] = (potential[node] ?? 0) + amount
    if (node === stop) return
  }
}

function place(tree: FlowTree, order: Int32Array, incident: Adjacency, balance: Int32Array): void {
  const { source, target, length, potential } = tree
  for (const node of order) {
    const base = potential[node] ?? 0
    for (let k = incident.start[node] ?? 0; k < (incident.start[node + 1] ?? 0); k++) {
      const arc = incident.items[k] ?? 0
      if (source[arc] !== node) break
      const to = target[arc] ?? 0
      potential[to] = Math.max(potential[to] ?? 0, base + (length[arc] ?? 0))
    }
  }
  for (let at = order.length - 1; at >= 0; at--) {
    const node = order[at] ?? 0
    if ((balance[node] ?? 0) <= 0) continue
    let lowest = Number.POSITIVE_INFINITY
    for (let k = incident.start[node] ?? 0; k < (incident.start[node + 1] ?? 0); k++) {
      const arc = incident.items[k] ?? 0
      if (source[arc] !== node) break
      lowest = Math.min(lowest, (potential[target[arc] ?? 0] ?? 0) - (length[arc] ?? 0))
    }
    potential[node] = lowest
  }
  for (const node of order) {
    if ((balance[node] ?? 0) >= 0) continue
    let highest = Number.NEGATIVE_INFINITY
    for (let k = (incident.start[node + 1] ?? 0) - 1; k >= (incident.start[node] ?? 0); k--) {
      const arc = incident.items[k] ?? 0
      if (target[arc] !== node) break
      highest = Math.max(highest, (potential[source[arc] ?? 0] ?? 0) + (length[arc] ?? 0))
    }
    potential[node] = highest
  }
}

function tight(tree: FlowTree, arc: number): boolean {
  const { potential } = tree
  const rise = (potential[tree.target[arc] ?? 0] ?? 0) - (potential[tree.source[arc] ?? 0] ?? 0)
  return rise === tree.length[arc]
}

function discover(
  tree: FlowTree,
  order: Int32Array,
  incident: Adjacency,
  queue: Int32Array,
): Int32Array {
  const { source, target } = tree
  const rank = new Int32Array(tree.count).fill(-1)
  let queued = 0
  for (const start of order) {
    if ((rank[start] ?? -1) >= 0) continue
    rank[start] = queued
    let scan = queued
    queue[queued++] = start
    for (; scan < queued; scan++) {
      const node = queue[scan] ?? 0
      for (let k = incident.start[node] ?? 0; k < (incident.start[node + 1] ?? 0); k++) {
        const arc = incident.items[k] ?? 0
        const from = source[arc] ?? 0
        const next = from === node ? (target[arc] ?? 0) : from
        if ((rank[next] ?? -1) >= 0 || !tight(tree, arc)) continue
        rank[next] = queued
        queue[queued++] = next
      }
    }
  }
  return rank
}

function plant(tree: FlowTree, order: Int32Array): void {
  const { count, arcCount, source, target, length, flow, potential, size } = tree
  const balance = new Int32Array(count)
  const ends = new Int32Array(arcCount * 2)
  const ids = new Int32Array(arcCount * 2)
  for (let arc = 0; arc < arcCount; arc++) {
    const from = source[arc] ?? 0
    const to = target[arc] ?? 0
    balance[from] = (balance[from] ?? 0) + 1
    balance[to] = (balance[to] ?? 0) - 1
    ends[arc] = from
    ends[arc + arcCount] = to
    ids[arc] = arc
    ids[arc + arcCount] = arc
  }
  const incident = adjacency(count, ends, ids)
  place(tree, order, incident, balance)
  const queue = new Int32Array(count)
  const rank = discover(tree, order, incident, queue)
  for (let at = count - 1; at >= 0; at--) {
    const node = queue[at] ?? 0
    const sum = balance[node] ?? 0
    const outward = sum >= 0
    let chosen = -1
    let earliest = at
    if (sum !== 0) {
      for (let k = incident.start[node] ?? 0; k < (incident.start[node + 1] ?? 0); k++) {
        const arc = incident.items[k] ?? 0
        if ((source[arc] === node) !== outward) continue
        const other = outward ? (target[arc] ?? 0) : (source[arc] ?? 0)
        if ((rank[other] ?? 0) < earliest && tight(tree, arc)) {
          chosen = arc
          earliest = rank[other] ?? 0
        }
      }
    }
    if (chosen >= 0) {
      const above = outward ? (target[chosen] ?? 0) : (source[chosen] ?? 0)
      flow[chosen] = Math.abs(sum)
      balance[above] = (balance[above] ?? 0) + sum
      size[above] = (size[above] ?? 0) + (size[node] ?? 0)
      attach(tree, node, above, chosen)
      continue
    }
    const root = count + (tree.component[node] ?? 0)
    const artificial = arcCount + node
    source[artificial] = outward ? node : root
    target[artificial] = outward ? root : node
    length[artificial] = outward ? -(potential[node] ?? 0) : (potential[node] ?? 0)
    flow[artificial] = Math.abs(sum)
    size[root] = (size[root] ?? 0) + (size[node] ?? 0)
    attach(tree, node, root, artificial)
  }
}

function pivot(tree: FlowTree, enter: number, violation: number): void {
  const { source, flow, parent, parentArc, size } = tree
  const k = source[enter] ?? 0
  const l = tree.target[enter] ?? 0
  let a = k
  let b = l
  let tailAmount = Number.POSITIVE_INFINITY
  let headAmount = Number.POSITIVE_INFINITY
  let tailLeaving = -1
  let headLeaving = -1
  while (a !== b) {
    const sizeA = size[a] ?? 0
    const sizeB = size[b] ?? 0
    if (sizeA <= sizeB) {
      const arc = parentArc[a] ?? 0
      if (source[arc] === a && (flow[arc] ?? 0) < tailAmount) {
        tailAmount = flow[arc] ?? 0
        tailLeaving = a
      }
      a = parent[a] ?? 0
    }
    if (sizeB <= sizeA) {
      const arc = parentArc[b] ?? 0
      if (source[arc] !== b && (flow[arc] ?? 0) <= headAmount) {
        headAmount = flow[arc] ?? 0
        headLeaving = b
      }
      b = parent[b] ?? 0
    }
  }
  const apex = a
  const onTail = tailAmount < headAmount
  const amount = onTail ? tailAmount : headAmount
  const leaving = onTail ? tailLeaving : headLeaving
  const moved = size[leaving] ?? 0
  if (amount > 0) flow[enter] = (flow[enter] ?? 0) + amount
  let shifting = !onTail
  for (let node = k; node !== apex; node = parent[node] ?? 0) {
    const arc = parentArc[node] ?? 0
    if (amount > 0) flow[arc] = (flow[arc] ?? 0) + (source[arc] === node ? -amount : amount)
    if (shifting) size[node] = (size[node] ?? 0) + (onTail ? -moved : moved)
    else if (node === leaving) shifting = true
  }
  shifting = onTail
  for (let node = l; node !== apex; node = parent[node] ?? 0) {
    const arc = parentArc[node] ?? 0
    if (amount > 0) flow[arc] = (flow[arc] ?? 0) + (source[arc] === node ? amount : -amount)
    if (shifting) size[node] = (size[node] ?? 0) + (onTail ? moved : -moved)
    else if (node === leaving) shifting = true
  }
  const near = onTail ? k : l
  const far = onTail ? l : k
  const change = onTail ? violation : -violation
  const root = tree.count + (tree.component[leaving] ?? 0)
  if (moved * 2 <= (size[root] ?? 0)) shift(tree, leaving, -1, change)
  else shift(tree, root, leaving, -change)
  const { next, previous, last, path, pathLast, pathPrevious, pathAfter } = tree
  const end = last[leaving] ?? leaving
  const before = previous[leaving] ?? 0
  const after = next[end] ?? -1
  next[before] = after
  if (after >= 0) previous[after] = before
  for (
    let node = parent[leaving] ?? -1;
    node >= 0 && last[node] === end;
    node = parent[node] ?? -1
  ) {
    last[node] = before
  }
  let steps = 0
  for (let node = near; ; node = parent[node] ?? 0) {
    const final = last[node] ?? node
    path[steps] = node
    pathLast[steps] = final
    pathPrevious[steps] = previous[node] ?? 0
    pathAfter[steps] = next[final] ?? -1
    steps++
    if (node === leaving) break
  }
  let tip = pathLast[0] ?? near
  for (let at = 1; at < steps; at++) {
    const node = path[at] ?? 0
    next[tip] = node
    previous[node] = tip
    const inner = pathPrevious[at - 1] ?? node
    if (pathLast[at] !== pathLast[at - 1]) {
      const resume = pathAfter[at - 1] ?? 0
      next[inner] = resume
      previous[resume] = inner
      tip = pathLast[at] ?? node
    } else {
      tip = inner
    }
  }
  for (let at = 0; at < steps; at++) last[path[at] ?? 0] = tip
  const following = next[far] ?? -1
  next[far] = near
  previous[near] = far
  next[tip] = following
  if (following >= 0) previous[following] = tip
  for (let node = far; node >= 0 && last[node] === far; node = parent[node] ?? -1) last[node] = tip
  let node = near
  let above = far
  let arc = enter
  let carried = moved
  for (;;) {
    const up = parent[node] ?? 0
    const upArc = parentArc[node] ?? 0
    const held = size[node] ?? 0
    parent[node] = above
    parentArc[node] = arc
    size[node] = carried
    if (node === leaving) return
    carried = moved - held
    above = node
    arc = upArc
    node = up
  }
}

function loosen(tree: FlowTree, amount: number): boolean {
  const { count, next, last, parentArc, flow, length, source } = tree
  let carrying = false
  for (let root = count; root < tree.potential.length; root++) {
    const end = last[root] ?? root
    if (end === root) continue
    for (let child = next[root] ?? 0; ; ) {
      const arc = parentArc[child] ?? 0
      const stop = last[child] ?? child
      if ((flow[arc] ?? 0) !== 0) {
        carrying = true
        length[arc] = (length[arc] ?? 0) - amount
        shift(tree, child, -1, source[arc] === child ? amount : -amount)
      }
      if (stop === end) break
      child = next[stop] ?? 0
    }
  }
  return carrying
}

function solve(
  count: number,
  tail: Int32Array,
  head: Int32Array,
  span: Int32Array,
  order: Int32Array,
  budget: number,
): { potential: Float64Array; optimal: boolean } {
  const tree = flowTree(count, tail, head, span)
  const { potential, length, arcCount } = tree
  plant(tree, order)
  const block = Math.max(64, Math.ceil(3 * Math.sqrt(arcCount)))
  let cursor = 0
  let pivots = 0
  for (let raise = 1; ; raise *= 2) {
    let quiet = 0
    while (quiet < arcCount) {
      let best = -1
      let least = 0
      const end = Math.min(block, arcCount)
      for (let step = 0; step < end; step++) {
        const arc = cursor
        cursor = cursor + 1 === arcCount ? 0 : cursor + 1
        const value =
          (potential[head[arc] ?? 0] ?? 0) - (potential[tail[arc] ?? 0] ?? 0) - (length[arc] ?? 0)
        if (value < least) {
          least = value
          best = arc
        }
      }
      quiet += end
      if (best < 0) continue
      if (pivots++ >= budget) return { potential, optimal: false }
      pivot(tree, best, least)
      quiet = 0
    }
    if (!loosen(tree, raise)) return { potential, optimal: true }
  }
}

function repair(
  count: number,
  tail: Int32Array,
  head: Int32Array,
  length: Int32Array,
  order: Int32Array,
  potential: Float64Array,
): void {
  const ids = new Int32Array(tail.length)
  for (let arc = 0; arc < tail.length; arc++) ids[arc] = arc
  const out = adjacency(count, tail, ids)
  for (const node of order) {
    const base = potential[node] ?? 0
    for (let k = out.start[node] ?? 0; k < (out.start[node + 1] ?? 0); k++) {
      const arc = out.items[k] ?? 0
      const to = head[arc] ?? 0
      potential[to] = Math.max(potential[to] ?? 0, base + (length[arc] ?? 0))
    }
  }
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

function tighten(
  count: number,
  tail: Int32Array,
  head: Int32Array,
  length: Int32Array,
  order: Int32Array,
  rank: Float64Array,
): void {
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
  const gap = (edge: number) =>
    actual(head[edge] ?? 0) - actual(tail[edge] ?? 0) - (length[edge] ?? 0)
  const join = (node: number) => {
    rank[node] = (rank[node] ?? 0) - offset
    reached[node] = 1
    members[size++] = node
  }
  for (const start of order) {
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
          if (value === 0) join(next)
          else if (from === node) {
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
      const down = below.size > 0 ? (keys[below.top()] ?? 0) - offset : Number.POSITIVE_INFINITY
      const rise = above.size > 0 ? (keys[above.top()] ?? 0) + offset : Number.POSITIVE_INFINITY
      if (down <= rise) {
        const edge = below.top()
        below.pop()
        offset += down
        join(head[edge] ?? 0)
      } else {
        const edge = above.top()
        above.pop()
        offset -= rise
        join(tail[edge] ?? 0)
      }
    }
    const base = rank[start] ?? 0
    for (let at = 0; at < size; at++) {
      const node = members[at] ?? 0
      rank[node] = (rank[node] ?? 0) - base
    }
  }
}

export function simplex(
  count: number,
  successors: Adjacency,
  topological: Int32Array,
  budget: number,
  lengths: Int32Array | null = null,
): Int32Array {
  const { kept, local, tail, head, length, removed, anchor, offset } = reduce(
    count,
    successors,
    lengths,
  )
  const reducedCount = kept.length
  const order = new Int32Array(reducedCount)
  let at = 0
  for (const node of topological) {
    const index = local[node] ?? -1
    if (index >= 0) order[at++] = index
  }
  const { potential, optimal } = solve(reducedCount, tail, head, length, order, budget)
  if (!optimal) repair(reducedCount, tail, head, length, order, potential)
  tighten(reducedCount, tail, head, length, order, potential)
  const layer = new Int32Array(count)
  for (let index = 0; index < reducedCount; index++) {
    layer[kept[index] ?? 0] = potential[index] ?? 0
  }
  for (let step = removed.length - 1; step >= 0; step--) {
    const node = removed[step] ?? 0
    layer[node] = (layer[anchor[node] ?? 0] ?? 0) + (offset[node] ?? 0)
  }
  return layer
}
