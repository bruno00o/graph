import { type Adjacency, linkStride } from '../../core/graph-model'
import { stringCheck } from '../../core/key-list'
import { offsetAt } from '../../core/spread'
import type { Key, KeyList, LayoutGraph } from '../../types'
import { type ChainFound, type WaysFound, WaysSearch } from '../../ways/ways'
import { separate } from '../force/collider'

export interface ChainsSpec<T = unknown> {
  readonly exits: ((datum: T, key: Key) => boolean) | KeyList<Key>
  readonly spacing?: number | undefined
}

export interface ChainsUnit {
  readonly members: readonly number[]
  readonly isHeart: boolean
}

export interface ChainsPlan {
  readonly found: WaysFound
  readonly step: number
  readonly gap: number
  readonly exit: Uint8Array
  readonly units: readonly ChainsUnit[]
  readonly heart: readonly number[]
  readonly linkStart: Int32Array
  readonly linkNext: Int32Array
  readonly adjacency: Adjacency
}

const check = stringCheck()

function exitsOf<T>(graph: LayoutGraph<T>, given: ChainsSpec<T>['exits']): Uint8Array {
  const exit = new Uint8Array(graph.capacity)
  if (typeof given === 'function') {
    for (let index = 0; index < graph.capacity; index++) {
      if (graph.alive[index] !== 1) continue
      if (given(graph.datum(index) as T, graph.keys[index] as Key)) exit[index] = 1
    }
    return exit
  }
  check(given, 'chains({ exits })')
  if (given === null || given === undefined) return exit
  if (typeof (given as Iterable<Key>)[Symbol.iterator] !== 'function') return exit
  const wanted = new Set(given as Iterable<Key>)
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.alive[index] !== 1) continue
    const key = graph.keys[index]
    if (key !== undefined && wanted.has(key)) exit[index] = 1
  }
  return exit
}

function movers(graph: LayoutGraph): number[] {
  const indices: number[] = []
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.alive[index] === 1 && graph.movable[index] === 1) indices.push(index)
  }
  return indices
}

function isPlain(graph: LayoutGraph, index: number): boolean {
  return !graph.blocks || (graph.blocks.size[index] ?? 0) === 0
}

export function planOf<T>(graph: LayoutGraph<T>, spec: ChainsSpec<T>): ChainsPlan {
  const capacity = graph.capacity
  const alive = graph.alive
  const edges = graph.edges
  const edgeCount = Math.floor(edges.length / 2)
  const endNode = new Int32Array(capacity).fill(-1)
  const nodeEnd = new Int32Array(capacity).fill(-1)
  const endHead = new Int32Array(capacity).fill(-1)
  const links = new Int32Array(edgeCount * linkStride).fill(-1)
  const degree = new Int32Array(capacity)
  for (let index = 0; index < capacity; index++) {
    if (alive[index] === 1) {
      endNode[index] = index
      nodeEnd[index] = index
    }
  }
  for (let edge = 0; edge < edgeCount; edge++) {
    const a = edges[edge * 2] ?? -1
    const b = edges[edge * 2 + 1] ?? -1
    if (a === b || alive[a] !== 1 || alive[b] !== 1) continue
    const at = edge * linkStride
    links[at] = a
    links[at + 1] = b
    links[at + 2] = endHead[a] ?? -1
    endHead[a] = edge
    links[at + 4] = endHead[b] ?? -1
    endHead[b] = edge
    degree[a] = (degree[a] ?? 0) + 1
    degree[b] = (degree[b] ?? 0) + 1
  }
  const linkStart = new Int32Array(capacity + 1)
  for (let index = 0; index < capacity; index++) {
    linkStart[index + 1] = (linkStart[index] ?? 0) + (degree[index] ?? 0)
  }
  const linkNext = new Int32Array(linkStart[capacity] ?? 0)
  const cursor = Int32Array.from(linkStart.subarray(0, capacity))
  for (let edge = 0; edge < edgeCount; edge++) {
    const at = edge * linkStride
    const a = links[at] ?? -1
    const b = links[at + 1] ?? -1
    if (a < 0 || b < 0) continue
    linkNext[cursor[a] ?? 0] = b
    cursor[a] = (cursor[a] ?? 0) + 1
    linkNext[cursor[b] ?? 0] = a
    cursor[b] = (cursor[b] ?? 0) + 1
  }
  const adjacency: Adjacency = { endNode, endHead, nodeEnd, links, edgeAt: () => undefined }
  const exit = exitsOf(graph, spec.exits)
  const found = new WaysSearch().analyze(adjacency, {
    failure: 'node',
    exit,
    nodeOk: (index) => alive[index] === 1,
    edgeOk: null,
    groups: null,
  })
  const indices = movers(graph)
  const spacing = spec.spacing
  const given = spacing !== undefined && Number.isFinite(spacing) && spacing >= 0 ? spacing : null
  let largest = 0
  let plain = 0
  for (const index of indices) {
    const diameter = (graph.radius[index] ?? 0) * 2
    if (diameter > largest) largest = diameter
    if (isPlain(graph, index) && diameter > plain) plain = diameter
  }
  const step = largest + (given ?? Math.max(plain, 24))

  const parent = new Int32Array(capacity).fill(-1)
  const find = (at: number): number => {
    let node = at
    while ((parent[node] ?? node) !== node) {
      const above = parent[node] ?? node
      parent[node] = parent[above] ?? above
      node = parent[node] ?? node
    }
    return node
  }
  const join = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    if (ra < rb) parent[rb] = ra
    else parent[ra] = rb
  }
  for (const index of found.exits) parent[index] = index
  for (const chain of found.chains) join(chain.ends[0], chain.ends[1])
  for (let edge = 0; edge < edgeCount; edge++) {
    const a = edges[edge * 2] ?? -1
    const b = edges[edge * 2 + 1] ?? -1
    if (exit[a] === 1 && exit[b] === 1) join(a, b)
  }
  const unitOfExit = new Int32Array(capacity).fill(-1)
  const memberLists: number[][] = []
  for (const index of found.exits) {
    const root = find(index)
    let unit = unitOfExit[root] ?? -1
    if (unit < 0) {
      unit = memberLists.length
      unitOfExit[root] = unit
      memberLists.push([])
    }
    ;(memberLists[unit] as number[]).push(index)
  }
  const unitChains: ChainFound[][] = Array.from({ length: memberLists.length }, () => [])
  for (const chain of found.chains) {
    const unit = unitOfExit[find(chain.ends[0])] ?? -1
    if (unit >= 0) (unitChains[unit] as ChainFound[]).push(chain)
  }
  const units: ChainsUnit[] = []
  const heart: number[] = []
  const seenPairs = new Set<number>()
  const degOf = new Int32Array(capacity)
  const uf = new Int32Array(capacity).fill(-1)
  const findUnit = (at: number): number => {
    let node = at
    while ((uf[node] ?? node) !== node) {
      const above = uf[node] ?? node
      uf[node] = uf[above] ?? above
      node = uf[node] ?? node
    }
    return node
  }
  for (let unit = 0; unit < memberLists.length; unit++) {
    const members = memberLists[unit] ?? []
    for (const member of members) uf[member] = member
    seenPairs.clear()
    let cycle = false
    let maxDeg = 0
    const link = (a: number, b: number): void => {
      const key = a < b ? a * capacity + b : b * capacity + a
      if (seenPairs.has(key)) return
      seenPairs.add(key)
      degOf[a] = (degOf[a] ?? 0) + 1
      degOf[b] = (degOf[b] ?? 0) + 1
      maxDeg = Math.max(maxDeg, degOf[a] ?? 0, degOf[b] ?? 0)
      const ra = findUnit(a)
      const rb = findUnit(b)
      if (ra === rb) cycle = true
      else if (ra < rb) uf[rb] = ra
      else uf[ra] = rb
    }
    for (const chain of unitChains[unit] ?? []) {
      if (chain.ends[0] !== chain.ends[1]) link(chain.ends[0], chain.ends[1])
    }
    for (const member of members) {
      for (let at = linkStart[member] ?? 0; at < (linkStart[member + 1] ?? 0); at++) {
        const other = linkNext[at] ?? -1
        if (exit[other] === 1 && (unitOfExit[find(other)] ?? -1) === unit) link(member, other)
      }
    }
    for (const member of members) degOf[member] = 0
    const isHeart = members.length > 2 && (cycle || maxDeg >= 3)
    units.push({ members, isHeart })
    if (isHeart) heart.push(...members)
  }
  return {
    found,
    step,
    gap: given ?? step - largest,
    exit,
    units,
    heart,
    linkStart,
    linkNext,
    adjacency,
  }
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function placeArc(
  x: Float64Array,
  y: Float64Array,
  a: number,
  b: number,
  nodes: readonly number[],
  step: number,
  towardX: number,
  towardY: number,
  centerX: Float64Array,
  centerY: Float64Array,
  centerSet: Uint8Array,
): void {
  const count = nodes.length
  const ax = x[a] ?? 0
  const ay = y[a] ?? 0
  const bx = x[b] ?? 0
  const by = y[b] ?? 0
  const chord = Math.hypot(bx - ax, by - ay)
  const length = (count + 1) * step
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  if (chord === 0) {
    const radius = length / (2 * Math.PI)
    let dx = towardX - ax
    let dy = towardY - ay
    const away = Math.hypot(dx, dy)
    if (away === 0) {
      dx = 0
      dy = 1
    } else {
      dx /= away
      dy /= away
    }
    const cx = ax + radius * dx
    const cy = ay + radius * dy
    const first = Math.atan2(ay - cy, ax - cx)
    for (let i = 0; i < count; i++) {
      const turn = first + ((i + 1) * 2 * Math.PI) / (count + 1)
      const node = nodes[i] ?? -1
      x[node] = cx + radius * Math.cos(turn)
      y[node] = cy + radius * Math.sin(turn)
      centerX[node] = cx
      centerY[node] = cy
      centerSet[node] = 1
    }
    centerX[a] = cx
    centerY[a] = cy
    centerSet[a] = 1
    return
  }
  if (length <= chord) {
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1)
      const node = nodes[i] ?? -1
      x[node] = ax + (bx - ax) * t
      y[node] = ay + (by - ay) * t
    }
    return
  }
  let nx = (ay - by) / chord
  let ny = (bx - ax) / chord
  if ((towardX - mx) * nx + (towardY - my) * ny < 0) {
    nx = -nx
    ny = -ny
  }
  const ratio = Math.max(length / chord, 1 + 1e-9)
  let low = 1e-6
  let high = 2 * Math.PI - 1e-6
  for (let round = 0; round < 60; round++) {
    const angle = (low + high) / 2
    if (angle / (2 * Math.sin(angle / 2)) < ratio) low = angle
    else high = angle
  }
  const angle = (low + high) / 2
  const radius = chord / (2 * Math.sin(angle / 2))
  const cx = mx - nx * radius * Math.cos(angle / 2)
  const cy = my - ny * radius * Math.cos(angle / 2)
  const first = Math.atan2(ay - cy, ax - cx)
  const bulge = Math.atan2(ny, nx)
  const sign =
    Math.abs(wrap(first + angle / 2 - bulge)) < Math.abs(wrap(first - angle / 2 - bulge)) ? 1 : -1
  for (let i = 0; i < count; i++) {
    const turn = first + (sign * (i + 1) * angle) / (count + 1)
    const node = nodes[i] ?? -1
    x[node] = cx + radius * Math.cos(turn)
    y[node] = cy + radius * Math.sin(turn)
    centerX[node] = cx
    centerY[node] = cy
    centerSet[node] = 1
  }
  centerX[a] = cx
  centerY[a] = cy
  centerSet[a] = 1
  centerX[b] = cx
  centerY[b] = cy
  centerSet[b] = 1
}

function placeChain(
  chain: ChainFound,
  parity: number,
  line: boolean,
  x: Float64Array,
  y: Float64Array,
  placed: Uint8Array,
  unitOf: Int32Array,
  unit: number,
  step: number,
  cx: number,
  cy: number,
  centerX: Float64Array,
  centerY: Float64Array,
  centerSet: Uint8Array,
): void {
  for (const node of chain.nodes) {
    if (placed[node] === 1) return
  }
  const a = chain.ends[0]
  const b = chain.ends[1]
  const side = parity % 2 === 0 ? 1 : -1
  let towardX: number
  let towardY: number
  if (a === b) {
    towardX = x[a] ?? 0
    towardY = (y[a] ?? 0) + side * step
  } else if (line) {
    const mx = ((x[a] ?? 0) + (x[b] ?? 0)) / 2
    const my = ((y[a] ?? 0) + (y[b] ?? 0)) / 2
    towardX = mx
    towardY = my + side * step
  } else {
    const mx = ((x[a] ?? 0) + (x[b] ?? 0)) / 2
    const my = ((y[a] ?? 0) + (y[b] ?? 0)) / 2
    let bx = mx - cx
    let by = my - cy
    const len = Math.hypot(bx, by)
    if (len === 0) {
      bx = 0
      by = 1
    } else {
      bx /= len
      by /= len
    }
    towardX = mx + bx * step * side
    towardY = my + by * step * side
  }
  placeArc(x, y, a, b, chain.nodes, step, towardX, towardY, centerX, centerY, centerSet)
  for (const node of chain.nodes) {
    placed[node] = 1
    unitOf[node] = unit
  }
}

export function compute<T>(
  graph: LayoutGraph<T>,
  plan: ChainsPlan,
  coreXy?: Float32Array,
): Float32Array {
  const capacity = graph.capacity
  const alive = graph.alive
  const movable = graph.movable
  const radius = graph.radius
  const { found, step, gap, units, linkStart, linkNext } = plan
  const x = new Float64Array(capacity)
  const y = new Float64Array(capacity)
  const placed = new Uint8Array(capacity)
  for (let index = 0; index < capacity; index++) {
    if (alive[index] === 1 && movable[index] !== 1) {
      x[index] = graph.xy[index * 2] ?? 0
      y[index] = graph.xy[index * 2 + 1] ?? 0
      placed[index] = 1
    }
  }
  const neighborsOf = (index: number, visit: (other: number) => void): void => {
    for (let at = linkStart[index] ?? 0; at < (linkStart[index + 1] ?? 0); at++) {
      visit(linkNext[at] ?? -1)
    }
  }

  const unitOf = new Int32Array(capacity).fill(-1)
  const unitMembers: number[][] = []
  for (let unit = 0; unit < units.length; unit++) {
    const members = units[unit]?.members ?? []
    unitMembers.push([...members])
    for (const member of members) unitOf[member] = unit
  }
  const centerX = new Float64Array(capacity)
  const centerY = new Float64Array(capacity)
  const centerSet = new Uint8Array(capacity)
  const ownChains: ChainFound[][] = Array.from({ length: units.length }, () => [])
  for (const chain of found.chains) {
    const unit = unitOf[chain.ends[0]] ?? -1
    if (unit >= 0) (ownChains[unit] as ChainFound[]).push(chain)
  }
  const minNode = (chain: ChainFound): number => {
    let min = Number.POSITIVE_INFINITY
    for (const node of chain.nodes) min = Math.min(min, node)
    return min
  }

  for (let unit = 0; unit < units.length; unit++) {
    const { members, isHeart } = units[unit] as ChainsUnit
    const fixed = members.filter((member) => movable[member] !== 1)
    const free = members.filter((member) => movable[member] === 1)
    let anchorX = 0
    let anchorY = 0
    if (fixed.length > 0) {
      for (const member of fixed) {
        anchorX += x[member] ?? 0
        anchorY += y[member] ?? 0
      }
      anchorX /= fixed.length
      anchorY /= fixed.length
    } else {
      const [ox, oy] = offsetAt(unit, units.length, step)
      anchorX = ox
      anchorY = oy
    }
    const own = ownChains[unit] ?? []
    if (members.length === 1) {
      if (free.length === 1) {
        const only = free[0] as number
        x[only] = anchorX
        y[only] = anchorY
        placed[only] = 1
      }
    } else if (members.length === 2) {
      if (fixed.length === 2) {
        placed[members[0] as number] = 1
        placed[members[1] as number] = 1
      } else if (fixed.length === 1) {
        const anchor = fixed[0] as number
        const other = free[0] as number
        x[other] = (x[anchor] ?? 0) + 1.6 * step
        y[other] = y[anchor] ?? 0
        placed[anchor] = 1
        placed[other] = 1
      } else {
        x[members[0] as number] = anchorX - 0.8 * step
        y[members[0] as number] = anchorY
        x[members[1] as number] = anchorX + 0.8 * step
        y[members[1] as number] = anchorY
        placed[members[0] as number] = 1
        placed[members[1] as number] = 1
      }
    } else if (!isHeart) {
      const order = [
        members.find(
          (member) =>
            own.filter((chain) => chain.ends[0] === member || chain.ends[1] === member).length ===
            1,
        ) ?? (members[0] as number),
      ]
      while (order.length < members.length) {
        const last = order[order.length - 1] as number
        const next =
          own
            .map((chain) =>
              chain.ends[0] === last ? chain.ends[1] : chain.ends[1] === last ? chain.ends[0] : -1,
            )
            .find((member) => member >= 0 && !order.includes(member)) ??
          (members.find((member) => !order.includes(member)) as number)
        order.push(next)
      }
      let lx = 0
      order.forEach((member, at) => {
        if (at > 0) {
          const before = order[at - 1] as number
          let span = 2 * step
          for (const chain of own) {
            if (
              (chain.ends[0] === before && chain.ends[1] === member) ||
              (chain.ends[0] === member && chain.ends[1] === before)
            ) {
              span = Math.max(span, (2 * (chain.nodes.length + 1) * step) / Math.PI)
            }
          }
          lx += span
        }
        if (movable[member] === 1) {
          x[member] = anchorX + lx
          y[member] = anchorY
        }
        placed[member] = 1
      })
    } else {
      const movableMembers = members.filter((member) => movable[member] === 1)
      if (coreXy !== undefined && movableMembers.length > 0) {
        for (const member of movableMembers) {
          x[member] = coreXy[member * 2] ?? 0
          y[member] = coreXy[member * 2 + 1] ?? 0
          placed[member] = 1
        }
      } else {
        const ring = movableMembers.length
        const r = Math.max(step, (ring * step) / (2 * Math.PI))
        movableMembers.forEach((member, at) => {
          const angle = -Math.PI / 2 + (at * 2 * Math.PI) / ring
          x[member] = anchorX + r * Math.cos(angle)
          y[member] = anchorY + r * Math.sin(angle)
          placed[member] = 1
        })
      }
      for (const member of members) placed[member] = 1
    }
    let cx = 0
    let cy = 0
    for (const member of members) {
      cx += x[member] ?? 0
      cy += y[member] ?? 0
    }
    cx /= members.length
    cy /= members.length
    const sorted = [...own].sort((p, q) => minNode(p) - minNode(q))
    for (const chain of sorted) {
      const twins = sorted.filter(
        (other) =>
          (other.ends[0] === chain.ends[0] && other.ends[1] === chain.ends[1]) ||
          (other.ends[0] === chain.ends[1] && other.ends[1] === chain.ends[0]),
      )
      const parity = twins.indexOf(chain)
      placeChain(
        chain,
        parity,
        !isHeart,
        x,
        y,
        placed,
        unitOf,
        unit,
        step,
        cx,
        cy,
        centerX,
        centerY,
        centerSet,
      )
    }
  }

  const heading = new Float64Array(capacity)
  const headingSet = new Uint8Array(capacity)
  const parentOf = new Int32Array(capacity).fill(-1)
  const parentStamp = new Int32Array(capacity).fill(-1)
  const childCount = new Int32Array(capacity)
  const leafOf = new Int32Array(capacity)
  let generation = 0
  const fanFrom = (seeds: readonly number[]): void => {
    generation++
    const queue: number[] = [...seeds]
    const order: number[] = []
    for (const seed of seeds) {
      parentStamp[seed] = generation
      childCount[seed] = 0
      leafOf[seed] = 0
    }
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head] as number
      neighborsOf(id, (other) => {
        if (
          alive[other] === 1 &&
          movable[other] === 1 &&
          placed[other] !== 1 &&
          parentStamp[other] !== generation
        ) {
          parentStamp[other] = generation
          parentOf[other] = id
          childCount[other] = 0
          leafOf[other] = 0
          childCount[id] = (childCount[id] ?? 0) + 1
          order.push(other)
          queue.push(other)
        }
      })
    }
    for (const node of order) leafOf[node] = (childCount[node] ?? 0) === 0 ? 1 : 0
    for (let at = order.length - 1; at >= 0; at--) {
      const node = order[at] as number
      const parent = parentOf[node] ?? -1
      if (parent >= 0) leafOf[parent] = (leafOf[parent] ?? 0) + (leafOf[node] ?? 0)
    }
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head] as number
      const kids: number[] = []
      neighborsOf(id, (other) => {
        if (parentStamp[other] === generation && parentOf[other] === id) kids.push(other)
      })
      if (kids.length === 0) continue
      const ahead =
        headingSet[id] === 1
          ? (heading[id] ?? 0)
          : centerSet[id] === 1
            ? Math.atan2((y[id] ?? 0) - (centerY[id] ?? 0), (x[id] ?? 0) - (centerX[id] ?? 0))
            : Math.PI / 2
      let leaves = 0
      for (const kid of kids) leaves += leafOf[kid] ?? 1
      const spread = Math.min(1.2, 0.9 * leaves)
      const reach = kids.length > 1 ? step * Math.max(1, leaves / spread) : step
      let cumulative = 0
      for (const kid of kids) {
        const size = leafOf[kid] ?? 1
        const angle = ahead + spread * ((cumulative + size / 2) / leaves - 0.5)
        cumulative += size
        x[kid] = (x[id] ?? 0) + reach * Math.cos(angle)
        y[kid] = (y[id] ?? 0) + reach * Math.sin(angle)
        heading[kid] = angle
        headingSet[kid] = 1
        placed[kid] = 1
        unitOf[kid] = unitOf[id] ?? -1
      }
    }
  }

  const seeds: number[] = []
  for (let index = 0; index < capacity; index++) {
    if (placed[index] === 1) seeds.push(index)
  }
  fanFrom(seeds)

  const compStamp = new Int32Array(capacity).fill(-1)
  let compGen = 0
  for (let index = 0; index < capacity; index++) {
    if (alive[index] !== 1 || movable[index] !== 1 || placed[index] === 1) continue
    if (compStamp[index] === compGen) continue
    compGen++
    const component: number[] = []
    const queue = [index]
    compStamp[index] = compGen
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head] as number
      component.push(id)
      neighborsOf(id, (other) => {
        if (
          alive[other] === 1 &&
          movable[other] === 1 &&
          placed[other] !== 1 &&
          compStamp[other] !== compGen
        ) {
          compStamp[other] = compGen
          queue.push(other)
        }
      })
    }
    let seed = component[0] ?? -1
    let seedDeg = -1
    for (const node of component) {
      const deg = (linkStart[node + 1] ?? 0) - (linkStart[node] ?? 0)
      if (deg > seedDeg) {
        seedDeg = deg
        seed = node
      }
    }
    const unit = unitMembers.length
    unitMembers.push([seed])
    unitOf[seed] = unit
    const [ox, oy] = offsetAt(unit, unitMembers.length, step)
    x[seed] = ox
    y[seed] = oy
    placed[seed] = 1
    fanFrom([seed])
    for (const node of component) {
      if (placed[node] !== 1) {
        x[node] = x[seed] ?? 0
        y[node] = y[seed] ?? 0
        placed[node] = 1
        unitOf[node] = unit
      }
    }
  }

  const moving: number[] = []
  for (let index = 0; index < capacity; index++) {
    if (alive[index] === 1 && movable[index] === 1) moving.push(index)
  }

  const unitCount = unitMembers.length
  if (unitCount > 0) {
    const unitLists: number[][] = Array.from({ length: unitCount }, () => [])
    for (let index = 0; index < capacity; index++) {
      const unit = unitOf[index] ?? -1
      if (unit >= 0) (unitLists[unit] as number[]).push(index)
    }
    const boxes = unitMembers.map((_, unit) => {
      let left = Number.POSITIVE_INFINITY
      let right = Number.NEGATIVE_INFINITY
      let top = Number.POSITIVE_INFINITY
      let bottom = Number.NEGATIVE_INFINITY
      for (const index of unitLists[unit] ?? []) {
        if (placed[index] !== 1) continue
        left = Math.min(left, x[index] ?? 0)
        right = Math.max(right, x[index] ?? 0)
        top = Math.min(top, y[index] ?? 0)
        bottom = Math.max(bottom, y[index] ?? 0)
      }
      return { left, right, top, bottom }
    })
    const anchored = unitMembers.map((members) => members.some((member) => movable[member] !== 1))
    for (let unit = 0; unit < unitCount; unit++) {
      if (anchored[unit]) continue
      const members = unitMembers[unit] ?? []
      let ex = 0
      let ey = 0
      for (const member of members) {
        ex += x[member] ?? 0
        ey += y[member] ?? 0
      }
      ex /= members.length
      ey /= members.length
      for (const index of unitLists[unit] ?? []) {
        if (movable[index] !== 1) continue
        x[index] = (x[index] ?? 0) - ex
        y[index] = (y[index] ?? 0) - ey
      }
      const box = boxes[unit] as (typeof boxes)[number]
      boxes[unit] = {
        left: box.left - ex,
        right: box.right - ex,
        top: box.top - ey,
        bottom: box.bottom - ey,
      }
    }
    const margin = 2 * step
    const freeUnits = unitMembers.map((_, unit) => unit).filter((unit) => !anchored[unit])
    const area = freeUnits.reduce((sum, unit) => {
      const box = boxes[unit] as (typeof boxes)[number]
      return sum + (box.right - box.left + margin) * (box.bottom - box.top + margin)
    }, 0)
    const width = 1.5 * Math.sqrt(area)
    let rowY = 0
    for (let first = 0; first < freeUnits.length; ) {
      const row = [freeUnits[first] as number]
      const box0 = boxes[row[0] as number] as (typeof boxes)[number]
      let used = box0.right - box0.left
      while (first + row.length < freeUnits.length) {
        const next = freeUnits[first + row.length] as number
        const box = boxes[next] as (typeof boxes)[number]
        if (used + margin + box.right - box.left > width) break
        used += margin + box.right - box.left
        row.push(next)
      }
      const above = Math.max(...row.map((unit) => -(boxes[unit] as (typeof boxes)[number]).top))
      let rowX = 0
      let deepest = 0
      for (const unit of row) {
        const box = boxes[unit] as (typeof boxes)[number]
        const dx = rowX - box.left
        const dy = rowY + above
        for (const index of unitLists[unit] ?? []) {
          if (movable[index] !== 1) continue
          x[index] = (x[index] ?? 0) + dx
          y[index] = (y[index] ?? 0) + dy
        }
        rowX += box.right - box.left + margin
        deepest = Math.max(deepest, box.bottom)
      }
      rowY += above + deepest + margin
      first += row.length
    }
  }

  const out = Float32Array.from(graph.xy)
  for (const index of moving) {
    if (placed[index] === 1) {
      out[index * 2] = x[index] ?? 0
      out[index * 2 + 1] = y[index] ?? 0
    }
  }
  const fixed = new Uint8Array(capacity)
  let maxRadius = 0
  for (let index = 0; index < capacity; index++) {
    if (alive[index] !== 1) continue
    if (movable[index] !== 1) fixed[index] = 1
    const r = radius[index] ?? 0
    if (r > maxRadius) maxRadius = r
  }
  const gapFinal = Math.min(gap, Math.max(0, 0.6 * step - 2 * maxRadius))
  separate(radius, alive, fixed, out, gapFinal, 40)
  return out
}
