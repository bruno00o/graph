import type { Layout, LayoutGraph, LayoutListener, LayoutRun } from '../types'
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

export interface ScopeEngine {
  plan(request: ScopeRequest): ScopePlan | null
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
