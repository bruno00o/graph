import { noColor } from './columns'
import type { CompiledLabelText } from './compile-mark'
import type { Palette } from './palette'

export function toText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function toColor(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function swapColor(
  palette: Palette,
  previous: number,
  color: string | null,
  fallback: number,
): number {
  if (color === null && previous === fallback) return previous
  return palette.swap(previous, color, fallback)
}

export function readBackground(
  previous: number,
  value: unknown,
  palette: Palette,
  fallbacks: { readonly labelBackground: number },
): number {
  if (value === true) return swapColor(palette, previous, null, fallbacks.labelBackground)
  return swapColor(palette, previous, toColor(value), noColor)
}

export function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function readWeight(value: unknown): number {
  if (value === 'normal') return 400
  if (value === 'bold') return 700
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1000, Math.max(1, Math.round(value)))
    : 0
}

export interface LabelTextColumns {
  readonly labelColor: Uint32Array
  readonly labelSize: Float32Array
  readonly labelWeight: Uint16Array
  readonly labelFont: (string | null)[]
  readonly labelMaxWidth: Float32Array
}

export function writeLabelText(
  columns: LabelTextColumns,
  index: number,
  text: CompiledLabelText,
  datum: unknown,
  palette: Palette,
): void {
  const color = text.color ? toColor(text.color(datum)) : null
  columns.labelColor[index] = swapColor(
    palette,
    columns.labelColor[index] ?? noColor,
    color,
    noColor,
  )
  columns.labelSize[index] = positive(text.size?.(datum))
  columns.labelWeight[index] = readWeight(text.weight?.(datum))
  columns.labelFont[index] = text.font ? toColor(text.font(datum)) : null
  columns.labelMaxWidth[index] = positive(text.maxWidth?.(datum))
}
