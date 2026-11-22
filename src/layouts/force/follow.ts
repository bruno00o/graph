import type { LayoutFollower, LayoutGraph } from '../../types'
import { retention } from './simulation'

const stiffness = 0.5
const anchor = 0.03
const push = 0.5
const halo = 12
const wakePixels = 0.5
const quietPixels = 0.05
const quietSteps = 8
const cap = 5000
const cool = 90
const heldLimit = 600
const rate = 120

const asleep = 0
const moving = 1
const pinned = 2

export class ElasticFollower implements LayoutFollower {
  readonly #graph: LayoutGraph
  readonly #x: Float64Array
  readonly #y: Float64Array
  readonly #homeX: Float64Array
  readonly #homeY: Float64Array
  readonly #vx: Float64Array
  readonly #vy: Float64Array
  readonly #free: Uint8Array
  readonly #role: Uint8Array
  readonly #start: Uint32Array
  readonly #next: Uint32Array
  readonly #mobile: number[] = []
  readonly #pins: number[] = []
  readonly #wake: number
  readonly #quiet: number
  readonly #cell: number
  readonly #mask: number
  readonly #restHead: Int32Array
  readonly #restNext: Int32Array
  readonly #moveHead: Int32Array
  readonly #moveNext: Int32Array
  readonly #used: number[] = []
  #fx = 0
  #fy = 0
  #held = true
  #still = 0
  #heldSteps = 0
  #after = 0
  #stopped = false

  constructor(graph: LayoutGraph, held: readonly number[], pixel: number) {
    this.#graph = graph
    const { capacity, alive, movable, xy, radius, edges } = graph
    this.#wake = wakePixels * pixel
    this.#quiet = quietPixels * pixel
    this.#x = new Float64Array(capacity)
    this.#y = new Float64Array(capacity)
    for (let index = 0; index < capacity; index++) {
      this.#x[index] = xy[index * 2] ?? 0
      this.#y[index] = xy[index * 2 + 1] ?? 0
    }
    this.#homeX = this.#x.slice()
    this.#homeY = this.#y.slice()
    this.#vx = new Float64Array(capacity)
    this.#vy = new Float64Array(capacity)
    this.#free = new Uint8Array(capacity)
    this.#role = new Uint8Array(capacity)
    const degree = new Uint32Array(capacity + 1)
    for (let at = 0; at < edges.length; at += 2) {
      degree[edges[at] ?? 0] = (degree[edges[at] ?? 0] ?? 0) + 1
      degree[edges[at + 1] ?? 0] = (degree[edges[at + 1] ?? 0] ?? 0) + 1
    }
    const start = new Uint32Array(capacity + 1)
    for (let index = 0; index < capacity; index++) {
      start[index + 1] = (start[index] ?? 0) + (degree[index] ?? 0)
    }
    const fill = start.slice(0, capacity)
    const next = new Uint32Array(start[capacity] ?? 0)
    for (let at = 0; at < edges.length; at += 2) {
      const a = edges[at] ?? 0
      const b = edges[at + 1] ?? 0
      next[fill[a] ?? 0] = b
      fill[a] = (fill[a] ?? 0) + 1
      next[fill[b] ?? 0] = a
      fill[b] = (fill[b] ?? 0) + 1
    }
    this.#start = start
    this.#next = next
    let largest = 0
    let count = 0
    for (let index = 0; index < capacity; index++) {
      if (alive[index] !== 1) continue
      count++
      largest = Math.max(largest, radius[index] ?? 0)
      if (movable[index] === 1) this.#free[index] = 1
    }
    this.#cell = 2 * largest + halo
    let size = 64
    while (size < count * 2) size *= 2
    this.#mask = size - 1
    this.#restHead = new Int32Array(size).fill(-1)
    this.#restNext = new Int32Array(capacity).fill(-1)
    this.#moveHead = new Int32Array(size).fill(-1)
    this.#moveNext = new Int32Array(capacity).fill(-1)
    for (let index = 0; index < capacity; index++) {
      if (alive[index] !== 1) continue
      const slot = this.#slotAt(this.#x[index] ?? 0, this.#y[index] ?? 0)
      this.#restNext[index] = this.#restHead[slot] ?? -1
      this.#restHead[slot] = index
    }
    for (const index of held) {
      if (index < 0 || index >= capacity || alive[index] !== 1) continue
      if (this.#role[index] === pinned) continue
      this.#role[index] = pinned
      this.#pins.push(index)
    }
    for (const index of this.#pins) this.#wakeNeighbors(index)
  }

  get moved(): Iterable<number> {
    return this.#mobile
  }

  hold(index: number, x: number, y: number): void {
    if (this.#role[index] !== pinned || !Number.isFinite(x) || !Number.isFinite(y)) return
    if (this.#x[index] === x && this.#y[index] === y) return
    this.#x[index] = x
    this.#y[index] = y
    this.#still = 0
    this.#heldSteps = 0
  }

  release(): void {
    this.#held = false
    this.#still = 0
  }

  stop(): void {
    this.#stopped = true
  }

  step(time: number, until: number): boolean {
    if (this.#stopped) return false
    const wanted = Number.isFinite(time) ? Math.max(1, Math.round((time * rate) / 1000)) : -1
    for (let steps = 0; wanted < 0 || steps < wanted; steps++) {
      if (!this.#moving()) break
      this.#advance()
      if (performance.now() >= until) break
    }
    this.#write()
    return this.#moving()
  }

  #moving(): boolean {
    if (this.#stopped || this.#still >= quietSteps) return false
    if (this.#held) return this.#heldSteps < heldLimit
    return this.#after < cool
  }

  #write(): void {
    const xy = this.#graph.xy
    for (const index of this.#mobile) {
      xy[index * 2] = this.#x[index] ?? 0
      xy[index * 2 + 1] = this.#y[index] ?? 0
    }
  }

  #advance(): void {
    const x = this.#x
    const y = this.#y
    const homeX = this.#homeX
    const homeY = this.#homeY
    const vx = this.#vx
    const vy = this.#vy
    const role = this.#role
    const radius = this.#graph.radius
    const start = this.#start
    const next = this.#next
    const cell = this.#cell
    const mobile = this.#mobile
    this.#fillMoving()
    const heat = this.#held ? 1 : Math.max(0, 1 - this.#after / cool)
    const count = mobile.length
    for (let m = 0; m < count; m++) {
      const v = mobile[m] ?? 0
      const xv = x[v] ?? 0
      const yv = y[v] ?? 0
      let fx = ((homeX[v] ?? 0) - xv) * anchor
      let fy = ((homeY[v] ?? 0) - yv) * anchor
      const from = start[v] ?? 0
      const to = start[v + 1] ?? 0
      const dv = to - from
      for (let k = from; k < to; k++) {
        const u = next[k] ?? 0
        const dx = (x[u] ?? 0) - xv
        const dy = (y[u] ?? 0) - yv
        const length = Math.sqrt(dx * dx + dy * dy)
        if (length === 0) continue
        const rest = Math.hypot(
          (homeX[u] ?? 0) - (homeX[v] ?? 0),
          (homeY[u] ?? 0) - (homeY[v] ?? 0),
        )
        const du = (start[u + 1] ?? 0) - (start[u] ?? 0)
        const pull = ((length - rest) / length) * (stiffness / Math.min(dv, du)) * (du / (dv + du))
        fx += dx * pull
        fy += dy * pull
      }
      const rv = radius[v] ?? 0
      const cx = Math.floor(xv / cell)
      const cy = Math.floor(yv / cell)
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const slot = this.#slot(cx + ox, cy + oy)
          for (let j = this.#moveHead[slot] ?? -1; j >= 0; j = this.#moveNext[j] ?? -1) {
            if (j !== v && this.#pushOf(v, j, xv, yv, rv)) {
              fx += this.#fx
              fy += this.#fy
            }
          }
          for (let j = this.#restHead[slot] ?? -1; j >= 0; j = this.#restNext[j] ?? -1) {
            if (j === v || role[j] !== asleep) continue
            if (this.#pushOf(v, j, xv, yv, rv)) {
              fx += this.#fx
              fy += this.#fy
              this.#wakeOne(j)
            }
          }
        }
      }
      vx[v] = ((vx[v] ?? 0) + fx * heat) * retention
      vy[v] = ((vy[v] ?? 0) + fy * heat) * retention
    }
    let fastest = 0
    const wake = this.#wake
    for (let m = 0; m < count; m++) {
      const v = mobile[m] ?? 0
      const sx = vx[v] ?? 0
      const sy = vy[v] ?? 0
      x[v] = (x[v] ?? 0) + sx
      y[v] = (y[v] ?? 0) + sy
      fastest = Math.max(fastest, sx * sx + sy * sy)
      const ox = (x[v] ?? 0) - (homeX[v] ?? 0)
      const oy = (y[v] ?? 0) - (homeY[v] ?? 0)
      if (ox * ox + oy * oy > wake * wake) this.#wakeNeighbors(v)
    }
    for (const p of this.#pins) {
      const cx = Math.floor((x[p] ?? 0) / cell)
      const cy = Math.floor((y[p] ?? 0) / cell)
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const slot = this.#slot(cx + ox, cy + oy)
          for (let j = this.#restHead[slot] ?? -1; j >= 0; j = this.#restNext[j] ?? -1) {
            if (role[j] !== asleep) continue
            if (this.#pushOf(j, p, x[j] ?? 0, y[j] ?? 0, radius[j] ?? 0)) this.#wakeOne(j)
          }
        }
      }
    }
    if (this.#held) this.#heldSteps++
    else this.#after++
    this.#still = Math.sqrt(fastest) < this.#quiet ? this.#still + 1 : 0
  }

  #pushOf(v: number, j: number, xv: number, yv: number, rv: number): boolean {
    const dx = xv - (this.#x[j] ?? 0)
    const dy = yv - (this.#y[j] ?? 0)
    const reach = rv + (this.#graph.radius[j] ?? 0) + halo
    const d2 = dx * dx + dy * dy
    if (d2 >= reach * reach || d2 === 0) return false
    const home = Math.hypot(
      (this.#homeX[v] ?? 0) - (this.#homeX[j] ?? 0),
      (this.#homeY[v] ?? 0) - (this.#homeY[j] ?? 0),
    )
    const limit = Math.min(reach, home)
    if (d2 >= limit * limit) return false
    const d = Math.sqrt(d2)
    const force = ((limit - d) / d) * push
    this.#fx = dx * force
    this.#fy = dy * force
    return true
  }

  #wakeOne(index: number): void {
    if (this.#role[index] !== asleep || this.#free[index] !== 1) return
    if (this.#mobile.length >= cap) return
    this.#role[index] = moving
    this.#mobile.push(index)
    this.#still = 0
  }

  #wakeNeighbors(index: number): void {
    const to = this.#start[index + 1] ?? 0
    for (let k = this.#start[index] ?? 0; k < to; k++) this.#wakeOne(this.#next[k] ?? 0)
  }

  #fillMoving(): void {
    for (const slot of this.#used) this.#moveHead[slot] = -1
    this.#used.length = 0
    for (const list of [this.#mobile, this.#pins]) {
      for (const v of list) {
        const slot = this.#slotAt(this.#x[v] ?? 0, this.#y[v] ?? 0)
        if (this.#moveHead[slot] === -1) this.#used.push(slot)
        this.#moveNext[v] = this.#moveHead[slot] ?? -1
        this.#moveHead[slot] = v
      }
    }
  }

  #slotAt(px: number, py: number): number {
    return this.#slot(Math.floor(px / this.#cell), Math.floor(py / this.#cell))
  }

  #slot(cx: number, cy: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.#mask
  }
}

export function follow(
  graph: LayoutGraph,
  held: readonly number[],
  pixel: number,
): LayoutFollower | null {
  if (!(pixel > 0) || held.length === 0) return null
  return new ElasticFollower(graph, held, pixel)
}
