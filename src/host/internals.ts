import type { GraphChanges } from '../core/graph-model'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import type { Sight } from '../core/visibility'
import type { EdgeEnd, GraphDefinition, Key } from '../types'
import type { ContainerFrame } from './renderer'

export interface GraphStamp {
  readonly scene: number
  readonly positions: number
  readonly palette: number
  readonly containers: number
  readonly detail: number
}

export interface GraphWatcher {
  frame(): void
  changed?(changes: GraphChanges): void
  destroy(): void
}

export interface GraphInternals {
  readonly onMap: boolean
  readonly scene: Scene
  readonly positions: Positions
  definition(): GraphDefinition
  containers(): ContainerFrame | null
  palette(): Uint8Array
  masks(): Uint32Array
  edgeMembers(index: number, end?: EdgeEnd): readonly Key[] | null
  sight(except?: string | null): Sight
  stamp(): GraphStamp
  watch(watcher: GraphWatcher): () => void
}

const exposed = new WeakMap<object, GraphInternals>()

export function exposeInternals(graph: object, internals: GraphInternals): void {
  exposed.set(graph, internals)
}

export function internalsOf(graph: object, caller: string): GraphInternals {
  const internals = exposed.get(graph)
  if (!internals) throw new Error(`${caller}: needs a graph created by mountGraph`)
  return internals
}
