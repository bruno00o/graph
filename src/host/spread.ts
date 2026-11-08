import { containerShape, type NodeColumns } from '../core/columns'
import { type GlobeCamera, globeScale } from '../core/globe'
import type { GraphChanges } from '../core/graph-model'
import type { Hierarchy } from '../core/hierarchy'
import { boundingRadius } from '../core/node-shape'
import type { PositionReader, Positions } from '../core/positions'
import type { ProjectionChanges } from '../core/projection'
import { type Packing, packMembers, spreadStep, stepZoom } from '../core/spread'
import { easeInOut } from '../core/view'

export const perFrameLimit = 20_000
const shownDrift = 0.25
const repackBudget = 4
const viewSlack = 0.25
const zoomTolerance = 1e-9
const globeTolerance = 1e-6
const none = -1

export interface SpreadCamera {
  readonly zoom: number
  readonly globe: GlobeCamera | null
  readonly width: number
  readonly height: number
}

export interface SpreadSource {
  readonly nodes: NodeColumns
  readonly hierarchy: Hierarchy
  readonly positions: Positions
  readonly containers: ReadonlySet<number>
  eligible(index: number): boolean
  settled(): PositionReader
  claim(index: number): void
  camera(): SpreadCamera
  duration(): number
}

function grownInt(array: Int32Array, length: number): Int32Array {
  if (array.length >= length) return array
  const next = new Int32Array(Math.max(64, array.length * 2, length)).fill(none)
  next.set(array)
  return next
}

function grownFloat(array: Float64Array, length: number): Float64Array {
  if (array.length >= length) return array
  const next = new Float64Array(Math.max(64, array.length * 2, length))
  next.set(array)
  return next
}

function grownByte(array: Uint8Array, length: number): Uint8Array {
  if (array.length >= length) return array
  const next = new Uint8Array(Math.max(64, array.length * 2, length))
  next.set(array)
  return next
}

function reachLimit(camera: SpreadCamera): number {
  const side = Math.min(camera.width, camera.height)
  return side > 0 ? side / 2 : Number.POSITIVE_INFINITY
}

function oversized(packing: Packing, radius: Float64Array, limit: number): Uint8Array | null {
  if (limit === Number.POSITIVE_INFINITY) return null
  const reach = new Float64Array(packing.packs)
  packing.packOf.forEach((id, at) => {
    if (id < 0 || (packing.size[id] ?? 0) < 2) return
    const out = Math.hypot(packing.offsetX[at] ?? 0, packing.offsetY[at] ?? 0) + (radius[at] ?? 0)
    reach[id] = Math.max(reach[id] ?? 0, out)
  })
  let wide: Uint8Array | null = null
  reach.forEach((value, id) => {
    if (value <= limit) return
    wide ??= new Uint8Array(packing.packs)
    wide[id] = 1
  })
  return wide
}

function relativeChange(a: number, b: number): number {
  if (a === b) return 0
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE)
}

export class SpreadHost {
  readonly #source: SpreadSource
  #slotOf: Int32Array = new Int32Array(0)
  #holder: Int32Array = new Int32Array(0)
  #detached: Uint8Array = new Uint8Array(0)
  #seen: Uint32Array = new Uint32Array(0)
  #stamp = 0
  #count = 0
  #index: Int32Array = new Int32Array(0)
  #baseX: Float64Array = new Float64Array(0)
  #baseY: Float64Array = new Float64Array(0)
  #anchorX: Float64Array = new Float64Array(0)
  #anchorY: Float64Array = new Float64Array(0)
  #offsetX: Float64Array = new Float64Array(0)
  #offsetY: Float64Array = new Float64Array(0)
  #fromX: Float64Array = new Float64Array(0)
  #fromY: Float64Array = new Float64Array(0)
  #stepScale: Float64Array = new Float64Array(0)
  #screen: Uint8Array = new Uint8Array(0)
  #screenSlots = 0
  readonly #members = new Map<number, Int32Array>()
  readonly #screens = new Set<number>()
  readonly #dirty = new Set<number>()
  #step: number | null = null
  #start = 0
  #duration = 0
  #moving = false
  #rewrote = false
  #limit = Number.NaN
  #zoom = Number.NaN
  #globeScale = Number.NaN
  #globeMix = Number.NaN

  constructor(source: SpreadSource) {
    this.#source = source
  }

  get moving(): boolean {
    return this.#moving
  }

  get writing(): boolean {
    return this.#moving || this.#rewrote || this.#dirty.size > 0
  }

  owns(index: number): boolean {
    return (this.#slotOf[index] ?? none) >= 0
  }

  release(groups: readonly number[]): void {
    for (const group of groups) {
      const slot = this.#slotOf[group] ?? none
      if (slot < 0) continue
      this.#source.positions.set(group, this.#baseX[slot] ?? 0, this.#baseY[slot] ?? 0)
      this.#free(slot)
    }
  }

  changed(changes: GraphChanges, projected: ProjectionChanges, now: number): void {
    const { nodes, hierarchy, containers, positions } = this.#source
    if (containers.size === 0 && this.#members.size === 0 && this.#count === 0) {
      for (const { index } of changes.nodes.removed) this.attach(index)
      return
    }
    this.#reserve(Math.max(nodes.capacity, positions.capacity, hierarchy.capacity))
    for (const { index } of changes.nodes.removed) {
      const slot = this.#slotOf[index] ?? none
      if (slot >= 0) this.#free(slot)
      this.#detached[index] = 0
      this.#forget(index)
      if (this.#members.has(index)) this.#dirty.add(index)
    }
    for (const group of projected.folded) {
      hierarchy.forEachDescendant(group, (index) => {
        this.#detached[index] = 0
      })
      this.#dirty.add(group)
      this.#touchParent(group)
    }
    for (const { index } of projected.scene.nodes.removed) {
      const slot = this.#slotOf[index] ?? none
      if (slot >= 0) {
        positions.set(index, this.#baseX[slot] ?? 0, this.#baseY[slot] ?? 0)
        this.#free(slot)
      }
      this.#forget(index)
    }
    for (const group of projected.unfolded) {
      this.#dirty.add(group)
      this.#touchParent(group)
    }
    for (const { index } of projected.scene.nodes.added) this.#touch(index)
    for (const { index } of projected.scene.nodes.updated) this.#touch(index)
    if (projected.containers) {
      for (const container of containers) {
        if (!this.#members.has(container) && nodes.spread[container] === 1) {
          this.#dirty.add(container)
        }
      }
      for (const container of this.#members.keys()) {
        if (!containers.has(container)) this.#dirty.add(container)
      }
    }
    this.settle(now)
  }

  settle(now: number, budget: number = Number.POSITIVE_INFINITY): void {
    if (this.#dirty.size === 0) return
    this.#freeze(now)
    const settled = this.#source.settled()
    const camera = this.#source.camera()
    this.#limit = reachLimit(camera)
    const aimed: number[] = []
    const started = performance.now()
    for (const container of this.#dirty) {
      this.#dirty.delete(container)
      this.#pack(container, settled, camera, aimed)
      if (performance.now() - started > budget) break
    }
    this.#countScreens()
    for (const index of aimed) this.#aim(index, camera)
    this.#begin(now, camera)
  }

  detach(index: number): void {
    if (index >= this.#holder.length) return
    const holder = this.#holder[index] ?? none
    const slot = this.#slotOf[index] ?? none
    if (holder < 0 && slot < 0) return
    this.#detached[index] = 1
    if (slot >= 0) this.#free(slot)
    if (holder >= 0) this.#dirty.add(holder)
  }

  attach(index: number): void {
    if (index < this.#detached.length) this.#detached[index] = 0
  }

  carry(index: number, dx: number, dy: number): void {
    const slot = this.#slotOf[index] ?? none
    if (slot < 0) return
    this.#baseX[slot] = (this.#baseX[slot] ?? 0) + dx
    this.#baseY[slot] = (this.#baseY[slot] ?? 0) + dy
    this.#anchorX[slot] = (this.#anchorX[slot] ?? 0) + dx
    this.#anchorY[slot] = (this.#anchorY[slot] ?? 0) + dy
  }

  moveBase(index: number, x: number, y: number): boolean {
    const slot = this.#slotOf[index] ?? none
    if (slot < 0) return false
    this.#baseX[slot] = x
    this.#baseY[slot] = y
    const holder = this.#holder[index] ?? none
    if (holder >= 0) {
      this.#dirty.add(holder)
      return true
    }
    this.#fromX[slot] = (this.#fromX[slot] ?? 0) + (this.#anchorX[slot] ?? 0) - x
    this.#fromY[slot] = (this.#fromY[slot] ?? 0) + (this.#anchorY[slot] ?? 0) - y
    this.#anchorX[slot] = x
    this.#anchorY[slot] = y
    return true
  }

  frame(now: number): boolean {
    this.#rewrote = false
    if (this.#count === 0 && this.#screens.size === 0 && this.#dirty.size === 0) return false
    const camera = this.#source.camera()
    if (this.#screens.size > 0) {
      const step = spreadStep(camera.zoom, this.#step)
      const limit = reachLimit(camera)
      if (step !== this.#step || this.#resized(limit)) {
        this.#step = step
        for (const container of this.#screens) this.#dirty.add(container)
      }
    }
    if (this.#dirty.size > 0) {
      this.settle(now, repackBudget)
      this.#rewrote = true
      return this.#moving || this.#dirty.size > 0
    }
    if (this.#moving) this.#write(now, camera, false)
    else if (this.#rescaled(camera)) {
      this.#write(now, camera, true)
      this.#rewrote = true
    }
    return this.#moving
  }

  goals(visit: (index: number, x: number, y: number) => void): void {
    if (!this.#moving) return
    const camera = this.#source.camera()
    for (let slot = 0; slot < this.#count; slot++) {
      const scale = this.#scaleOf(slot, camera)
      visit(
        this.#index[slot] ?? 0,
        (this.#anchorX[slot] ?? 0) + (this.#offsetX[slot] ?? 0) / scale,
        (this.#anchorY[slot] ?? 0) + (this.#offsetY[slot] ?? 0) / scale,
      )
    }
  }

  #reserve(capacity: number): void {
    if (this.#slotOf.length >= capacity) return
    this.#slotOf = grownInt(this.#slotOf, capacity)
    this.#holder = grownInt(this.#holder, capacity)
    this.#detached = grownByte(this.#detached, capacity)
    const seen = new Uint32Array(this.#slotOf.length)
    seen.set(this.#seen)
    this.#seen = seen
  }

  #forget(index: number): void {
    const holder = this.#holder[index] ?? none
    if (holder < 0) return
    this.#holder[index] = none
    this.#dirty.add(holder)
  }

  #touchParent(index: number): void {
    const parent = this.#source.hierarchy.parent[index] ?? none
    if (parent >= 0 && this.#source.containers.has(parent)) this.#dirty.add(parent)
  }

  #touch(index: number): void {
    const { containers, hierarchy } = this.#source
    if (containers.has(index)) this.#dirty.add(index)
    const parent = hierarchy.parent[index] ?? none
    if (parent >= 0 && containers.has(parent)) this.#dirty.add(parent)
    const holder = this.#holder[index] ?? none
    if (holder >= 0 && holder !== parent) this.#dirty.add(holder)
  }

  #take(index: number): number {
    const slot = this.#count++
    if (this.#index.length <= slot) {
      const length = Math.max(64, this.#index.length * 2)
      const index = new Int32Array(length)
      index.set(this.#index)
      this.#index = index
      this.#baseX = grownFloat(this.#baseX, length)
      this.#baseY = grownFloat(this.#baseY, length)
      this.#anchorX = grownFloat(this.#anchorX, length)
      this.#anchorY = grownFloat(this.#anchorY, length)
      this.#offsetX = grownFloat(this.#offsetX, length)
      this.#offsetY = grownFloat(this.#offsetY, length)
      this.#fromX = grownFloat(this.#fromX, length)
      this.#fromY = grownFloat(this.#fromY, length)
      this.#stepScale = grownFloat(this.#stepScale, length)
      this.#screen = grownByte(this.#screen, length)
    }
    this.#index[slot] = index
    this.#slotOf[index] = slot
    this.#offsetX[slot] = 0
    this.#offsetY[slot] = 0
    this.#fromX[slot] = 0
    this.#fromY[slot] = 0
    this.#screen[slot] = 0
    this.#stepScale[slot] = 1
    return slot
  }

  #free(slot: number): void {
    const index = this.#index[slot] ?? 0
    this.#slotOf[index] = none
    const last = --this.#count
    if (slot === last) return
    const moved = this.#index[last] ?? 0
    this.#index[slot] = moved
    this.#slotOf[moved] = slot
    this.#baseX[slot] = this.#baseX[last] ?? 0
    this.#baseY[slot] = this.#baseY[last] ?? 0
    this.#anchorX[slot] = this.#anchorX[last] ?? 0
    this.#anchorY[slot] = this.#anchorY[last] ?? 0
    this.#offsetX[slot] = this.#offsetX[last] ?? 0
    this.#offsetY[slot] = this.#offsetY[last] ?? 0
    this.#fromX[slot] = this.#fromX[last] ?? 0
    this.#fromY[slot] = this.#fromY[last] ?? 0
    this.#stepScale[slot] = this.#stepScale[last] ?? 1
    this.#screen[slot] = this.#screen[last] ?? 0
  }

  #scaleAt(camera: SpreadCamera, zoom: number, y: number): number {
    const globe = camera.globe
    if (!globe) return zoom
    const scale = (globeScale(globe, y) * zoom) / globe.view.zoom
    return scale > 0 && Number.isFinite(scale) ? scale : zoom
  }

  #scaleOf(slot: number, camera: SpreadCamera): number {
    if (this.#screen[slot] !== 1) return 1
    if (this.#screenSlots > perFrameLimit) return this.#stepScale[slot] ?? 1
    return this.#scaleAt(camera, camera.zoom, this.#anchorY[slot] ?? 0)
  }

  #resized(limit: number): boolean {
    if (limit === this.#limit) return false
    if (!Number.isFinite(limit) || !Number.isFinite(this.#limit)) return true
    return relativeChange(limit, this.#limit) > viewSlack
  }

  #rescaled(camera: SpreadCamera): boolean {
    const globe = camera.globe
    const zoomChanged = relativeChange(camera.zoom, this.#zoom) > zoomTolerance
    const globeChanged = globe
      ? relativeChange(globe.scale, this.#globeScale) > globeTolerance ||
        globe.mix !== this.#globeMix
      : !Number.isNaN(this.#globeMix)
    if (!zoomChanged && !globeChanged) return false
    this.#zoom = camera.zoom
    this.#globeScale = globe ? globe.scale : Number.NaN
    this.#globeMix = globe ? globe.mix : Number.NaN
    return this.#screenSlots > 0 && this.#screenSlots <= perFrameLimit
  }

  #pack(container: number, settled: PositionReader, camera: SpreadCamera, aimed: number[]): void {
    const { nodes, hierarchy, containers } = this.#source
    const previous = this.#members.get(container)
    const stamp = ++this.#stamp
    const live =
      containers.has(container) &&
      nodes.alive[container] === 1 &&
      nodes.shape[container] === containerShape &&
      nodes.spread[container] === 1
    const list: number[] = []
    let screen = false
    if (live) {
      for (
        let child = hierarchy.firstChild[container] ?? none;
        child >= 0;
        child = hierarchy.nextSibling[child] ?? none
      ) {
        if (nodes.alive[child] !== 1 || nodes.shape[child] === containerShape) continue
        if (this.#detached[child] === 1 || !this.#source.eligible(child)) continue
        list.push(child)
        this.#seen[child] = stamp
        if (nodes.screenUnits[child] === 1) screen = true
      }
      list.reverse()
    }
    if (previous) {
      for (const index of previous) {
        if (this.#seen[index] !== stamp) this.#leave(index, container)
      }
    }
    if (!live || list.length === 0) {
      this.#members.delete(container)
      this.#screens.delete(container)
      return
    }
    if (screen) this.#step ??= spreadStep(camera.zoom, null)
    const zoom = stepZoom(this.#step ?? 0)
    const count = list.length
    const x = new Float64Array(count)
    const y = new Float64Array(count)
    const radius = new Float64Array(count)
    const scale = new Float64Array(count)
    list.forEach((index, at) => {
      const slot = this.#slotOf[index] ?? none
      const by = slot >= 0 ? (this.#baseY[slot] ?? 0) : settled.y(index)
      x[at] = slot >= 0 ? (this.#baseX[slot] ?? 0) : settled.x(index)
      y[at] = by
      const s = screen ? this.#scaleAt(camera, zoom, by) : 1
      const r = boundingRadius(nodes, index)
      scale[at] = s
      radius[at] = !screen
        ? r
        : nodes.screenUnits[index] === 1
          ? r + (nodes.outlineWidth[index] ?? 0)
          : r * s
    })
    const input = { count, x, y, radius, scale, gap: nodes.gap[container] ?? 0 }
    const joined = packMembers(input)
    const wide = screen ? oversized(joined, radius, this.#limit) : null
    const apart = wide ? packMembers(input, 0, false) : null
    list.forEach((index, at) => {
      this.#holder[index] = container
      const whole = joined.packOf[at] ?? none
      const packing = apart && whole >= 0 && wide?.[whole] === 1 ? apart : joined
      const id = packing.packOf[at] ?? none
      let slot = this.#slotOf[index] ?? none
      const size = id >= 0 ? (packing.size[id] ?? 1) : 0
      if (size < 2 && slot < 0) return
      if (slot < 0) {
        slot = this.#take(index)
        this.#baseX[slot] = x[at] ?? 0
        this.#baseY[slot] = y[at] ?? 0
        this.#source.claim(index)
      }
      const packed = size >= 2
      this.#anchorX[slot] = packed ? (packing.anchorX[id] ?? 0) : (this.#baseX[slot] ?? 0)
      this.#anchorY[slot] = packed ? (packing.anchorY[id] ?? 0) : (this.#baseY[slot] ?? 0)
      this.#offsetX[slot] = packed ? (packing.offsetX[at] ?? 0) : 0
      this.#offsetY[slot] = packed ? (packing.offsetY[at] ?? 0) : 0
      this.#screen[slot] = screen && packed ? 1 : 0
      this.#stepScale[slot] = screen ? this.#scaleAt(camera, zoom, this.#anchorY[slot] ?? 0) : 1
      aimed.push(index)
    })
    this.#members.set(container, Int32Array.from(list))
    if (screen) this.#screens.add(container)
    else this.#screens.delete(container)
  }

  #leave(index: number, container: number): void {
    if (this.#holder[index] !== container) return
    this.#holder[index] = none
    const slot = this.#slotOf[index] ?? none
    if (slot < 0) return
    const { nodes, positions } = this.#source
    if (nodes.alive[index] !== 1) {
      positions.set(index, this.#baseX[slot] ?? 0, this.#baseY[slot] ?? 0)
      this.#free(slot)
      return
    }
    this.#anchorX[slot] = this.#baseX[slot] ?? 0
    this.#anchorY[slot] = this.#baseY[slot] ?? 0
    this.#offsetX[slot] = 0
    this.#offsetY[slot] = 0
    this.#screen[slot] = 0
    this.#stepScale[slot] = 1
    this.#fromX[slot] = positions.x(index) - (this.#anchorX[slot] ?? 0)
    this.#fromY[slot] = positions.y(index) - (this.#anchorY[slot] ?? 0)
  }

  #aim(index: number, camera: SpreadCamera): void {
    const slot = this.#slotOf[index] ?? none
    if (slot < 0) return
    const positions = this.#source.positions
    const scale = this.#scaleOf(slot, camera)
    const tx = (this.#anchorX[slot] ?? 0) + (this.#offsetX[slot] ?? 0) / scale
    const ty = (this.#anchorY[slot] ?? 0) + (this.#offsetY[slot] ?? 0) / scale
    this.#fromX[slot] = (positions.x(index) - tx) * scale
    this.#fromY[slot] = (positions.y(index) - ty) * scale
  }

  #freeze(now: number): void {
    if (!this.#moving) return
    const t = this.#duration > 0 ? Math.min(1, (now - this.#start) / this.#duration) : 1
    const keep = 1 - easeInOut(Math.max(0, t))
    for (let slot = 0; slot < this.#count; slot++) {
      this.#fromX[slot] = (this.#fromX[slot] ?? 0) * keep
      this.#fromY[slot] = (this.#fromY[slot] ?? 0) * keep
    }
    this.#moving = false
  }

  #countScreens(): void {
    let screenSlots = 0
    for (let slot = 0; slot < this.#count; slot++) {
      if (this.#screen[slot] === 1) screenSlots++
    }
    this.#screenSlots = screenSlots
  }

  #begin(now: number, camera: SpreadCamera): void {
    let away = false
    for (let slot = 0; slot < this.#count && !away; slot++) {
      if (this.#fromX[slot] !== 0 || this.#fromY[slot] !== 0) away = true
    }
    const duration = away ? this.#source.duration() : 0
    if (duration > 0) {
      this.#moving = true
      this.#start = Math.min(now, performance.now())
      this.#duration = duration
    } else {
      this.#fromX.fill(0, 0, this.#count)
      this.#fromY.fill(0, 0, this.#count)
    }
    this.#zoom = camera.zoom
    this.#globeScale = camera.globe ? camera.globe.scale : Number.NaN
    this.#globeMix = camera.globe ? camera.globe.mix : Number.NaN
    this.#write(now, camera, false)
  }

  #write(now: number, camera: SpreadCamera, loose: boolean): void {
    let keep = 0
    if (this.#moving) {
      const t = this.#duration > 0 ? Math.min(1, (now - this.#start) / this.#duration) : 1
      keep = 1 - easeInOut(Math.max(0, t))
      if (t >= 1) this.#moving = false
    }
    const positions = this.#source.positions
    for (let slot = this.#count - 1; slot >= 0; slot--) {
      const index = this.#index[slot] ?? 0
      const scale = this.#scaleOf(slot, camera)
      const dx = (this.#offsetX[slot] ?? 0) + (this.#fromX[slot] ?? 0) * keep
      const dy = (this.#offsetY[slot] ?? 0) + (this.#fromY[slot] ?? 0) * keep
      const x = (this.#anchorX[slot] ?? 0) + dx / scale
      const y = (this.#anchorY[slot] ?? 0) + dy / scale
      const drift = Math.hypot(x - positions.x(index), y - positions.y(index)) * scale
      if (!(loose && drift < shownDrift) && !positions.holds(index, x, y))
        positions.set(index, x, y)
      if (this.#moving) continue
      this.#fromX[slot] = 0
      this.#fromY[slot] = 0
      if (this.#offsetX[slot] === 0 && this.#offsetY[slot] === 0) this.#free(slot)
    }
  }
}
