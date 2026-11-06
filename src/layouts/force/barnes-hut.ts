const internal = -2
const empty = -1
const leafSize = 8
const maxDepth = 32
const theta2 = 1.44
const coincident = 1e-12
export const softening = 4

export class BarnesHut {
  #capacity = 0
  #count = 0
  #child: Int32Array = new Int32Array(0)
  #point: Int32Array = new Int32Array(0)
  #fill: Int32Array = new Int32Array(0)
  #mass: Float64Array = new Float64Array(0)
  #cx: Float64Array = new Float64Array(0)
  #cy: Float64Array = new Float64Array(0)
  #left: Float64Array = new Float64Array(0)
  #top: Float64Array = new Float64Array(0)
  #size: Float64Array = new Float64Array(0)
  #depth: Int32Array = new Int32Array(0)
  #next: Int32Array = new Int32Array(0)
  #stack: Int32Array = new Int32Array(0)

  get cells(): number {
    return this.#count
  }

  build(nodes: Uint32Array, x: Float64Array, y: Float64Array): void {
    if (this.#next.length < x.length) this.#next = new Int32Array(x.length)
    this.#count = 0
    if (nodes.length === 0) return
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const i of nodes) {
      const px = x[i] ?? 0
      const py = y[i] ?? 0
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
    }
    const size = Math.max(maxX - minX, maxY - minY, 1) * 1.0001
    this.#reserve(Math.ceil(nodes.length / 2) + 1)
    this.#cell(minX, minY, size, 0)
    for (const i of nodes) this.#insert(0, i, x, y)
    this.#aggregate(x, y)
  }

  apply(
    i: number,
    x: Float64Array,
    y: Float64Array,
    strength: number,
    jiggle: () => number,
    vx: Float64Array,
    vy: Float64Array,
  ): void {
    if (this.#count === 0) return
    const xi = x[i] ?? 0
    const yi = y[i] ?? 0
    const stack = this.#stack
    const cx = this.#cx
    const cy = this.#cy
    const sizes = this.#size
    const mass = this.#mass
    const point = this.#point
    const child = this.#child
    const next = this.#next
    const left = this.#left
    const top = this.#top
    let fx = 0
    let fy = 0
    let depth = 0
    stack[depth++] = 0
    while (depth > 0) {
      const c = stack[--depth] ?? 0
      const dx = (cx[c] ?? 0) - xi
      const dy = (cy[c] ?? 0) - yi
      const d2 = dx * dx + dy * dy
      const size = sizes[c] ?? 0
      if (size * size < theta2 * d2) {
        const l = left[c] ?? 0
        const t = top[c] ?? 0
        if (xi < l || xi >= l + size || yi < t || yi >= t + size) {
          const w = (mass[c] ?? 0) / (d2 + softening)
          fx += dx * w
          fy += dy * w
          continue
        }
      }
      const head = point[c] ?? empty
      if (head === internal) {
        for (let q = c * 4; q < c * 4 + 4; q++) {
          const k = child[q] ?? empty
          if (k >= 0) stack[depth++] = k
        }
        continue
      }
      for (let j = head; j >= 0; j = next[j] ?? empty) {
        if (j === i) continue
        let ex = (x[j] ?? 0) - xi
        let ey = (y[j] ?? 0) - yi
        let e2 = ex * ex + ey * ey
        if (e2 < coincident) {
          ex = jiggle()
          ey = jiggle()
          e2 = ex * ex + ey * ey
        }
        const w = 1 / (e2 + softening)
        fx += ex * w
        fy += ey * w
      }
    }
    vx[i] = (vx[i] ?? 0) + fx * strength
    vy[i] = (vy[i] ?? 0) + fy * strength
  }

  #reserve(cells: number): void {
    if (cells <= this.#capacity) return
    const capacity = Math.max(cells, this.#capacity * 2)
    this.#child = grown(this.#child, capacity * 4)
    this.#point = grown(this.#point, capacity)
    this.#fill = grown(this.#fill, capacity)
    this.#depth = grown(this.#depth, capacity)
    this.#left = grown(this.#left, capacity)
    this.#top = grown(this.#top, capacity)
    this.#size = grown(this.#size, capacity)
    this.#mass = new Float64Array(capacity)
    this.#cx = new Float64Array(capacity)
    this.#cy = new Float64Array(capacity)
    this.#stack = new Int32Array(capacity * 4)
    this.#capacity = capacity
  }

  #cell(left: number, top: number, size: number, depth: number): number {
    if (this.#count === this.#capacity) this.#reserve(this.#count + 1)
    const c = this.#count++
    this.#child.fill(empty, c * 4, c * 4 + 4)
    this.#point[c] = empty
    this.#fill[c] = 0
    this.#left[c] = left
    this.#top[c] = top
    this.#size[c] = size
    this.#depth[c] = depth
    return c
  }

  #insert(from: number, i: number, x: Float64Array, y: Float64Array): void {
    const xi = x[i] ?? 0
    const yi = y[i] ?? 0
    let c = from
    for (;;) {
      const p = this.#point[c] ?? empty
      if (p !== internal) {
        const fill = this.#fill[c] ?? 0
        if (fill < leafSize || (this.#depth[c] ?? 0) >= maxDepth || this.#same(p, xi, yi, x, y)) {
          this.#next[i] = p
          this.#point[c] = i
          this.#fill[c] = fill + 1
          return
        }
        this.#point[c] = internal
        this.#fill[c] = 0
        for (let j = p; j >= 0; ) {
          const after = this.#next[j] ?? empty
          this.#insert(c, j, x, y)
          j = after
        }
      }
      const half = (this.#size[c] ?? 0) / 2
      const left = this.#left[c] ?? 0
      const top = this.#top[c] ?? 0
      const right = xi >= left + half
      const below = yi >= top + half
      const q = (right ? 1 : 0) | (below ? 2 : 0)
      let k = this.#child[c * 4 + q] ?? empty
      if (k === empty) {
        const depth = (this.#depth[c] ?? 0) + 1
        k = this.#cell(right ? left + half : left, below ? top + half : top, half, depth)
        this.#child[c * 4 + q] = k
      }
      c = k
    }
  }

  #same(p: number, xi: number, yi: number, x: Float64Array, y: Float64Array): boolean {
    for (let j = p; j >= 0; j = this.#next[j] ?? empty) {
      if (x[j] !== xi || y[j] !== yi) return false
    }
    return true
  }

  #aggregate(x: Float64Array, y: Float64Array): void {
    for (let c = this.#count - 1; c >= 0; c--) {
      const p = this.#point[c] ?? empty
      let mass = 0
      let sx = 0
      let sy = 0
      if (p === internal) {
        for (let q = 0; q < 4; q++) {
          const k = this.#child[c * 4 + q] ?? empty
          if (k < 0) continue
          const m = this.#mass[k] ?? 0
          mass += m
          sx += (this.#cx[k] ?? 0) * m
          sy += (this.#cy[k] ?? 0) * m
        }
      } else {
        for (let j = p; j >= 0; j = this.#next[j] ?? empty) {
          mass++
          sx += x[j] ?? 0
          sy += y[j] ?? 0
        }
      }
      this.#mass[c] = mass
      this.#cx[c] = mass > 0 ? sx / mass : 0
      this.#cy[c] = mass > 0 ? sy / mass : 0
    }
  }
}

function grown<A extends Int32Array | Float64Array>(array: A, length: number): A {
  const next = new (array.constructor as new (length: number) => A)(length)
  next.set(array)
  return next
}
