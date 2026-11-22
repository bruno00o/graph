import { type CellFrame, CellTrace, CrossingCount, crosses, frameOf, traceCells } from './crossings'
import type { ForceGraph, ForceSettings } from './simulation'
import type { UntangleJob } from './untangle-stage'

const densest = 4
const sampledFrom = 16384
const sampleShare = 1 / 16
const sampleMargin = 1.5
const roundLimit = 10
const leastGain = 0.02
const tolerance = 0.35
const stretch = 3
const branchLimit = 256
const crossedLimit = 32
const goldenTurn = Math.PI * (3 - Math.sqrt(5))
const branchTurns = [
  Math.PI / 12,
  -Math.PI / 12,
  Math.PI / 6,
  -Math.PI / 6,
  Math.PI / 3,
  -Math.PI / 3,
  Math.PI / 2,
  -Math.PI / 2,
  (3 * Math.PI) / 4,
  (-3 * Math.PI) / 4,
  Math.PI,
]
const mirroredTurns = [0, ...branchTurns]
const fround = Math.fround

const sampleCount = -1
const firstCount = 0
const findBranches = 1
const newRound = 2
const tryBranches = 3
const branchCount = 4
const tryNodes = 5
const roundCount = 6

function sampled(edges: Uint32Array): Uint32Array {
  const limit = sampleShare * 4294967296
  const kept: number[] = []
  for (let e = 0; e < edges.length >> 1; e++) {
    if (Math.imul(e + 1, 0x9e3779b1) >>> 0 < limit)
      kept.push(edges[e * 2] ?? 0, edges[e * 2 + 1] ?? 0)
  }
  return Uint32Array.from(kept)
}

class DynamicGrid {
  readonly frame: CellFrame
  readonly edgeCells: number[][]
  readonly #edgeLists: (number[] | undefined)[]
  readonly #nodeLists: (number[] | undefined)[]
  readonly #nodeCell: Int32Array
  readonly #trace = new CellTrace()

  constructor(frame: CellFrame, m: number, capacity: number) {
    this.frame = frame
    const count = frame.cols * frame.rows
    this.#edgeLists = new Array(count)
    this.#nodeLists = new Array(count)
    this.edgeCells = Array.from({ length: m }, () => [])
    this.#nodeCell = new Int32Array(capacity).fill(-1)
  }

  cellAt(x: number, y: number): number {
    const { x0, y0, cell, cols, rows } = this.frame
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / cell)))
    const cy = Math.min(rows - 1, Math.max(0, Math.floor((y - y0) / cell)))
    return cy * cols + cx
  }

  inside(x: number, y: number): boolean {
    const { x0, y0, cell, cols, rows } = this.frame
    return x >= x0 && y >= y0 && x < x0 + cell * cols && y < y0 + cell * rows
  }

  edgesIn(cell: number): readonly number[] | undefined {
    return this.#edgeLists[cell]
  }

  nodesIn(cell: number): readonly number[] | undefined {
    return this.#nodeLists[cell]
  }

  addEdge(e: number, ax: number, ay: number, bx: number, by: number): void {
    const cells = this.edgeCells[e] as number[]
    const lists = this.#edgeLists
    const trace = this.#trace
    const count = traceCells(this.frame, ax, ay, bx, by, trace)
    for (let k = 0; k < count; k++) {
      const cell = trace.cells[k] ?? 0
      const list = lists[cell]
      if (list) list.push(e)
      else lists[cell] = [e]
      cells.push(cell)
    }
  }

  removeEdge(e: number): void {
    const cells = this.edgeCells[e] as number[]
    for (const cell of cells) {
      const list = this.#edgeLists[cell] as number[]
      list[list.indexOf(e)] = list[list.length - 1] as number
      list.pop()
    }
    cells.length = 0
  }

  setNode(index: number, x: number, y: number): void {
    const before = this.#nodeCell[index] ?? -1
    const after = this.cellAt(x, y)
    if (before === after) return
    if (before >= 0) {
      const list = this.#nodeLists[before] as number[]
      list[list.indexOf(index)] = list[list.length - 1] as number
      list.pop()
    }
    const list = this.#nodeLists[after]
    if (list) list.push(index)
    else this.#nodeLists[after] = [index]
    this.#nodeCell[index] = after
  }
}

interface Branches {
  readonly pre: Int32Array
  readonly order: Int32Array
  readonly bridge: Int32Array
  readonly pivot: Int32Array
  readonly child: Int32Array
  readonly from: Int32Array
  readonly to: Int32Array
}

function segmentDistance2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const length2 = dx * dx + dy * dy
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0
  const ex = ax + t * dx - px
  const ey = ay + t * dy - py
  return ex * ex + ey * ey
}

function mirror(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  push: number,
  out: number[],
): void {
  const dx = bx - ax
  const dy = by - ay
  const length2 = dx * dx + dy * dy
  if (length2 === 0) {
    out.push(2 * ax - x, 2 * ay - y)
    return
  }
  const t = ((x - ax) * dx + (y - ay) * dy) / length2
  const fx = ax + t * dx
  const fy = ay + t * dy
  let nx = fx - x
  let ny = fy - y
  if (Math.hypot(nx, ny) === 0) {
    nx = -dy
    ny = dx
  }
  const norm = Math.hypot(nx, ny)
  out.push(2 * fx - x + (nx / norm) * push, 2 * fy - y + (ny / norm) * push)
}

export class UntanglePass implements UntangleJob {
  skipped = false
  moves = 0
  branchMoves = 0
  before = 0
  readonly #budget: number
  readonly #xy: Float32Array
  readonly #capacity: number
  readonly #nodes: Int32Array
  readonly #edges: Uint32Array
  readonly #movable: Uint8Array
  readonly #radius: Float32Array
  readonly #maxRadius: number
  readonly #px: Float64Array
  readonly #py: Float64Array
  readonly #start: Uint32Array
  readonly #other: Uint32Array
  readonly #edgeOf: Uint32Array
  readonly #edgeLength: number
  readonly #spacing: number
  readonly #box: Float64Array
  readonly #edgeStamp: Int32Array
  readonly #nodeStamp: Int32Array
  readonly #changedAt: Int32Array
  readonly #failedAt: Int32Array
  readonly #tx: Float64Array
  readonly #ty: Float64Array
  readonly #crossedBy: number[] = []
  readonly #candidates: number[] = []
  readonly #shifted: number[] = []
  readonly #trace = new CellTrace()
  #stamp = 0
  #clock = 1
  #phase = firstCount
  #count: CrossingCount
  #sample: CrossingCount | null = null
  #perEdge: Uint32Array = new Uint32Array(0)
  #total = 0
  #roundStart = 0
  #rounds = 0
  #gained = 0
  #cursor = 0
  #order: number[] = []
  #branches: Branches | null = null
  #fixedBranch: Uint8Array = new Uint8Array(0)
  #grid: DynamicGrid | null = null
  #spent = 0
  #done = false

  constructor(graph: ForceGraph, xy: Float32Array, settings: ForceSettings) {
    const { capacity, alive, movable, radius } = graph
    this.#budget = settings.untangle
    this.#xy = xy
    this.#capacity = capacity
    this.#radius = radius
    this.#edgeLength = settings.edgeLength
    this.#spacing = settings.spacing
    const nodes: number[] = []
    const px = new Float64Array(capacity)
    const py = new Float64Array(capacity)
    const free = new Uint8Array(capacity)
    let maxRadius = 0
    let movers = 0
    for (let index = 0; index < capacity; index++) {
      if (alive[index] !== 1) continue
      nodes.push(index)
      px[index] = xy[index * 2] ?? 0
      py[index] = xy[index * 2 + 1] ?? 0
      maxRadius = Math.max(maxRadius, radius[index] ?? 0)
      if (movable[index] === 1) {
        free[index] = 1
        movers++
      }
    }
    const kept: number[] = []
    for (let k = 0; k + 1 < graph.edges.length; k += 2) {
      const a = graph.edges[k] ?? 0
      const b = graph.edges[k + 1] ?? 0
      if (a === b || a >= capacity || b >= capacity) continue
      if (alive[a] !== 1 || alive[b] !== 1) continue
      kept.push(a, b)
    }
    this.#nodes = Int32Array.from(nodes)
    this.#edges = Uint32Array.from(kept)
    this.#px = px
    this.#py = py
    this.#movable = free
    this.#maxRadius = maxRadius
    const m = this.#edges.length >> 1
    const start = new Uint32Array(capacity + 1)
    for (let e = 0; e < m; e++) {
      const a = this.#edges[e * 2] ?? 0
      const b = this.#edges[e * 2 + 1] ?? 0
      start[a + 1] = (start[a + 1] ?? 0) + 1
      start[b + 1] = (start[b + 1] ?? 0) + 1
    }
    for (let index = 0; index < capacity; index++) {
      start[index + 1] = (start[index + 1] ?? 0) + (start[index] ?? 0)
    }
    const fill = start.slice(0, capacity)
    const other = new Uint32Array(m * 2)
    const edgeOf = new Uint32Array(m * 2)
    for (let e = 0; e < m; e++) {
      const a = this.#edges[e * 2] ?? 0
      const b = this.#edges[e * 2 + 1] ?? 0
      const at = fill[a] ?? 0
      other[at] = b
      edgeOf[at] = e
      fill[a] = at + 1
      const bt = fill[b] ?? 0
      other[bt] = a
      edgeOf[bt] = e
      fill[b] = bt + 1
    }
    this.#start = start
    this.#other = other
    this.#edgeOf = edgeOf
    const box = new Float64Array([
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ])
    for (const index of nodes) {
      box[0] = Math.min(box[0] ?? 0, px[index] ?? 0)
      box[1] = Math.min(box[1] ?? 0, py[index] ?? 0)
      box[2] = Math.max(box[2] ?? 0, px[index] ?? 0)
      box[3] = Math.max(box[3] ?? 0, py[index] ?? 0)
    }
    box[0] = (box[0] ?? 0) - this.#edgeLength
    box[1] = (box[1] ?? 0) - this.#edgeLength
    box[2] = (box[2] ?? 0) + this.#edgeLength
    box[3] = (box[3] ?? 0) + this.#edgeLength
    this.#box = box
    this.#edgeStamp = new Int32Array(m).fill(-1)
    this.#nodeStamp = new Int32Array(capacity).fill(-1)
    this.#changedAt = new Int32Array(capacity).fill(1)
    this.#failedAt = new Int32Array(capacity)
    this.#tx = new Float64Array(capacity)
    this.#ty = new Float64Array(capacity)
    this.#count = new CrossingCount(this.#nodes, this.#edges, px, py, densest * m)
    if (m >= sampledFrom) {
      const sample = sampled(this.#edges)
      const share = sample.length / 2 / m
      const cap = densest * m * sampleMargin * share * share
      this.#sample = new CrossingCount(this.#nodes, sample, px, py, cap)
      this.#phase = sampleCount
    }
    this.#done = m < 2 || movers === 0 || !(this.#budget > 0)
  }

  get moved(): boolean {
    return this.moves + this.branchMoves > 0
  }

  get crossings(): number {
    return this.#total
  }

  pin(index: number, x: number, y: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.#capacity) return
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (this.#movable[index] === 1) this.#movable[index] = 0
    const branches = this.#branches
    if (branches) {
      const at = branches.pre[index] ?? -1
      for (let b = 0; b < branches.bridge.length; b++) {
        if (at >= (branches.from[b] ?? 0) && at < (branches.to[b] ?? 0)) this.#fixedBranch[b] = 1
      }
    }
    const fx = fround(x)
    const fy = fround(y)
    if (this.#px[index] === fx && this.#py[index] === fy) return
    if (this.#grid) this.#place(this.#grid, index, fx, fy)
    else {
      this.#px[index] = fx
      this.#py[index] = fy
    }
  }

  advance(until: number): boolean {
    if (this.#done) return true
    const begun = performance.now()
    const stop = Math.min(until, begun + this.#budget - this.#spent)
    do this.#step(stop)
    while (!this.#done && performance.now() < stop)
    this.#spent += performance.now() - begun
    if (this.#spent >= this.#budget) this.#done = true
    return this.#done
  }

  result(): Float32Array {
    const out = Float32Array.from(this.#xy)
    for (const index of this.#nodes) {
      out[index * 2] = this.#px[index] ?? 0
      out[index * 2 + 1] = this.#py[index] ?? 0
    }
    return out
  }

  #step(stop: number): void {
    switch (this.#phase) {
      case sampleCount: {
        const sample = this.#sample as CrossingCount
        if (!sample.advance(stop)) return
        this.#sample = null
        if (sample.exceeded) {
          this.skipped = true
          this.#done = true
          return
        }
        this.#phase = firstCount
        return
      }
      case firstCount: {
        const count = this.#count
        if (!count.advance(stop)) return
        if (count.exceeded) {
          this.skipped = true
          this.#total = count.total
          this.#done = true
          return
        }
        this.#adopt(count)
        this.before = count.total
        this.#phase = findBranches
        return
      }
      case findBranches: {
        this.#findBranches()
        this.#phase = newRound
        return
      }
      case newRound: {
        if (this.#total === 0 || this.#rounds >= roundLimit) {
          this.#done = true
          return
        }
        this.#rounds++
        this.#gained = 0
        this.#roundStart = this.#total
        this.#grid = this.#buildGrid()
        this.#orderBranches()
        this.#cursor = 0
        this.#phase = tryBranches
        return
      }
      case tryBranches: {
        const grid = this.#grid as DynamicGrid
        if (this.#cursor < this.#order.length) {
          this.#gained += this.#tryBranch(grid, this.#order[this.#cursor++] ?? 0)
          return
        }
        if (this.#gained > 0) {
          this.#recount()
          this.#phase = branchCount
          return
        }
        this.#orderNodes()
        this.#phase = tryNodes
        return
      }
      case branchCount: {
        if (!this.#count.advance(stop)) return
        this.#adopt(this.#count)
        this.#grid = this.#buildGrid()
        this.#orderNodes()
        this.#phase = tryNodes
        return
      }
      case tryNodes: {
        const grid = this.#grid as DynamicGrid
        if (this.#cursor < this.#order.length) {
          this.#gained += this.#tryNode(grid, this.#order[this.#cursor++] ?? 0)
          return
        }
        this.#recount()
        this.#phase = roundCount
        return
      }
      case roundCount: {
        if (!this.#count.advance(stop)) return
        this.#adopt(this.#count)
        const gain = this.#roundStart - this.#total
        if (this.#gained === 0 || gain < leastGain * this.#roundStart) this.#done = true
        else this.#phase = newRound
        return
      }
    }
  }

  #recount(): void {
    this.#count = new CrossingCount(this.#nodes, this.#edges, this.#px, this.#py)
  }

  #adopt(count: CrossingCount): void {
    this.#total = count.total
    this.#perEdge = count.perEdge
  }

  #buildGrid(): DynamicGrid {
    const edges = this.#edges
    const px = this.#px
    const py = this.#py
    const m = edges.length >> 1
    const frame = frameOf(
      this.#nodes,
      edges,
      px,
      py,
      this.#edgeLength * 4,
      Math.max(this.#edgeLength, this.#maxRadius * 2 + this.#spacing),
    )
    const grid = new DynamicGrid(frame, m, this.#capacity)
    for (let e = 0; e < m; e++) {
      const a = edges[e * 2] ?? 0
      const b = edges[e * 2 + 1] ?? 0
      grid.addEdge(e, px[a] ?? 0, py[a] ?? 0, px[b] ?? 0, py[b] ?? 0)
    }
    for (const index of this.#nodes) grid.setNode(index, px[index] ?? 0, py[index] ?? 0)
    return grid
  }

  #allowed(grid: DynamicGrid, x: number, y: number): boolean {
    const box = this.#box
    return (
      grid.inside(x, y) &&
      x >= (box[0] ?? 0) &&
      y >= (box[1] ?? 0) &&
      x <= (box[2] ?? 0) &&
      y <= (box[3] ?? 0)
    )
  }

  #findBranches(): void {
    const nodes = this.#nodes
    const start = this.#start
    const other = this.#other
    const edgeOf = this.#edgeOf
    const capacity = this.#capacity
    const pre = new Int32Array(capacity).fill(-1)
    const low = new Int32Array(capacity)
    const size = new Int32Array(capacity)
    const parentEdge = new Int32Array(capacity).fill(-1)
    const parent = new Int32Array(capacity).fill(-1)
    const cursor = new Uint32Array(capacity)
    const order = new Int32Array(capacity)
    const component = new Int32Array(capacity)
    const componentSize: number[] = []
    const stack = new Int32Array(capacity)
    let counter = 0
    for (const root of nodes) {
      if (pre[root] !== -1) continue
      const id = componentSize.length
      let members = 0
      let top = 0
      stack[top++] = root
      pre[root] = counter
      low[root] = counter
      order[counter++] = root
      cursor[root] = start[root] ?? 0
      while (top > 0) {
        const v = stack[top - 1] ?? 0
        component[v] = id
        if ((cursor[v] ?? 0) < (start[v + 1] ?? 0)) {
          const k = cursor[v] ?? 0
          cursor[v] = k + 1
          const u = other[k] ?? 0
          const e = edgeOf[k] ?? 0
          if (e === parentEdge[v]) continue
          if (pre[u] === -1) {
            pre[u] = counter
            low[u] = counter
            order[counter++] = u
            parent[u] = v
            parentEdge[u] = e
            cursor[u] = start[u] ?? 0
            stack[top++] = u
          } else {
            low[v] = Math.min(low[v] ?? 0, pre[u] ?? 0)
          }
        } else {
          top--
          members++
          size[v] = (size[v] ?? 0) + 1
          const p = parent[v] ?? -1
          if (p >= 0) {
            low[p] = Math.min(low[p] ?? 0, low[v] ?? 0)
            size[p] = (size[p] ?? 0) + (size[v] ?? 0)
          }
        }
      }
      componentSize.push(members)
    }
    const bridge: number[] = []
    const pivot: number[] = []
    const child: number[] = []
    const from: number[] = []
    const to: number[] = []
    for (const v of nodes) {
      const p = parent[v] ?? -1
      if (p < 0 || (low[v] ?? 0) <= (pre[p] ?? 0)) continue
      const s = size[v] ?? 0
      if (s > branchLimit || s * 2 > (componentSize[component[v] ?? 0] ?? 0)) continue
      bridge.push(parentEdge[v] ?? 0)
      pivot.push(p)
      child.push(v)
      from.push(pre[v] ?? 0)
      to.push((pre[v] ?? 0) + s)
    }
    const branches: Branches = {
      pre,
      order,
      bridge: Int32Array.from(bridge),
      pivot: Int32Array.from(pivot),
      child: Int32Array.from(child),
      from: Int32Array.from(from),
      to: Int32Array.from(to),
    }
    const fixed = new Uint8Array(bridge.length)
    for (let b = 0; b < bridge.length; b++) {
      for (let k = from[b] ?? 0; k < (to[b] ?? 0); k++) {
        if (this.#movable[order[k] ?? 0] !== 1) {
          fixed[b] = 1
          break
        }
      }
    }
    this.#branches = branches
    this.#fixedBranch = fixed
  }

  #orderBranches(): void {
    const order = this.#order
    order.length = 0
    const branches = this.#branches
    if (!branches || branches.bridge.length === 0) return
    const edges = this.#edges
    const perEdge = this.#perEdge
    const capacity = this.#capacity
    const prefix = new Float64Array(capacity + 1)
    for (let e = 0; e < perEdge.length; e++) {
      const count = perEdge[e] ?? 0
      if (count === 0) continue
      const a = edges[e * 2] ?? 0
      const b = edges[e * 2 + 1] ?? 0
      const deeper = (branches.pre[a] ?? 0) > (branches.pre[b] ?? 0) ? a : b
      const at = (branches.pre[deeper] ?? 0) + 1
      prefix[at] = (prefix[at] ?? 0) + count
    }
    for (let k = 0; k < capacity; k++) prefix[k + 1] = (prefix[k + 1] ?? 0) + (prefix[k] ?? 0)
    const load = new Float64Array(branches.bridge.length)
    for (let b = 0; b < branches.bridge.length; b++) {
      if (this.#fixedBranch[b] === 1) continue
      const sum = (prefix[branches.to[b] ?? 0] ?? 0) - (prefix[branches.from[b] ?? 0] ?? 0)
      if (sum > 0) {
        load[b] = sum
        order.push(b)
      }
    }
    const span = (b: number) => (branches.to[b] ?? 0) - (branches.from[b] ?? 0)
    order.sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0) || span(a) - span(b) || a - b)
  }

  #orderNodes(): void {
    const order = this.#order
    order.length = 0
    this.#cursor = 0
    const edges = this.#edges
    const perEdge = this.#perEdge
    const load = new Float64Array(this.#capacity)
    for (let e = 0; e < perEdge.length; e++) {
      const count = perEdge[e] ?? 0
      if (count === 0) continue
      const a = edges[e * 2] ?? 0
      const b = edges[e * 2 + 1] ?? 0
      load[a] = (load[a] ?? 0) + count
      load[b] = (load[b] ?? 0) + count
    }
    for (const index of this.#nodes) {
      if ((load[index] ?? 0) > 0 && this.#movable[index] === 1) order.push(index)
    }
    order.sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0) || a - b)
  }

  #crossingsAt(
    grid: DynamicGrid,
    v: number,
    x: number,
    y: number,
    limit: number,
    collect: boolean,
  ): number {
    const edges = this.#edges
    const px = this.#px
    const py = this.#py
    const stamps = this.#edgeStamp
    const crossedBy = this.#crossedBy
    const trace = this.#trace
    let total = 0
    for (let k = this.#start[v] ?? 0; k < (this.#start[v + 1] ?? 0); k++) {
      const u = this.#other[k] ?? 0
      const ux = px[u] ?? 0
      const uy = py[u] ?? 0
      const query = ++this.#stamp
      const cells = traceCells(grid.frame, x, y, ux, uy, trace)
      for (let at = 0; at < cells; at++) {
        const list = grid.edgesIn(trace.cells[at] ?? 0)
        if (!list) continue
        for (let j = 0; j < list.length; j++) {
          const f = list[j] ?? 0
          if (stamps[f] === query) continue
          stamps[f] = query
          const a = edges[f * 2] ?? 0
          const b = edges[f * 2 + 1] ?? 0
          if (a === v || b === v || a === u || b === u) continue
          if (crosses(x, y, ux, uy, px[a] ?? 0, py[a] ?? 0, px[b] ?? 0, py[b] ?? 0)) {
            total++
            if (collect && crossedBy.length < crossedLimit) crossedBy.push(f)
            if (total > limit) return total
          }
        }
      }
    }
    return total
  }

  #crowded(
    grid: DynamicGrid,
    v: number,
    x: number,
    y: number,
    skip: (w: number) => boolean,
  ): boolean {
    const rv = this.#radius[v] ?? 0
    const gap = this.#spacing * 0.5
    const { cols, rows, cell } = grid.frame
    const reach = Math.max(1, Math.ceil((rv + this.#maxRadius + gap) / cell))
    const home = grid.cellAt(x, y)
    const hx = home % cols
    const hy = (home - hx) / cols
    for (let dy = -reach; dy <= reach; dy++) {
      const cy = hy + dy
      if (cy < 0 || cy >= rows) continue
      for (let dx = -reach; dx <= reach; dx++) {
        const cx = hx + dx
        if (cx < 0 || cx >= cols) continue
        const list = grid.nodesIn(cy * cols + cx)
        if (!list) continue
        for (const w of list) {
          if (w === v || skip(w)) continue
          const room = rv + (this.#radius[w] ?? 0) + gap
          const dx = (this.#px[w] ?? 0) - x
          const dy = (this.#py[w] ?? 0) - y
          if (dx * dx + dy * dy < room * room) return true
        }
      }
    }
    return false
  }

  #onEdges(
    grid: DynamicGrid,
    v: number,
    x: number,
    y: number,
    skip: (f: number) => boolean,
  ): number {
    const rv = this.#radius[v] ?? 0
    const { cols, rows, cell } = grid.frame
    const reach = Math.max(1, Math.ceil(rv / cell))
    const home = grid.cellAt(x, y)
    const hx = home % cols
    const hy = (home - hx) / cols
    const edges = this.#edges
    const stamps = this.#edgeStamp
    const query = ++this.#stamp
    let clashes = 0
    for (let dy = -reach; dy <= reach; dy++) {
      const cy = hy + dy
      if (cy < 0 || cy >= rows) continue
      for (let dx = -reach; dx <= reach; dx++) {
        const cx = hx + dx
        if (cx < 0 || cx >= cols) continue
        const list = grid.edgesIn(cy * cols + cx)
        if (!list) continue
        for (const f of list) {
          if (stamps[f] === query) continue
          stamps[f] = query
          const a = edges[f * 2] ?? 0
          const b = edges[f * 2 + 1] ?? 0
          if (a === v || b === v || skip(f)) continue
          const ax = this.#px[a] ?? 0
          const ay = this.#py[a] ?? 0
          if (segmentDistance2(x, y, ax, ay, this.#px[b] ?? 0, this.#py[b] ?? 0) < rv * rv) {
            clashes++
          }
        }
      }
    }
    return clashes
  }

  #nodesOn(
    grid: DynamicGrid,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    a: number,
    b: number,
    skip: (w: number) => boolean,
  ): number {
    const { cols, rows, cell } = grid.frame
    const reach = Math.max(1, Math.ceil(this.#maxRadius / cell))
    const stamps = this.#nodeStamp
    const query = ++this.#stamp
    const trace = this.#trace
    const cells = traceCells(grid.frame, ax, ay, bx, by, trace)
    let clashes = 0
    for (let k = 0; k < cells; k++) {
      const at = trace.cells[k] ?? 0
      const hx = at % cols
      const hy = (at - hx) / cols
      for (let dy = -reach; dy <= reach; dy++) {
        const cy = hy + dy
        if (cy < 0 || cy >= rows) continue
        for (let dx = -reach; dx <= reach; dx++) {
          const cx = hx + dx
          if (cx < 0 || cx >= cols) continue
          const list = grid.nodesIn(cy * cols + cx)
          if (!list) continue
          for (const w of list) {
            if (w === a || w === b || stamps[w] === query || skip(w)) continue
            stamps[w] = query
            const r = this.#radius[w] ?? 0
            if (segmentDistance2(this.#px[w] ?? 0, this.#py[w] ?? 0, ax, ay, bx, by) < r * r) {
              clashes++
            }
          }
        }
      }
    }
    return clashes
  }

  readonly #never = (): boolean => false

  #clashesAt(grid: DynamicGrid, v: number, x: number, y: number): number {
    let clashes = this.#onEdges(grid, v, x, y, this.#never)
    for (let k = this.#start[v] ?? 0; k < (this.#start[v + 1] ?? 0); k++) {
      const u = this.#other[k] ?? 0
      clashes += this.#nodesOn(grid, x, y, this.#px[u] ?? 0, this.#py[u] ?? 0, v, u, this.#never)
    }
    return clashes
  }

  #strainAt(v: number, x: number, y: number): readonly [number, number] {
    let strain = 0
    let longest = 0
    const rv = this.#radius[v] ?? 0
    for (let k = this.#start[v] ?? 0; k < (this.#start[v + 1] ?? 0); k++) {
      const u = this.#other[k] ?? 0
      const rest = this.#edgeLength + rv + (this.#radius[u] ?? 0)
      const length = Math.max(1e-6, Math.hypot((this.#px[u] ?? 0) - x, (this.#py[u] ?? 0) - y))
      const ratio = Math.log(length / rest)
      strain += ratio * ratio
      longest = Math.max(longest, length / rest)
    }
    return [strain, longest]
  }

  #candidatesOf(v: number): void {
    const out = this.#candidates
    out.length = 0
    const px = this.#px
    const py = this.#py
    const start = this.#start[v] ?? 0
    const end = this.#start[v + 1] ?? 0
    const degree = end - start
    const x = px[v] ?? 0
    const y = py[v] ?? 0
    let bx = 0
    let by = 0
    for (let k = start; k < end; k++) {
      bx += px[this.#other[k] ?? 0] ?? 0
      by += py[this.#other[k] ?? 0] ?? 0
    }
    bx /= degree
    by /= degree
    const rest = this.#edgeLength + (this.#radius[v] ?? 0) * 2
    const turn = this.#rounds * 0.7 + v * goldenTurn
    out.push(bx, by)
    if (degree === 1) {
      const u = this.#other[start] ?? 0
      const ux = px[u] ?? 0
      const uy = py[u] ?? 0
      out.push(2 * ux - x, 2 * uy - y)
      for (let k = 0; k < 16; k++) {
        const angle = turn + (k * Math.PI * 2) / 16
        out.push(ux + Math.cos(angle) * rest, uy + Math.sin(angle) * rest)
      }
    } else {
      for (const scale of [0.5, 1]) {
        for (let k = 0; k < 8; k++) {
          const angle = turn + (k * Math.PI * 2) / 8
          out.push(bx + Math.cos(angle) * rest * scale, by + Math.sin(angle) * rest * scale)
        }
      }
      if (degree === 2) {
        const a = this.#other[start] ?? 0
        const b = this.#other[start + 1] ?? 0
        mirror(x, y, px[a] ?? 0, py[a] ?? 0, px[b] ?? 0, py[b] ?? 0, rest * 0.25, out)
      }
    }
    for (const scale of [0.5, 1, 2]) {
      for (let k = 0; k < 8; k++) {
        const angle = turn + (k * Math.PI * 2) / 8 + scale
        out.push(x + Math.cos(angle) * rest * scale, y + Math.sin(angle) * rest * scale)
      }
    }
    const push = (this.#radius[v] ?? 0) + this.#spacing
    for (const f of this.#crossedBy) {
      const a = this.#edges[f * 2] ?? 0
      const b = this.#edges[f * 2 + 1] ?? 0
      mirror(x, y, px[a] ?? 0, py[a] ?? 0, px[b] ?? 0, py[b] ?? 0, push, out)
    }
    for (let k = 0; k < out.length; k++) out[k] = fround(out[k] ?? 0)
  }

  #touch(grid: DynamicGrid, e: number): void {
    const edges = this.#edges
    const changedAt = this.#changedAt
    const clock = this.#clock
    changedAt[edges[e * 2] ?? 0] = clock
    changedAt[edges[e * 2 + 1] ?? 0] = clock
    for (const cell of grid.edgeCells[e] ?? []) {
      for (const f of grid.edgesIn(cell) ?? []) {
        changedAt[edges[f * 2] ?? 0] = clock
        changedAt[edges[f * 2 + 1] ?? 0] = clock
      }
    }
  }

  #reinsert(grid: DynamicGrid, e: number): void {
    const a = this.#edges[e * 2] ?? 0
    const b = this.#edges[e * 2 + 1] ?? 0
    grid.addEdge(e, this.#px[a] ?? 0, this.#py[a] ?? 0, this.#px[b] ?? 0, this.#py[b] ?? 0)
  }

  #place(grid: DynamicGrid, v: number, x: number, y: number): void {
    this.#clock++
    const start = this.#start[v] ?? 0
    const end = this.#start[v + 1] ?? 0
    for (let k = start; k < end; k++) {
      this.#touch(grid, this.#edgeOf[k] ?? 0)
      grid.removeEdge(this.#edgeOf[k] ?? 0)
    }
    this.#px[v] = x
    this.#py[v] = y
    grid.setNode(v, x, y)
    for (let k = start; k < end; k++) {
      this.#reinsert(grid, this.#edgeOf[k] ?? 0)
      this.#touch(grid, this.#edgeOf[k] ?? 0)
    }
  }

  #tryNode(grid: DynamicGrid, v: number): number {
    if (this.#movable[v] !== 1 || (this.#failedAt[v] ?? 0) >= (this.#changedAt[v] ?? 0)) return 0
    const x0 = this.#px[v] ?? 0
    const y0 = this.#py[v] ?? 0
    this.#crossedBy.length = 0
    const base = this.#crossingsAt(grid, v, x0, y0, Number.POSITIVE_INFINITY, true)
    if (base === 0) return 0
    const baseClash = this.#clashesAt(grid, v, x0, y0)
    const [baseStrain, baseLongest] = this.#strainAt(v, x0, y0)
    this.#candidatesOf(v)
    const candidates = this.#candidates
    let bestScore = Number.POSITIVE_INFINITY
    let bestX = 0
    let bestY = 0
    let bestCross = base
    for (let c = 0; c < candidates.length; c += 2) {
      const x = candidates[c] ?? 0
      const y = candidates[c + 1] ?? 0
      if (!this.#allowed(grid, x, y)) continue
      const [strain, longest] = this.#strainAt(v, x, y)
      if (longest > Math.max(stretch, baseLongest)) continue
      if (strain - baseStrain > tolerance * base) continue
      if (this.#crowded(grid, v, x, y, this.#never)) continue
      const crossings = this.#crossingsAt(grid, v, x, y, base - 1, false)
      if (crossings >= base) continue
      if (strain - baseStrain > tolerance * (base - crossings)) continue
      if (this.#clashesAt(grid, v, x, y) > baseClash) continue
      const score = crossings + (strain - baseStrain) / tolerance / 4
      if (score < bestScore) {
        bestScore = score
        bestX = x
        bestY = y
        bestCross = crossings
        if (crossings === 0) break
      }
    }
    if (bestScore === Number.POSITIVE_INFINITY) {
      this.#failedAt[v] = this.#clock
      return 0
    }
    this.#place(grid, v, bestX, bestY)
    this.moves++
    return base - bestCross
  }

  #tryBranch(grid: DynamicGrid, b: number): number {
    const branches = this.#branches as Branches
    if (this.#fixedBranch[b] === 1) return 0
    const from = branches.from[b] ?? 0
    const to = branches.to[b] ?? 0
    const pivot = branches.pivot[b] ?? 0
    const child = branches.child[b] ?? 0
    const bridge = branches.bridge[b] ?? 0
    const pre = branches.pre
    const edges = this.#edges
    const px = this.#px
    const py = this.#py
    const tx = this.#tx
    const ty = this.#ty
    const stamps = this.#edgeStamp
    const trace = this.#trace
    const inside = (w: number) => (pre[w] ?? -1) >= from && (pre[w] ?? -1) < to
    const shiftedEdge = (f: number) =>
      f === bridge || (inside(edges[f * 2] ?? 0) && inside(edges[f * 2 + 1] ?? 0))
    const shifted = this.#shifted
    shifted.length = 0
    shifted.push(bridge)
    for (let k = from; k < to; k++) {
      const w = branches.order[k] ?? 0
      for (let j = this.#start[w] ?? 0; j < (this.#start[w + 1] ?? 0); j++) {
        const u = this.#other[j] ?? 0
        if (inside(u) && (pre[u] ?? 0) > (pre[w] ?? 0)) shifted.push(this.#edgeOf[j] ?? 0)
      }
    }
    const xOf = (w: number, turned: boolean) => (turned && inside(w) ? tx[w] : px[w]) ?? 0
    const yOf = (w: number, turned: boolean) => (turned && inside(w) ? ty[w] : py[w]) ?? 0
    const count = (limit: number, turned: boolean): number => {
      let total = 0
      for (const e of shifted) {
        const a = edges[e * 2] ?? 0
        const c = edges[e * 2 + 1] ?? 0
        const ax = xOf(a, turned)
        const ay = yOf(a, turned)
        const cx = xOf(c, turned)
        const cy = yOf(c, turned)
        const query = ++this.#stamp
        const cells = traceCells(grid.frame, ax, ay, cx, cy, trace)
        for (let at = 0; at < cells; at++) {
          const list = grid.edgesIn(trace.cells[at] ?? 0)
          if (!list) continue
          for (const f of list) {
            if (stamps[f] === query) continue
            stamps[f] = query
            if (shiftedEdge(f)) continue
            const s = edges[f * 2] ?? 0
            const t = edges[f * 2 + 1] ?? 0
            if (s === a || s === c || t === a || t === c) continue
            if (crosses(ax, ay, cx, cy, px[s] ?? 0, py[s] ?? 0, px[t] ?? 0, py[t] ?? 0)) {
              total++
              if (total > limit) return total
            }
          }
        }
      }
      return total
    }
    const clashes = (turned: boolean): number => {
      let total = 0
      for (let k = from; k < to; k++) {
        const w = branches.order[k] ?? 0
        total += this.#onEdges(grid, w, xOf(w, turned), yOf(w, turned), shiftedEdge)
      }
      for (const e of shifted) {
        const a = edges[e * 2] ?? 0
        const c = edges[e * 2 + 1] ?? 0
        const ax = xOf(a, turned)
        const ay = yOf(a, turned)
        total += this.#nodesOn(grid, ax, ay, xOf(c, turned), yOf(c, turned), a, c, inside)
      }
      return total
    }
    const base = count(Number.POSITIVE_INFINITY, false)
    if (base === 0) return 0
    const baseClash = clashes(false)
    const ox = px[pivot] ?? 0
    const oy = py[pivot] ?? 0
    const dirX = (px[child] ?? 0) - ox
    const dirY = (py[child] ?? 0) - oy
    const dirLength = Math.hypot(dirX, dirY) || 1
    const ux = dirX / dirLength
    const uy = dirY / dirLength
    const turn = (angle: number, mirrored: boolean): boolean => {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      for (let k = from; k < to; k++) {
        const w = branches.order[k] ?? 0
        let rx = (px[w] ?? 0) - ox
        let ry = (py[w] ?? 0) - oy
        if (mirrored) {
          const along = rx * ux + ry * uy
          rx = 2 * along * ux - rx
          ry = 2 * along * uy - ry
        }
        const x = fround(ox + rx * cos - ry * sin)
        const y = fround(oy + rx * sin + ry * cos)
        if (!this.#allowed(grid, x, y)) return false
        tx[w] = x
        ty[w] = y
      }
      return true
    }
    let best = base
    let bestTurn = Number.NaN
    let bestMirror = false
    for (const mirrored of [false, true]) {
      for (const angle of mirrored ? mirroredTurns : branchTurns) {
        if (!turn(angle, mirrored)) continue
        let free = true
        for (let k = from; k < to && free; k++) {
          const w = branches.order[k] ?? 0
          if (this.#crowded(grid, w, tx[w] ?? 0, ty[w] ?? 0, inside)) free = false
        }
        if (!free) continue
        const crossings = count(best - 1, true)
        if (crossings >= best) continue
        if (clashes(true) > baseClash) continue
        best = crossings
        bestTurn = angle
        bestMirror = mirrored
      }
    }
    if (Number.isNaN(bestTurn)) return 0
    turn(bestTurn, bestMirror)
    this.#clock++
    for (const e of shifted) {
      this.#touch(grid, e)
      grid.removeEdge(e)
    }
    for (let k = from; k < to; k++) {
      const w = branches.order[k] ?? 0
      px[w] = tx[w] ?? 0
      py[w] = ty[w] ?? 0
      grid.setNode(w, px[w] ?? 0, py[w] ?? 0)
    }
    for (const e of shifted) {
      this.#reinsert(grid, e)
      this.#touch(grid, e)
    }
    this.branchMoves++
    return base - best
  }
}

export function startUntangle(
  graph: ForceGraph,
  xy: Float32Array,
  settings: ForceSettings,
): UntanglePass {
  return new UntanglePass(graph, xy, settings)
}
