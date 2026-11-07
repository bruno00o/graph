const primeX = 73856093
const primeY = 19349663
const goldenTurn = 2.399963229728653
const forward = [0, 0, 1, 0, -1, 1, 0, 1, 1, 1]
const tierSpread = 2

type Visit = (a: number, b: number) => void

class SpatialHash {
  readonly #cell: number
  readonly #largest: number
  readonly #mask: number
  readonly #start: Int32Array
  readonly #items: Int32Array
  readonly #members: Int32Array
  readonly #cx: Int32Array
  readonly #cy: Int32Array

  constructor(cell: number, largest: number, members: Int32Array, cx: Int32Array, cy: Int32Array) {
    const count = members.length
    let size = 16
    while (size < count * 2) size *= 2
    this.#cell = cell
    this.#largest = largest
    this.#mask = size - 1
    this.#start = new Int32Array(size + 1)
    this.#items = new Int32Array(Math.max(count, 1))
    this.#members = members
    this.#cx = cx
    this.#cy = cy
  }

  get largest(): number {
    return this.#largest
  }

  get members(): Int32Array {
    return this.#members
  }

  #bucket(cx: number, cy: number): number {
    return (Math.imul(cx, primeX) ^ Math.imul(cy, primeY)) & this.#mask
  }

  fill(px: Float64Array, py: Float64Array): void {
    const start = this.#start
    const cxs = this.#cx
    const cys = this.#cy
    const members = this.#members
    start.fill(0)
    const cell = this.#cell
    for (let k = 0; k < members.length; k++) {
      const i = members[k] ?? 0
      const cx = Math.floor((px[i] ?? 0) / cell)
      const cy = Math.floor((py[i] ?? 0) / cell)
      cxs[i] = cx
      cys[i] = cy
      const b = this.#bucket(cx, cy) + 1
      start[b] = (start[b] ?? 0) + 1
    }
    for (let b = 1; b < start.length; b++) start[b] = (start[b] ?? 0) + (start[b - 1] ?? 0)
    for (let k = 0; k < members.length; k++) {
      const i = members[k] ?? 0
      const b = this.#bucket(cxs[i] ?? 0, cys[i] ?? 0)
      const at = start[b] ?? 0
      this.#items[at] = i
      start[b] = at + 1
    }
    for (let b = start.length - 1; b > 0; b--) start[b] = start[b - 1] ?? 0
    start[0] = 0
  }

  pairs(visit: Visit, skip: Uint8Array | null): void {
    const start = this.#start
    const items = this.#items
    const cxs = this.#cx
    const cys = this.#cy
    const members = this.#members
    for (let k = 0; k < members.length; k++) {
      const a = members[k] ?? 0
      const ax = cxs[a] ?? 0
      const ay = cys[a] ?? 0
      const still = skip !== null && skip[a] === 1 ? skip : null
      for (let o = 0; o < forward.length; o += 2) {
        const tx = ax + (forward[o] ?? 0)
        const ty = ay + (forward[o + 1] ?? 0)
        const b0 = this.#bucket(tx, ty)
        const end = start[b0 + 1] ?? 0
        for (let at = start[b0] ?? 0; at < end; at++) {
          const b = items[at] ?? 0
          if (cxs[b] !== tx || cys[b] !== ty) continue
          if (o === 0 && b <= a) continue
          if (still !== null && still[b] === 1) continue
          visit(a, b)
        }
      }
    }
  }

  near(
    a: number,
    x: number,
    y: number,
    reach: number,
    visit: Visit,
    skip: Uint8Array | null,
  ): void {
    const still = skip !== null && skip[a] === 1 ? skip : null
    const cell = this.#cell
    const x0 = Math.floor((x - reach) / cell)
    const x1 = Math.floor((x + reach) / cell)
    const y0 = Math.floor((y - reach) / cell)
    const y1 = Math.floor((y + reach) / cell)
    const members = this.#members
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= members.length)) {
      for (let k = 0; k < members.length; k++) {
        const b = members[k] ?? 0
        if (still === null || still[b] !== 1) visit(b, a)
      }
      return
    }
    const start = this.#start
    const items = this.#items
    const cxs = this.#cx
    const cys = this.#cy
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const b0 = this.#bucket(tx, ty)
        const end = start[b0 + 1] ?? 0
        for (let at = start[b0] ?? 0; at < end; at++) {
          const b = items[at] ?? 0
          if (cxs[b] !== tx || cys[b] !== ty) continue
          if (still !== null && still[b] === 1) continue
          visit(b, a)
        }
      }
    }
  }
}

function sizeOf(radius: Float32Array, index: number): number {
  const r = radius[index] ?? 0
  return Math.max(r, 0) || 0
}

class TieredHash {
  readonly #tiers: SpatialHash[]
  readonly #radius: Float32Array
  readonly #gap: number

  constructor(radius: Float32Array, nodes: ArrayLike<number>, count: number, gap: number) {
    this.#radius = radius
    this.#gap = gap
    const sorted = new Float32Array(count)
    for (let k = 0; k < count; k++) sorted[k] = sizeOf(radius, nodes[k] ?? 0)
    sorted.sort()
    const caps: number[] = []
    let from = 0
    while (from < count) {
      const cap = (sorted[from + ((count - from) >> 1)] ?? 0) * tierSpread
      let to = from
      while (to < count && (sorted[to] ?? 0) <= cap) to++
      caps.push(cap)
      from = to
    }
    if (caps.length === 0) caps.push(0)
    const tierOf = new Uint8Array(count)
    const sizes = new Int32Array(caps.length)
    const largest = new Float64Array(caps.length)
    for (let k = 0; k < count; k++) {
      const r = sizeOf(radius, nodes[k] ?? 0)
      let tier = 0
      while (tier < caps.length - 1 && r > (caps[tier] ?? 0)) tier++
      tierOf[k] = tier
      sizes[tier] = (sizes[tier] ?? 0) + 1
      largest[tier] = Math.max(largest[tier] ?? 0, r)
    }
    const members = Array.from(sizes, (size) => new Int32Array(size))
    const filled = new Int32Array(caps.length)
    for (let k = 0; k < count; k++) {
      const tier = tierOf[k] ?? 0
      const at = filled[tier] ?? 0
      const list = members[tier] as Int32Array
      list[at] = nodes[k] ?? 0
      filled[tier] = at + 1
    }
    const capacity = radius.length
    const cx = new Int32Array(capacity)
    const cy = new Int32Array(capacity)
    this.#tiers = members.map((list, tier) => {
      const r = largest[tier] ?? 0
      return new SpatialHash(Math.max(2 * r + gap, 1), r, list, cx, cy)
    })
  }

  fill(px: Float64Array, py: Float64Array): void {
    for (const tier of this.#tiers) tier.fill(px, py)
  }

  pairs(px: Float64Array, py: Float64Array, visit: Visit, skip: Uint8Array | null): void {
    const tiers = this.#tiers
    for (const tier of tiers) tier.pairs(visit, skip)
    for (let t = 1; t < tiers.length; t++) {
      const members = (tiers[t] as SpatialHash).members
      for (let k = 0; k < members.length; k++) {
        const a = members[k] ?? 0
        const x = px[a] ?? 0
        const y = py[a] ?? 0
        const r = sizeOf(this.#radius, a) + this.#gap
        for (let s = 0; s < t; s++) {
          const lower = tiers[s] as SpatialHash
          lower.near(a, x, y, r + lower.largest, visit, skip)
        }
      }
    }
  }
}

function shareOf(ra: number, rb: number): number {
  const a2 = ra * ra
  const b2 = rb * rb
  return a2 + b2 > 0 ? b2 / (a2 + b2) : 0.5
}

export class Collider {
  readonly #radius: Float32Array
  readonly #gap: number
  readonly #hash: TieredHash
  readonly #px: Float64Array
  readonly #py: Float64Array
  readonly #visit: (a: number, b: number) => void
  #fixed: Uint8Array = new Uint8Array(0)
  #vx: Float64Array = new Float64Array(0)
  #vy: Float64Array = new Float64Array(0)
  #stiffness = 1
  #jiggle: () => number = () => 0

  constructor(radius: Float32Array, nodes: Uint32Array, gap: number) {
    this.#radius = radius
    this.#gap = gap
    this.#hash = new TieredHash(radius, nodes, nodes.length, gap)
    this.#px = new Float64Array(radius.length)
    this.#py = new Float64Array(radius.length)
    this.#visit = (a, b) => this.#resolve(a, b)
  }

  apply(
    nodes: Uint32Array,
    fixed: Uint8Array,
    x: Float64Array,
    y: Float64Array,
    vx: Float64Array,
    vy: Float64Array,
    stiffness: number,
    jiggle: () => number,
  ): void {
    const px = this.#px
    const py = this.#py
    for (const i of nodes) {
      px[i] = (x[i] ?? 0) + (vx[i] ?? 0)
      py[i] = (y[i] ?? 0) + (vy[i] ?? 0)
    }
    this.#fixed = fixed
    this.#vx = vx
    this.#vy = vy
    this.#stiffness = stiffness
    this.#jiggle = jiggle
    this.#hash.fill(px, py)
    this.#hash.pairs(px, py, this.#visit, null)
  }

  #resolve(a: number, b: number): void {
    const fixed = this.#fixed
    const fa = fixed[a] === 1
    const fb = fixed[b] === 1
    if (fa && fb) return
    const px = this.#px
    const py = this.#py
    const ra = this.#radius[a] ?? 0
    const rb = this.#radius[b] ?? 0
    const reach = ra + rb + this.#gap
    let dx = (px[b] ?? 0) - (px[a] ?? 0)
    let dy = (py[b] ?? 0) - (py[a] ?? 0)
    let d2 = dx * dx + dy * dy
    if (d2 >= reach * reach) return
    if (d2 === 0) {
      dx = this.#jiggle()
      dy = this.#jiggle()
      d2 = dx * dx + dy * dy
      if (d2 === 0) return
    }
    const d = Math.sqrt(d2)
    const push = ((reach - d) / d) * this.#stiffness
    const wa = fa ? 0 : fb ? 1 : shareOf(ra, rb)
    const ax = dx * push * wa
    const ay = dy * push * wa
    const bx = dx * push * (fb ? 0 : 1 - wa)
    const by = dy * push * (fb ? 0 : 1 - wa)
    const vx = this.#vx
    const vy = this.#vy
    vx[a] = (vx[a] ?? 0) - ax
    vy[a] = (vy[a] ?? 0) - ay
    px[a] = (px[a] ?? 0) - ax
    py[a] = (py[a] ?? 0) - ay
    vx[b] = (vx[b] ?? 0) + bx
    vy[b] = (vy[b] ?? 0) + by
    px[b] = (px[b] ?? 0) + bx
    py[b] = (py[b] ?? 0) + by
  }
}

export function separate(
  radius: Float32Array,
  alive: Uint8Array,
  fixed: Uint8Array,
  xy: Float32Array,
  spacing: number,
  rounds: number,
): void {
  const capacity = Math.min(radius.length, alive.length, xy.length >> 1)
  const nodes = new Int32Array(capacity)
  let count = 0
  let movers = 0
  for (let i = 0; i < capacity; i++) {
    if (alive[i] !== 1) continue
    nodes[count++] = i
    if (fixed[i] !== 1) movers++
  }
  if (movers === 0) return
  const px = new Float64Array(capacity)
  const py = new Float64Array(capacity)
  for (let k = 0; k < count; k++) {
    const i = nodes[k] ?? 0
    px[i] = xy[i * 2] ?? 0
    py[i] = xy[i * 2 + 1] ?? 0
  }
  const hash = new TieredHash(radius, nodes, count, spacing)
  let still = new Uint8Array(capacity)
  let next = new Uint8Array(capacity)
  let changes = 0
  const visit = (a: number, b: number) => {
    const fa = fixed[a] === 1
    const fb = fixed[b] === 1
    if (fa && fb) return
    const ra = radius[a] ?? 0
    const rb = radius[b] ?? 0
    const reach = ra + rb + spacing
    let dx = (px[b] ?? 0) - (px[a] ?? 0)
    let dy = (py[b] ?? 0) - (py[a] ?? 0)
    let d2 = dx * dx + dy * dy
    if (d2 >= reach * reach) return
    if (d2 === 0) {
      const turn = Math.min(a, b) * goldenTurn
      dx = Math.cos(turn) * 1e-3
      dy = Math.sin(turn) * 1e-3
      d2 = 1e-6
    }
    const d = Math.sqrt(d2)
    const push = (reach - d) / d
    const wa = fa ? 0 : fb ? 1 : shareOf(ra, rb)
    const wb = fb ? 0 : 1 - wa
    px[a] = (px[a] ?? 0) - dx * push * wa
    py[a] = (py[a] ?? 0) - dy * push * wa
    px[b] = (px[b] ?? 0) + dx * push * wb
    py[b] = (py[b] ?? 0) + dy * push * wb
    if (wa > 0) next[a] = 0
    if (wb > 0) next[b] = 0
    changes++
  }
  for (let round = 0; round < rounds; round++) {
    hash.fill(px, py)
    changes = 0
    next.fill(1)
    hash.pairs(px, py, visit, round === 0 ? null : still)
    if (changes === 0) break
    const swap = still
    still = next
    next = swap
  }
  for (let k = 0; k < count; k++) {
    const i = nodes[k] ?? 0
    if (fixed[i] === 1) continue
    xy[i * 2] = px[i] ?? 0
    xy[i * 2 + 1] = py[i] ?? 0
  }
}
