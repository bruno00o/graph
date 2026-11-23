import type { Link, Spot } from './sample'

export interface Way {
  readonly nodes: readonly string[]
  readonly edges: readonly string[]
}

export interface Ways {
  readonly twoWays: ReadonlySet<string>
  readonly sharedEdges: ReadonlySet<string>
  readonly joins: ReadonlyMap<string, string>
  readonly pair: (key: string) => readonly [Way, Way] | null
}

export function findWays(spots: readonly Spot[], links: readonly Link[]): Ways {
  const index = new Map(spots.map((spot, at) => [spot.id, at]))
  const root = spots.length
  const ends: number[] = []
  const ids: (string | null)[] = []
  const around: number[][] = Array.from({ length: root + 1 }, () => [])
  const join = (a: number, b: number, id: string | null) => {
    around[a]?.push(ids.length)
    around[b]?.push(ids.length)
    ends.push(a, b)
    ids.push(id)
  }
  for (const link of links) {
    const a = index.get(link.from)
    const b = index.get(link.to)
    if (a !== undefined && b !== undefined && a !== b) join(a, b, link.id)
  }
  spots.forEach((spot, at) => {
    if (spot.base) join(at, root, null)
  })
  const other = (edge: number, from: number) =>
    ends[2 * edge] === from ? (ends[2 * edge + 1] as number) : (ends[2 * edge] as number)

  const order = new Int32Array(root + 1).fill(-1)
  const low = new Int32Array(root + 1)
  const parent = new Int32Array(root + 1).fill(-1)
  const parentEdge = new Int32Array(root + 1).fill(-1)
  const cursor = new Int32Array(root + 1)
  const inner = new Set<number>([root])
  const sharedEdges = new Set<string>()
  const walk = [root]
  const pending: number[] = []
  let clock = 0
  order[root] = clock++
  while (walk.length > 0) {
    const at = walk[walk.length - 1] as number
    const edges = around[at] as number[]
    if ((cursor[at] as number) < edges.length) {
      const edge = edges[cursor[at] as number] as number
      cursor[at] = (cursor[at] as number) + 1
      if (edge === parentEdge[at]) continue
      const next = other(edge, at)
      if ((order[next] as number) < 0) {
        parent[next] = at
        parentEdge[next] = edge
        order[next] = low[next] = clock++
        pending.push(edge)
        walk.push(next)
      } else if ((order[next] as number) < (order[at] as number)) {
        pending.push(edge)
        low[at] = Math.min(low[at] as number, order[next] as number)
      }
      continue
    }
    walk.pop()
    const up = parent[at] as number
    if (up < 0) continue
    low[up] = Math.min(low[up] as number, low[at] as number)
    if ((low[at] as number) < (order[up] as number)) continue
    const block: number[] = []
    let edge = -1
    while (edge !== parentEdge[at]) {
      edge = pending.pop() as number
      block.push(edge)
    }
    if (up !== root || block.length < 3) continue
    for (const member of block) {
      inner.add(ends[2 * member] as number)
      inner.add(ends[2 * member + 1] as number)
      const id = ids[member]
      if (id) sharedEdges.add(id)
    }
  }

  const twoWays = new Set<string>()
  const joins = new Map<string, string>()
  spots.forEach((spot, at) => {
    if (spot.base) return
    if (inner.has(at)) {
      twoWays.add(spot.id)
      return
    }
    let up = parent[at] as number
    while (up >= 0 && !inner.has(up) && !spots[up]?.base) up = parent[up] as number
    if (up >= 0 && up !== root) joins.set(spot.id, (spots[up] as Spot).id)
  })

  const pair = (key: string): readonly [Way, Way] | null => {
    const start = index.get(key)
    if (start === undefined || !twoWays.has(key)) return null
    return disjointWays(start, root, ends, ids, spots)
  }

  return { twoWays, sharedEdges, joins, pair }
}

function disjointWays(
  start: number,
  root: number,
  ends: readonly number[],
  ids: readonly (string | null)[],
  spots: readonly Spot[],
): readonly [Way, Way] | null {
  const to: number[] = []
  const room: number[] = []
  const edgeOf: number[] = []
  const arcs: number[][] = Array.from({ length: 2 * (root + 1) }, () => [])
  const arc = (from: number, target: number, capacity: number, edge: number) => {
    arcs[from]?.push(to.length)
    to.push(target)
    room.push(capacity)
    edgeOf.push(edge)
    arcs[target]?.push(to.length)
    to.push(from)
    room.push(0)
    edgeOf.push(-1)
  }
  const entry = (node: number) => 2 * node
  const exit = (node: number) => 2 * node + 1
  for (let node = 0; node <= root; node++) {
    arc(entry(node), exit(node), node === start || node === root ? 2 : 1, -1)
  }
  for (let edge = 0; edge < ids.length; edge++) {
    const a = ends[2 * edge] as number
    const b = ends[2 * edge + 1] as number
    arc(exit(a), entry(b), 1, edge)
    arc(exit(b), entry(a), 1, edge)
  }

  const source = entry(start)
  const sink = entry(root)
  for (let round = 0; round < 2; round++) {
    const through = new Int32Array(arcs.length).fill(-1)
    const queue = [source]
    through[source] = -2
    for (let head = 0; head < queue.length && (through[sink] as number) === -1; head++) {
      const at = queue[head] as number
      for (const used of arcs[at] as number[]) {
        const target = to[used] as number
        if ((room[used] as number) > 0 && (through[target] as number) === -1) {
          through[target] = used
          queue.push(target)
        }
      }
    }
    if ((through[sink] as number) === -1) return null
    for (let at = sink; at !== source; ) {
      const used = through[at] as number
      room[used] = (room[used] as number) - 1
      room[used ^ 1] = (room[used ^ 1] as number) + 1
      at = to[used ^ 1] as number
    }
  }

  const carried = (used: number) => used % 2 === 0 && (room[used] as number) === 0
  const follow = (): Way => {
    const nodes = [(spots[start] as Spot).id]
    const edges: string[] = []
    let at = exit(start)
    while (at !== sink) {
      const used = (arcs[at] as number[]).find(carried)
      if (used === undefined) break
      room[used] = 1
      at = to[used] as number
      const id = ids[edgeOf[used] as number]
      if (at === sink) break
      if (id) edges.push(id)
      nodes.push((spots[at >> 1] as Spot).id)
      at = exit(at >> 1)
    }
    return { nodes, edges }
  }
  return [follow(), follow()]
}
