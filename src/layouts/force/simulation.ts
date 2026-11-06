import type { LayoutGraph } from '../../types'
import { BarnesHut } from './barnes-hut'

export interface ForceOptions {
  readonly edgeLength?: number
  readonly repulsion?: number
  readonly gravity?: number
  readonly spacing?: number
}

export interface ForceSettings {
  readonly edgeLength: number
  readonly repulsion: number
  readonly gravity: number
  readonly spacing: number
}

export const forceDefaults: ForceSettings = {
  edgeLength: 40,
  repulsion: 80,
  gravity: 0.04,
  spacing: 6,
}

const alphaMin = 0.001
const fullTicks = 300
const cooling = alphaMin ** (1 / fullTicks)
const keep = 0.6
const partialAlpha = 0.5
const collideStrength = 0.7

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

export function resolveForce(options: ForceOptions = {}): ForceSettings {
  return {
    edgeLength: positive(options.edgeLength, forceDefaults.edgeLength),
    repulsion: positive(options.repulsion, forceDefaults.repulsion),
    gravity: positive(options.gravity, forceDefaults.gravity),
    spacing: positive(options.spacing, forceDefaults.spacing),
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
  readonly #radius: Float32Array
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
  readonly #reach: number
  #buckets: Int32Array = new Int32Array(0)
  #items: Uint32Array = new Uint32Array(0)
  #gx: Int32Array = new Int32Array(0)
  #gy: Int32Array = new Int32Array(0)
  #slot: Int32Array = new Int32Array(0)
  #seed = 1

  constructor(graph: LayoutGraph, settings: ForceSettings) {
    const capacity = graph.capacity
    this.#settings = settings
    this.x = new Float64Array(capacity)
    this.y = new Float64Array(capacity)
    this.#vx = new Float64Array(capacity)
    this.#vy = new Float64Array(capacity)
    this.#fixed = new Uint8Array(capacity)
    this.#radius = graph.radius
    const nodes: number[] = []
    const movers: number[] = []
    let sumX = 0
    let sumY = 0
    let reach = 0
    for (let i = 0; i < capacity; i++) {
      this.x[i] = graph.xy[i * 2] ?? 0
      this.y[i] = graph.xy[i * 2 + 1] ?? 0
      if (graph.alive[i] !== 1) continue
      nodes.push(i)
      reach = Math.max(reach, graph.radius[i] ?? 0)
      if (graph.movable[i] === 1) {
        movers.push(i)
        sumX += this.x[i] ?? 0
        sumY += this.y[i] ?? 0
      } else this.#fixed[i] = 1
    }
    this.#nodes = Uint32Array.from(nodes)
    this.#movers = Uint32Array.from(movers)
    this.#reach = reach
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
    this.alpha *= cooling
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
    const spacing = this.#settings.spacing
    const cell = Math.max(2 * this.#reach + spacing, 1)
    const nodes = this.#nodes
    const size = 1 << Math.ceil(Math.log2(Math.max(16, nodes.length * 2)))
    if (this.#buckets.length !== size + 1) this.#buckets = new Int32Array(size + 1)
    else this.#buckets.fill(0)
    if (this.#items.length < nodes.length) this.#items = new Uint32Array(nodes.length)
    if (this.#gx.length < this.x.length) {
      this.#gx = new Int32Array(this.x.length)
      this.#gy = new Int32Array(this.x.length)
      this.#slot = new Int32Array(this.x.length)
    }
    const buckets = this.#buckets
    const items = this.#items
    const gx = this.#gx
    const gy = this.#gy
    const slot = this.#slot
    const { x, y } = this
    const vx = this.#vx
    const vy = this.#vy
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
    const fixed = this.#fixed
    const radius = this.#radius
    const half = spacing / 2
    for (const i of this.#movers) {
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
            if (!jFixed && j < i) continue
            const rj = (radius[j] ?? 0) + half
            const r = ri + rj
            let dx = (x[i] ?? 0) + (vx[i] ?? 0) - (x[j] ?? 0) - (vx[j] ?? 0)
            let dy = (y[i] ?? 0) + (vy[i] ?? 0) - (y[j] ?? 0) - (vy[j] ?? 0)
            let l = dx * dx + dy * dy
            if (l >= r * r) continue
            if (l === 0) {
              dx = this.#jiggle()
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
