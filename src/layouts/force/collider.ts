const primeX = 73856093
const primeY = 19349663
const goldenTurn = 2.399963229728653
const forward = [0, 0, 1, 0, -1, 1, 0, 1, 1, 1]

class SpatialHash {
  readonly #cell: number
  readonly #mask: number
  readonly #start: Int32Array
  readonly #items: Int32Array
  readonly #cx: Int32Array
  readonly #cy: Int32Array

  constructor(cell: number, count: number, capacity: number) {
    let size = 16
    while (size < count * 2) size *= 2
    this.#cell = cell
    this.#mask = size - 1
    this.#start = new Int32Array(size + 1)
    this.#items = new Int32Array(Math.max(count, 1))
    this.#cx = new Int32Array(capacity)
    this.#cy = new Int32Array(capacity)
  }

  #bucket(cx: number, cy: number): number {
    return (Math.imul(cx, primeX) ^ Math.imul(cy, primeY)) & this.#mask
  }

  fill(nodes: ArrayLike<number>, count: number, px: Float64Array, py: Float64Array): void {
    const start = this.#start
    const cxs = this.#cx
    const cys = this.#cy
    start.fill(0)
    const cell = this.#cell
    for (let k = 0; k < count; k++) {
      const i = nodes[k] ?? 0
      const cx = Math.floor((px[i] ?? 0) / cell)
      const cy = Math.floor((py[i] ?? 0) / cell)
      cxs[i] = cx
      cys[i] = cy
      const b = this.#bucket(cx, cy) + 1
      start[b] = (start[b] ?? 0) + 1
    }
    for (let b = 1; b < start.length; b++) start[b] = (start[b] ?? 0) + (start[b - 1] ?? 0)
    for (let k = 0; k < count; k++) {
      const i = nodes[k] ?? 0
      const b = this.#bucket(cxs[i] ?? 0, cys[i] ?? 0)
      const at = start[b] ?? 0
      this.#items[at] = i
      start[b] = at + 1
    }
    for (let b = start.length - 1; b > 0; b--) start[b] = start[b - 1] ?? 0
    start[0] = 0
  }

  pairs(
    nodes: ArrayLike<number>,
    count: number,
    visit: (a: number, b: number) => void,
    skip: Uint8Array | null,
  ): void {
    const start = this.#start
    const items = this.#items
    const cxs = this.#cx
    const cys = this.#cy
    for (let k = 0; k < count; k++) {
      const a = nodes[k] ?? 0
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
}

function cellOf(
  radius: Float32Array,
  nodes: ArrayLike<number>,
  count: number,
  gap: number,
): number {
  let largest = 0
  for (let k = 0; k < count; k++) largest = Math.max(largest, radius[nodes[k] ?? 0] ?? 0)
  return Math.max(2 * largest + gap, 1)
}

function shareOf(ra: number, rb: number): number {
  const a2 = ra * ra
  const b2 = rb * rb
  return a2 + b2 > 0 ? b2 / (a2 + b2) : 0.5
}

export class Collider {
  readonly #radius: Float32Array
  readonly #gap: number
  readonly #hash: SpatialHash
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
    this.#hash = new SpatialHash(
      cellOf(radius, nodes, nodes.length, gap),
      nodes.length,
      radius.length,
    )
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
    this.#hash.fill(nodes, nodes.length, px, py)
    this.#hash.pairs(nodes, nodes.length, this.#visit, null)
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
  const hash = new SpatialHash(cellOf(radius, nodes, count, spacing), count, capacity)
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
    hash.fill(nodes, count, px, py)
    changes = 0
    next.fill(1)
    hash.pairs(nodes, count, visit, round === 0 ? null : still)
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
