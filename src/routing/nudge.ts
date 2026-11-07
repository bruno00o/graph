import type { Obstacles } from './obstacles'

export interface RouteSet {
  readonly xs: Float64Array
  readonly ys: Float64Array
  readonly offsets: Uint32Array
  readonly ends: Uint32Array
}

export interface NudgeOptions {
  readonly obstacles: Obstacles
  readonly extents: Float32Array
  readonly spacing: number
  readonly wall: number
  readonly port: number
}

const eps = 1e-6
const lookBack = 512
const maxTurns = 64

function sign(value: number): number {
  return value > eps ? 1 : value < -eps ? -1 : 0
}

export class Nudger {
  readonly #routes: RouteSet
  readonly #options: NudgeOptions
  readonly #route: Uint32Array

  constructor(routes: RouteSet, options: NudgeOptions) {
    this.#routes = routes
    this.#options = options
    const count = routes.offsets.length - 1
    this.#route = new Uint32Array(routes.xs.length)
    for (let r = 0; r < count; r++) {
      const end = routes.offsets[r + 1] ?? 0
      for (let k = routes.offsets[r] ?? 0; k < end; k++) this.#route[k] = r
    }
  }

  #coord(k: number, axis: number): number {
    return (axis === 0 ? this.#routes.xs[k] : this.#routes.ys[k]) ?? 0
  }

  #terminal(k: number): boolean {
    const r = this.#route[k] ?? 0
    return k === this.#routes.offsets[r] || k === (this.#routes.offsets[r + 1] ?? 0) - 1
  }

  #walk(
    fa: number,
    stepA: number,
    fb: number,
    stepB: number,
    axis: number,
    travel: number,
  ): number {
    let factor = 1
    let a = axis
    let s = travel
    let ia = fa
    let ib = fb
    for (let turn = 0; turn < maxTurns; turn++) {
      const difference = s * (this.#coord(ia, a) - this.#coord(ib, a))
      const across = 1 - a
      if (difference < -eps) {
        if (this.#terminal(ia)) return 0
        return factor * sign(this.#coord(ia + stepA, across) - this.#coord(ia, across))
      }
      if (difference > eps) {
        if (this.#terminal(ib)) return 0
        return -factor * sign(this.#coord(ib + stepB, across) - this.#coord(ib, across))
      }
      if (this.#terminal(ia) || this.#terminal(ib)) return 0
      const turnA = sign(this.#coord(ia + stepA, across) - this.#coord(ia, across))
      const turnB = sign(this.#coord(ib + stepB, across) - this.#coord(ib, across))
      if (turnA === 0 || turnB === 0) return 0
      if (turnA !== turnB) return factor * turnA
      factor = -factor * s * turnA
      ia += stepA
      ib += stepB
      a = across
      s = turnA
    }
    return 0
  }

  #compare(a: number, b: number, axis: number): number {
    const da = this.#coord(a + 1, axis) > this.#coord(a, axis) ? 1 : -1
    const db = this.#coord(b + 1, axis) > this.#coord(b, axis) ? 1 : -1
    const headA = da > 0 ? a + 1 : a
    const headB = db > 0 ? b + 1 : b
    const tailA = da > 0 ? a : a + 1
    const tailB = db > 0 ? b : b + 1
    const ahead = this.#walk(headA, da, headB, db, axis, 1)
    if (ahead !== 0) return ahead
    const behind = this.#walk(tailA, -da, tailB, -db, axis, -1)
    if (behind !== 0) return behind
    return (this.#route[a] ?? 0) - (this.#route[b] ?? 0) || a - b
  }

  run(axis: number): void {
    const across = 1 - axis
    const { offsets } = this.#routes
    const starts: number[] = []
    for (let r = 0; r + 1 < offsets.length; r++) {
      const end = (offsets[r + 1] ?? 0) - 1
      for (let k = offsets[r] ?? 0; k < end; k++) {
        if (
          Math.abs(this.#coord(k, across) - this.#coord(k + 1, across)) <= eps &&
          Math.abs(this.#coord(k, axis) - this.#coord(k + 1, axis)) > eps
        ) {
          starts.push(k)
        }
      }
    }
    const count = starts.length
    const at = new Float64Array(count)
    const lo = new Float64Array(count)
    const hi = new Float64Array(count)
    starts.forEach((k, s) => {
      at[s] = this.#coord(k, across)
      lo[s] = Math.min(this.#coord(k, axis), this.#coord(k + 1, axis))
      hi[s] = Math.max(this.#coord(k, axis), this.#coord(k + 1, axis))
    })
    const order = Array.from({ length: count }, (_, s) => s)
    order.sort((p, q) => (at[p] ?? 0) - (at[q] ?? 0) || (lo[p] ?? 0) - (lo[q] ?? 0))
    let first = 0
    while (first < count) {
      const head = order[first] ?? 0
      const line = at[head] ?? 0
      let reach = hi[head] ?? 0
      let last = first + 1
      while (last < count) {
        const next = order[last] ?? 0
        if (Math.abs((at[next] ?? 0) - line) > eps || (lo[next] ?? 0) >= reach - eps) break
        reach = Math.max(reach, hi[next] ?? 0)
        last++
      }
      if (last - first > 1) {
        const members = order.slice(first, last)
        this.#arrange(
          members.map((s) => starts[s] ?? 0),
          members.map((s) => lo[s] ?? 0),
          members.map((s) => hi[s] ?? 0),
          line,
          axis,
        )
      }
      first = last
    }
  }

  #portRange(k: number, axis: number): [number, number] {
    const r = this.#route[k] ?? 0
    const first = this.#routes.offsets[r] ?? 0
    const node = this.#routes.ends[r * 2 + (k === first ? 0 : 1)] ?? 0
    const half = this.#options.extents[node * 2 + (axis === 0 ? 1 : 0)] ?? 0
    const center = this.#coord(k, 1 - axis)
    const reach = half * this.#options.port
    return [center - reach, center + reach]
  }

  #arrange(segments: number[], lows: number[], highs: number[], line: number, axis: number): void {
    const m = segments.length
    const rank = Array.from({ length: m }, (_, s) => s)
    rank.sort((p, q) => this.#compare(segments[p] ?? 0, segments[q] ?? 0, axis))
    const track = new Int32Array(m)
    let tracks = 0
    for (let at = 0; at < m; at++) {
      const s = rank[at] ?? 0
      let level = 0
      for (let before = Math.max(0, at - lookBack); before < at; before++) {
        const other = rank[before] ?? 0
        if (
          (lows[s] ?? 0) < (highs[other] ?? 0) - eps &&
          (lows[other] ?? 0) < (highs[s] ?? 0) - eps
        ) {
          level = Math.max(level, (track[other] ?? 0) + 1)
        }
      }
      track[s] = level
      tracks = Math.max(tracks, level + 1)
    }
    if (tracks < 2) return
    const floor = new Float64Array(tracks).fill(Number.NEGATIVE_INFINITY)
    const ceiling = new Float64Array(tracks).fill(Number.POSITIVE_INFINITY)
    const terminals = new Set<number>()
    let from = Number.POSITIVE_INFINITY
    let to = Number.NEGATIVE_INFINITY
    for (let s = 0; s < m; s++) {
      const k = segments[s] ?? 0
      from = Math.min(from, lows[s] ?? 0)
      to = Math.max(to, highs[s] ?? 0)
      for (const end of [k, k + 1]) {
        if (!this.#terminal(end)) continue
        const r = this.#route[end] ?? 0
        terminals.add(this.#routes.ends[r * 2 + (end === this.#routes.offsets[r] ? 0 : 1)] ?? 0)
        const [low, high] = this.#portRange(end, axis)
        const t = track[s] ?? 0
        floor[t] = Math.max(floor[t] ?? 0, low)
        ceiling[t] = Math.min(ceiling[t] ?? 0, high)
      }
    }
    const { obstacles, spacing, wall } = this.#options
    let left = Number.NEGATIVE_INFINITY
    let right = Number.POSITIVE_INFINITY
    const spread = tracks * spacing + wall
    const boxes = obstacles.boxes
    const box0 = axis === 0 ? 1 : 0
    const along0 = axis === 0 ? 0 : 1
    const qx0 = axis === 0 ? from : line - spread
    const qx1 = axis === 0 ? to : line + spread
    const qy0 = axis === 0 ? line - spread : from
    const qy1 = axis === 0 ? line + spread : to
    obstacles.query(qx0, qy0, qx1, qy1, (index) => {
      if (terminals.has(index)) return false
      const low = (boxes[index * 4 + box0] ?? 0) + wall
      const high = (boxes[index * 4 + box0 + 2] ?? 0) - wall
      const start = boxes[index * 4 + along0] ?? 0
      const end = boxes[index * 4 + along0 + 2] ?? 0
      if (end <= from + eps || start >= to - eps || high <= low) return false
      if (high <= line + eps) left = Math.max(left, high)
      else if (low >= line - eps) right = Math.min(right, low)
      return false
    })
    const position = new Float64Array(tracks)
    let gap = spacing
    let placed = false
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      for (let t = 0; t < tracks; t++) {
        const wanted = line + (t - (tracks - 1) / 2) * gap
        const low = Math.max(floor[t] ?? 0, left)
        position[t] = Math.max(wanted, low, t > 0 ? (position[t - 1] ?? 0) + gap : low)
      }
      for (let t = tracks - 1; t >= 0; t--) {
        const high = Math.min(ceiling[t] ?? 0, right)
        position[t] = Math.min(
          position[t] ?? 0,
          high,
          t < tracks - 1 ? (position[t + 1] ?? 0) - gap : high,
        )
      }
      placed = true
      for (let t = 0; t < tracks && placed; t++) {
        const low = Math.max(floor[t] ?? 0, left)
        if ((position[t] ?? 0) < low - eps) placed = false
        if (t > 0 && (position[t] ?? 0) - (position[t - 1] ?? 0) < gap - eps) placed = false
      }
      gap /= 2
    }
    if (!placed) return
    const target = axis === 0 ? this.#routes.ys : this.#routes.xs
    for (let s = 0; s < m; s++) {
      const k = segments[s] ?? 0
      const value = position[track[s] ?? 0] ?? line
      target[k] = value
      target[k + 1] = value
    }
  }
}
