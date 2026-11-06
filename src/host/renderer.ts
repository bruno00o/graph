import type { Positions } from '../core/positions'
import type { Scene, SceneDirty } from '../core/scene'
import type { StateBuffers } from '../core/state-buffers'
import type { ResolvedTheme } from '../dom/theme'
import type { BackgroundGrid, View } from '../types'

export interface GridInput {
  readonly pattern: BackgroundGrid
  readonly spacing: number
  readonly color: number
  readonly majorColor: number
}

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
}

export interface RenderFrame {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly pixelRatio: number
  readonly labels?: LabelArea
}

export type LabelMode = 'visible' | 'all' | 'none'

export interface LabelArea {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly mode: LabelMode
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
