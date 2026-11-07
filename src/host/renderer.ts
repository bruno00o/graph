import type { GridInput } from '../core/background-grid'
import type { EdgePaths } from '../core/edge-paths'
import type { GlobeCamera } from '../core/globe'
import type { Positions } from '../core/positions'
import type { Scene, SceneDirty } from '../core/scene'
import type { StateBuffers } from '../core/state-buffers'
import type { ResolvedTheme } from '../dom/theme'
import type { View } from '../types'

export type { GridInput }

export interface HullInput {
  readonly data: ArrayBuffer
  readonly count: number
  readonly version: number
}

export interface RenderInput {
  readonly scene: Scene
  readonly dirty: SceneDirty
  readonly positions: Positions
  readonly positionsChanged: boolean
  readonly states: StateBuffers
  readonly full: boolean
  readonly grid?: GridInput | null
  readonly hulls?: HullInput | null
  readonly containers?: ContainerFrame
  readonly bundles?: EdgePaths | null
}

export interface ContainerFrame {
  readonly boxes: Float32Array
  readonly order: Uint32Array
  readonly count: number
  readonly version: number
}

export interface LensFrame {
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly view: View
}

export interface RenderFrame {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly pixelRatio: number
  readonly labels?: LabelArea
  readonly time?: number
  readonly globe?: GlobeCamera | null
  readonly lens?: LensFrame | null
}

export type LabelMode = 'visible' | 'all' | 'none'

export interface LabelArea {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly mode: LabelMode
  readonly globe?: GlobeCamera | null
}

export interface RendererStats {
  readonly nodeLabels: number
  readonly edgeLabels: number
  readonly labelTime: number
  readonly textureBytes: number
}

export interface Renderer {
  sync(input: RenderInput): void
  setPalette(colors: Uint8Array, count: number): void
  setTheme(theme: ResolvedTheme): void
  render(frame: RenderFrame): number
  stats?(): RendererStats
  ready?(): Promise<void>
  destroy(): void
}
