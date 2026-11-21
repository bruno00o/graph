import type { GlobeCamera } from '../core/globe'
import type { GraphChanges, ShapeRecord } from '../core/graph-model'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import type { ShapeShift } from '../core/shape-store'
import type { Sight } from '../core/visibility'
import type { ResolvedDefinition } from '../resolved-definition'
import type { EdgeEnd, Key } from '../types'
import type { FrameClock } from './environment'
import type { SurfaceCapabilities } from './graph-instance'
import type { PointerTool } from './pointer-tool'
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
  surface?(capabilities: SurfaceCapabilities): void
  destroy(): void
}

export interface GraphInternals {
  readonly onMap: boolean
  surface(): SurfaceCapabilities
  readonly scene: Scene
  readonly positions: Positions
  definition(): ResolvedDefinition
  containers(): ContainerFrame | null
  palette(): Uint8Array
  masks(): Uint32Array
  edgeMembers(index: number, end?: EdgeEnd): readonly Key[] | null
  datum(kind: 'nodes' | 'edges' | 'shapes', index: number): unknown
  sight(except?: string | null): Sight
  stamp(): GraphStamp
  watch(watcher: GraphWatcher): () => void
  tool(tool: PointerTool | null): boolean
  draft(keys: readonly Key[], shifts?: readonly ShapeShift[]): void
  shape(key: Key): ShapeRecord | null
  globe(): GlobeCamera | null
  readonly frames: FrameClock
}

const exposed = new WeakMap<object, GraphInternals>()

export function exposeInternals(graph: object, internals: GraphInternals): void {
  exposed.set(graph, internals)
}

export function internalsOf(graph: object, caller: string): GraphInternals {
  const internals = exposed.get(graph)
  if (!internals) throw new Error(`${caller}: needs a graph made by mountGraph or createGraph`)
  return internals
}
