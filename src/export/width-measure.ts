import { atlasFontSize } from '../core/label-metrics'
import { cutText, type TextWidth } from '../core/label-width'
import type { LineLayout } from '../webgl/glyph-atlas'
import type { TextMeasure } from '../webgl/label-layer'

const noGlyphs: LineLayout['glyphs'] = []

export function widthMeasure(width: TextWidth): TextMeasure {
  const lines = new Map<string, LineLayout>()
  const line = (text: string, weight: number, font: string | null = null): LineLayout => {
    const key = `${weight}\u0000${font ?? ''}\u0000${text}`
    let found = lines.get(key)
    if (!found) {
      found = { width: width(text, weight, font) * atlasFontSize, glyphs: noGlyphs }
      lines.set(key, found)
    }
    return found
  }
  return {
    height: 256,
    generation: 0,
    line,
    fit(text, weight, font, room) {
      if (line(text, weight, font).width <= room) return text
      return cutText(width, text, weight, font, room / atlasFontSize)
    },
  }
}
