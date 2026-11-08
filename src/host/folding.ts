import { containerShape } from '../core/columns'
import type { GraphChanges, GraphModel } from '../core/graph-model'
import { groupingOf, groupKey } from '../core/group-index'
import { goldenAngle, type Positions, placementSpacing } from '../core/positions'
import type { Projection, ProjectionChanges } from '../core/projection'
import type { Scene } from '../core/scene'
import type { GraphDefinition, Key } from '../types'
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
  makeRoom(moving: readonly number[], to: readonly number[]): void
  request(flush: boolean): void
  prepare(): void
}

export class FoldControl {
  readonly #asks = new PendingRequests<readonly Key[]>(sameList, requestMemory)
  readonly #origins = new Map<number, readonly [number, number]>()
  #listener: ((event: GraphFoldEvent) => void) | undefined
  readonly #source: FoldSource

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

  foldNew(changes: GraphChanges): void {
    const { model, projection } = this.#source
    const born: Key[] = []
    for (const { key, index } of changes.nodes.added) {
      const record = model.nodeAt(index)
      if (record && groupingOf(record.mark)?.folded) born.push(key)
    }
    if (born.length === 0) return
    if (this.#source.controlled) {
      this.ask([...this.base(), ...born])
      return
    }
    const folded = [...new Set([...this.#source.state().folded, ...born])]
    projection.setFolded(folded)
    this.#source.patch({ folded })
    this.#source.emitter.emit('foldchange', { folded })
  }

  #placeFolded(
    changes: GraphChanges,
    projected: ProjectionChanges,
    tracked: (index: number) => boolean,
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
      if (!tracked(index) && (added.has(index) || fresh.has(index))) {
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

  reveal(changes: GraphChanges, projected: ProjectionChanges): number[] {
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
      ? this.#placeFolded(changes, projected, tracked)
      : new Set<number>()
    if (projected.revealed.length === 0) return []
    const fresh = new Set(projected.fresh)
    const anchorOf = (index: number): number => {
      for (let at = hierarchy.parent[index] ?? -1; at >= 0; at = hierarchy.parent[at] ?? -1) {
        if (opened.has(at)) return at
      }
      return -1
    }
    const indices: number[] = []
    const to: number[] = []
    const placed: number[] = []
    for (const index of projected.revealed) {
      const anchor = anchorOf(index)
      if (anchor < 0 || tracked(index) || scene.nodes.shape[index] === containerShape) continue
      const ax = positions.x(anchor)
      const ay = positions.y(anchor)
      if (fresh.has(index) && !grouped.has(index)) {
        const ring = positions.nextRing(anchor)
        const angle = ring * goldenAngle
        const radius = placementSpacing * Math.sqrt(ring + 1)
        positions.set(index, ax + radius * Math.cos(angle), ay + radius * Math.sin(angle))
        placed.push(index)
        continue
      }
      indices.push(index)
      to.push(positions.x(index), positions.y(index))
      positions.set(index, ax, ay)
    }
    const definition = this.#source.definition()
    this.#source.motion.move(indices, to, definition.transitions.layout)
    if (definition.layout && indices.length > 0) this.#source.makeRoom(indices, to)
    return placed
  }

  api(): GraphGroups {
    const { model, projection } = this.#source
    const hierarchy = projection.hierarchy
    const prepare = () => this.#source.prepare()
    return {
      folded: () => this.#source.state().folded,
      isFolded: (key) => projection.folded.has(key),
      fold: (keys) => {
        prepare()
        this.ask([...this.base(), ...(keys ?? this.#all())])
      },
      unfold: (keys) => {
        if (!keys) return this.ask([])
        const removed = new Set(keys)
        this.ask(this.base().filter((key) => !removed.has(key)))
      },
      toggle: (key) => this.toggle(key),
      set: (keys) => this.ask(keys),
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
