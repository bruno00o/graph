import type { TextWidths } from '../dom/text-width'
import type { ResolvedTheme, Rgba } from '../dom/theme'
import type { HostSurface } from './graph-instance'

export interface ColorSource {
  color(css: string): Rgba
  palette(colors: readonly string[], target: Uint8Array, from?: number): void
  theme(): ResolvedTheme
  destroy(): void
}

export interface GraphEnvironment {
  readonly home: HostSurface
  readonly colors: ColorSource
  readonly textWidths: TextWidths
  still(): boolean
}
