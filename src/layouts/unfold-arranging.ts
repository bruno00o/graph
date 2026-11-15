import {
  type ArrangePlan,
  type ArrangeSource,
  sameLayout,
  type UnfoldArranging,
} from '../core/layout-scopes'
import { goldenAngle, placementSpacing } from '../core/positions'

interface Unit {
  readonly index: number
  readonly recorded: boolean
}

export class Arranging implements UnfoldArranging {
  readonly #source: ArrangeSource
  readonly #homes: ReadonlySet<number>
  readonly #opened: ReadonlySet<number>
  readonly #units = new Map<number, Unit[]>()
  readonly #starts = new Map<number, readonly [number, number]>()
  readonly #refs = new Map<number, readonly [number, number]>()
  readonly #valid = new Map<number, boolean>()
  readonly #rings = new Map<number, number>()

  constructor(source: ArrangeSource, homes: ReadonlySet<number>, opened: ReadonlySet<number>) {
    this.#source = source
    this.#homes = homes
    this.#opened = opened
    for (const block of homes) {
      const home = this.#homeOf(block)
      if (home >= 0 && homes.has(home)) this.#unit(home, block, this.#recorded(home, block))
    }
  }

  place(index: number, fresh: boolean): boolean {
    const home = this.#homeOf(index)
    if (home < 0 || !this.#homes.has(home)) return false
    const { positions, projection } = this.#source
    const parent = projection.hierarchy.parent[index] ?? -1
    const at = this.#ref(parent)
    const recorded = this.#recorded(home, index)
    const offset = recorded ? this.#source.arranged.offset(index, parent) : null
    if (offset) {
      this.#starts.set(index, [at[0] + offset[0], at[1] + offset[1]])
    } else if (fresh) {
      const ring = this.#rings.get(parent) ?? 0
      this.#rings.set(parent, ring + 1)
      const radius = placementSpacing * Math.sqrt(ring + 1)
      this.#starts.set(index, [
        at[0] + radius * Math.cos(ring * goldenAngle),
        at[1] + radius * Math.sin(ring * goldenAngle),
      ])
    } else {
      this.#starts.set(index, [positions.x(index), positions.y(index)])
    }
    this.#unit(home, index, recorded)
    return true
  }

  get starts(): ReadonlyMap<number, readonly [number, number]> {
    return this.#starts
  }

  decide(): ArrangePlan {
    const plan: ArrangePlan = { keyed: [], whole: [], growing: [], settled: [] }
    for (const home of this.#homes) {
      if (!this.#homes.has(this.#homeOf(home))) this.#decide(home, false, plan)
    }
    return plan
  }

  #decide(home: number, moved: boolean, plan: ArrangePlan): void {
    const units = this.#units.get(home) ?? []
    const layout = this.#source.arranger(home)
    const recorded = units.filter((unit) => unit.recorded).length
    const whole = units.length > 0 && (layout?.incremental === false || recorded === 0)
    const keyed = !whole && recorded < units.length
    if (whole) {
      plan.whole.push(home)
      this.#center(home)
    }
    for (const unit of units) {
      if (keyed && !unit.recorded) plan.keyed.push(unit.index)
      const runs = whole || (keyed && !unit.recorded)
      const start = this.#starts.get(unit.index)
      if (!start) {
        this.#decide(unit.index, moved || runs, plan)
        continue
      }
      if (moved || runs) plan.growing.push(unit.index)
      else plan.settled.push([unit.index, start[0], start[1]])
    }
  }

  #center(home: number): void {
    const leaves: number[] = []
    const collect = (at: number): void => {
      for (const unit of this.#units.get(at) ?? []) {
        if (this.#starts.has(unit.index)) leaves.push(unit.index)
        else collect(unit.index)
      }
    }
    collect(home)
    if (leaves.length === 0) return
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const index of leaves) {
      const [x, y] = this.#starts.get(index) ?? [0, 0]
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    const [x, y] = this.#ref(home)
    const dx = x - (minX + maxX) / 2
    const dy = y - (minY + maxY) / 2
    for (const index of leaves) {
      const [sx, sy] = this.#starts.get(index) ?? [0, 0]
      this.#starts.set(index, [sx + dx, sy + dy])
    }
  }

  #unit(home: number, index: number, recorded: boolean): void {
    let units = this.#units.get(home)
    if (!units) {
      units = []
      this.#units.set(home, units)
    }
    units.push({ index, recorded })
  }

  #recorded(home: number, index: number): boolean {
    let valid = this.#valid.get(home)
    if (valid === undefined) {
      valid = sameLayout(this.#source.arranged.layout(home), this.#source.arranger(home))
      this.#valid.set(home, valid)
    }
    if (!valid) return false
    const parent = this.#source.projection.hierarchy.parent[index] ?? -1
    return this.#source.arranged.offset(index, parent) !== null
  }

  #homeOf(index: number): number {
    const hierarchy = this.#source.projection.hierarchy
    for (let at = hierarchy.parent[index] ?? -1; at >= 0; at = hierarchy.parent[at] ?? -1) {
      if (this.#source.arranger(at)) return at
    }
    return -1
  }

  #ref(container: number): readonly [number, number] {
    const known = this.#refs.get(container)
    if (known) return known
    const { positions, projection, arranged } = this.#source
    let ref: readonly [number, number] = [positions.x(container), positions.y(container)]
    if (!this.#opened.has(container)) {
      const parent = projection.hierarchy.parent[container] ?? -1
      const offset = arranged.offset(container, parent)
      if (offset) {
        const above = this.#ref(parent)
        ref = [above[0] + offset[0], above[1] + offset[1]]
      }
    }
    this.#refs.set(container, ref)
    return ref
  }
}
