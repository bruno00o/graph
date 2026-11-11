import type { StateKind } from '../core/state-buffers'
import type { Key } from '../types'
import type { ElementKeys, ElementKeysInput, GraphTarget } from './events'

export const kindOf: {
  readonly node: 'nodes'
  readonly edge: 'edges'
  readonly shape: 'shapes'
} = {
  node: 'nodes',
  edge: 'edges',
  shape: 'shapes',
} satisfies Record<string, StateKind>
export const noKeys: ElementKeys = Object.freeze({ nodes: [], edges: [] })
export const noShapeKeys: ElementKeys = Object.freeze({ nodes: [], edges: [], shapes: [] })
export const requestMemory = 8

export function emptyKeys(shaped: boolean): ElementKeys {
  return shaped ? noShapeKeys : noKeys
}

export function toKeys(input: ElementKeysInput, shaped = false): ElementKeys {
  const nodes = [...(input.nodes ?? [])]
  const edges = [...(input.edges ?? [])]
  return shaped ? { nodes, edges, shapes: [...(input.shapes ?? [])] } : { nodes, edges }
}

export function sameList(a: readonly Key[], b: readonly Key[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((key) => set.has(key))
}

export function sameKeys(a: ElementKeys, b: ElementKeys): boolean {
  return (
    sameList(a.nodes, b.nodes) &&
    sameList(a.edges, b.edges) &&
    sameList(a.shapes ?? [], b.shapes ?? [])
  )
}

export function sameTarget(a: GraphTarget | null, b: GraphTarget | null): boolean {
  return a === b || (a !== null && b !== null && a.kind === b.kind && a.key === b.key)
}

export function sameEnd(a: GraphTarget | null, b: GraphTarget | null): boolean {
  return a?.kind !== 'edge' || b?.kind !== 'edge' || a.end === b.end
}

export function mergedKeys(element: GraphTarget): readonly Key[] | undefined {
  if (element.kind !== 'edge' || !element.aggregate) return undefined
  return element.direction ? element.aggregate[element.direction].keys : element.aggregate.keys
}

export function keysOf(element: GraphTarget): ElementKeysInput {
  const merged = mergedKeys(element)
  if (merged) return { edges: merged }
  return { [kindOf[element.kind]]: [element.key] }
}

export function countAlive(alive: Uint8Array, capacity: number): number {
  let count = 0
  for (let index = 0; index < capacity; index++) if (alive[index] === 1) count++
  return count
}
