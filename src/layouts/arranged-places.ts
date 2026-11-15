import type { NodeColumns } from '../core/columns'
import type { Hierarchy } from '../core/hierarchy'
import type { ArrangedPlaces as Places } from '../core/layout-scopes'
import type { Positions } from '../core/positions'
import type { Layout } from '../types'

const none = -2

export class ArrangedPlaces implements Places {
  #parent = new Int32Array(0)
  #offset = new Float64Array(0)
  readonly #layouts = new Map<number, Layout>()

  get empty(): boolean {
    return this.#parent.length === 0
  }

  remember(
    movable: Uint8Array,
    nodes: NodeColumns,
    hierarchy: Hierarchy,
    positions: Positions,
    skip: ReadonlySet<number> | null,
  ): void {
    const done = new Set<number>()
    const limit = Math.min(movable.length, nodes.capacity)
    for (let index = 0; index < limit; index++) {
      if (movable[index] !== 1 || nodes.alive[index] !== 1 || skip?.has(index)) continue
      for (let at = index; !done.has(at); ) {
        done.add(at)
        const parent = hierarchy.parent[at] ?? -1
        if (parent < 0) break
        this.record(
          at,
          parent,
          positions.x(at) - positions.x(parent),
          positions.y(at) - positions.y(parent),
        )
        const layout = nodes.containerLayouts.get(parent)
        if (layout) this.#layouts.set(parent, layout)
        at = parent
      }
    }
  }

  record(index: number, parent: number, dx: number, dy: number): void {
    if (index >= this.#parent.length) {
      const size = Math.max(index + 1, this.#parent.length * 2, 64)
      const parents = new Int32Array(size).fill(none)
      parents.set(this.#parent)
      const offsets = new Float64Array(size * 2)
      offsets.set(this.#offset)
      this.#parent = parents
      this.#offset = offsets
    }
    this.#parent[index] = parent
    this.#offset[index * 2] = dx
    this.#offset[index * 2 + 1] = dy
  }

  offset(index: number, parent: number): readonly [number, number] | null {
    if (parent < 0 || this.#parent[index] !== parent) return null
    return [this.#offset[index * 2] ?? 0, this.#offset[index * 2 + 1] ?? 0]
  }

  layout(container: number): Layout | null {
    return this.#layouts.get(container) ?? null
  }

  forget(index: number): void {
    if (index < this.#parent.length) this.#parent[index] = none
    this.#layouts.delete(index)
  }
}
