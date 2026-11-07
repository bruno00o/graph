import { type GroupTree, groupTree } from '../../core/group-tree'
import type { LayoutGraph } from '../../types'
import { BarnesHut } from './barnes-hut'
import { Collider } from './collider'
import { GroupForces, liftOf } from './groups'
import { jitterOf, xorshift32 } from './random'

export type ForceGraph = Omit<LayoutGraph, 'keys' | 'datum'>

/**
 * Where the simulation runs: `'auto'`, `'gpu'` or `'cpu'`. `'auto'` uses the GPU from 2,000 nodes,
 * unless the browser draws WebGL in software, and the CPU otherwise.
 */
export type ForceEngine = 'auto' | 'gpu' | 'cpu'

/** Options of `force`. A negative or non-finite value falls back to its default. */
export interface ForceOptions {
  /**
   * Length an edge tends to, between the borders of its two nodes, in world units.
   * @default 40
   */
  readonly edgeLength?: number
  /**
   * Strength of the push between nodes. `0` turns it off.
   * @default 80
   */
  readonly repulsion?: number
  /**
   * Pull toward the center of the moving nodes, on full runs only.
   * @default 0.04
   */
  readonly gravity?: number
  /**
   * Smallest gap between two nodes, in world units.
   * @default 6
   */
  readonly spacing?: number
  /**
   * Pull of the members of an unfolded group toward the center of the group. `0` turns it off.
   * @default 0.5
   */
  readonly cohesion?: number
  /**
   * Smallest gap between the container of an unfolded group and the nodes and containers next to
   * it, in world units.
   * @default 16
   */
  readonly groupSpacing?: number
  /**
   * Steps of a full run, rounded and at least 1. A run on part of the graph takes fewer.
   * @default 300
   */
  readonly steps?: number
  /**
   * Where the simulation runs: `'auto'` uses the GPU from 2,000 nodes, unless the browser draws
   * WebGL in software, and the CPU otherwise.
   * @default 'auto'
   */
  readonly engine?: ForceEngine
}

/** Force options with every default applied, as `layout.options` holds them. */
export interface ForceSettings {
  /** Length an edge tends to, between the borders of its two nodes, in world units. */
  readonly edgeLength: number
  /** Strength of the push between nodes. */
  readonly repulsion: number
  /** Pull toward the center of the moving nodes. */
  readonly gravity: number
  /** Smallest gap between two nodes, in world units. */
  readonly spacing: number
  /** Pull of the members of an unfolded group toward the center of the group. */
  readonly cohesion: number
  /** Smallest gap between a container and the nodes and containers next to it, in world units. */
  readonly groupSpacing: number
  /** Steps of a full run. */
  readonly steps: number
  /** Where the simulation runs. */
  readonly engine: ForceEngine
}

export const forceDefaults: ForceSettings = {
  edgeLength: 40,
  repulsion: 80,
  gravity: 0.04,
  spacing: 6,
  cohesion: 0.5,
  groupSpacing: 16,
  steps: 300,
  engine: 'auto',
}

export const alphaMin = 0.001
export const partialAlpha = 0.5
export const retention = 0.6
const collisionStiffness = 0.5
const jitterScale = 1e-6
const engines: readonly ForceEngine[] = ['auto', 'gpu', 'cpu']

const gpuFrom = 2000

export function prefersGpu(graph: ForceGraph, settings: ForceSettings): boolean {
  if (settings.engine !== 'auto') return settings.engine === 'gpu'
  let alive = 0
  for (const flag of graph.alive) alive += flag
  return alive >= gpuFrom
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

export function resolveForce(options: ForceOptions = {}): ForceSettings {
  return {
    edgeLength: positive(options.edgeLength, forceDefaults.edgeLength),
    repulsion: positive(options.repulsion, forceDefaults.repulsion),
    gravity: positive(options.gravity, forceDefaults.gravity),
    spacing: positive(options.spacing, forceDefaults.spacing),
    cohesion: positive(options.cohesion, forceDefaults.cohesion),
    groupSpacing: positive(options.groupSpacing, forceDefaults.groupSpacing),
    steps: Math.max(1, Math.round(positive(options.steps, forceDefaults.steps))),
    engine: engines.includes(options.engine as ForceEngine)
      ? (options.engine as ForceEngine)
      : forceDefaults.engine,
  }
}

export class Cooling {
  readonly start: number
  readonly #rate: number
  readonly #total: number
  #tick = 0

  constructor(start: number, steps: number) {
    this.start = start
    this.#rate = alphaMin ** (1 / Math.max(1, steps))
    this.#total =
      start > alphaMin ? Math.ceil(Math.log(alphaMin / start) / Math.log(this.#rate) - 1e-9) : 0
  }

  get alpha(): number {
    return this.start * this.#rate ** this.#tick
  }

  get done(): boolean {
    return this.#tick >= this.#total
  }

  get progress(): number {
    return this.#total === 0 ? 1 : Math.min(1, this.#tick / this.#total)
  }

  advance(): void {
    if (this.#tick < this.#total) this.#tick++
  }
}

export interface Springs {
  readonly count: number
  readonly ends: Uint32Array
  readonly stiffness: Float64Array
  readonly share: Float64Array
  readonly rest: Float64Array
}

export function springsOf(graph: ForceGraph, edgeLength: number): Springs {
  const { alive, edges, radius } = graph
  const degree = new Uint32Array(graph.capacity)
  const usable = (s: number, t: number) => s !== t && alive[s] === 1 && alive[t] === 1
  let count = 0
  for (let e = 0; e + 1 < edges.length; e += 2) {
    const s = edges[e] ?? 0
    const t = edges[e + 1] ?? 0
    if (!usable(s, t)) continue
    degree[s] = (degree[s] ?? 0) + 1
    degree[t] = (degree[t] ?? 0) + 1
    count++
  }
  const ends = new Uint32Array(count * 2)
  const stiffness = new Float64Array(count)
  const share = new Float64Array(count)
  const rest = new Float64Array(count)
  let k = 0
  for (let e = 0; e + 1 < edges.length; e += 2) {
    const s = edges[e] ?? 0
    const t = edges[e + 1] ?? 0
    if (!usable(s, t)) continue
    const ds = degree[s] ?? 1
    const dt = degree[t] ?? 1
    ends[k * 2] = s
    ends[k * 2 + 1] = t
    stiffness[k] = 1 / Math.min(ds, dt)
    share[k] = dt / (ds + dt)
    rest[k] = edgeLength + (radius[s] ?? 0) + (radius[t] ?? 0)
    k++
  }
  return { count, ends, stiffness, share, rest }
}

export class ForceSimulation {
  readonly x: Float64Array
  readonly y: Float64Array
  readonly tree: GroupTree | null
  readonly #vx: Float64Array
  readonly #vy: Float64Array
  readonly #fixed: Uint8Array
  readonly #groups: GroupForces | null
  readonly #lift: Int32Array | null
  readonly #nodes: Uint32Array
  readonly #movers: Uint32Array
  readonly #springs: Springs
  readonly #repulsion: number
  readonly #gravity: number
  readonly #centerX: number
  readonly #centerY: number
  readonly #cooling: Cooling
  readonly #tree = new BarnesHut()
  readonly #collider: Collider
  readonly #jiggle: () => number

  constructor(graph: ForceGraph, settings: ForceSettings) {
    const capacity = graph.capacity
    this.x = new Float64Array(capacity)
    this.y = new Float64Array(capacity)
    this.#vx = new Float64Array(capacity)
    this.#vy = new Float64Array(capacity)
    this.#fixed = new Uint8Array(capacity).fill(1)
    const nodes: number[] = []
    const movers: number[] = []
    let sumX = 0
    let sumY = 0
    for (let i = 0; i < capacity; i++) {
      const px = graph.xy[i * 2] ?? 0
      const py = graph.xy[i * 2 + 1] ?? 0
      this.x[i] = px
      this.y[i] = py
      if (graph.alive[i] !== 1) continue
      nodes.push(i)
      if (graph.movable[i] !== 1) continue
      movers.push(i)
      this.#fixed[i] = 0
      sumX += px
      sumY += py
    }
    this.#nodes = Uint32Array.from(nodes)
    this.#movers = Uint32Array.from(movers)
    const partial = movers.length < nodes.length
    const start = movers.length === 0 ? 0 : partial ? partialAlpha : 1
    this.#cooling = new Cooling(start, settings.steps)
    this.#repulsion = settings.repulsion
    this.#gravity = partial ? 0 : settings.gravity
    this.#centerX = movers.length > 0 ? sumX / movers.length : 0
    this.#centerY = movers.length > 0 ? sumY / movers.length : 0
    this.#springs = springsOf(graph, settings.edgeLength)
    this.#collider = new Collider(graph.radius, this.#nodes, settings.spacing)
    this.#jiggle = jitterOf(xorshift32(), jitterScale)
    this.tree = groupTree(capacity, graph.alive, graph.groups)
    this.#groups = this.tree
      ? new GroupForces(
          this.tree,
          graph.alive,
          graph.movable,
          graph.radius,
          settings.cohesion,
          settings.groupSpacing,
          settings.edgeLength,
        )
      : null
    this.#lift =
      this.tree && this.#groups
        ? liftOf(this.tree, this.#groups.rigid, this.#springs.ends, this.#springs.count)
        : null
  }

  get fixed(): Uint8Array {
    return this.#fixed
  }

  get alpha(): number {
    return this.#cooling.alpha
  }

  get done(): boolean {
    return this.#cooling.done
  }

  get progress(): number {
    return this.#cooling.progress
  }

  pin(index: number, x: number, y: number): void {
    if (index < 0 || index >= this.x.length) return
    this.#fixed[index] = 1
    this.x[index] = x
    this.y[index] = y
    this.#vx[index] = 0
    this.#vy[index] = 0
  }

  step(): void {
    if (this.done) return
    const alpha = this.#cooling.alpha
    this.#stretch(alpha)
    this.#repel(alpha)
    this.#attract(alpha)
    this.#groups?.apply(alpha, this.x, this.y, this.#vx, this.#vy, this.#fixed)
    this.#damp()
    this.#collider.apply(
      this.#nodes,
      this.#fixed,
      this.x,
      this.y,
      this.#vx,
      this.#vy,
      collisionStiffness,
      this.#jiggle,
    )
    this.#advance()
    this.#cooling.advance()
  }

  write(target: Float32Array): void {
    const limit = Math.min(this.x.length, target.length >> 1)
    for (let i = 0; i < limit; i++) {
      target[i * 2] = this.x[i] ?? 0
      target[i * 2 + 1] = this.y[i] ?? 0
    }
  }

  #stretch(alpha: number): void {
    const { count, ends, stiffness, share, rest } = this.#springs
    const { x, y } = this
    const vx = this.#vx
    const vy = this.#vy
    const fixed = this.#fixed
    const lift = this.#lift
    const lifted = this.#groups?.pull
    for (let k = 0; k < count; k++) {
      const s = ends[k * 2] ?? 0
      const t = ends[k * 2 + 1] ?? 0
      const fs = fixed[s] === 1
      const ft = fixed[t] === 1
      if (fs && ft) continue
      let dx = (x[t] ?? 0) + (vx[t] ?? 0) - (x[s] ?? 0) - (vx[s] ?? 0)
      let dy = (y[t] ?? 0) + (vy[t] ?? 0) - (y[s] ?? 0) - (vy[s] ?? 0)
      let length = Math.sqrt(dx * dx + dy * dy)
      if (length === 0) {
        dx = this.#jiggle()
        dy = this.#jiggle()
        length = Math.sqrt(dx * dx + dy * dy)
        if (length === 0) continue
      }
      const pull = ((length - (rest[k] ?? 0)) / length) * alpha * (stiffness[k] ?? 0)
      const ws = share[k] ?? 0.5
      const ls = lift ? (lift[k * 2] ?? -1) : -1
      const lt = lift ? (lift[k * 2 + 1] ?? -1) : -1
      if (ls >= 0 && lifted && !fs) {
        lifted[ls * 2] = (lifted[ls * 2] ?? 0) + dx * pull * ws
        lifted[ls * 2 + 1] = (lifted[ls * 2 + 1] ?? 0) + dy * pull * ws
      } else if (!fs) {
        vx[s] = (vx[s] ?? 0) + dx * pull * ws
        vy[s] = (vy[s] ?? 0) + dy * pull * ws
      }
      if (lt >= 0 && lifted && !ft) {
        lifted[lt * 2] = (lifted[lt * 2] ?? 0) - dx * pull * (1 - ws)
        lifted[lt * 2 + 1] = (lifted[lt * 2 + 1] ?? 0) - dy * pull * (1 - ws)
      } else if (!ft) {
        vx[t] = (vx[t] ?? 0) - dx * pull * (1 - ws)
        vy[t] = (vy[t] ?? 0) - dy * pull * (1 - ws)
      }
    }
  }

  #repel(alpha: number): void {
    const strength = -this.#repulsion * alpha
    if (strength === 0) return
    this.#tree.build(this.#nodes, this.x, this.y)
    for (const i of this.#movers) {
      if (this.#fixed[i] === 1) continue
      this.#tree.apply(i, this.x, this.y, strength, this.#jiggle, this.#vx, this.#vy)
    }
  }

  #attract(alpha: number): void {
    const pull = this.#gravity * alpha
    if (pull === 0) return
    for (const i of this.#movers) {
      if (this.#fixed[i] === 1) continue
      this.#vx[i] = (this.#vx[i] ?? 0) + (this.#centerX - (this.x[i] ?? 0)) * pull
      this.#vy[i] = (this.#vy[i] ?? 0) + (this.#centerY - (this.y[i] ?? 0)) * pull
    }
  }

  #damp(): void {
    for (const i of this.#movers) {
      this.#vx[i] = (this.#vx[i] ?? 0) * retention
      this.#vy[i] = (this.#vy[i] ?? 0) * retention
    }
  }

  #advance(): void {
    for (const i of this.#movers) {
      if (this.#fixed[i] === 1) continue
      this.x[i] = (this.x[i] ?? 0) + (this.#vx[i] ?? 0)
      this.y[i] = (this.y[i] ?? 0) + (this.#vy[i] ?? 0)
    }
  }
}
