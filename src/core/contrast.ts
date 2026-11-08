export type Color = readonly [number, number, number, number]

function linear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function paperOnFill(fill: Color, ink: Color, paper: Color): boolean {
  const alpha = fill[3] / 255
  const r = paper[0] + (fill[0] - paper[0]) * alpha
  const g = paper[1] + (fill[1] - paper[1]) * alpha
  const b = paper[2] + (fill[2] - paper[2]) * alpha
  const below = luminance(r, g, b)
  const onInk = contrastRatio(below, luminance(ink[0], ink[1], ink[2]))
  const onPaper = contrastRatio(below, luminance(paper[0], paper[1], paper[2]))
  return onPaper > onInk
}
