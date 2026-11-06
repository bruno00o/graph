import type { GroupTree } from '../../core/group-tree'

export const boxStiffness = 0.1
export const leafStiffness = 0.4
export const groupAlpha = 0.5
export const drift = 0.75

export function pushStrength(
  alpha: number,
  push: number,
  limit: number,
  stiffness: number,
): number {
  if (alpha > groupAlpha || push === 0) return 0
  return (stiffness * Math.min(push, limit)) / push
}

const primeX = 73856093
const primeY = 19349663

export function groupMasses(
  tree: GroupTree,
  alive: Uint8Array,
  movable: Uint8Array,
): { readonly mass: Float64Array; readonly rigid: Uint8Array } {
  const mass = new Float64Array(tree.count)
  const stuck = new Uint8Array(tree.count)
  for (let index = 0; index < alive.length; index++) {
    if (alive[index] !== 1) continue
    const slot = tree.groupOf[index] ?? -1
    if (slot < 0) continue
    mass[slot] = (mass[slot] ?? 0) + 1
    if (movable[index] !== 1) stuck[slot] = 1
  }
  for (let slot = tree.count - 1; slot >= 0; slot--) {
    const parent = tree.parent[slot] ?? -1
    if (parent < 0) continue
    mass[parent] = (mass[parent] ?? 0) + (mass[slot] ?? 0)
    if (stuck[slot] === 1) stuck[parent] = 1
  }
  const rigid = new Uint8Array(tree.count)
  for (let slot = 0; slot < tree.count; slot++) {
    rigid[slot] = stuck[slot] === 0 && (mass[slot] ?? 0) > 0 ? 1 : 0
  }
  return { mass, rigid }
}

export function boxPush(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  gap: number,
): readonly [number, number] | null {
  const dx = bx - ax
  const dy = by - ay
  const ox = aw + bw + gap - Math.abs(dx)
  const oy = ah + bh + gap - Math.abs(dy)
  if (ox <= 0 || oy <= 0) return null
  return ox <= oy ? [dx < 0 ? -ox : ox, 0] : [0, dy < 0 ? -oy : oy]
}

export function discPush(
  cx: number,
  cy: number,
  w: number,
  h: number,
  px: number,
  py: number,
  reach: number,
): readonly [number, number] | null {
  const ex = px - cx
  const ey = py - cy
  if (Math.abs(ex) <= w && Math.abs(ey) <= h) {
    const out = w - Math.abs(ex) + reach
    const up = h - Math.abs(ey) + reach
    return out <= up ? [ex < 0 ? -out : out, 0] : [0, ey < 0 ? -up : up]
  }
  const qx = ex - Math.max(-w, Math.min(w, ex))
  const qy = ey - Math.max(-h, Math.min(h, ey))
  const d2 = qx * qx + qy * qy
  if (d2 >= reach * reach) return null
  const d = Math.sqrt(d2)
  return [(qx / d) * (reach - d), (qy / d) * (reach - d)]
}

export function liftOf(
  tree: GroupTree,
  rigid: Uint8Array,
  ends: Uint32Array,
  count: number,
): Int32Array {
  const lift = new Int32Array(count * 2).fill(-1)
  const depthOf = (slot: number) => (slot < 0 ? -1 : (tree.depth[slot] ?? 0))
  for (let k = 0; k < count; k++) {
    let a = tree.groupOf[ends[k * 2] ?? 0] ?? -1
    let b = tree.groupOf[ends[k * 2 + 1] ?? 0] ?? -1
    let below = -1
    let above = -1
    while (depthOf(a) > depthOf(b)) {
      below = a
      a = tree.parent[a] ?? -1
    }
    while (depthOf(b) > depthOf(a)) {
      above = b
      b = tree.parent[b] ?? -1
    }
    while (a !== b) {
      below = a
      a = tree.parent[a] ?? -1
      above = b
      b = tree.parent[b] ?? -1
    }
    lift[k * 2] = below >= 0 && rigid[below] === 1 ? below : -1
    lift[k * 2 + 1] = above >= 0 && rigid[above] === 1 ? above : -1
  }
  return lift
}

export class GroupForces {
  readonly pull: Float64Array
  readonly rigid: Uint8Array
  readonly #tree: GroupTree
  readonly #leaves: Uint32Array
  readonly #radius: Float32Array
  readonly #mass: Float64Array
  readonly #rigid: Uint8Array
  readonly #cohesion: number
  readonly #gap: number
  readonly #limit: number
  readonly #largest: number
  readonly #sum: Float64Array
  readonly #direct: Float64Array
  readonly #box: Float64Array
  readonly #motion: Float64Array
  readonly #order: Int32Array
  #cell = 1
  #mask = 0
  #start: Int32Array = new Int32Array(0)
  #items: Int32Array = new Int32Array(0)
  #cellX: Int32Array = new Int32Array(0)
  #cellY: Int32Array = new Int32Array(0)
  #fill: Int32Array = new Int32Array(0)

  constructor(
    tree: GroupTree,
    alive: Uint8Array,
    movable: Uint8Array,
    radius: Float32Array,
    cohesion: number,
    gap: number,
    limit: number,
  ) {
    this.#tree = tree
    this.#radius = radius
    const leaves: number[] = []
    let largest = 0
    for (let index = 0; index < alive.length; index++) {
      if (alive[index] !== 1) continue
      leaves.push(index)
      largest = Math.max(largest, radius[index] ?? 0)
    }
    this.#leaves = Uint32Array.from(leaves)
    this.#largest = largest
    const { mass, rigid } = groupMasses(tree, alive, movable)
    this.#mass = mass
    this.#rigid = rigid
    this.rigid = rigid
    this.#cohesion = cohesion
    this.#gap = gap
    this.#limit = limit
    this.#sum = new Float64Array(tree.count * 3)
    this.#direct = new Float64Array(tree.count * 3)
    this.#box = new Float64Array(tree.count * 4)
    this.#motion = new Float64Array(tree.count * 2)
    this.pull = new Float64Array(tree.count * 2)
    this.#order = new Int32Array(tree.count)
  }

  apply(
    alpha: number,
    x: Float64Array,
    y: Float64Array,
    vx: Float64Array,
    vy: Float64Array,
    fixed: Uint8Array,
  ): void {
    this.#measure(x, y)
    this.#move(alpha)
    if (alpha <= groupAlpha) this.#index()
    else this.#mask = 0
    const tree = this.#tree
    const sum = this.#sum
    const motion = this.#motion
    const pull = this.#cohesion * alpha
    for (const i of this.#leaves) {
      if (fixed[i] === 1) continue
      const slot = tree.groupOf[i] ?? -1
      const px = x[i] ?? 0
      const py = y[i] ?? 0
      let dx = 0
      let dy = 0
      if (slot >= 0) {
        const count = sum[slot * 3 + 2] ?? 0
        const cx = (sum[slot * 3] ?? 0) / count
        const cy = (sum[slot * 3 + 1] ?? 0) / count
        const direct = this.#direct
        const n = direct[slot * 3 + 2] ?? 1
        const bx = (direct[slot * 3] ?? 0) / n
        const by = (direct[slot * 3 + 1] ?? 0) / n
        dx += (bx - px) * pull + (cx - bx) * pull * drift + (motion[slot * 2] ?? 0)
        dy += (by - py) * pull + (cy - by) * pull * drift + (motion[slot * 2 + 1] ?? 0)
      }
      const push = this.#escape(slot, px, py, (this.#radius[i] ?? 0) + this.#gap)
      const strength = pushStrength(alpha, Math.hypot(push[0], push[1]), this.#limit, leafStiffness)
      vx[i] = (vx[i] ?? 0) + dx + push[0] * strength
      vy[i] = (vy[i] ?? 0) + dy + push[1] * strength
    }
  }

  #measure(x: Float64Array, y: Float64Array): void {
    const tree = this.#tree
    const sum = this.#sum
    const box = this.#box
    sum.fill(0)
    for (let slot = 0; slot < tree.count; slot++) {
      box[slot * 4] = Number.POSITIVE_INFINITY
      box[slot * 4 + 1] = Number.POSITIVE_INFINITY
      box[slot * 4 + 2] = Number.NEGATIVE_INFINITY
      box[slot * 4 + 3] = Number.NEGATIVE_INFINITY
    }
    for (const i of this.#leaves) {
      const slot = tree.groupOf[i] ?? -1
      if (slot < 0) continue
      const px = x[i] ?? 0
      const py = y[i] ?? 0
      const r = this.#radius[i] ?? 0
      sum[slot * 3] = (sum[slot * 3] ?? 0) + px
      sum[slot * 3 + 1] = (sum[slot * 3 + 1] ?? 0) + py
      sum[slot * 3 + 2] = (sum[slot * 3 + 2] ?? 0) + 1
      box[slot * 4] = Math.min(box[slot * 4] ?? 0, px - r)
      box[slot * 4 + 1] = Math.min(box[slot * 4 + 1] ?? 0, py - r)
      box[slot * 4 + 2] = Math.max(box[slot * 4 + 2] ?? 0, px + r)
      box[slot * 4 + 3] = Math.max(box[slot * 4 + 3] ?? 0, py + r)
    }
    this.#direct.set(sum)
    for (let slot = tree.count - 1; slot >= 0; slot--) {
      if ((sum[slot * 3 + 2] ?? 0) === 0) continue
      const padding = tree.padding[slot] ?? 0
      box[slot * 4] = (box[slot * 4] ?? 0) - padding
      box[slot * 4 + 1] = (box[slot * 4 + 1] ?? 0) - padding
      box[slot * 4 + 2] = (box[slot * 4 + 2] ?? 0) + padding
      box[slot * 4 + 3] = (box[slot * 4 + 3] ?? 0) + padding
      const parent = tree.parent[slot] ?? -1
      if (parent < 0) continue
      for (let k = 0; k < 3; k++)
        sum[parent * 3 + k] = (sum[parent * 3 + k] ?? 0) + (sum[slot * 3 + k] ?? 0)
      box[parent * 4] = Math.min(box[parent * 4] ?? 0, box[slot * 4] ?? 0)
      box[parent * 4 + 1] = Math.min(box[parent * 4 + 1] ?? 0, box[slot * 4 + 1] ?? 0)
      box[parent * 4 + 2] = Math.max(box[parent * 4 + 2] ?? 0, box[slot * 4 + 2] ?? 0)
      box[parent * 4 + 3] = Math.max(box[parent * 4 + 3] ?? 0, box[slot * 4 + 3] ?? 0)
    }
  }

  #move(alpha: number): void {
    const tree = this.#tree
    const sum = this.#sum
    const box = this.#box
    const motion = this.#motion
    const mass = this.#mass
    const rigid = this.#rigid
    const pull = this.#cohesion * alpha
    motion.fill(0)
    const lifted = this.pull
    for (let slot = 0; slot < tree.count; slot++) {
      if (rigid[slot] !== 1) continue
      motion[slot * 2] = (lifted[slot * 2] ?? 0) / (mass[slot] ?? 1)
      motion[slot * 2 + 1] = (lifted[slot * 2 + 1] ?? 0) / (mass[slot] ?? 1)
    }
    lifted.fill(0)
    for (let slot = 0; slot < tree.count; slot++) {
      const parent = tree.parent[slot] ?? -1
      const count = sum[slot * 3 + 2] ?? 0
      if (parent < 0 || rigid[slot] !== 1 || count === 0) continue
      const total = sum[parent * 3 + 2] ?? 0
      motion[slot * 2] =
        (motion[slot * 2] ?? 0) +
        ((sum[parent * 3] ?? 0) / total - (sum[slot * 3] ?? 0) / count) * pull * drift
      motion[slot * 2 + 1] =
        (motion[slot * 2 + 1] ?? 0) +
        ((sum[parent * 3 + 1] ?? 0) / total - (sum[slot * 3 + 1] ?? 0) / count) * pull * drift
    }
    const order = this.#order
    const sweep = (first: number, count: number) => {
      if (count < 2 || alpha > groupAlpha) return
      const range = order.subarray(first, first + count)
      for (let k = 0; k < count; k++) range[k] = first + k
      range.sort((a, b) => (box[a * 4] ?? 0) - (box[b * 4] ?? 0))
      for (let k = 0; k < count; k++) {
        const a = range[k] ?? 0
        if ((sum[a * 3 + 2] ?? 0) === 0) continue
        const right = (box[a * 4 + 2] ?? 0) + this.#gap
        for (let m = k + 1; m < count; m++) {
          const b = range[m] ?? 0
          if ((box[b * 4] ?? 0) >= right) break
          if ((sum[b * 3 + 2] ?? 0) === 0) continue
          const ra = rigid[a] === 1
          const rb = rigid[b] === 1
          if (!ra && !rb) continue
          const push = boxPush(
            ((box[a * 4] ?? 0) + (box[a * 4 + 2] ?? 0)) / 2,
            ((box[a * 4 + 1] ?? 0) + (box[a * 4 + 3] ?? 0)) / 2,
            ((box[a * 4 + 2] ?? 0) - (box[a * 4] ?? 0)) / 2,
            ((box[a * 4 + 3] ?? 0) - (box[a * 4 + 1] ?? 0)) / 2,
            ((box[b * 4] ?? 0) + (box[b * 4 + 2] ?? 0)) / 2,
            ((box[b * 4 + 1] ?? 0) + (box[b * 4 + 3] ?? 0)) / 2,
            ((box[b * 4 + 2] ?? 0) - (box[b * 4] ?? 0)) / 2,
            ((box[b * 4 + 3] ?? 0) - (box[b * 4 + 1] ?? 0)) / 2,
            this.#gap,
          )
          if (!push) continue
          const ma = mass[a] ?? 0
          const mb = mass[b] ?? 0
          const share = !ra ? 0 : !rb ? 1 : mb / (ma + mb)
          const strength = pushStrength(
            alpha,
            Math.abs(push[0] + push[1]),
            this.#limit,
            boxStiffness,
          )
          motion[a * 2] = (motion[a * 2] ?? 0) - push[0] * strength * share
          motion[a * 2 + 1] = (motion[a * 2 + 1] ?? 0) - push[1] * strength * share
          motion[b * 2] = (motion[b * 2] ?? 0) + push[0] * strength * (1 - share)
          motion[b * 2 + 1] = (motion[b * 2 + 1] ?? 0) + push[1] * strength * (1 - share)
        }
      }
    }
    sweep(0, tree.roots)
    for (let slot = 0; slot < tree.count; slot++) {
      sweep(tree.first[slot] ?? 0, tree.children[slot] ?? 0)
    }
    for (let slot = 0; slot < tree.count; slot++) {
      const parent = tree.parent[slot] ?? -1
      if (parent < 0) continue
      motion[slot * 2] = (motion[slot * 2] ?? 0) + (motion[parent * 2] ?? 0)
      motion[slot * 2 + 1] = (motion[slot * 2 + 1] ?? 0) + (motion[parent * 2 + 1] ?? 0)
    }
  }

  #bucket(cx: number, cy: number): number {
    return (Math.imul(cx, primeX) ^ Math.imul(cy, primeY)) & this.#mask
  }

  #index(): void {
    const tree = this.#tree
    const box = this.#box
    const sum = this.#sum
    const reach = this.#largest + this.#gap
    let side = 0
    let filled = 0
    for (let slot = 0; slot < tree.count; slot++) {
      if ((sum[slot * 3 + 2] ?? 0) === 0) continue
      side +=
        (box[slot * 4 + 2] ?? 0) -
        (box[slot * 4] ?? 0) +
        (box[slot * 4 + 3] ?? 0) -
        (box[slot * 4 + 1] ?? 0)
      filled++
    }
    if (filled === 0) {
      this.#mask = 0
      return
    }
    const cell = Math.max(side / (2 * filled) + 2 * reach, 1)
    this.#cell = cell
    let entries = 0
    const span = (slot: number) => {
      const x0 = Math.floor(((box[slot * 4] ?? 0) - reach) / cell)
      const y0 = Math.floor(((box[slot * 4 + 1] ?? 0) - reach) / cell)
      const x1 = Math.floor(((box[slot * 4 + 2] ?? 0) + reach) / cell)
      const y1 = Math.floor(((box[slot * 4 + 3] ?? 0) + reach) / cell)
      return [x0, y0, x1, y1] as const
    }
    for (let slot = 0; slot < tree.count; slot++) {
      if ((sum[slot * 3 + 2] ?? 0) === 0) continue
      const [x0, y0, x1, y1] = span(slot)
      entries += (x1 - x0 + 1) * (y1 - y0 + 1)
    }
    let size = 16
    while (size < entries * 2) size *= 2
    this.#mask = size - 1
    if (this.#start.length < size + 1) this.#start = new Int32Array(size + 1)
    if (this.#items.length < entries) {
      this.#items = new Int32Array(entries * 2)
      this.#cellX = new Int32Array(entries * 2)
      this.#cellY = new Int32Array(entries * 2)
    }
    if (this.#fill.length < size) this.#fill = new Int32Array(size)
    const start = this.#start
    start.fill(0, 0, size + 1)
    for (let slot = 0; slot < tree.count; slot++) {
      if ((sum[slot * 3 + 2] ?? 0) === 0) continue
      const [x0, y0, x1, y1] = span(slot)
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const bucket = this.#bucket(cx, cy) + 1
          start[bucket] = (start[bucket] ?? 0) + 1
        }
      }
    }
    for (let bucket = 1; bucket <= size; bucket++) {
      start[bucket] = (start[bucket] ?? 0) + (start[bucket - 1] ?? 0)
    }
    const fill = this.#fill
    fill.set(start.subarray(0, size))
    for (let slot = 0; slot < tree.count; slot++) {
      if ((sum[slot * 3 + 2] ?? 0) === 0) continue
      const [x0, y0, x1, y1] = span(slot)
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const bucket = this.#bucket(cx, cy)
          const at = fill[bucket] ?? 0
          this.#items[at] = slot
          this.#cellX[at] = cx
          this.#cellY[at] = cy
          fill[bucket] = at + 1
        }
      }
    }
  }

  #escape(slot: number, px: number, py: number, reach: number): readonly [number, number] {
    if (this.#mask === 0) return none
    const tree = this.#tree
    const box = this.#box
    const cell = this.#cell
    const cx = Math.floor(px / cell)
    const cy = Math.floor(py / cell)
    const bucket = this.#bucket(cx, cy)
    const end = this.#start[bucket + 1] ?? 0
    let fx = 0
    let fy = 0
    for (let at = this.#start[bucket] ?? 0; at < end; at++) {
      const other = this.#items[at] ?? 0
      if ((tree.parent[other] ?? -1) !== slot) continue
      if (this.#cellX[at] !== cx || this.#cellY[at] !== cy) continue
      const push = discPush(
        ((box[other * 4] ?? 0) + (box[other * 4 + 2] ?? 0)) / 2,
        ((box[other * 4 + 1] ?? 0) + (box[other * 4 + 3] ?? 0)) / 2,
        ((box[other * 4 + 2] ?? 0) - (box[other * 4] ?? 0)) / 2,
        ((box[other * 4 + 3] ?? 0) - (box[other * 4 + 1] ?? 0)) / 2,
        px,
        py,
        reach,
      )
      if (!push) continue
      fx += push[0]
      fy += push[1]
    }
    return fx === 0 && fy === 0 ? none : [fx, fy]
  }
}

const none: readonly [number, number] = [0, 0]
