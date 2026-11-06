import type { Positions } from '../core/positions'
import type { Scene, SceneDirty } from '../core/scene'
import type { StateBuffers } from '../core/state-buffers'
import type { ResolvedTheme } from '../dom/theme'
import type { View } from '../types'

export interface RenderInput {
  readonly scene: Scene
  readonly dirty: SceneDirty
  readonly positions: Positions
  readonly positionsChanged: boolean
  readonly states: StateBuffers
  readonly full: boolean
  readonly containers?: ContainerFrame
}

export interface ContainerFrame {
  readonly boxes: Float32Array
  readonly order: Uint32Array
  readonly count: number
  readonly version: number
}

export interface RenderFrame {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly pixelRatio: number
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
  destroy(): void
}
