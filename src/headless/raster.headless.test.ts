import { readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { exportSvg } from '../export'
import { edges, nodes } from '../marks'
import { createGraph, readFont } from './index'

interface Spot {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly fill: string
  readonly rgb: readonly [number, number, number]
  readonly label: string
}

const spots: Spot[] = [
  { id: 'a', x: 0, y: 0, fill: '#d0342c', rgb: [208, 52, 44], label: 'West' },
  { id: 'b', x: 200, y: 0, fill: '#1f6fd1', rgb: [31, 111, 209], label: 'East' },
  { id: 'c', x: 100, y: 120, fill: '#2a9d4b', rgb: [42, 157, 75], label: 'South' },
]

const fontUrl = new URL('../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf', import.meta.url)
const fontPath = decodeURIComponent(fontUrl.pathname)

describe('a graph without a page, rasterized by resvg', () => {
  it('draws the nodes, the edges and the labels in the font it measured', async () => {
    const font = readFont(readFileSync(fontUrl))
    expect(font.family).toBe('DejaVu Sans')
    const graph = createGraph({
      definition: defineGraph({
        marks: [
          nodes(spots, {
            x: (spot) => spot.x,
            y: (spot) => spot.y,
            fill: (spot) => spot.fill,
            size: 40,
            label: { text: (spot) => spot.label, size: 24 },
          }),
          edges(
            [
              { id: 'ab', from: 'a', to: 'b' },
              { id: 'bc', from: 'b', to: 'c' },
            ],
            { source: (link) => link.from, target: (link) => link.to },
          ),
        ],
      }),
      theme: { font: font.family },
      measureText: font.width,
    })
    await graph.settled()
    const svg = await exportSvg(graph, {
      region: 'graph',
      size: { width: 400, height: 300 },
      labels: 'all',
      background: '#ffffff',
    })
    graph.destroy()
    const render = (fontFiles: string[]) =>
      new Resvg(svg, {
        font: { loadSystemFonts: false, fontFiles, defaultFontFamily: font.family },
      }).render()
    const image = render([fontPath])
    expect([image.width, image.height]).toEqual([400, 300])
    const png = image.asPng()
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    const count = (pixels: Uint8Array, test: (r: number, g: number, b: number) => boolean) => {
      let found = 0
      for (let at = 0; at < pixels.length; at += 4) {
        if (test(pixels[at] ?? 0, pixels[at + 1] ?? 0, pixels[at + 2] ?? 0)) found++
      }
      return found
    }
    const near = (rgb: readonly number[]) => (r: number, g: number, b: number) =>
      Math.abs(r - (rgb[0] ?? 0)) + Math.abs(g - (rgb[1] ?? 0)) + Math.abs(b - (rgb[2] ?? 0)) < 12
    for (const spot of spots) expect(count(image.pixels, near(spot.rgb))).toBeGreaterThan(400)
    expect(count(image.pixels, near([255, 255, 255]))).toBeGreaterThan(400 * 300 * 0.6)
    const ink = (r: number, g: number, b: number) => Math.max(r, g, b) < 120
    const blank = render([])
    expect(count(blank.pixels, ink)).toBe(0)
    expect(count(image.pixels, ink)).toBeGreaterThan(300)
  })
})
