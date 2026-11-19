import type { TextWidth } from '../core/label-width'

const advances = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const lowerAverage = 0.5
const boldScale = 1.06

function wide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    code >= 0x1f300
  )
}

function advance(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code >= 32 && code < 127) return (advances[code - 32] ?? 556) / 1000
  if (wide(code)) return 1
  const plain = char.normalize('NFD').codePointAt(0) ?? 0
  if (plain >= 32 && plain < 127) return (advances[plain - 32] ?? 556) / 1000
  return lowerAverage
}

export const sansTextWidth: TextWidth = (text, weight) => {
  let width = 0
  for (const char of text) width += advance(char)
  return weight >= 600 ? width * boldScale : width
}
