import type { BackgroundGrid, ResolvedBackground, View } from '../types'
import type { Palette } from './palette'
import type { Viewport } from './view'

export const gridLevelCount = 3
export const gridRatio = 4
export const gridFadeStart = 4

export interface GridInput {
  readonly pattern: BackgroundGrid
  readonly spacing: number
  readonly color: number
  readonly majorColor: number
}

export function gridInput(
  background: ResolvedBackground | null,
  palette: Palette,
): GridInput | null {
  if (!background) return null
  return {
    pattern: background.grid,
    spacing: background.spacing,
    color: palette.id(background.color),
    majorColor: palette.id(background.majorColor),
  }
}

export interface GridLevel {
  readonly pitch: number
  readonly offsetX: number
  readonly offsetY: number
  readonly weight: number
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export function gridLevels(spacing: number, view: View, viewport: Viewport): GridLevel[] {
  const base = spacing * view.zoom
  const exponent = Math.floor(Math.log(gridFadeStart / base) / Math.log(gridRatio)) + 1
  const levels: GridLevel[] = []
  for (let level = 0; level < gridLevelCount; level++) {
    const world = spacing * gridRatio ** (exponent + level)
    const pitch = world * view.zoom
    levels.push({
      pitch,
      offsetX: modulo(modulo(-view.x, world) * view.zoom + viewport.width / 2, pitch),
      offsetY: modulo(modulo(-view.y, world) * view.zoom + viewport.height / 2, pitch),
      weight: Math.min(2, Math.max(0, Math.log(pitch / gridFadeStart) / Math.log(gridRatio))),
    })
  }
  return levels
}
