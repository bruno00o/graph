import type { LayoutGraph } from '../../types'
import { BarnesHut } from './barnes-hut'
import { Collider } from './collider'

export type ForceGraph = Omit<LayoutGraph, 'keys' | 'datum'>

export type ForceEngine = 'auto' | 'gpu' | 'cpu'

export interface ForceOptions {
  readonly edgeLength?: number
  readonly repulsion?: number
  readonly gravity?: number
  readonly spacing?: number
  readonly steps?: number
  readonly engine?: ForceEngine
}

export interface ForceSettings {
  readonly edgeLength: number
  readonly repulsion: number
  readonly gravity: number
  readonly spacing: number
  readonly steps: number
  readonly engine: ForceEngine
}

export const forceDefaults: ForceSettings = {
  edgeLength: 40,
  repulsion: 80,
  gravity: 0.04,
  spacing: 6,
  steps: 300,
  engine: 'auto',
}

export const alphaMin = 0.001
export const keep = 0.6
export const partialAlpha = 0.5
const engines: readonly ForceEngine[] = ['auto', 'gpu', 'cpu']

const gpuFrom = 2000

export function prefersGpu(graph: ForceGraph, settings: ForceSettings): boolean {
  if (settings.engine !== 'auto') return settings.engine === 'gpu'
  let alive = 0
  for (const flag of graph.alive) alive += flag
  return alive >= gpuFrom
}

export function coolingOf(steps: number): number {
  return alphaMin ** (1 / steps)
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
    steps: Math.max(1, Math.round(positive(options.steps, forceDefaults.steps))),
    engine: engines.includes(options.engine as ForceEngine)
      ? (options.engine as ForceEngine)
      : forceDefaults.engine,
  }
}

export class ForceSimulation {
  readonly x: Float64Array
  readonly y: Float64Array
  alpha: number
  readonly #start: number
  readonly #vx: Float64Array
  readonly #vy: Float64Array
  readonly #fixed: Uint8Array
  readonly #nodes: Uint32Array
  readonly #movers: Uint32Array
  readonly #edges: Uint32Array
  readonly #strength: Float64Array
  readonly #bias: Float64Array
  readonly #length: Float64Array
  readonly #settings: ForceSettings
  readonly #centerX: number
  readonly #centerY: number
  readonly #gravity: number
  readonly #tree = new BarnesHut()
  readonly #collider: Collider
  readonly #cooling: number
  #seed = 1

  constructor(graph: ForceGraph, settings: ForceSettings) {
    const capacity = graph.capacity
    this.#settings = settings
    this.x = new Float64Array(capacity)
    this.y = new Float64Array(capacity)
    this.#vx = new Float64Array(capacity)
    this.#vy = new Float64Array(capacity)
    this.#fixed = new Uint8Array(capacity)
    const nodes: number[] = []
    const movers: number[] = []
    let sumX = 0
    let sumY = 0
    for (let i = 0; i < capacity; i++) {
      this.x[i] = graph.xy[i * 2] ?? 0
      this.y[i] = graph.xy[i * 2 + 1] ?? 0
      if (graph.alive[i] !== 1) continue
      nodes.push(i)
      if (graph.movable[i] === 1) {
        movers.push(i)
        sumX += this.x[i] ?? 0
        sumY += this.y[i] ?? 0
      } else this.#fixed[i] = 1
    }
    this.#nodes = Uint32Array.from(nodes)
    this.#movers = Uint32Array.from(movers)
    this.#collider = new Collider(graph.radius, this.#nodes, settings.spacing)
    this.#cooling = coolingOf(settings.steps)
    const partial = movers.length < nodes.length
    this.#start = partial ? partialAlpha : 1
    this.alpha = movers.length === 0 ? 0 : this.#start
    this.#gravity = partial ? 0 : settings.gravity
    this.#centerX = movers.length > 0 ? sumX / movers.length : 0
    this.#centerY = movers.length > 0 ? sumY / movers.length : 0
    const degree = new Uint32Array(capacity)
    const edges: number[] = []
    for (let e = 0; e + 1 < graph.edges.length; e += 2) {
      const s = graph.edges[e] ?? 0
      const t = graph.edges[e + 1] ?? 0
      if (s === t || graph.alive[s] !== 1 || graph.alive[t] !== 1) continue
      edges.push(s, t)
      degree[s] = (degree[s] ?? 0) + 1
      degree[t] = (degree[t] ?? 0) + 1
    }
    this.#edges = Uint32Array.from(edges)
    const count = edges.length / 2
    this.#strength = new Float64Array(count)
    this.#bias = new Float64Array(count)
    this.#length = new Float64Array(count)
    for (let e = 0; e < count; e++) {
      const s = edges[e * 2] ?? 0
      const t = edges[e * 2 + 1] ?? 0
      const ds = degree[s] ?? 1
      const dt = degree[t] ?? 1
      this.#strength[e] = 1 / Math.min(ds, dt)
      this.#bias[e] = ds / (ds + dt)
      this.#length[e] = settings.edgeLength + (graph.radius[s] ?? 0) + (graph.radius[t] ?? 0)
    }
  }

  get done(): boolean {
    return this.alpha < alphaMin
  }

  get progress(): number {
    if (this.alpha <= 0) return 1
    const value = Math.log(this.alpha / this.#start) / Math.log(alphaMin / this.#start)
    return Math.min(1, Math.max(0, value))
  }

  pin(index: number, x: number, y: number): void {
    if (index >= this.x.length) return
    this.#fixed[index] = 1
    this.x[index] = x
    this.y[index] = y
    this.#vx[index] = 0
    this.#vy[index] = 0
  }

  step(): void {
    if (this.done) return
    this.alpha *= this.#cooling
    const alpha = this.alpha
    this.#link(alpha)
    this.#repel(alpha)
    this.#pull(alpha)
    this.#collide()
    const fixed = this.#fixed
    for (const i of this.#movers) {
      if (fixed[i] === 1) continue
      const vx = (this.#vx[i] ?? 0) * keep
      const vy = (this.#vy[i] ?? 0) * keep
      this.#vx[i] = vx
      this.#vy[i] = vy
      this.x[i] = (this.x[i] ?? 0) + vx
      this.y[i] = (this.y[i] ?? 0) + vy
    }
  }

  write(target: Float32Array): void {
    for (let i = 0; i < this.x.length; i++) {
      target[i * 2] = this.x[i] ?? 0
      target[i * 2 + 1] = this.y[i] ?? 0
    }
  }

  #jiggle = (): number => {
    this.#seed = (this.#seed * 1664525 + 1013904223) >>> 0
    return (this.#seed / 4294967296 - 0.5) * 1e-6
  }

  #link(alpha: number): void {
    const { x, y } = this
    const vx = this.#vx
    const vy = this.#vy
    const fixed = this.#fixed
    const edges = this.#edges
    for (let e = 0; e < this.#length.length; e++) {
      const s = edges[e * 2] ?? 0
      const t = edges[e * 2 + 1] ?? 0
      const sFixed = fixed[s] === 1
      const tFixed = fixed[t] === 1
      if (sFixed && tFixed) continue
      let dx = (x[t] ?? 0) + (vx[t] ?? 0) - (x[s] ?? 0) - (vx[s] ?? 0)
      let dy = (y[t] ?? 0) + (vy[t] ?? 0) - (y[s] ?? 0) - (vy[s] ?? 0)
      if (dx === 0 && dy === 0) dx = this.#jiggle()
      const l = Math.sqrt(dx * dx + dy * dy)
      const f = ((l - (this.#length[e] ?? 0)) / l) * alpha * (this.#strength[e] ?? 0)
      dx *= f
      dy *= f
      const bias = sFixed ? 1 : tFixed ? 0 : (this.#bias[e] ?? 0.5)
      if (!tFixed) {
        vx[t] = (vx[t] ?? 0) - dx * bias
        vy[t] = (vy[t] ?? 0) - dy * bias
      }
      if (!sFixed) {
        vx[s] = (vx[s] ?? 0) + dx * (1 - bias)
        vy[s] = (vy[s] ?? 0) + dy * (1 - bias)
      }
    }
  }

  #repel(alpha: number): void {
    const strength = -this.#settings.repulsion * alpha
    if (strength === 0) return
    this.#tree.build(this.#nodes, this.x, this.y)
    const fixed = this.#fixed
    for (const i of this.#movers) {
      if (fixed[i] === 1) continue
      this.#tree.apply(i, this.x, this.y, strength, this.#jiggle, this.#vx, this.#vy)
    }
  }

  #pull(alpha: number): void {
    const k = this.#gravity * alpha
    if (k === 0) return
    const fixed = this.#fixed
    for (const i of this.#movers) {
      if (fixed[i] === 1) continue
      this.#vx[i] = (this.#vx[i] ?? 0) + (this.#centerX - (this.x[i] ?? 0)) * k
      this.#vy[i] = (this.#vy[i] ?? 0) + (this.#centerY - (this.y[i] ?? 0)) * k
    }
  }

  #collide(): void {
    this.#collider.apply(
      this.#nodes,
      this.#movers,
      this.#fixed,
      this.x,
      this.y,
      this.#vx,
      this.#vy,
      this.#jiggle,
    )
  }
}
