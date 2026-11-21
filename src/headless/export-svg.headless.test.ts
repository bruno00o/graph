import { describe, expect, it } from 'vitest'
import type { TextWidth } from '../core/label-width'
import { defineGraph } from '../define-graph'
import { exportPng, exportSvg } from '../export'
import { grid } from '../layouts'
import { edges, nodes } from '../marks'
import { createGraph } from './index'

interface Item {
  readonly id: string
  readonly label: string
  readonly image: string | null
}

interface Link {
  readonly id: string
  readonly source: string
  readonly target: string
}

const items: Item[] = [
  { id: 'a', label: 'Alpha', image: 'icons/round.png' },
  { id: 'b', label: 'Bravo', image: 'icons/wide.png' },
  { id: 'c', label: 'Charlie', image: null },
  { id: 'd', label: 'Delta', image: null },
]

const links: Link[] = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
  { id: 'cd', source: 'c', target: 'd' },
]

function graphOf(measureText?: TextWidth, maxWidth?: number) {
  return createGraph({
    definition: defineGraph({
      marks: [
        nodes(items, {
          label: { text: (item) => item.label, maxWidth, background: true },
          image: (item) => item.image,
          size: 30,
        }),
        edges(links, { source: (link) => link.source, target: (link) => link.target }),
      ],
      layout: grid(),
    }),
    title: 'Sample',
    measureText,
  })
}

function withoutIds(svg: string): string {
  return svg.replaceAll(/graph\d+-/g, 'graph-')
}

function texts(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? '')
}

describe('exportSvg without a page', () => {
  it('writes the same document for the same graph', async () => {
    const graph = graphOf()
    await graph.settled()
    const first = await exportSvg(graph, { region: 'graph', labels: 'all' })
    expect(first).toMatch(/^<svg /)
    expect(first).toContain('<title>Sample</title>')
    expect(texts(first)).toEqual(expect.arrayContaining(['Alpha', 'Bravo', 'Charlie', 'Delta']))
    graph.destroy()
    const second = graphOf()
    await second.settled()
    expect(withoutIds(await exportSvg(second, { region: 'graph', labels: 'all' }))).toBe(
      withoutIds(first),
    )
    second.destroy()
  })

  it('measures and cuts the labels with the text measure of the graph', async () => {
    const square: TextWidth = (text) => Array.from(text).length
    const graph = graphOf(square, 40)
    await graph.settled()
    const svg = await exportSvg(graph, { region: 'graph', labels: 'all' })
    expect(texts(svg)).toEqual(expect.arrayContaining(['Al…', 'Br…', 'Ch…', 'De…']))
    const plain = graphOf()
    await plain.settled()
    const wide = await exportSvg(plain, { region: 'graph', labels: 'all' })
    const plates = (document: string) =>
      [...document.matchAll(/<rect [^>]*width="([\d.]+)"[^>]*rx=/g)].map((match) =>
        Number(match[1]),
      )
    const narrow = graphOf((text) => Array.from(text).length * 0.3)
    await narrow.settled()
    const thin = await exportSvg(narrow, { region: 'graph', labels: 'all' })
    expect(Math.max(...plates(wide))).toBeGreaterThan(Math.max(...plates(thin)))
    graph.destroy()
    plain.destroy()
    narrow.destroy()
  })

  it('keeps image URLs as they are and draws them square without the images option', async () => {
    const graph = graphOf()
    await graph.settled()
    const svg = await exportSvg(graph)
    expect(svg).toContain('href="icons/round.png"')
    expect(svg).toContain('href="icons/wide.png"')
    expect(svg).toMatch(/<image x="0" y="0" width="1" height="1"[^>]*href="icons\/wide\.png"/)
    graph.destroy()
  })

  it('reads the images through the images option', async () => {
    const graph = graphOf()
    await graph.settled()
    const asked: string[] = []
    const svg = await exportSvg(graph, {
      images: async (src) => {
        asked.push(src)
        return src.includes('wide')
          ? { href: 'data:image/png;base64,AA', width: 200, height: 100 }
          : null
      },
    })
    expect(asked.sort()).toEqual(['icons/round.png', 'icons/wide.png'])
    expect(svg).not.toContain('icons/')
    expect(svg).toMatch(/<image x="-0\.5" y="0" width="2" height="1"[^>]*href="data:image\/png/)
    graph.destroy()
  })

  it('exports at a size, without grid nor badges', async () => {
    const graph = graphOf()
    await graph.settled()
    const svg = await exportSvg(graph, {
      region: 'graph',
      size: { width: 320, height: 200 },
      grid: false,
      badges: false,
    })
    expect(svg).toMatch(/^<svg [^>]*width="320" height="200"/)
    graph.destroy()
  })

  it('rejects a PNG with a pointer to the SVG recipe', async () => {
    const graph = graphOf()
    await graph.settled()
    // @ts-expect-error
    await expect(exportPng(graph)).rejects.toThrow(TypeError)
    // @ts-expect-error
    await expect(exportPng(graph)).rejects.toThrow('rasterize the document of exportSvg')
    graph.destroy()
    await expect(exportSvg(graph)).rejects.toThrow('graph: cannot export a destroyed graph')
  })
})
