import { secondaryFactor } from './label-metrics'

/**
 * Width of one line of text in em, the font size taken as 1. `weight` is a CSS font weight, such
 * as 400 or 700, and `font` the font family of the label, or `null` for the font of the theme.
 */
export type TextWidth = (text: string, weight: number, font: string | null) => number

export const primaryWeight = 500
export const secondaryWeight = 400
export const boxPadding = 0.5
const ellipsis = '…'
const estimatedAdvance = 0.6

export const estimateTextWidth: TextWidth = (text) => {
  let count = 0
  for (const _ of text) count++
  return count * estimatedAdvance
}

export function cutText(
  measure: TextWidth,
  text: string,
  weight: number,
  font: string | null,
  limit: number,
): string {
  const room = limit - measure(ellipsis, weight, font)
  let pen = 0
  let end = 0
  const chars = Array.from(text)
  for (const char of chars) {
    const advance = measure(char, weight, font)
    if (pen + advance > room) break
    pen += advance
    end++
  }
  return `${chars.slice(0, end).join('').trimEnd()}${ellipsis}`
}

function fittedWidth(
  measure: TextWidth,
  text: string,
  weight: number,
  font: string | null,
  limit: number,
): number {
  const whole = measure(text, weight, font)
  if (limit <= 0 || whole <= limit) return whole
  return measure(cutText(measure, text, weight, font, limit), weight, font)
}

export function labelWidth(
  measure: TextWidth,
  primary: string,
  secondary: string | null,
  weight: number,
  font: string | null,
  maxWidth: number,
  size: number,
): number {
  let width = 0
  const add = (text: string, lineWeight: number, factor: number) => {
    const limit = maxWidth > 0 ? maxWidth / (size * factor) : 0
    for (const part of text.split('\n')) {
      width = Math.max(width, fittedWidth(measure, part, lineWeight, font, limit) * factor)
    }
  }
  add(primary, weight, 1)
  if (secondary) add(secondary, secondaryWeight, secondaryFactor)
  return width * size
}
