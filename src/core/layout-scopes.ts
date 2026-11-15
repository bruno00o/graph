import type { Layout, LayoutGraph, LayoutListener, LayoutRun } from '../types'
import type { NodeColumns } from './columns'
import type { Hierarchy } from './hierarchy'
import type { Positions } from './positions'
import type { Projection } from './projection'
import { shallowEqual } from './shallow-equal'

export interface ScopeRequest {
  readonly graph: LayoutGraph
  readonly keyed: Uint8Array | null
  readonly top: Layout | null
  readonly layouts: ReadonlyMap<number, Layout>
  readonly replace: Layout | null
  readonly rerun: ReadonlySet<number> | null
  readonly arrivals: boolean
  readonly fresh: boolean
  readonly memory?: object
}

export interface ScopePlan {
  readonly name: string
  readonly movable: Uint8Array
  readonly partial: boolean
  start(listener: LayoutListener): LayoutRun
}

export interface ArrangedPlaces {
  readonly empty: boolean
  remember(
    movable: Uint8Array,
    nodes: NodeColumns,
    hierarchy: Hierarchy,
    positions: Positions,
    skip: ReadonlySet<number> | null,
  ): void
  offset(index: number, parent: number): readonly [number, number] | null
  layout(container: number): Layout | null
  forget(index: number): void
}

export interface ArrangeSource {
  readonly positions: Positions
  readonly projection: Projection
  readonly arranged: ArrangedPlaces
  arranger(index: number): Layout | null
}

export interface ArrangePlan {
  readonly keyed: number[]
  readonly whole: number[]
  readonly growing: number[]
  readonly settled: (readonly [number, number, number])[]
}

export interface UnfoldArranging {
  readonly starts: ReadonlyMap<number, readonly [number, number]>
  place(index: number, fresh: boolean): boolean
  decide(): ArrangePlan
}

export interface ScopeEngine {
  plan(request: ScopeRequest): ScopePlan | null
  places(): ArrangedPlaces
  arrange(
    source: ArrangeSource,
    homes: ReadonlySet<number>,
    opened: ReadonlySet<number>,
  ): UnfoldArranging
}

let engine: ScopeEngine | null = null

export function registerScopeEngine(next: ScopeEngine): void {
  engine = next
}

export function scopeEngine(): ScopeEngine | null {
  return engine
}

export function isLayout(value: unknown): value is Layout {
  if (typeof value !== 'object' || value === null) return false
  const layout = value as Partial<Layout>
  return (
    typeof layout.name === 'string' &&
    typeof layout.start === 'function' &&
    typeof layout.options === 'object' &&
    layout.options !== null
  )
}

export function readLayout(value: unknown): Layout | null {
  return isLayout(value) ? value : null
}

export function sameLayout(a: Layout | null, b: Layout | null): boolean {
  if (a === b) return true
  return a !== null && b !== null && a.name === b.name && shallowEqual(a.options, b.options)
}
