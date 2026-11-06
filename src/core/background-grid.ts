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
  readonly adaptive: boolean
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
    adaptive: background.adaptive,
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

function levelAt(world: number, view: View, viewport: Viewport, weight: number): GridLevel {
  const pitch = world * view.zoom
  return {
    pitch,
    offsetX: modulo(modulo(-view.x, world) * view.zoom + viewport.width / 2, pitch),
    offsetY: modulo(modulo(-view.y, world) * view.zoom + viewport.height / 2, pitch),
    weight,
  }
}

export function gridDotScale(view: View, adaptive: boolean): number {
  return adaptive ? 1 : Math.min(3, Math.max(1, view.zoom))
}

export function gridLevels(
  spacing: number,
  view: View,
  viewport: Viewport,
  adaptive = true,
): GridLevel[] {
  const base = spacing * view.zoom
  if (!adaptive) {
    const weight = Math.min(1, Math.max(0, Math.log2(base / gridFadeStart)))
    return [levelAt(spacing, view, viewport, weight)]
  }
  const exponent = Math.floor(Math.log(gridFadeStart / base) / Math.log(gridRatio)) + 1
  const levels: GridLevel[] = []
  for (let level = 0; level < gridLevelCount; level++) {
    const world = spacing * gridRatio ** (exponent + level)
    const pitch = world * view.zoom
    const weight = Math.min(2, Math.max(0, Math.log(pitch / gridFadeStart) / Math.log(gridRatio)))
    levels.push(levelAt(world, view, viewport, weight))
  }
  return levels
}
