import { type Adjacency, adjacency } from './adjacency'

const searchSize = 30
const patience = 256
const unit = 2 ** 30

interface Tree {
  readonly tail: Int32Array
  readonly head: Int32Array
  readonly length: Float64Array
  readonly incident: Adjacency
  readonly rank: Float64Array
  readonly tree: Uint8Array
  readonly parent: Int32Array
  readonly size: Int32Array
  readonly cut: Float64Array
  readonly component: Int32Array
  readonly roots: Int32Array
  readonly side: Int32Array
  readonly mark: Int32Array
  readonly trail: Int32Array
  stamp: number
  moved: number
}

function slack(tree: Tree, edge: number): number {
  return (
    (tree.rank[tree.head[edge] ?? 0] ?? 0) -
    (tree.rank[tree.tail[edge] ?? 0] ?? 0) -
    (tree.length[edge] ?? 0)
  )
}

function other(tree: Tree, edge: number, node: number): number {
  const tail = tree.tail[edge] ?? 0
  return tail === node ? (tree.head[edge] ?? 0) : tail
}

function up(tree: Tree, node: number): number {
  return other(tree, tree.parent[node] ?? 0, node)
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

function feasibleTree(tree: Tree, count: number, sequence: Int32Array): void {
  const { tail, head, rank, incident, length, component, roots } = tree
  const edgeCount = tail.length
  const keys = new Float64Array(edgeCount)
  const below = new EdgeHeap(edgeCount, keys)
  const above = new EdgeHeap(edgeCount, keys)
  const reached = new Uint8Array(count)
  const members = tree.side
  let offset = 0
  let size = 0
  const actual = (node: number) => (rank[node] ?? 0) + (reached[node] === 1 ? offset : 0)
  const gap = (edge: number) =>
    actual(head[edge] ?? 0) - actual(tail[edge] ?? 0) - (length[edge] ?? 0)
  const join = (node: number, edge: number) => {
    rank[node] = (rank[node] ?? 0) - offset
    reached[node] = 1
    if (edge >= 0) tree.tree[edge] = 1
    members[size++] = node
  }
  const total = new Int32Array(count)
  for (let node = 0; node < count; node++) {
    const c = component[node] ?? 0
    total[c] = (total[c] ?? 0) + 1
  }
  roots.fill(-1)
  for (const start of sequence) {
    const c = component[start] ?? 0
    if ((roots[c] ?? -1) >= 0) continue
    roots[c] = start
    offset = 0
    size = 0
    let scan = 0
    join(start, -1)
    for (;;) {
      for (; scan < size; scan++) {
        const node = members[scan] ?? 0
        for (let k = incident.start[node] ?? 0; k < (incident.start[node + 1] ?? 0); k++) {
          const edge = incident.items[k] ?? 0
          const next = other(tree, edge, node)
          if (reached[next] === 1) continue
          const value = gap(edge)
          if (value === 0) {
            join(next, edge)
          } else if (tail[edge] === node) {
            keys[edge] = value + offset
            below.push(edge)
          } else {
            keys[edge] = value - offset
            above.push(edge)
          }
        }
      }
      if (size === total[c]) break
      while (below.size > 0 && reached[head[below.top()] ?? 0] === 1) below.pop()
      while (above.size > 0 && reached[tail[above.top()] ?? 0] === 1) above.pop()
      const down = below.size > 0 ? (keys[below.top()] ?? 0) - offset : Number.POSITIVE_INFINITY
      const rise = above.size > 0 ? (keys[above.top()] ?? 0) + offset : Number.POSITIVE_INFINITY
      if (down <= rise) {
        const edge = below.top()
        below.pop()
        offset += down
        join(head[edge] ?? 0, edge)
      } else {
        const edge = above.top()
        above.pop()
        offset -= rise
        join(tail[edge] ?? 0, edge)
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

function initialCuts(tree: Tree, count: number): void {
  const { incident, parent, roots, size, cut } = tree
  const order = new Int32Array(count)
  const low = new Int32Array(count)
  const lim = new Int32Array(count)
  const cursor = new Int32Array(count)
  const stack = tree.side
  let counter = 0
  for (const root of roots) {
    if (root < 0) break
    let depth = 0
    stack[depth++] = root
    parent[root] = -1
    low[root] = counter
    cursor[root] = incident.start[root] ?? 0
    while (depth > 0) {
      const node = stack[depth - 1] ?? 0
      const end = incident.start[node + 1] ?? 0
      let at = cursor[node] ?? 0
      while (at < end) {
        const edge = incident.items[at] ?? 0
        if (tree.tree[edge] === 1 && edge !== parent[node]) break
        at++
      }
      if (at < end) {
        cursor[node] = at + 1
        const edge = incident.items[at] ?? 0
        const next = other(tree, edge, node)
        parent[next] = edge
        low[next] = counter
        cursor[next] = incident.start[next] ?? 0
        stack[depth++] = next
      } else {
        lim[node] = counter
        order[counter++] = node
        depth--
      }
    }
  }
  for (let node = 0; node < count; node++) size[node] = (lim[node] ?? 0) - (low[node] ?? 0) + 1
  for (const node of order) {
    const edge = parent[node] ?? -1
    if (edge < 0) continue
    const outward = tree.tail[edge] === node
    const from = low[node] ?? 0
    const to = lim[node] ?? 0
    let sum = 0
    for (let at = incident.start[node] ?? 0; at < (incident.start[node + 1] ?? 0); at++) {
      const crossing = incident.items[at] ?? 0
      const far = lim[other(tree, crossing, node)] ?? 0
      const leaves = far < from || far > to
      let value = leaves ? 1 : (tree.tree[crossing] === 1 ? (cut[crossing] ?? 0) : 0) - 1
      let sign = (outward ? tree.head[crossing] : tree.tail[crossing]) === node ? 1 : -1
      if (leaves) sign = -sign
      if (sign < 0) value = -value
      sum += value
    }
    cut[edge] = sum
  }
}

function collect(tree: Tree, start: number, skip: number): number {
  const { incident, parent, side, mark, stamp } = tree
  let size = 0
  side[size++] = start
  mark[start] = stamp
  for (let at = 0; at < size; at++) {
    const node = side[at] ?? 0
    for (let k = incident.start[node] ?? 0; k < (incident.start[node + 1] ?? 0); k++) {
      const edge = incident.items[k] ?? 0
      if (tree.tree[edge] !== 1 || edge === skip || edge === parent[node]) continue
      const next = other(tree, edge, node)
      mark[next] = stamp
      side[size++] = next
    }
  }
  return size
}

function pivot(tree: Tree, leave: number): number {
  const { tail, head, parent, size, mark, side, incident, rank, cut, trail } = tree
  const t = tail[leave] ?? 0
  const h = head[leave] ?? 0
  const child = parent[t] === leave ? t : h
  const tailSide = child === t
  const below = size[child] ?? 0
  const root = tree.roots[tree.component[child] ?? 0] ?? 0
  const above = (size[root] ?? 0) - below
  tree.stamp++
  const stamp = tree.stamp
  const lower = below <= above
  const count = lower ? collect(tree, child, -1) : collect(tree, root, leave)
  const inner = (node: number) => (mark[node] === stamp) === lower
  let enter = -1
  let least = Number.POSITIVE_INFINITY
  for (let at = 0; at < count; at++) {
    const node = side[at] ?? 0
    for (let k = incident.start[node] ?? 0; k < (incident.start[node + 1] ?? 0); k++) {
      const edge = incident.items[k] ?? 0
      if (tree.tree[edge] === 1) continue
      const far = other(tree, edge, node)
      if (mark[far] === stamp) continue
      const into = lower === tailSide ? head[edge] : tail[edge]
      if (into !== node) continue
      const value = slack(tree, edge)
      if (value < least) {
        least = value
        enter = edge
      }
    }
  }
  if (enter < 0) return -1
  const delta = least
  tree.moved = delta
  if (delta > 0) {
    const move = tailSide === lower ? -delta : delta
    for (let at = 0; at < count; at++) {
      const node = side[at] ?? 0
      rank[node] = (rank[node] ?? 0) + move
    }
  }
  const a = inner(tail[enter] ?? 0) ? (tail[enter] ?? 0) : (head[enter] ?? 0)
  const b = other(tree, enter, a)
  const value = cut[leave] ?? 0
  tree.stamp++
  const seen = tree.stamp
  let node = tail[enter] ?? 0
  trail[node] = seen
  while ((parent[node] ?? -1) >= 0) {
    node = up(tree, node)
    trail[node] = seen
  }
  let lca = head[enter] ?? 0
  while (trail[lca] !== seen) lca = up(tree, lca)
  for (const [from, forward] of [
    [tail[enter] ?? 0, true],
    [head[enter] ?? 0, false],
  ] as const) {
    for (let step = from; step !== lca; step = up(tree, step)) {
      const edge = parent[step] ?? 0
      const along = tail[edge] === step ? forward : !forward
      cut[edge] = (cut[edge] ?? 0) + (along ? value : -value)
    }
  }
  const p = other(tree, leave, child)
  for (let step = p; step !== lca; step = up(tree, step)) size[step] = (size[step] ?? 0) - below
  for (let step = b; step !== lca; step = up(tree, step)) size[step] = (size[step] ?? 0) + below
  let edge = enter
  let carried = below
  node = a
  for (;;) {
    const previous = parent[node] ?? -1
    const held = size[node] ?? 0
    parent[node] = edge
    size[node] = carried
    if (node === child) break
    carried = below - held
    edge = previous
    node = other(tree, previous, node)
  }
  cut[enter] = -value
  cut[leave] = 0
  tree.tree[leave] = 0
  tree.tree[enter] = 1
  return enter
}

export function simplex(
  count: number,
  successors: Adjacency,
  topological: Int32Array,
  component: Int32Array,
  maxIterations: number,
): Int32Array {
  const edgeCount = successors.items.length
  const tail = new Int32Array(edgeCount)
  const head = successors.items
  for (let node = 0; node < count; node++) {
    for (let at = successors.start[node] ?? 0; at < (successors.start[node + 1] ?? 0); at++) {
      tail[at] = node
    }
  }
  const range = Math.max(1, Math.floor(unit / (2 * count + 2)))
  const length = new Float64Array(edgeCount)
  for (let edge = 0; edge < edgeCount; edge++) {
    let hash = Math.imul(edge + 1, 0x9e3779b1)
    hash ^= hash >>> 16
    hash = Math.imul(hash, 0x85ebca6b)
    hash ^= hash >>> 13
    length[edge] = unit + ((hash >>> 0) % range)
  }
  const ends = new Int32Array(edgeCount * 2)
  const ids = new Int32Array(edgeCount * 2)
  for (let edge = 0; edge < edgeCount; edge++) {
    ends[edge * 2] = tail[edge] ?? 0
    ends[edge * 2 + 1] = head[edge] ?? 0
    ids[edge * 2] = edge
    ids[edge * 2 + 1] = edge
  }
  const rank = new Float64Array(count)
  for (const node of topological) {
    for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
      const target = head[k] ?? 0
      rank[target] = Math.max(rank[target] ?? 0, (rank[node] ?? 0) + (length[k] ?? 0))
    }
  }
  const tree: Tree = {
    tail,
    head,
    length,
    incident: adjacency(count, ends, ids),
    rank,
    tree: new Uint8Array(edgeCount),
    parent: new Int32Array(count).fill(-1),
    size: new Int32Array(count),
    cut: new Float64Array(edgeCount),
    component,
    roots: new Int32Array(count),
    side: new Int32Array(count),
    mark: new Int32Array(count),
    trail: new Int32Array(count),
    stamp: 0,
    moved: 0,
  }
  feasibleTree(tree, count, topological)
  initialCuts(tree, count)
  const treeEdges: number[] = []
  for (let edge = 0; edge < edgeCount; edge++) if (tree.tree[edge] === 1) treeEdges.push(edge)
  let searchFrom = 0
  let idle = 0
  for (let iteration = 0; iteration < maxIterations && idle <= patience; iteration++) {
    let leave = -1
    let found = 0
    let scanned = 0
    for (; scanned < treeEdges.length; scanned++) {
      const at = (searchFrom + scanned) % treeEdges.length
      const edge = treeEdges[at] ?? 0
      if ((tree.cut[edge] ?? 0) >= 0) continue
      if (leave < 0 || (tree.cut[edge] ?? 0) < (tree.cut[treeEdges[leave] ?? 0] ?? 0)) leave = at
      if (++found >= searchSize) break
    }
    if (leave < 0) break
    searchFrom = (searchFrom + scanned) % treeEdges.length
    const enter = pivot(tree, treeEdges[leave] ?? 0)
    if (enter < 0) break
    idle = tree.moved >= unit / 2 ? 0 : idle + 1
    treeEdges[leave] = enter
  }
  const layer = new Int32Array(count)
  const seen = new Uint8Array(count)
  const stack = tree.side
  for (const root of tree.roots) {
    if (root < 0) break
    let depth = 0
    stack[depth++] = root
    seen[root] = 1
    while (depth > 0) {
      const node = stack[--depth] ?? 0
      for (
        let at = tree.incident.start[node] ?? 0;
        at < (tree.incident.start[node + 1] ?? 0);
        at++
      ) {
        const edge = tree.incident.items[at] ?? 0
        if (tree.tree[edge] !== 1) continue
        const next = other(tree, edge, node)
        if (seen[next] === 1) continue
        seen[next] = 1
        layer[next] = (layer[node] ?? 0) + (tail[edge] === node ? 1 : -1)
        stack[depth++] = next
      }
    }
  }
  return layer
}
