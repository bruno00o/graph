const collideStrength = 0.7

export class Collider {
  readonly #radius: Float32Array
  readonly #spacing: number
  readonly #cell: number
  #buckets: Int32Array = new Int32Array(0)
  #items: Uint32Array = new Uint32Array(0)
  #gx: Int32Array = new Int32Array(0)
  #gy: Int32Array = new Int32Array(0)
  #slot: Int32Array = new Int32Array(0)

  constructor(radius: Float32Array, nodes: Uint32Array, spacing: number) {
    let reach = 0
    for (const i of nodes) reach = Math.max(reach, radius[i] ?? 0)
    this.#radius = radius
    this.#spacing = spacing
    this.#cell = Math.max(2 * reach + spacing, 1)
  }

  apply(
    nodes: Uint32Array,
    movers: Uint32Array,
    fixed: Uint8Array,
    x: Float64Array,
    y: Float64Array,
    vx: Float64Array,
    vy: Float64Array,
    jiggle: () => number,
    active: Uint8Array | null = null,
  ): void {
    const cell = this.#cell
    const size = 1 << Math.ceil(Math.log2(Math.max(16, nodes.length * 2)))
    if (this.#buckets.length !== size + 1) this.#buckets = new Int32Array(size + 1)
    else this.#buckets.fill(0)
    if (this.#items.length < nodes.length) this.#items = new Uint32Array(nodes.length)
    if (this.#gx.length < x.length) {
      this.#gx = new Int32Array(x.length)
      this.#gy = new Int32Array(x.length)
      this.#slot = new Int32Array(x.length)
    }
    const buckets = this.#buckets
    const items = this.#items
    const gx = this.#gx
    const gy = this.#gy
    const slot = this.#slot
    const mask = size - 1
    for (const i of nodes) {
      const cx = Math.floor(((x[i] ?? 0) + (vx[i] ?? 0)) / cell)
      const cy = Math.floor(((y[i] ?? 0) + (vy[i] ?? 0)) / cell)
      const b = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & mask
      gx[i] = cx
      gy[i] = cy
      slot[i] = b
      buckets[b + 1] = (buckets[b + 1] ?? 0) + 1
    }
    for (let b = 0; b < size; b++) buckets[b + 1] = (buckets[b + 1] ?? 0) + (buckets[b] ?? 0)
    for (const i of nodes) {
      const b = slot[i] ?? 0
      const at = buckets[b] ?? 0
      items[at] = i
      buckets[b] = at + 1
    }
    for (let b = size; b > 0; b--) buckets[b] = buckets[b - 1] ?? 0
    buckets[0] = 0
    const radius = this.#radius
    const half = this.#spacing / 2
    for (const i of movers) {
      if (fixed[i] === 1) continue
      const ri = (radius[i] ?? 0) + half
      const ci = gx[i] ?? 0
      const cj = gy[i] ?? 0
      for (let ox = -1; ox <= 1; ox++) {
        const tx = ci + ox
        for (let oy = -1; oy <= 1; oy++) {
          const ty = cj + oy
          const b = (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) & mask
          const end = buckets[b + 1] ?? 0
          for (let at = buckets[b] ?? 0; at < end; at++) {
            const j = items[at] ?? 0
            if (j === i || gx[j] !== tx || gy[j] !== ty) continue
            const jFixed = fixed[j] === 1
            if (!jFixed && j < i && (active === null || active[j] === 1)) continue
            const rj = (radius[j] ?? 0) + half
            const r = ri + rj
            let dx = (x[i] ?? 0) + (vx[i] ?? 0) - (x[j] ?? 0) - (vx[j] ?? 0)
            let dy = (y[i] ?? 0) + (vy[i] ?? 0) - (y[j] ?? 0) - (vy[j] ?? 0)
            let l = dx * dx + dy * dy
            if (l >= r * r) continue
            if (l === 0) {
              dx = jiggle()
              l = dx * dx
            }
            l = Math.sqrt(l)
            const f = ((r - l) / l) * collideStrength
            dx *= f
            dy *= f
            const share = jFixed ? 1 : (rj * rj) / (ri * ri + rj * rj)
            vx[i] = (vx[i] ?? 0) + dx * share
            vy[i] = (vy[i] ?? 0) + dy * share
            if (!jFixed) {
              vx[j] = (vx[j] ?? 0) - dx * (1 - share)
              vy[j] = (vy[j] ?? 0) - dy * (1 - share)
            }
          }
        }
      }
    }
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
  const capacity = Math.min(alive.length, xy.length / 2)
  const nodes: number[] = []
  const movers: number[] = []
  for (let i = 0; i < capacity; i++) {
    if (alive[i] !== 1) continue
    nodes.push(i)
    if (fixed[i] !== 1) movers.push(i)
  }
  if (movers.length === 0) return
  const all = Uint32Array.from(nodes)
  const moving = Uint32Array.from(movers)
  const x = new Float64Array(capacity)
  const y = new Float64Array(capacity)
  for (let i = 0; i < capacity; i++) {
    x[i] = xy[i * 2] ?? 0
    y[i] = xy[i * 2 + 1] ?? 0
  }
  const vx = new Float64Array(capacity)
  const vy = new Float64Array(capacity)
  const collider = new Collider(radius, all, spacing)
  let seed = 1
  const jiggle = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed / 4294967296 - 0.5) * 1e-6
  }
  const active = new Uint8Array(capacity)
  let round: Uint32Array = moving
  for (let pass = 0; pass < rounds && round.length > 0; pass++) {
    vx.fill(0)
    vy.fill(0)
    collider.apply(all, round, fixed, x, y, vx, vy, jiggle, pass === 0 ? null : active)
    active.fill(0)
    const moved: number[] = []
    for (const i of moving) {
      const dx = vx[i] ?? 0
      const dy = vy[i] ?? 0
      if (dx === 0 && dy === 0) continue
      active[i] = 1
      moved.push(i)
      x[i] = (x[i] ?? 0) + dx
      y[i] = (y[i] ?? 0) + dy
    }
    round = Uint32Array.from(moved)
  }
  for (const i of moving) {
    xy[i * 2] = x[i] ?? 0
    xy[i * 2 + 1] = y[i] ?? 0
  }
}
