export interface CellFrame {
  readonly x0: number
  readonly y0: number
  readonly cell: number
  readonly cols: number
  readonly rows: number
}

const countChunk = 256

export function crosses(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  if (Math.max(ax, bx) < Math.min(cx, dx) || Math.max(cx, dx) < Math.min(ax, bx)) return false
  if (Math.max(ay, by) < Math.min(cy, dy) || Math.max(cy, dy) < Math.min(ay, by)) return false
  const o1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const o2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax)
  if (o1 * o2 >= 0) return false
  const o3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)
  const o4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx)
  return o3 * o4 < 0
}

export class CellTrace {
  cells: Int32Array = new Int32Array(64)
  length = 0

  push(cell: number): void {
    if (this.length === this.cells.length) {
      const grown = new Int32Array(this.cells.length * 2)
      grown.set(this.cells)
      this.cells = grown
    }
    this.cells[this.length++] = cell
  }
}

export function traceCells(
  frame: CellFrame,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  trace: CellTrace,
): number {
  trace.length = 0
  const { x0, y0, cell, cols, rows } = frame
  const fx = (ax - x0) / cell
  const fy = (ay - y0) / cell
  const gx = (bx - x0) / cell
  const gy = (by - y0) / cell
  const lastX = cols - 1
  const lastY = rows - 1
  let cx = Math.min(lastX, Math.max(0, Math.floor(fx)))
  let cy = Math.min(lastY, Math.max(0, Math.floor(fy)))
  const ex = Math.min(lastX, Math.max(0, Math.floor(gx)))
  const ey = Math.min(lastY, Math.max(0, Math.floor(gy)))
  const dx = gx - fx
  const dy = gy - fy
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0
  const deltaX = stepX !== 0 ? Math.abs(1 / dx) : Number.POSITIVE_INFINITY
  const deltaY = stepY !== 0 ? Math.abs(1 / dy) : Number.POSITIVE_INFINITY
  let nextX =
    stepX > 0
      ? (Math.floor(fx) + 1 - fx) / dx
      : stepX < 0
        ? (fx - Math.floor(fx)) / -dx
        : Number.POSITIVE_INFINITY
  let nextY =
    stepY > 0
      ? (Math.floor(fy) + 1 - fy) / dy
      : stepY < 0
        ? (fy - Math.floor(fy)) / -dy
        : Number.POSITIVE_INFINITY
  let guard = cols + rows + 4
  for (;;) {
    trace.push(cy * cols + cx)
    if ((cx === ex && cy === ey) || --guard < 0) return trace.length
    if (nextX < nextY) {
      nextX += deltaX
      const moved = cx + stepX
      if (moved < 0 || moved > lastX) {
        if (cy === ey) return trace.length
        cy = Math.min(lastY, Math.max(0, cy + stepY))
        nextY += deltaY
        continue
      }
      cx = moved
    } else {
      nextY += deltaY
      const moved = cy + stepY
      if (moved < 0 || moved > lastY) {
        if (cx === ex) return trace.length
        cx = Math.min(lastX, Math.max(0, cx + stepX))
        nextX += deltaX
        continue
      }
      cy = moved
    }
  }
}

export function frameOf(
  nodes: Int32Array,
  edges: Uint32Array,
  px: Float64Array,
  py: Float64Array,
  margin: number = 0,
  floor: number = 0,
): CellFrame {
  let x0 = Number.POSITIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (const index of nodes) {
    const x = px[index] ?? 0
    const y = py[index] ?? 0
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  if (nodes.length === 0) {
    x0 = 0
    y0 = 0
    x1 = 0
    y1 = 0
  }
  const pad = Math.max(margin, (x1 - x0 + y1 - y0) * (margin > 0 ? 0.1 : 0))
  x0 -= pad
  y0 -= pad
  x1 += pad
  y1 += pad
  const m = Math.max(1, edges.length >> 1)
  let total = 0
  for (let k = 0; k < edges.length; k += 2) {
    const a = edges[k] ?? 0
    const b = edges[k + 1] ?? 0
    total += Math.hypot((px[a] ?? 0) - (px[b] ?? 0), (py[a] ?? 0) - (py[b] ?? 0))
  }
  const width = Math.max(x1 - x0, 1e-6)
  const height = Math.max(y1 - y0, 1e-6)
  const items = Math.max(m, nodes.length)
  let cell = Math.max(total / m, Math.sqrt((width * height) / (m * 2)), floor, 1e-6)
  let cols = Math.ceil(width / cell) + 1
  let rows = Math.ceil(height / cell) + 1
  while (cols * rows > items * 8 + 64) {
    cell *= 1.25
    cols = Math.ceil(width / cell) + 1
    rows = Math.ceil(height / cell) + 1
  }
  return { x0, y0, cell, cols, rows }
}

export class CrossingCount {
  total = 0
  exceeded = false
  done = false
  readonly perEdge: Uint32Array
  readonly #edges: Uint32Array
  readonly #px: Float64Array
  readonly #py: Float64Array
  readonly #cap: number
  readonly #frame: CellFrame
  readonly #start: Int32Array
  readonly #stamp: Int32Array
  readonly #trace: CellTrace = new CellTrace()
  #items: Int32Array = new Int32Array(0)
  #fill: Int32Array = new Int32Array(0)
  #phase = 0
  #at = 0

  constructor(
    nodes: Int32Array,
    edges: Uint32Array,
    px: Float64Array,
    py: Float64Array,
    cap: number = Number.POSITIVE_INFINITY,
  ) {
    const m = edges.length >> 1
    this.perEdge = new Uint32Array(m)
    this.#edges = edges
    this.#px = px
    this.#py = py
    this.#cap = cap
    this.#frame = frameOf(nodes, edges, px, py)
    this.#start = new Int32Array(this.#frame.cols * this.#frame.rows + 1)
    this.#stamp = new Int32Array(m).fill(-1)
    this.done = m < 2
  }

  advance(until: number): boolean {
    const edges = this.#edges
    const px = this.#px
    const py = this.#py
    const trace = this.#trace
    const m = edges.length >> 1
    while (!this.done) {
      const end = Math.min(m, this.#at + countChunk)
      for (let e = this.#at; e < end; e++) {
        const a = edges[e * 2] ?? 0
        const b = edges[e * 2 + 1] ?? 0
        const ax = px[a] ?? 0
        const ay = py[a] ?? 0
        const bx = px[b] ?? 0
        const by = py[b] ?? 0
        const cells = traceCells(this.#frame, ax, ay, bx, by, trace)
        if (this.#phase === 0) {
          for (let k = 0; k < cells; k++) {
            const cell = (trace.cells[k] ?? 0) + 1
            this.#start[cell] = (this.#start[cell] ?? 0) + 1
          }
        } else if (this.#phase === 1) {
          for (let k = 0; k < cells; k++) {
            const cell = trace.cells[k] ?? 0
            const slot = this.#fill[cell] ?? 0
            this.#items[slot] = e
            this.#fill[cell] = slot + 1
          }
        } else {
          this.#test(e, a, b, ax, ay, bx, by, cells)
          if (this.exceeded) {
            this.done = true
            return true
          }
        }
      }
      this.#at = end
      if (end === m) this.#next()
      if (performance.now() >= until) break
    }
    return this.done
  }

  #next(): void {
    this.#at = 0
    if (this.#phase === 0) {
      const start = this.#start
      const cells = start.length - 1
      for (let cell = 0; cell < cells; cell++)
        start[cell + 1] = (start[cell + 1] ?? 0) + (start[cell] ?? 0)
      this.#items = new Int32Array(start[cells] ?? 0)
      this.#fill = start.slice(0, cells)
      this.#phase = 1
      return
    }
    if (this.#phase === 1) {
      this.#phase = 2
      return
    }
    this.done = true
  }

  #test(
    e: number,
    a: number,
    b: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cells: number,
  ): void {
    const edges = this.#edges
    const px = this.#px
    const py = this.#py
    const start = this.#start
    const items = this.#items
    const stamp = this.#stamp
    const perEdge = this.perEdge
    const trace = this.#trace.cells
    for (let at = 0; at < cells; at++) {
      const cell = trace[at] ?? 0
      const last = start[cell + 1] ?? 0
      for (let k = start[cell] ?? 0; k < last; k++) {
        const f = items[k] ?? 0
        if (f <= e || stamp[f] === e) continue
        stamp[f] = e
        const c = edges[f * 2] ?? 0
        const d = edges[f * 2 + 1] ?? 0
        if (c === a || c === b || d === a || d === b) continue
        if (crosses(ax, ay, bx, by, px[c] ?? 0, py[c] ?? 0, px[d] ?? 0, py[d] ?? 0)) {
          this.total++
          perEdge[e] = (perEdge[e] ?? 0) + 1
          perEdge[f] = (perEdge[f] ?? 0) + 1
          if (this.total > this.#cap) {
            this.exceeded = true
            return
          }
        }
      }
    }
  }
}
