import type { StateKind } from '../core/state-buffers'
import type { Key } from '../types'
import type { ElementKeys, ElementKeysInput, GraphTarget } from './events'

export const kindOf: { readonly node: 'nodes'; readonly edge: 'edges' } = {
  node: 'nodes',
  edge: 'edges',
} satisfies Record<string, StateKind>
export const noKeys: ElementKeys = Object.freeze({ nodes: [], edges: [] })
export const requestMemory = 8

export function toKeys(input: ElementKeysInput): ElementKeys {
  return { nodes: [...(input.nodes ?? [])], edges: [...(input.edges ?? [])] }
}

export function sameList(a: readonly Key[], b: readonly Key[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((key) => set.has(key))
}

export function sameKeys(a: ElementKeys, b: ElementKeys): boolean {
  return sameList(a.nodes, b.nodes) && sameList(a.edges, b.edges)
}

export function sameTarget(a: GraphTarget | null, b: GraphTarget | null): boolean {
  return a === b || (a !== null && b !== null && a.kind === b.kind && a.key === b.key)
}

export function sameEnd(a: GraphTarget | null, b: GraphTarget | null): boolean {
  return a?.kind !== 'edge' || b?.kind !== 'edge' || a.end === b.end
}

export function keysOf(element: GraphTarget): ElementKeysInput {
  if (element.kind === 'edge' && element.aggregate) return { edges: element.aggregate.keys }
  return { [kindOf[element.kind]]: [element.key] }
}

export function countAlive(alive: Uint8Array, capacity: number): number {
  let count = 0
  for (let index = 0; index < capacity; index++) if (alive[index] === 1) count++
  return count
}
