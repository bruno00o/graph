import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { exportSvg } from '@bruno00o/graph/export'
import { createGraph, type FontFile } from '@bruno00o/graph/headless'
import { force } from '@bruno00o/graph/layouts/force'
import { lightTheme } from '../../src/theme/tokens'
import { sample } from './sample'

export interface Fonts {
  readonly title: FontFile
  readonly body: FontFile
  readonly mono: FontFile
}

export interface Card {
  readonly label: string
  readonly title: string
  readonly description: string
  readonly footer: string
  readonly seed: number
}

export const cardSize = { width: 1200, height: 630 } as const

const margin = 72
const textWidth = 560
const graphBox = { x: 676, y: 72, width: 452, height: 486 } as const
const ink = lightTheme['ink'] as string
const muted = lightTheme['ink-muted'] as string
const paper = lightTheme['paper'] as string

function mix(front: string, back: string, share: number): string {
  const channels = [1, 3, 5].map((at) => {
    const a = Number.parseInt(front.slice(at, at + 2), 16)
    const b = Number.parseInt(back.slice(at, at + 2), 16)
    return Math.round(a * share + b * (1 - share))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

const rule = mix(ink, paper, 0.13)

function escaped(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function widthOf(font: FontFile, text: string, size: number): number {
  return font.width(text, 400, null) * size
}

function broken(font: FontFile, word: string, size: number, limit: number): string[] {
  const parts: string[] = []
  let part = ''
  for (const letter of word) {
    if (part !== '' && widthOf(font, part + letter, size) > limit) {
      parts.push(part)
      part = ''
    }
    part += letter
  }
  return part === '' ? parts : [...parts, part]
}

export function wrap(
  font: FontFile,
  text: string,
  size: number,
  limit: number,
  maxLines: number,
): { readonly lines: string[]; readonly cut: boolean } {
  const lines: string[] = []
  let line = ''
  const words = text.split(/\s+/).filter((word) => word !== '')
  const pieces = words.flatMap((word) =>
    widthOf(font, word, size) > limit ? broken(font, word, size, limit) : [word],
  )
  for (const piece of pieces) {
    const next = line === '' ? piece : `${line} ${piece}`
    if (line === '' || widthOf(font, next, size) <= limit) {
      line = next
    } else {
      lines.push(line)
      line = piece
    }
  }
  if (line !== '') lines.push(line)
  const cut = lines.length > maxLines
  const kept = lines.slice(0, maxLines)
  if (cut) {
    let last = kept[maxLines - 1] ?? ''
    while (last !== '' && widthOf(font, `${last}…`, size) > limit) {
      last = last.includes(' ') ? last.slice(0, last.lastIndexOf(' ')) : last.slice(0, -1)
    }
    kept[maxLines - 1] = `${last}…`
  }
  return { lines: kept, cut }
}

function titleLines(font: FontFile, title: string): { size: number; lines: string[] } {
  const words = title.split(/\s+/)
  for (const size of [68, 60, 52, 46]) {
    const { lines, cut } = wrap(font, title, size, textWidth, 3)
    const wide = words.some((word) => widthOf(font, word, size) > textWidth)
    if (!cut && !wide) return { size, lines }
  }
  return { size: 46, lines: wrap(font, title, 46, textWidth, 3).lines }
}

async function graphSvg(seed: number): Promise<string> {
  const { nodes: items, links, hub } = sample(seed)
  const graph = createGraph({
    definition: defineGraph({
      marks: [
        nodes(items, { color: (item) => item.group, size: (item) => item.degree }),
        edges(links, { source: (link) => link.from, target: (link) => link.to }),
      ],
      layout: force(),
    }),
    size: { width: graphBox.width, height: graphBox.height },
  })
  await graph.settled()
  graph.selection.set({ nodes: [hub] })
  const svg = await exportSvg(graph, {
    region: 'graph',
    size: { width: graphBox.width, height: graphBox.height },
    padding: 16,
    labels: 'none',
    background: 'transparent',
  })
  graph.destroy()
  return svg.replace(/^<\?xml[^>]*\?>\s*/, '')
}

export async function drawCard(card: Card, fonts: Fonts): Promise<string> {
  const picture = (await graphSvg(card.seed)).replace(
    /<svg\b/,
    `<svg x="${graphBox.x}" y="${graphBox.y}"`,
  )
  const heading = titleLines(fonts.title, card.title)
  const headingHeight = Math.round(heading.size * 1.14)
  const top = 192
  const bottom = top + (heading.lines.length - 1) * headingHeight
  const room = Math.floor((520 - (bottom + 44)) / 38)
  const body = wrap(fonts.body, card.description, 28, textWidth, Math.min(3, Math.max(0, room)))
  const text: string[] = []
  const line = (
    value: string,
    x: number,
    y: number,
    family: string,
    weight: number,
    size: number,
    fill: string,
    extra = '',
  ): void => {
    text.push(
      `<text x="${x}" y="${y}" font-family="${family}" font-weight="${weight}" font-size="${size}" fill="${fill}"${extra}>${escaped(value)}</text>`,
    )
  }
  line(
    card.label.toUpperCase(),
    margin,
    112,
    'Atkinson Hyperlegible Mono',
    600,
    22,
    muted,
    ' letter-spacing="2"',
  )
  heading.lines.forEach((value, at) => {
    line(
      value,
      margin,
      top + at * headingHeight,
      'Atkinson Hyperlegible Next',
      700,
      heading.size,
      ink,
    )
  })
  body.lines.forEach((value, at) => {
    line(value, margin, bottom + 56 + at * 38, 'Atkinson Hyperlegible Next', 400, 28, muted)
  })
  line(card.footer, margin, 566, 'Atkinson Hyperlegible Mono', 600, 24, ink)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cardSize.width}" height="${cardSize.height}" viewBox="0 0 ${cardSize.width} ${cardSize.height}">`,
    `<rect width="${cardSize.width}" height="${cardSize.height}" fill="${paper}"/>`,
    `<rect x="0.5" y="0.5" width="${cardSize.width - 1}" height="${cardSize.height - 1}" fill="none" stroke="${rule}"/>`,
    picture,
    ...text,
    '</svg>',
  ].join('\n')
}
