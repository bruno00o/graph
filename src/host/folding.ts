import { containerShape } from '../core/columns'
import type { GraphChanges, GraphModel } from '../core/graph-model'
import { groupingOf, groupKey } from '../core/group-index'
import { type StringCheck, stringCheck } from '../core/key-list'
import { sameLayout } from '../core/layout-scopes'
import { goldenAngle, type Positions, placementSpacing } from '../core/positions'
import type { Projection, ProjectionChanges } from '../core/projection'
import type { Scene } from '../core/scene'
import type { GraphDefinition, Key, Layout } from '../types'
import type { ArrangedPlaces } from './arranged-places'
import { requestMemory, sameList } from './element-keys'
import type { Emitter, GraphFoldEvent } from './events'
import type { GraphGroups, GraphState } from './graph-instance'
import { isolated } from './isolate'
import type { PositionMotion } from './position-motion'
import { PendingRequests } from './requests'

export interface FoldSource {
  readonly controlled: boolean
  readonly model: GraphModel
  readonly scene: Scene
  readonly positions: Positions
  readonly projection: Projection
  readonly motion: PositionMotion
  readonly emitter: Emitter
  state(): GraphState
  patch(next: Partial<GraphState>): void
  definition(): GraphDefinition
  readonly arranged: ArrangedPlaces
  makeRoom(moving: readonly number[], to: readonly number[]): void
  arranger(index: number): Layout | null
  arranges(): boolean
  request(flush: boolean): void
  prepare(): void
}

export interface Revealed {
  readonly placed: readonly number[]
  readonly keyed: readonly number[]
  readonly whole: readonly number[]
  readonly growing: readonly number[]
}

export const nothingRevealed: Revealed = Object.freeze({
  placed: [],
  keyed: [],
  whole: [],
  growing: [],
})

export class FoldControl {
  readonly #asks = new PendingRequests<readonly Key[]>(sameList, requestMemory)
  readonly #origins = new Map<number, readonly [number, number]>()
  #listener: ((event: GraphFoldEvent) => void) | undefined
  readonly #source: FoldSource
  readonly check: StringCheck = stringCheck()

  constructor(source: FoldSource, listener: ((event: GraphFoldEvent) => void) | undefined) {
    this.#source = source
    this.#listener = isolated(listener)
  }

  listen(listener: (event: GraphFoldEvent) => void): void {
    this.#listener = isolated(listener)
  }

  isGroup(key: Key): boolean {
    const { model, projection } = this.#source
    const index = model.node(key)?.index ?? -1
    return index >= 0 && (projection.hierarchy.childCount[index] ?? 0) > 0
  }

  apply(next: Iterable<Key>): void {
    const folded = [...new Set(next)]
    if (sameList(this.#source.state().folded, folded)) return
    this.#source.projection.setFolded(folded)
    this.#source.patch({ folded })
    this.#source.emitter.emit('foldchange', { folded })
    this.#source.request(true)
  }

  answer(next: Iterable<Key>): void {
    const folded = [...new Set(next)]
    this.#asks.answer(folded)
    this.apply(folded)
  }

  base(): readonly Key[] {
    return this.#asks.base(this.#source.state().folded)
  }

  ask(next: Iterable<Key>): void {
    const folded = [...new Set(next)]
    if (!this.#source.controlled) {
      this.apply(folded)
      return
    }
    if (sameList(this.base(), folded)) return
    this.#asks.send(folded)
    this.#listener?.({ folded })
  }

  #all(): Key[] {
    const hierarchy = this.#source.projection.hierarchy
    const keys: Key[] = []
    for (let index = 0; index < hierarchy.capacity; index++) {
      const key = hierarchy.keys[index]
      if (
        hierarchy.present[index] === 1 &&
        (hierarchy.childCount[index] ?? 0) > 0 &&
        key !== undefined
      )
        keys.push(key)
    }
    return keys
  }

  toggle(key: Key): void {
    const folded = this.base()
    this.ask(
      folded.includes(key) ? folded.filter((each) => !Object.is(each, key)) : [...folded, key],
    )
  }

  foldNew(changes: GraphChanges): readonly Key[] | null {
    const { model, projection } = this.#source
    const born: Key[] = []
    for (const { key, index } of changes.nodes.added) {
      const record = model.nodeAt(index)
      if (record && groupingOf(record.mark)?.folded) born.push(key)
    }
    if (born.length === 0) return null
    if (this.#source.controlled) {
      this.ask([...this.base(), ...born])
      return null
    }
    const folded = [...new Set([...this.#source.state().folded, ...born])]
    projection.setFolded(folded)
    this.#source.patch({ folded })
    return folded
  }

  adopt(): void {
    const source = this.#source
    const born = source.projection.hierarchy.takeBorn()
    if (born.length === 0) return
    const folded = [...new Set([...source.state().folded, ...born])]
    if (source.controlled) {
      const asked = [...new Set([...this.base(), ...born])]
      source.patch({ folded })
      this.#asks.send(asked)
      this.#listener?.({ folded: asked })
    } else source.patch({ folded })
    source.emitter.emit('foldchange', { folded })
  }

  #placeFolded(
    changes: GraphChanges,
    projected: ProjectionChanges,
    tracked: (index: number) => boolean,
    restored: ReadonlySet<number> | null,
  ): Set<number> {
    const { positions, projection } = this.#source
    const hierarchy = projection.hierarchy
    const origins = this.#origins
    const grouped = new Set<number>()
    let added: Set<number> | null = null
    const fresh = new Set(projected.fresh)
    for (const { index } of projected.scene.nodes.added) {
      if (hierarchy.folded[index] !== 1 || (hierarchy.childCount[index] ?? 0) === 0) continue
      added ??= new Set(changes.nodes.added.map((ref) => ref.index))
      if (!tracked(index) && !restored?.has(index) && (added.has(index) || fresh.has(index))) {
        let minX = Number.POSITIVE_INFINITY
        let minY = Number.POSITIVE_INFINITY
        let maxX = Number.NEGATIVE_INFINITY
        let maxY = Number.NEGATIVE_INFINITY
        hierarchy.forEachDescendant(index, (descendant) => {
          if (!tracked(descendant) && !projection.seen(descendant)) return
          const x = positions.x(descendant)
          const y = positions.y(descendant)
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        })
        if (maxX >= minX) {
          positions.set(index, (minX + maxX) / 2, (minY + maxY) / 2)
          grouped.add(index)
        }
      }
      if (!origins.has(index)) origins.set(index, [positions.x(index), positions.y(index)])
    }
    return grouped
  }

  reveal(
    changes: GraphChanges,
    projected: ProjectionChanges,
    restored: readonly number[] = [],
  ): Revealed {
    const { positions, projection, scene } = this.#source
    const hierarchy = projection.hierarchy
    const origins = this.#origins
    for (const { index } of changes.nodes.removed) origins.delete(index)
    for (const group of projected.folded) {
      origins.set(group, [positions.x(group), positions.y(group)])
    }
    const tracked = (index: number) => !Number.isNaN(positions.source[index * 2] ?? Number.NaN)
    const opened = new Set<number>()
    for (const group of projected.unfolded) {
      opened.add(group)
      const origin = origins.get(group)
      origins.delete(group)
      if (!origin) continue
      const dx = positions.x(group) - origin[0]
      const dy = positions.y(group) - origin[1]
      if (dx === 0 && dy === 0) continue
      hierarchy.forEachDescendant(group, (index) => {
        const nested = origins.get(index)
        if (nested) origins.set(index, [nested[0] + dx, nested[1] + dy])
        if (!tracked(index)) positions.set(index, positions.x(index) + dx, positions.y(index) + dy)
      })
    }
    const grouped = projection.active
      ? this.#placeFolded(
          changes,
          projected,
          tracked,
          restored.length > 0 ? new Set(restored) : null,
        )
      : new Set<number>()
    if (projected.revealed.length === 0) return nothingRevealed
    const fresh = new Set(projected.fresh)
    const anchorOf = (index: number): number => {
      for (let at = hierarchy.parent[index] ?? -1; at >= 0; at = hierarchy.parent[at] ?? -1) {
        if (opened.has(at)) return at
      }
      return -1
    }
    const arranging = this.#arranging(projected, opened)
    const indices: number[] = []
    const to: number[] = []
    const room: number[] = []
    const roomTo: number[] = []
    const placed: number[] = []
    for (const index of projected.revealed) {
      const anchor = anchorOf(index)
      if (anchor < 0 || tracked(index) || scene.nodes.shape[index] === containerShape) continue
      const ax = positions.x(anchor)
      const ay = positions.y(anchor)
      if (arranging?.place(index, fresh.has(index) && !grouped.has(index))) {
        positions.set(index, ax, ay)
        continue
      }
      if (fresh.has(index) && !grouped.has(index)) {
        const ring = positions.nextRing(anchor)
        const angle = ring * goldenAngle
        const radius = placementSpacing * Math.sqrt(ring + 1)
        positions.set(index, ax + radius * Math.cos(angle), ay + radius * Math.sin(angle))
        placed.push(index)
        continue
      }
      const x = positions.x(index)
      const y = positions.y(index)
      indices.push(index)
      to.push(x, y)
      room.push(index)
      roomTo.push(x, y)
      positions.set(index, ax, ay)
    }
    const plan = arranging?.decide() ?? null
    if (arranging && plan) {
      for (const [index, [x, y]] of arranging.starts) {
        indices.push(index)
        to.push(x, y)
      }
      for (const [index, x, y] of plan.settled) {
        room.push(index)
        roomTo.push(x, y)
      }
    }
    const definition = this.#source.definition()
    this.#source.motion.move(indices, to, definition.transitions.layout)
    if ((definition.layout || this.#source.arranges()) && room.length > 0) {
      this.#source.makeRoom(room, roomTo)
    }
    if (!plan) return placed.length > 0 ? { ...nothingRevealed, placed } : nothingRevealed
    return { placed, keyed: plan.keyed, whole: plan.whole, growing: plan.growing }
  }

  #arranging(projected: ProjectionChanges, opened: ReadonlySet<number>): Arranging | null {
    const source = this.#source
    let homes: Set<number> | null = null
    for (const group of projected.unfolded) {
      if (!source.arranger(group)) continue
      homes ??= new Set()
      homes.add(group)
    }
    for (const index of projected.revealed) {
      if (source.scene.nodes.shape[index] !== containerShape || !source.arranger(index)) continue
      homes ??= new Set()
      homes.add(index)
    }
    return homes ? new Arranging(source, homes, opened) : null
  }

  api(): GraphGroups {
    const { model, projection } = this.#source
    const hierarchy = projection.hierarchy
    const prepare = () => this.#source.prepare()
    return {
      folded: () => this.#source.state().folded,
      isFolded: (key) => projection.folded.has(key),
      fold: (keys) => {
        this.check(keys, 'groups.fold')
        prepare()
        this.ask([...this.base(), ...(keys ?? this.#all())])
      },
      unfold: (keys) => {
        this.check(keys, 'groups.unfold')
        if (!keys) return this.ask([])
        const removed = new Set(keys)
        this.ask(this.base().filter((key) => !removed.has(key)))
      },
      toggle: (key) => this.toggle(key),
      set: (keys) => {
        this.check(keys, 'groups.set')
        this.ask(keys)
      },
      parent: (key) => {
        prepare()
        const index = model.node(key)?.index ?? -1
        const parent = index >= 0 ? (hierarchy.parent[index] ?? -1) : -1
        return parent >= 0 ? hierarchy.keys[parent] : undefined
      },
      children: (key) => {
        prepare()
        const index = model.node(key)?.index ?? -1
        const children: Key[] = []
        if (index < 0) return children
        for (
          let child = hierarchy.firstChild[index] ?? -1;
          child >= 0;
          child = hierarchy.nextSibling[child] ?? -1
        ) {
          const childKey = hierarchy.keys[child]
          if (childKey !== undefined) children.push(childKey)
        }
        return children.reverse()
      },
      keyOf: (name, value, parent) => groupKey(name, value, parent),
    }
  }
}

interface ArrangePlan {
  readonly keyed: number[]
  readonly whole: number[]
  readonly growing: number[]
  readonly settled: (readonly [number, number, number])[]
}

interface Unit {
  readonly index: number
  readonly recorded: boolean
}

class Arranging {
  readonly #source: FoldSource
  readonly #homes: ReadonlySet<number>
  readonly #opened: ReadonlySet<number>
  readonly #units = new Map<number, Unit[]>()
  readonly #starts = new Map<number, readonly [number, number]>()
  readonly #refs = new Map<number, readonly [number, number]>()
  readonly #valid = new Map<number, boolean>()
  readonly #rings = new Map<number, number>()

  constructor(source: FoldSource, homes: ReadonlySet<number>, opened: ReadonlySet<number>) {
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
