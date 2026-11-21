import type { BridgeSet } from '../core/bridges'
import type { EdgePaths } from '../core/edge-paths'
import type { GlobeCamera } from '../core/globe'
import type { ContainerSource } from '../core/hull-layer'
import type { LayerFilter } from '../core/mark-layers'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import type { StateBuffers } from '../core/state-buffers'
import type { TimeFilter } from '../core/time-range'
import type { Sight } from '../core/visibility'
import type { ResolvedTheme, Rgba } from '../dom/theme'
import type { View } from '../types'
import type { ContainerFrame, GridInput, HullInput, Renderer } from './renderer'

export interface GraphSnapshot {
  readonly scene: Scene
  readonly positions: Positions
  readonly states: StateBuffers
  readonly grid: GridInput | null
  readonly hulls: HullInput
  readonly containers: ContainerFrame | null
  readonly bundles: EdgePaths | null
  readonly bridges?: BridgeSet | null
  readonly palette: Uint8Array
  readonly theme: ResolvedTheme
  readonly view: View
  readonly window: TimeFilter | null
  readonly layers: LayerFilter | null
  readonly fade: number
  readonly width: number
  readonly height: number
  readonly pixelRatio: number
  readonly software: boolean | null
  readonly globe?: GlobeCamera | null
  readonly title: string | null
  color(css: string): Rgba
  ratioFor(software: boolean): number
  hullsFor(sight: Sight, positions: Positions, containers: ContainerSource | null): HullInput
  createRenderer(canvas: HTMLCanvasElement, invalidate: () => void): Renderer
}

const sources = new WeakMap<object, () => GraphSnapshot>()
const pages = new WeakMap<object, boolean>()

export function exposeSnapshot(
  graph: object,
  page: boolean | null,
  take: () => GraphSnapshot,
): void {
  sources.set(graph, take)
  if (page !== null) pages.set(graph, page)
}

export function onPage(graph: object): boolean | undefined {
  return pages.get(graph)
}

export function takeSnapshot(graph: object): GraphSnapshot {
  const take = sources.get(graph)
  if (!take) throw new Error('graph: export needs a graph created by mountGraph or createGraph')
  return take()
}
