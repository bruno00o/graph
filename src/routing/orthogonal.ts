import { Maze, type MazeLimits } from './maze'
import { Nudger } from './nudge'
import { Obstacles } from './obstacles'

export type RouteAxis = 'auto' | 'vertical' | 'horizontal'

export interface OrthogonalSettings {
  readonly gap: number
  readonly spacing: number
  readonly axis: RouteAxis
}

export interface RouteInput {
  readonly xy: Float32Array
  readonly extents: Float32Array
  readonly parents: Int32Array | null
  readonly ends: Uint32Array
}

export interface RouteOutput {
  readonly offsets: Uint32Array
  readonly points: Float32Array
}

export interface RouteStats {
  simple: number
  searched: number
  blocked: number
  expansions: number
  nudging: number
}

const limits: MazeLimits = { obstacles: 1500, points: 1 << 18, expansions: 40_000 }
const portShare = 0.7
const eps = 1e-6

class Path {
  values: number[] = []

  reset(x: number, y: number): this {
    this.values.length = 0
    this.values.push(x, y)
    return this
  }

  to(x: number, y: number): this {
    const v = this.values
    const n = v.length
    const lx = v[n - 2] ?? 0
    const ly = v[n - 1] ?? 0
    if (Math.abs(lx - x) <= eps && Math.abs(ly - y) <= eps) return this
    if (n >= 4) {
      const px = v[n - 4] ?? 0
      const py = v[n - 3] ?? 0
      const vertical = Math.abs(px - lx) <= eps && Math.abs(lx - x) <= eps
      const horizontal = Math.abs(py - ly) <= eps && Math.abs(ly - y) <= eps
      if (vertical || horizontal) {
        v[n - 2] = x
        v[n - 1] = y
        if (Math.abs(px - x) <= eps && Math.abs(py - y) <= eps) v.length = n - 2
        return this
      }
    }
    v.push(x, y)
    return this
  }
}

function free(obstacles: Obstacles, values: readonly number[]): boolean {
  for (let at = 0; at + 3 < values.length; at += 2) {
    if (
      obstacles.blocked(
        values[at] ?? 0,
        values[at + 1] ?? 0,
        values[at + 2] ?? 0,
        values[at + 3] ?? 0,
      )
    ) {
      return false
    }
  }
  return true
}

function middle(a: number, ha: number, b: number, hb: number): number {
  const from = b > a ? a + ha : a - ha
  const to = b > a ? b - hb : b + hb
  return (b > a ? to > from : to < from) ? (from + to) / 2 : (a + b) / 2
}

export class OrthogonalRouter {
  readonly #input: RouteInput
  readonly #settings: OrthogonalSettings
  readonly #stats: RouteStats | undefined
  readonly #obstacles: Obstacles
  readonly #maze: Maze = new Maze()
  readonly #bend: number
  readonly #gap: number
  readonly #count: number
  readonly #offsets: Uint32Array
  readonly #points: number[] = []
  readonly #path: Path = new Path()
  readonly #candidate: Path = new Path()
  readonly #ignore: number[] = [0, 0]
  #edge = 0
  #result: RouteOutput | null = null

  constructor(input: RouteInput, settings: OrthogonalSettings, stats?: RouteStats) {
    this.#input = input
    this.#settings = settings
    this.#stats = stats
    this.#gap = Math.max(0, settings.gap)
    this.#obstacles = new Obstacles(input.xy, input.extents, this.#gap)
    this.#bend = Math.max(this.#obstacles.size * 2, this.#gap * 4, 1)
    this.#count = input.ends.length >> 1
    this.#offsets = new Uint32Array(this.#count + 1)
  }

  get done(): boolean {
    return this.#result !== null
  }

  run(): RouteOutput {
    while (!this.#result) this.step(Number.POSITIVE_INFINITY)
    return this.#result
  }

  step(until: number): RouteOutput | null {
    if (this.#result) return this.#result
    while (this.#edge < this.#count) {
      this.#route(this.#edge++)
      if ((this.#edge & 63) === 0 && performance.now() >= until) return null
    }
    this.#result = this.#finish()
    return this.#result
  }

  #route(edge: number): void {
    const { xy, extents, parents, ends } = this.#input
    const settings = this.#settings
    const stats = this.#stats
    const obstacles = this.#obstacles
    const bend = this.#bend
    const path = this.#path
    const candidate = this.#candidate
    const source = ends[edge * 2] ?? 0
    const target = ends[edge * 2 + 1] ?? 0
    const sx = xy[source * 2] ?? 0
    const sy = xy[source * 2 + 1] ?? 0
    const tx = xy[target * 2] ?? 0
    const ty = xy[target * 2 + 1] ?? 0
    const shw = extents[source * 2] ?? 0
    const shh = extents[source * 2 + 1] ?? 0
    const thw = extents[target * 2] ?? 0
    const thh = extents[target * 2 + 1] ?? 0
    path.reset(sx, sy)
    const apart = Math.abs(tx - sx) > shw + thw + eps || Math.abs(ty - sy) > shh + thh + eps
    if (source === target || !apart) {
      path.to(tx, ty)
    } else {
      this.#ignore[0] = source
      this.#ignore[1] = target
      obstacles.ignore(this.#ignore, parents)
      const my = middle(sy, shh, ty, thh)
      const mx = middle(sx, shw, tx, thw)
      const vertical =
        settings.axis === 'auto'
          ? Math.abs(ty - sy) >= Math.abs(tx - sx)
          : settings.axis === 'vertical'
      const shapes: Array<() => Path> = [
        () => candidate.reset(sx, sy).to(sx, my).to(tx, my).to(tx, ty),
        () => candidate.reset(sx, sy).to(mx, sy).to(mx, ty).to(tx, ty),
        () => candidate.reset(sx, sy).to(sx, ty).to(tx, ty),
        () => candidate.reset(sx, sy).to(tx, sy).to(tx, ty),
      ]
      const order =
        settings.axis === 'auto' ? (vertical ? [0, 2, 3, 1] : [1, 3, 2, 0]) : vertical ? [0] : [1]
      const axis = settings.axis === 'auto' ? 0 : vertical ? 1 : 2
      let chosen: readonly number[] | null = null
      for (const at of order) {
        const shape = shapes[at]?.()
        if (shape && free(obstacles, shape.values)) {
          chosen = shape.values
          break
        }
      }
      if (chosen) {
        if (stats) stats.simple++
      } else {
        const narrow = Math.min(Math.abs(tx - sx), Math.abs(ty - sy))
        const near = bend * 2 + narrow * 0.25
        chosen =
          this.#maze.route(obstacles, sx, sy, tx, ty, near, bend, axis, limits) ??
          this.#maze.route(obstacles, sx, sy, tx, ty, near * 4, bend, axis, limits)
        if (chosen) {
          if (stats) stats.searched++
        } else {
          chosen = (shapes[order[0] ?? 0]?.() ?? candidate).values
          if (stats) stats.blocked++
        }
      }
      for (let at = 2; at + 1 < chosen.length; at += 2)
        path.to(chosen[at] ?? 0, chosen[at + 1] ?? 0)
    }
    this.#offsets[edge] = this.#points.length >> 1
    for (const value of path.values) this.#points.push(value)
  }

  #finish(): RouteOutput {
    const points = this.#points
    const offsets = this.#offsets
    offsets[this.#count] = points.length >> 1
    if (this.#stats) this.#stats.expansions = this.#maze.expansions
    const xs = new Float64Array(points.length >> 1)
    const ys = new Float64Array(points.length >> 1)
    for (let k = 0; k < xs.length; k++) {
      xs[k] = points[k * 2] ?? 0
      ys[k] = points[k * 2 + 1] ?? 0
    }
    const nudger = new Nudger(
      { xs, ys, offsets, ends: this.#input.ends },
      {
        obstacles: this.#obstacles,
        extents: this.#input.extents,
        spacing: this.#settings.spacing,
        wall: this.#gap * 0.5,
        port: portShare,
      },
    )
    const nudged = performance.now()
    nudger.run(1)
    nudger.run(0)
    if (this.#stats) this.#stats.nudging = performance.now() - nudged
    const result = new Float32Array(xs.length * 2)
    for (let k = 0; k < xs.length; k++) {
      result[k * 2] = xs[k] ?? 0
      result[k * 2 + 1] = ys[k] ?? 0
    }
    return { offsets, points: result }
  }
}

export function routeOrthogonal(
  input: RouteInput,
  settings: OrthogonalSettings,
  stats?: RouteStats,
): RouteOutput {
  return new OrthogonalRouter(input, settings, stats).run()
}
