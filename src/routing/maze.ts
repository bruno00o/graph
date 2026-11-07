import type { Obstacles } from './obstacles'

export interface MazeLimits {
  readonly obstacles: number
  readonly points: number
  readonly expansions: number
}

const stepX = [1, 0, -1, 0]
const stepY = [0, 1, 0, -1]

function unique(values: Float64Array, count: number): number {
  const sorted = values.subarray(0, count).sort()
  let kept = 0
  for (let at = 0; at < count; at++) {
    const value = sorted[at] ?? 0
    if (kept === 0 || value - (sorted[kept - 1] ?? 0) > 1e-9) sorted[kept++] = value
  }
  return kept
}

function lowerBound(values: Float64Array, count: number, value: number): number {
  let lo = 0
  let hi = count
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((values[mid] ?? 0) < value - 1e-9) lo = mid + 1
    else hi = mid
  }
  return lo
}

function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0
}

export class Maze {
  #xs: Float64Array = new Float64Array(64)
  #ys: Float64Array = new Float64Array(64)
  #ids: number[] = []
  #cover: Uint8Array = new Uint8Array(0)
  #cost: Float64Array = new Float64Array(0)
  #parent: Int32Array = new Int32Array(0)
  #seen: Uint32Array = new Uint32Array(0)
  #closed: Uint32Array = new Uint32Array(0)
  #generation = 0
  #heap: Int32Array = new Int32Array(1024)
  #keys: Float64Array = new Float64Array(1024)
  #size = 0
  expansions = 0

  #grow(states: number): void {
    if (this.#cost.length >= states) return
    const size = Math.max(states, this.#cost.length * 2)
    this.#cost = new Float64Array(size)
    this.#parent = new Int32Array(size)
    this.#seen = new Uint32Array(size)
    this.#closed = new Uint32Array(size)
    this.#generation = 0
  }

  #push(state: number, key: number): void {
    if (this.#size === this.#heap.length) {
      const heap = new Int32Array(this.#size * 2)
      heap.set(this.#heap)
      this.#heap = heap
      const keys = new Float64Array(this.#size * 2)
      keys.set(this.#keys)
      this.#keys = keys
    }
    let at = this.#size++
    while (at > 0) {
      const up = (at - 1) >> 1
      if ((this.#keys[up] ?? 0) <= key) break
      this.#heap[at] = this.#heap[up] ?? 0
      this.#keys[at] = this.#keys[up] ?? 0
      at = up
    }
    this.#heap[at] = state
    this.#keys[at] = key
  }

  #pop(): number {
    const top = this.#heap[0] ?? 0
    const size = --this.#size
    const last = this.#heap[size] ?? 0
    const key = this.#keys[size] ?? 0
    let at = 0
    for (;;) {
      let child = at * 2 + 1
      if (child >= size) break
      if (child + 1 < size && (this.#keys[child + 1] ?? 0) < (this.#keys[child] ?? 0)) child++
      if ((this.#keys[child] ?? 0) >= key) break
      this.#heap[at] = this.#heap[child] ?? 0
      this.#keys[at] = this.#keys[child] ?? 0
      at = child
    }
    this.#heap[at] = last
    this.#keys[at] = key
    return top
  }

  route(
    obstacles: Obstacles,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    margin: number,
    bend: number,
    axis: number,
    limits: MazeLimits,
  ): number[] | null {
    const x0 = Math.min(sx, tx) - margin
    const x1 = Math.max(sx, tx) + margin
    const y0 = Math.min(sy, ty) - margin
    const y1 = Math.max(sy, ty) + margin
    const ids = this.#ids
    ids.length = 0
    let overflow = false
    obstacles.query(x0, y0, x1, y1, (index) => {
      if (obstacles.ignored(index)) return false
      ids.push(index)
      overflow = ids.length > limits.obstacles
      return overflow
    })
    if (overflow) return null
    const room = ids.length * 2 + 4
    if (this.#xs.length < room) {
      this.#xs = new Float64Array(room * 2)
      this.#ys = new Float64Array(room * 2)
    }
    const xs = this.#xs
    const ys = this.#ys
    let nx = 0
    let ny = 0
    xs[nx++] = x0
    xs[nx++] = x1
    xs[nx++] = sx
    xs[nx++] = tx
    ys[ny++] = y0
    ys[ny++] = y1
    ys[ny++] = sy
    ys[ny++] = ty
    const boxes = obstacles.boxes
    for (const index of ids) {
      const box = index * 4
      xs[nx++] = Math.min(x1, Math.max(x0, boxes[box] ?? 0))
      xs[nx++] = Math.min(x1, Math.max(x0, boxes[box + 2] ?? 0))
      ys[ny++] = Math.min(y1, Math.max(y0, boxes[box + 1] ?? 0))
      ys[ny++] = Math.min(y1, Math.max(y0, boxes[box + 3] ?? 0))
    }
    nx = unique(xs, nx)
    ny = unique(ys, ny)
    const points = nx * ny
    if (points > limits.points) return null
    const cols = nx - 1
    const cells = cols * (ny - 1)
    if (this.#cover.length < cells) this.#cover = new Uint8Array(Math.max(cells, this.#cover.length * 2))
    const cover = this.#cover
    cover.fill(0, 0, cells)
    for (const index of ids) {
      const box = index * 4
      const i0 = lowerBound(xs, nx, boxes[box] ?? 0)
      const i1 = lowerBound(xs, nx, boxes[box + 2] ?? 0)
      const j0 = lowerBound(ys, ny, boxes[box + 1] ?? 0)
      const j1 = lowerBound(ys, ny, boxes[box + 3] ?? 0)
      for (let j = j0; j < j1; j++) cover.fill(1, j * cols + i0, j * cols + i1)
    }
    const covered = (i: number, j: number): boolean =>
      i >= 0 && j >= 0 && i < cols && j < ny - 1 && cover[j * cols + i] === 1
    const open = (i: number, j: number, direction: number): boolean => {
      if (direction === 0) return !(covered(i, j - 1) && covered(i, j))
      if (direction === 2) return !(covered(i - 1, j - 1) && covered(i - 1, j))
      if (direction === 1) return !(covered(i - 1, j) && covered(i, j))
      return !(covered(i - 1, j - 1) && covered(i, j - 1))
    }
    const start = lowerBound(ys, ny, sy) * nx + lowerBound(xs, nx, sx)
    const goal = lowerBound(ys, ny, ty) * nx + lowerBound(xs, nx, tx)
    this.#grow(points * 4)
    this.#generation++
    if (this.#generation === 0xffffffff) {
      this.#seen.fill(0)
      this.#closed.fill(0)
      this.#generation = 1
    }
    const generation = this.#generation
    const cost = this.#cost
    const parent = this.#parent
    const seen = this.#seen
    const closed = this.#closed
    const estimate = (point: number, direction: number): number => {
      const px = xs[point % nx] ?? 0
      const py = ys[Math.floor(point / nx)] ?? 0
      const dx = tx - px
      const dy = ty - py
      const ux = stepX[direction] ?? 0
      const uy = stepY[direction] ?? 0
      let turns = 0
      if (dx !== 0 || dy !== 0) {
        if (ux !== 0) {
          if (sign(dx) === -ux) turns = 2
          else if (dy !== 0) turns = 1
        } else if (sign(dy) === -uy) turns = 2
        else if (dx !== 0) turns = 1
      }
      return Math.abs(dx) + Math.abs(dy) + turns * bend
    }
    const away = (direction: number): number =>
      axis === 0 ? 0 : (direction & 1) === (axis === 1 ? 1 : 0) ? 0 : bend
    this.#size = 0
    for (let direction = 0; direction < 4; direction++) {
      const state = start * 4 + direction
      cost[state] = away(direction)
      parent[state] = -1
      seen[state] = generation
      this.#push(state, (cost[state] ?? 0) + estimate(start, direction))
    }
    let found = -1
    let expansions = 0
    while (this.#size > 0) {
      const state = this.#pop()
      if (closed[state] === generation) continue
      closed[state] = generation
      const point = state >> 2
      if (point === goal) {
        found = state
        break
      }
      if (++expansions > limits.expansions) break
      const direction = state & 3
      const i = point % nx
      const j = (point - i) / nx
      const base = cost[state] ?? 0
      for (let turn = -1; turn <= 1; turn++) {
        const next = (direction + turn + 4) & 3
        const ni = i + (stepX[next] ?? 0)
        const nj = j + (stepY[next] ?? 0)
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || !open(i, j, next)) continue
        const length = Math.abs((xs[ni] ?? 0) - (xs[i] ?? 0)) + Math.abs((ys[nj] ?? 0) - (ys[j] ?? 0))
        const total =
          base +
          length +
          (turn !== 0 ? bend : 0) +
          (nj * nx + ni === goal ? away(next) : 0)
        const target = (nj * nx + ni) * 4 + next
        if (closed[target] === generation) continue
        if (seen[target] === generation && (cost[target] ?? 0) <= total) continue
        seen[target] = generation
        cost[target] = total
        parent[target] = state
        this.#push(target, total + estimate(nj * nx + ni, next))
      }
    }
    this.expansions += expansions
    if (found < 0) return null
    const path: number[] = []
    let state = found
    let previous = -1
    while (state >= 0) {
      const point = state >> 2
      const direction = state & 3
      if (previous < 0 || direction !== previous || parent[state] === -1) {
        const i = point % nx
        path.push(xs[i] ?? 0, ys[(point - i) / nx] ?? 0)
      }
      previous = direction
      state = parent[state] ?? -1
    }
    const result: number[] = []
    for (let at = path.length - 2; at >= 0; at -= 2) result.push(path[at] ?? 0, path[at + 1] ?? 0)
    return result
  }
}
