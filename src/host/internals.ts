import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import type { GraphDefinition } from '../types'
import type { ContainerFrame } from './renderer'

export interface GraphStamp {
  readonly scene: number
  readonly positions: number
  readonly palette: number
  readonly containers: number
}

export interface GraphWatcher {
  frame(): void
  destroy(): void
}

export interface GraphInternals {
  readonly scene: Scene
  readonly positions: Positions
  definition(): GraphDefinition
  containers(): ContainerFrame | null
  palette(): Uint8Array
  masks(): Uint32Array
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
