import { worldSize } from '../core/geo'

const earthRadius = 6_371_008.8

export const wrapMargin = 0.5

export type MeasureText = (text: string) => number

export function metersToWorld(meters: number, y: number): number {
  const latitude = Math.atan(Math.sinh(Math.PI - (y / worldSize) * 2 * Math.PI))
  const ground = 2 * Math.PI * earthRadius * Math.cos(latitude)
  return ground > 0 ? (meters * worldSize) / ground : meters
}

function breakWord(word: string, width: number, measure: MeasureText, lines: string[]): string {
  let line = ''
  let pen = 0
  for (const char of word) {
    const advance = measure(char)
    if (line !== '' && pen + advance > width) {
      lines.push(line)
      line = ''
      pen = 0
    }
    line += char
    pen += advance
  }
  return line
}

export function wrapText(text: string, width: number, measure: MeasureText): string {
  if (!(width > 0)) return text
  const space = measure(' ')
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    let pen = 0
    for (const word of paragraph.split(' ')) {
      if (word === '') continue
      const length = measure(word)
      if (line !== '' && pen + space + length <= width) {
        line += ` ${word}`
        pen += space + length
        continue
      }
      if (line !== '') lines.push(line)
      if (length <= width) {
        line = word
        pen = length
        continue
      }
      line = breakWord(word, width, measure, lines)
      pen = measure(line)
    }
    lines.push(line)
  }
  return lines.join('\n')
}
