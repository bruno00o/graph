import type { EdgePaths } from '../core/edge-paths'
import type { GlobeCamera } from '../core/globe'
import type { HullLayer } from '../core/hull-layer'
import type { LayerFilter } from '../core/mark-layers'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import type { StateBuffers } from '../core/state-buffers'
import type { TimeFilter } from '../core/time-range'
import type { ResolvedTheme, Rgba } from '../dom/theme'
import type { View } from '../types'
import type { ContainerFrame, GridInput, Renderer } from './renderer'

export interface GraphSnapshot {
  readonly scene: Scene
  readonly positions: Positions
  readonly states: StateBuffers
  readonly grid: GridInput | null
  readonly hulls: HullLayer
  readonly containers: ContainerFrame | null
  readonly bundles: EdgePaths | null
  readonly palette: Uint8Array
  readonly theme: ResolvedTheme
  readonly view: View
  readonly window: TimeFilter | null
  readonly layers: LayerFilter | null
  readonly fade: number
  readonly width: number
  readonly height: number
  readonly pixelRatio: number
  readonly globe?: GlobeCamera | null
  readonly title: string | null
  color(css: string): Rgba
  createRenderer(canvas: HTMLCanvasElement, invalidate: () => void): Renderer
}

const sources = new WeakMap<object, () => GraphSnapshot>()

export function exposeSnapshot(graph: object, take: () => GraphSnapshot): void {
  sources.set(graph, take)
}

export function takeSnapshot(graph: object): GraphSnapshot {
  const take = sources.get(graph)
  if (!take) throw new Error('graph: export needs a graph created by mountGraph')
  return take()
}
