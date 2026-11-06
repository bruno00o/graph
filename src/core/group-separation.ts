import type { GroupTree } from './group-tree'

export interface SeparationOptions {
  readonly spacing: number
  readonly groupSpacing: number
  readonly rounds: number
  readonly nodes: 'all' | 'moved'
}

export interface ContainerShapes {
  readonly x: Float64Array
  readonly y: Float64Array
  readonly halfWidth: Float64Array
  readonly halfHeight: Float64Array
  readonly filled: Uint8Array
}

const disc = 0
const box = 1
const goldenTurn = 2.399963229728653
const primeX = 73856093
const primeY = 19349663
const forward = [0, 0, 1, 0, -1, 1, 0, 1, 1, 1]
const boxArea = 4 / Math.PI

function grow<A extends Float64Array | Int32Array | Uint8Array>(array: A, length: number): A {
  if (array.length >= length) return array
  return new (array.constructor as new (length: number) => A)(Math.max(length, array.length * 2))
}

class Level {
  count = 0
  leaves = 0
  x: Float64Array = new Float64Array(16)
  y: Float64Array = new Float64Array(16)
  half: Float64Array = new Float64Array(16)
  tall: Float64Array = new Float64Array(16)
  area: Float64Array = new Float64Array(16)
  kind: Uint8Array = new Uint8Array(16)
  fixed: Uint8Array = new Uint8Array(16)
  ref: Int32Array = new Int32Array(16)
  active: Uint8Array = new Uint8Array(16)
  moved: Uint8Array = new Uint8Array(16)
  cx: Int32Array = new Int32Array(16)
  cy: Int32Array = new Int32Array(16)
  start: Int32Array = new Int32Array(32)
  items: Int32Array = new Int32Array(16)
  sorted: Int32Array = new Int32Array(16)
  mask = 0
  cell = 1

  reset(count: number): void {
    this.count = 0
    this.leaves = 0
    this.x = grow(this.x, count)
    this.y = grow(this.y, count)
    this.half = grow(this.half, count)
    this.tall = grow(this.tall, count)
    this.area = grow(this.area, count)
    this.kind = grow(this.kind, count)
    this.fixed = grow(this.fixed, count)
    this.ref = grow(this.ref, count)
    this.active = grow(this.active, count)
    this.moved = grow(this.moved, count)
    this.cx = grow(this.cx, count)
    this.cy = grow(this.cy, count)
    this.items = grow(this.items, count)
    this.sorted = grow(this.sorted, count)
  }

  push(
    x: number,
    y: number,
    half: number,
    tall: number,
    kind: number,
    fixed: boolean,
    ref: number,
  ): void {
    const at = this.count++
    this.x[at] = x
    this.y[at] = y
    this.half[at] = half
    this.tall[at] = tall
    this.kind[at] = kind
    this.fixed[at] = fixed ? 1 : 0
    this.ref[at] = ref
    this.area[at] = kind === box ? half * tall * boxArea : half * half
  }

  #bucket(cx: number, cy: number): number {
    return (Math.imul(cx, primeX) ^ Math.imul(cy, primeY)) & this.mask
  }

  index(cell: number): void {
    const count = this.leaves
    let size = 16
    while (size < count * 2) size *= 2
    this.mask = size - 1
    this.cell = cell
    this.start = grow(this.start, size + 1)
    const start = this.start
    start.fill(0, 0, size + 1)
    for (let at = 0; at < count; at++) {
      const cx = Math.floor((this.x[at] ?? 0) / cell)
      const cy = Math.floor((this.y[at] ?? 0) / cell)
      this.cx[at] = cx
      this.cy[at] = cy
      const bucket = this.#bucket(cx, cy) + 1
      start[bucket] = (start[bucket] ?? 0) + 1
    }
    for (let bucket = 1; bucket <= size; bucket++) {
      start[bucket] = (start[bucket] ?? 0) + (start[bucket - 1] ?? 0)
    }
    for (let at = 0; at < count; at++) {
      const bucket = this.#bucket(this.cx[at] ?? 0, this.cy[at] ?? 0)
      const slot = start[bucket] ?? 0
      this.items[slot] = at
      start[bucket] = slot + 1
    }
    for (let bucket = size; bucket > 0; bucket--) start[bucket] = start[bucket - 1] ?? 0
    start[0] = 0
  }

  forCell(cx: number, cy: number, from: number, visit: (a: number, b: number) => void): void {
    const bucket = this.#bucket(cx, cy)
    const end = this.start[bucket + 1] ?? 0
    for (let slot = this.start[bucket] ?? 0; slot < end; slot++) {
      const at = this.items[slot] ?? 0
      if (this.cx[at] === cx && this.cy[at] === cy) visit(from, at)
    }
  }

  forwardPairs(visit: (a: number, b: number) => void): void {
    for (let a = 0; a < this.leaves; a++) {
      const ax = this.cx[a] ?? 0
      const ay = this.cy[a] ?? 0
      for (let o = 0; o < forward.length; o += 2) {
        const tx = ax + (forward[o] ?? 0)
        const ty = ay + (forward[o + 1] ?? 0)
        const bucket = this.#bucket(tx, ty)
        const end = this.start[bucket + 1] ?? 0
        for (let slot = this.start[bucket] ?? 0; slot < end; slot++) {
          const b = this.items[slot] ?? 0
          if (this.cx[b] !== tx || this.cy[b] !== ty) continue
          if (o === 0 && b <= a) continue
          visit(a, b)
        }
      }
    }
  }
}

export class GroupSeparation {
  readonly #tree: GroupTree
  readonly #level = new Level()
  readonly #leafStart: Int32Array
  readonly #leafItems: Int32Array
  readonly shapes: ContainerShapes
  readonly #kind: Uint8Array
  readonly #fixed: Uint8Array
  readonly #offset: Float64Array
  #options: SeparationOptions = { spacing: 0, groupSpacing: 0, rounds: 1, nodes: 'all' }
  #changes = 0
  #weight = 1
  readonly #visit = (a: number, b: number) => this.#pair(a, b)

  constructor(tree: GroupTree, alive: Uint8Array) {
    this.#tree = tree
    const count = tree.count
    const start = new Int32Array(count + 2)
    for (let index = 0; index < alive.length; index++) {
      if (alive[index] !== 1) continue
      const level = (tree.groupOf[index] ?? -1) + 1
      start[level + 1] = (start[level + 1] ?? 0) + 1
    }
    for (let level = 0; level <= count; level++) {
      start[level + 1] = (start[level + 1] ?? 0) + (start[level] ?? 0)
    }
    const fill = start.slice(0, count + 1)
    const items = new Int32Array(start[count + 1] ?? 0)
    for (let index = 0; index < alive.length; index++) {
      if (alive[index] !== 1) continue
      const level = (tree.groupOf[index] ?? -1) + 1
      const at = fill[level] ?? 0
      items[at] = index
      fill[level] = at + 1
    }
    this.#leafStart = start
    this.#leafItems = items
    this.shapes = {
      x: new Float64Array(count),
      y: new Float64Array(count),
      halfWidth: new Float64Array(count),
      halfHeight: new Float64Array(count),
      filled: new Uint8Array(count),
    }
    this.#kind = new Uint8Array(count)
    this.#fixed = new Uint8Array(count)
    this.#offset = new Float64Array(count * 2)
  }

  run(
    radius: Float32Array,
    fixed: Uint8Array,
    xy: Float32Array,
    options: SeparationOptions,
  ): number {
    const tree = this.#tree
    this.#options = options
    this.#offset.fill(0)
    this.#fixed.fill(0)
    for (const index of this.#leafItems) {
      const slot = tree.groupOf[index] ?? -1
      if (slot >= 0 && fixed[index] === 1) this.#fixed[slot] = 1
    }
    for (let slot = tree.count - 1; slot >= 0; slot--) {
      const parent = tree.parent[slot] ?? -1
      if (parent >= 0 && this.#fixed[slot] === 1) this.#fixed[parent] = 1
    }
    let changes = 0
    for (let slot = tree.count - 1; slot >= -1; slot--) {
      changes += this.#solve(slot, radius, fixed, xy)
    }
    const total = this.#offset
    for (let slot = 0; slot < tree.count; slot++) {
      const parent = tree.parent[slot] ?? -1
      if (parent < 0) continue
      total[slot * 2] = (total[slot * 2] ?? 0) + (total[parent * 2] ?? 0)
      total[slot * 2 + 1] = (total[slot * 2 + 1] ?? 0) + (total[parent * 2 + 1] ?? 0)
    }
    const shapes = this.shapes
    for (let slot = 0; slot < tree.count; slot++) {
      const parent = tree.parent[slot] ?? -1
      if (parent < 0) continue
      shapes.x[slot] = (shapes.x[slot] ?? 0) + (total[parent * 2] ?? 0)
      shapes.y[slot] = (shapes.y[slot] ?? 0) + (total[parent * 2 + 1] ?? 0)
    }
    for (const index of this.#leafItems) {
      const slot = tree.groupOf[index] ?? -1
      if (slot < 0 || fixed[index] === 1) continue
      xy[index * 2] = (xy[index * 2] ?? 0) + (total[slot * 2] ?? 0)
      xy[index * 2 + 1] = (xy[index * 2 + 1] ?? 0) + (total[slot * 2 + 1] ?? 0)
    }
    return changes
  }

  #solve(slot: number, radius: Float32Array, fixed: Uint8Array, xy: Float32Array): number {
    const tree = this.#tree
    const level = this.#level
    const from = this.#leafStart[slot + 1] ?? 0
    const to = this.#leafStart[slot + 2] ?? 0
    const first = slot < 0 ? 0 : (tree.first[slot] ?? 0)
    const children = slot < 0 ? tree.roots : (tree.children[slot] ?? 0)
    level.reset(to - from + children)
    let largest = 0
    for (let at = from; at < to; at++) {
      const index = this.#leafItems[at] ?? 0
      const r = Math.max(0, radius[index] ?? 0)
      largest = Math.max(largest, r)
      level.push(xy[index * 2] ?? 0, xy[index * 2 + 1] ?? 0, r, r, disc, fixed[index] === 1, index)
    }
    level.leaves = level.count
    const shapes = this.shapes
    for (let child = first; child < first + children; child++) {
      if (shapes.filled[child] !== 1) continue
      level.push(
        shapes.x[child] ?? 0,
        shapes.y[child] ?? 0,
        shapes.halfWidth[child] ?? 0,
        shapes.halfHeight[child] ?? 0,
        this.#kind[child] ?? box,
        this.#fixed[child] === 1,
        child,
      )
    }
    const changes = this.#rounds(largest)
    for (let at = 0; at < level.leaves; at++) {
      const index = level.ref[at] ?? 0
      if (level.fixed[at] === 1) continue
      xy[index * 2] = level.x[at] ?? 0
      xy[index * 2 + 1] = level.y[at] ?? 0
    }
    for (let at = level.leaves; at < level.count; at++) {
      const child = level.ref[at] ?? 0
      this.#offset[child * 2] = (level.x[at] ?? 0) - (shapes.x[child] ?? 0)
      this.#offset[child * 2 + 1] = (level.y[at] ?? 0) - (shapes.y[child] ?? 0)
      shapes.x[child] = level.x[at] ?? 0
      shapes.y[child] = level.y[at] ?? 0
    }
    if (slot >= 0) this.#measure(slot)
    return changes
  }

  #measure(slot: number): void {
    const level = this.#level
    const shapes = this.shapes
    if (level.count === 0) {
      shapes.filled[slot] = 0
      return
    }
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (let at = 0; at < level.count; at++) {
      const x = level.x[at] ?? 0
      const y = level.y[at] ?? 0
      const half = level.half[at] ?? 0
      const tall = level.tall[at] ?? 0
      minX = Math.min(minX, x - half)
      maxX = Math.max(maxX, x + half)
      minY = Math.min(minY, y - tall)
      maxY = Math.max(maxY, y + tall)
    }
    const padding = this.#tree.padding[slot] ?? 0
    const x = (minX + maxX) / 2
    const y = (minY + maxY) / 2
    shapes.filled[slot] = 1
    shapes.x[slot] = x
    shapes.y[slot] = y
    if (this.#tree.circle[slot] === 1) {
      let reach = 0
      for (let at = 0; at < level.count; at++) {
        const half = level.half[at] ?? 0
        const extent = level.kind[at] === box ? Math.hypot(half, level.tall[at] ?? 0) : half
        reach = Math.max(reach, Math.hypot((level.x[at] ?? 0) - x, (level.y[at] ?? 0) - y) + extent)
      }
      shapes.halfWidth[slot] = shapes.halfHeight[slot] = reach + padding
      this.#kind[slot] = disc
      return
    }
    shapes.halfWidth[slot] = (maxX - minX) / 2 + padding
    shapes.halfHeight[slot] = (maxY - minY) / 2 + padding
    this.#kind[slot] = box
  }

  #rounds(largest: number): number {
    const level = this.#level
    const { spacing, groupSpacing, rounds, nodes } = this.#options
    if (level.count < 2) return 0
    for (let at = 0; at < level.count; at++) {
      level.active[at] = at >= level.leaves || nodes === 'all' ? 1 : 0
    }
    const reach = largest + Math.max(spacing, groupSpacing)
    const cell = Math.max(2 * largest + spacing, 1)
    let total = 0
    for (let round = 0; round < rounds; round++) {
      this.#weight = Math.max(0, 1 - (2 * round) / rounds)
      this.#changes = 0
      level.moved.fill(0, 0, level.count)
      this.#boxes()
      if (level.leaves > 0) {
        level.index(cell)
        this.#boxLeaves(reach)
        level.forwardPairs(this.#visit)
      }
      total += this.#changes
      if (this.#changes === 0) break
      const active = level.active
      level.active = level.moved
      level.moved = active
    }
    return total
  }

  #boxes(): void {
    const level = this.#level
    const first = level.leaves
    const count = level.count - first
    if (count < 2) return
    const gap = this.#options.groupSpacing
    const sorted = level.sorted
    for (let k = 0; k < count; k++) sorted[k] = first + k
    const order = sorted.subarray(0, count)
    order.sort(
      (a, b) => (level.x[a] ?? 0) - (level.half[a] ?? 0) - (level.x[b] ?? 0) + (level.half[b] ?? 0),
    )
    for (let k = 0; k < count; k++) {
      const a = order[k] ?? 0
      for (let m = k + 1; m < count; m++) {
        const b = order[m] ?? 0
        const right = (level.x[a] ?? 0) + (level.half[a] ?? 0) + gap
        if ((level.x[b] ?? 0) - (level.half[b] ?? 0) >= right) break
        this.#pair(a, b)
      }
    }
  }

  #boxLeaves(reach: number): void {
    const level = this.#level
    const cell = level.cell
    for (let c = level.leaves; c < level.count; c++) {
      const x = level.x[c] ?? 0
      const y = level.y[c] ?? 0
      const half = (level.half[c] ?? 0) + reach
      const tall = (level.tall[c] ?? 0) + reach
      const x0 = Math.floor((x - half) / cell)
      const x1 = Math.floor((x + half) / cell)
      const y0 = Math.floor((y - tall) / cell)
      const y1 = Math.floor((y + tall) / cell)
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > level.leaves) {
        for (let leaf = 0; leaf < level.leaves; leaf++) this.#pair(c, leaf)
        continue
      }
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) level.forCell(cx, cy, c, this.#visit)
      }
    }
  }

  #pair(a: number, b: number): void {
    const level = this.#level
    if (level.active[a] !== 1 && level.active[b] !== 1) return
    const fa = level.fixed[a] === 1
    const fb = level.fixed[b] === 1
    if (fa && fb) return
    const ka = level.kind[a] ?? disc
    const kb = level.kind[b] ?? disc
    const leaves = a < level.leaves && b < level.leaves
    const gap = leaves ? this.#options.spacing : this.#options.groupSpacing
    const dx = (level.x[b] ?? 0) - (level.x[a] ?? 0)
    const dy = (level.y[b] ?? 0) - (level.y[a] ?? 0)
    let nx = 0
    let ny = 0
    let depth = 0
    if (ka === disc && kb === disc) {
      const reach = (level.half[a] ?? 0) + (level.half[b] ?? 0) + gap
      const d2 = dx * dx + dy * dy
      if (d2 >= reach * reach) return
      if (d2 === 0) {
        const turn = Math.min(level.ref[a] ?? 0, level.ref[b] ?? 0) * goldenTurn
        nx = Math.cos(turn)
        ny = Math.sin(turn)
        depth = reach
      } else {
        const d = Math.sqrt(d2)
        nx = dx / d
        ny = dy / d
        depth = reach - d
      }
    } else if (ka === box && kb === box) {
      const ox = (level.half[a] ?? 0) + (level.half[b] ?? 0) + gap - Math.abs(dx)
      const oy = (level.tall[a] ?? 0) + (level.tall[b] ?? 0) + gap - Math.abs(dy)
      if (ox <= 0 || oy <= 0) return
      if (ox <= oy) {
        nx = dx < 0 ? -1 : 1
        depth = ox
      } else {
        ny = dy < 0 ? -1 : 1
        depth = oy
      }
    } else {
      const flip = ka === box ? 1 : -1
      const container = ka === box ? a : b
      const round = ka === box ? b : a
      const ex = dx * flip
      const ey = dy * flip
      const half = level.half[container] ?? 0
      const tall = level.tall[container] ?? 0
      const reach = (level.half[round] ?? 0) + gap
      if (Math.abs(ex) <= half && Math.abs(ey) <= tall) {
        const out = half - Math.abs(ex)
        const up = tall - Math.abs(ey)
        if (out <= up) {
          nx = ex < 0 ? -1 : 1
          depth = out + reach
        } else {
          ny = ey < 0 ? -1 : 1
          depth = up + reach
        }
      } else {
        const qx = ex - Math.max(-half, Math.min(half, ex))
        const qy = ey - Math.max(-tall, Math.min(tall, ey))
        const d2 = qx * qx + qy * qy
        if (d2 >= reach * reach) return
        const d = Math.sqrt(d2)
        nx = qx / d
        ny = qy / d
        depth = reach - d
      }
      nx *= flip
      ny *= flip
    }
    const areaA = (level.area[a] ?? 0) ** this.#weight
    const areaB = (level.area[b] ?? 0) ** this.#weight
    const share = fa ? 0 : fb ? 1 : areaA + areaB > 0 ? areaB / (areaA + areaB) : 0.5
    if (share > 0) {
      level.x[a] = (level.x[a] ?? 0) - nx * depth * share
      level.y[a] = (level.y[a] ?? 0) - ny * depth * share
      level.moved[a] = 1
    }
    if (share < 1) {
      level.x[b] = (level.x[b] ?? 0) + nx * depth * (1 - share)
      level.y[b] = (level.y[b] ?? 0) + ny * depth * (1 - share)
      level.moved[b] = 1
    }
    this.#changes++
  }
}

export function separateGroups(
  tree: GroupTree,
  alive: Uint8Array,
  radius: Float32Array,
  fixed: Uint8Array,
  xy: Float32Array,
  options: SeparationOptions,
): ContainerShapes {
  const separation = new GroupSeparation(tree, alive)
  separation.run(radius, fixed, xy, options)
  return separation.shapes
}
