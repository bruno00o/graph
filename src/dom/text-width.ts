import { estimateTextWidth, type TextWidth } from '../core/label-width'
import { atlasFontSize } from '../webgl/glyph-atlas'

type MeasureContext = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>

function measureContext(): MeasureContext | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1).getContext('2d')
    if (typeof document === 'undefined') return null
    return document.createElement('canvas').getContext('2d')
  } catch {
    return null
  }
}

export interface TextWidths {
  readonly width: TextWidth
  setFont(font: string): boolean
}

export function createTextWidths(font: string): TextWidths {
  const context = measureContext()
  let themeFont = font
  const faces = new Map<string, Map<string, number>>()
  let current = ''
  let lastWeight = Number.NaN
  let lastFamily = ''
  let lastFace = ''
  let lastAdvances = new Map<string, number>()
  const measure = (char: string, weight: number, family: string, face: string): number => {
    if (!context) return estimateTextWidth(char, weight, family)
    if (current !== face) {
      context.font = face
      current = face
    }
    return context.measureText(char).width / atlasFontSize
  }
  return {
    width: (text, weight, font) => {
      const family = font ?? themeFont
      if (weight !== lastWeight || family !== lastFamily) {
        lastWeight = weight
        lastFamily = family
        lastFace = `normal ${weight} ${atlasFontSize}px ${family}`
        let found = faces.get(lastFace)
        if (!found) {
          found = new Map()
          faces.set(lastFace, found)
        }
        lastAdvances = found
      }
      const face = lastFace
      const advances = lastAdvances
      let width = 0
      for (const char of text) {
        let advance = advances.get(char)
        if (advance === undefined) {
          advance = measure(char, weight, family, face)
          advances.set(char, advance)
        }
        width += advance
      }
      return width
    },
    setFont(next) {
      if (next === themeFont) return false
      themeFont = next
      return true
    },
  }
}
