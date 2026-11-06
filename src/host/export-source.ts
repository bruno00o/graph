import type { HullLayer } from '../core/hull-layer'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import type { StateBuffers } from '../core/state-buffers'
import type { ResolvedTheme, Rgba } from '../dom/theme'
import type { View } from '../types'
import type { GridInput, Renderer } from './renderer'

export interface GraphSnapshot {
  readonly scene: Scene
  readonly positions: Positions
  readonly states: StateBuffers
  readonly grid: GridInput | null
  readonly hulls: HullLayer
  readonly palette: Uint8Array
  readonly theme: ResolvedTheme
  readonly view: View
  readonly width: number
  readonly height: number
  readonly pixelRatio: number
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
