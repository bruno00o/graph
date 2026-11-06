import { describe, expect, it } from 'vitest'
import { createGraphModel } from '../core/graph-model'
import { Positions, placeNodes } from '../core/positions'
import { createScene } from '../core/scene'
import { StateBuffers } from '../core/state-buffers'
import { defineGraph } from '../define-graph'
import type { LabelMode } from '../host/renderer'
import { edges, nodes } from '../marks'
import { lightTheme } from '../theme/tokens'
import type { GraphDefinitionOptions, StateStyle } from '../types'
import type { LineLayout } from '../webgl/glyph-atlas'
import type { TextMeasure } from '../webgl/label-layer'
import { type ExportFrame, exportFrame } from './frame'
import { fitLabels } from './labels'
import { escapeXml, writeSvg } from './svg'

type Item = {
  id: string
  x: number
  y: number
  label?: string
  image?: string
  shape?: 'circle' | 'square' | 'diamond'
}
type Link = {
  id: string
  from: string
  to: string
  label?: string
  dash?: 'solid' | 'dashed' | 'dotted'
}

const tokenPattern = /^var\(--graph-([a-z0-9-]+)\)$/

function rgba(css: string): [number, number, number, number] {
  const hex = css.replace(tokenPattern, (_, name: string) => lightTheme[name] ?? '#000000')
  const digits = hex.slice(1)
  const channel = (at: number) => Number.parseInt(digits.slice(at, at + 2), 16)
  return [channel(0), channel(2), channel(4), digits.length === 8 ? channel(6) : 255]
}

const measure: TextMeasure = {
  height: 256,
  generation: 0,
  line: (text: string): LineLayout => ({ width: text.length * 12, glyphs: [] }),
  fit: (text: string) => text,
}

interface Setup {
  readonly states?: Record<string, StateStyle>
  readonly members?: Record<string, readonly string[]>
}

function render(
  options: GraphDefinitionOptions,
  setup: Setup = {},
  extra: { labels?: LabelMode; frame?: Partial<ExportFrame>; background?: string } = {},
): string {
  const model = createGraphModel()
  const scene = createScene()
  const definition = defineGraph(options)
  model.setMarks(definition.marks)
  scene.setDefinition(definition)
  const changes = model.flush()
  scene.apply(model, changes)
  const positions = new Positions()
  placeNodes(model, positions, changes)
  const states = new StateBuffers()
  states.reserve(scene.nodes.capacity, scene.edges.capacity)
  const names = Object.keys(setup.states ?? {})
  const highlightedNodes: number[] = []
  const highlightedEdges: number[] = []
  names.forEach((name, bit) => {
    const style = setup.states?.[name] ?? {}
    for (const kind of ['nodes', 'edges'] as const) {
      states.setStyle(kind, bit, {
        ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
        ...(style.strokeWidth !== undefined ? { strokeWidth: style.strokeWidth } : {}),
        ...(style.halo !== undefined ? { halo: style.halo } : {}),
        ...(style.label !== undefined ? { label: style.label } : {}),
        ...(style.stroke !== undefined ? { stroke: scene.palette.id(style.stroke) } : {}),
      })
    }
    for (const key of setup.members?.[name] ?? []) {
      const node = model.node(key)
      const edge = model.edge(key)
      if (node) {
        states.setNode(node.index, (states.nodeMask[node.index] ?? 0) | (1 << bit))
        if (bit < 3) highlightedNodes.push(node.index)
      }
      if (edge) {
        states.setEdge(edge.index, (states.edgeMask[edge.index] ?? 0) | (1 << bit))
        if (bit < 3) highlightedEdges.push(edge.index)
      }
    }
  })
  states.setHighlighted(highlightedNodes, highlightedEdges)
  const colors = scene.palette.colors
  const palette = new Uint8Array(colors.length * 4)
  colors.forEach((color, id) => {
    palette.set(rgba(color), id * 4)
  })
  return writeSvg({
    nodes: scene.nodes,
    edges: scene.edges,
    layers: scene.layers,
    positions,
    states,
    palette,
    theme: {
      labelInk: rgba('#191d22'),
      labelMuted: rgba('#5b6167'),
      labelHalo: rgba('#f7f7f4'),
      halo: rgba('#c9370047'),
      font: '"Display Face", sans-serif',
    },
    frame: {
      view: { x: 0, y: 0, zoom: 1 },
      width: 400,
      height: 300,
      ...extra.frame,
    },
    background: rgba(extra.background ?? '#f7f7f4'),
    labels: extra.labels ?? 'visible',
    measure,
    images: new Map([['icon.svg', { href: 'data:image/svg+xml,%3Csvg%2F%3E', aspect: 2 }]]),
    title: 'Sample <graph>',
  })
}

const pair: GraphDefinitionOptions = {
  marks: [
    edges<Link>([{ id: 'ab', from: 'a', to: 'b' }], { source: 'from', target: 'to' }),
    nodes<Item>(
      [
        { id: 'a', x: -100, y: 0, label: 'Alpha' },
        { id: 'b', x: 100, y: 0, label: 'Beta' },
      ],
      { x: 'x', y: 'y', label: 'label' },
    ),
  ],
}

function count(svg: string, pattern: RegExp): number {
  return svg.match(new RegExp(pattern.source, 'g'))?.length ?? 0
}

describe('escapeXml', () => {
  it('escapes markup and drops characters XML forbids', () => {
    expect(escapeXml(`a & b <c> "d" 'e'\u0001\u0008\ttab`)).toBe(
      'a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;\ttab',
    )
  })
})

describe('writeSvg', () => {
  it('writes a sized document with a title, the theme font and the background', () => {
    const svg = render(pair)
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="400" height="300" viewBox="0 0 400 300" font-family="&quot;Display Face&quot;, sans-serif"/,
    )
    expect(svg).toContain('<title>Sample &lt;graph&gt;</title>')
    expect(svg).toContain('<rect width="400" height="300" fill="#f7f7f4"/>')
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(render(pair, {}, { background: '#00000000' })).not.toContain('<rect width="400"')
  })

  it('draws edges under nodes, nodes in world positions and labels last', () => {
    const svg = render(pair)
    const edge = svg.indexOf('<path d="M-')
    const firstNode = svg.indexOf('<circle cx="100" cy="150" r="8"')
    const label = svg.indexOf('>Alpha</text>')
    expect(svg).toContain('<path d="M108 150L292 150" fill="none" stroke="#7f858c"')
    expect(edge).toBe(-1)
    expect(firstNode).toBeGreaterThan(svg.indexOf('M108 150L292 150'))
    expect(label).toBeGreaterThan(firstNode)
    expect(svg).toContain('<circle cx="100" cy="150" r="8" fill="#474e55"/>')
    expect(svg).toContain('<circle cx="100" cy="150" r="7.5" fill="none" stroke="#f7f7f4"')
  })

  it('escapes label text and keeps the halo under the ink', () => {
    const svg = render({
      marks: [
        nodes<Item>([{ id: 'a', x: 0, y: 0, label: 'Tom & <Jerry> "quoted"' }], {
          x: 'x',
          y: 'y',
          label: 'label',
        }),
      ],
    })
    expect(svg).toContain('>Tom &amp; &lt;Jerry&gt; &quot;quoted&quot;</text>')
    expect(svg).not.toContain('<Jerry>')
    expect(svg).toMatch(
      /<g transform="translate\(200 161\) scale\(0.5\)"><text x="0" y="24" text-anchor="middle" font-size="24" font-weight="500" fill="#191d22" stroke="#f7f7f4" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke">/,
    )
  })

  it('bends parallel edges and loops with cubic curves and closes arrow heads', () => {
    const svg = render({
      marks: [
        edges<Link>(
          [
            { id: 'ab', from: 'a', to: 'b' },
            { id: 'ba', from: 'b', to: 'a' },
            { id: 'aa', from: 'a', to: 'a' },
          ],
          { source: 'from', target: 'to', arrow: 'target' },
        ),
        nodes<Item>(
          [
            { id: 'a', x: -100, y: 0 },
            { id: 'b', x: 100, y: 0 },
          ],
          { x: 'x', y: 'y' },
        ),
      ],
    })
    expect(count(svg, /<path d="M[\d.-]+ [\d.-]+C/)).toBe(3)
    expect(count(svg, /<path d="M[^"]+Z" fill="#7f858c"\/>/)).toBe(3)
    expect(svg).not.toMatch(/<path d="M[\d.-]+ [\d.-]+L[\d.-]+ [\d.-]+" fill="none"/)
  })

  it('dashes and dots the body of an edge', () => {
    const dashed = render({
      marks: [
        edges<Link>([{ id: 'ab', from: 'a', to: 'b', dash: 'dashed' }], {
          source: 'from',
          target: 'to',
          dash: (link) => link.dash ?? 'solid',
        }),
        nodes<Item>(
          [
            { id: 'a', x: -100, y: 0 },
            { id: 'b', x: 100, y: 0 },
          ],
          { x: 'x', y: 'y' },
        ),
      ],
    })
    expect(dashed).toContain('stroke-dasharray="4.8 3.2" stroke-dashoffset="0"')
    const dotted = render({
      marks: [
        edges<Link>([{ id: 'ab', from: 'a', to: 'b' }], {
          source: 'from',
          target: 'to',
          dash: 'dotted',
        }),
        nodes<Item>(
          [
            { id: 'a', x: -100, y: 0 },
            { id: 'b', x: 100, y: 0 },
          ],
          { x: 'x', y: 'y' },
        ),
      ],
    })
    expect(dotted).toContain(
      'stroke-width="2" stroke-linecap="round" stroke-dasharray="0 4" stroke-dashoffset="-2"',
    )
  })

  it('applies state styles and draws highlighted elements on top', () => {
    const svg = render(pair, {
      states: {
        selected: { stroke: '#c93700', strokeWidth: 2, halo: true, label: true },
        hovered: {},
        focused: {},
        muted: { opacity: 0.25, label: false },
      },
      members: { selected: ['a'], muted: ['b'] },
    })
    const muted = svg.indexOf('<g opacity="0.25"><circle cx="300"')
    const selected = svg.indexOf('<circle cx="100" cy="150" r="7" fill="none" stroke="#c93700"')
    expect(muted).toBeGreaterThan(-1)
    expect(selected).toBeGreaterThan(muted)
    expect(svg).toMatch(
      /<circle cx="100" cy="150" r="11" fill="none" stroke="#c93700" stroke-opacity="[\d.]+" stroke-width="6"\/>/,
    )
    expect(svg).toContain('>Alpha</text>')
    expect(svg).not.toContain('>Beta</text>')
  })

  it('keeps visible labels apart and draws them all on demand', () => {
    const crowded: GraphDefinitionOptions = {
      marks: [
        nodes<Item>(
          [
            { id: 'a', x: 0, y: 0, label: 'First' },
            { id: 'b', x: 2, y: 0, label: 'Second' },
          ],
          { x: 'x', y: 'y', label: 'label' },
        ),
      ],
    }
    expect(count(render(crowded), /<text /)).toBe(1)
    expect(count(render(crowded, {}, { labels: 'all' }), /<text /)).toBe(2)
    expect(count(render(crowded, {}, { labels: 'none' }), /<text /)).toBe(0)
    const far = { frame: { view: { x: 0, y: 0, zoom: 0.4 } } }
    expect(count(render(crowded, {}, far), /<text /)).toBe(0)
    expect(count(render(crowded, {}, { ...far, labels: 'all' }), /<text /)).toBe(2)
  })

  it('clips images to the shape and tints them with a filter', () => {
    const svg = render({
      marks: [
        nodes<Item>([{ id: 'a', x: 0, y: 0, shape: 'square' }], {
          x: 'x',
          y: 'y',
          size: () => 40,
          shape: (item) => item.shape ?? 'circle',
          image: { src: 'icon.svg', scale: 0.5, color: '#ff0000' },
        }),
      ],
      scales: { size: (value) => value },
    })
    expect(svg).toMatch(
      /<symbol id="graph\d+-i0" viewBox="0 0 1 1"><image x="-0.5" y="0" width="2" height="1" preserveAspectRatio="none" href="data:image\/svg\+xml,%3Csvg%2F%3E"\/><\/symbol>/,
    )
    expect(svg).toMatch(
      /<clipPath id="graph\d+-c0"><rect x="-0.36" y="-0.36" width="1.72" height="1.72"\/><\/clipPath>/,
    )
    expect(svg).toMatch(/<feFlood flood-color="#ff0000"\/>/)
    expect(svg).toMatch(
      /<use href="#graph\d+-i0" width="1" height="1" transform="translate\(190 140\) scale\(20\)" clip-path="url\(#graph\d+-c0\)" filter="url\(#graph\d+-t0\)"\/>/,
    )
  })

  it('draws badges as pills with their text', () => {
    const svg = render({
      marks: [
        nodes<Item>([{ id: 'a', x: 0, y: 0 }], {
          x: 'x',
          y: 'y',
          size: () => 40,
          badges: { topRight: () => ({ text: 7 }), bottomLeft: () => ({}) },
        }),
      ],
      scales: { size: (value) => value },
    })
    expect(count(svg, /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="19.5" rx="9.75"/)).toBe(2)
    expect(svg).toMatch(
      /scale\(0.495\)" text-anchor="middle" font-size="24" font-weight="500" fill="#f7f7f4">7<\/text>/,
    )
  })

  it('rotates edge labels along their edge and keeps them upright', () => {
    const svg = render({
      marks: [
        edges<Link>([{ id: 'ba', from: 'b', to: 'a', label: 'link' }], {
          source: 'from',
          target: 'to',
          label: 'label',
        }),
        nodes<Item>(
          [
            { id: 'a', x: -100, y: 100 },
            { id: 'b', x: 100, y: -100 },
          ],
          { x: 'x', y: 'y' },
        ),
      ],
    })
    expect(svg).toContain('<g transform="translate(200 150) rotate(-45)">')
    expect(svg).toContain('>link</text>')
  })
})

describe('exportFrame', () => {
  const model = createGraphModel()
  const scene = createScene()
  const definition = defineGraph({
    marks: [
      nodes<Item>(
        [
          { id: 'a', x: -100, y: -50 },
          { id: 'b', x: 300, y: 50 },
        ],
        { x: 'x', y: 'y', size: () => 20 },
      ),
    ],
    scales: { size: (value) => value },
  })
  model.setMarks(definition.marks)
  scene.setDefinition(definition)
  const changes = model.flush()
  scene.apply(model, changes)
  const positions = new Positions()
  placeNodes(model, positions, changes)
  const source = {
    nodes: scene.nodes,
    edges: scene.edges,
    positions,
    view: { x: 10, y: 20, zoom: 2 },
    width: 800,
    height: 600,
  }

  it('keeps the visible area and scales its size with the zoom', () => {
    expect(exportFrame(source, { region: 'view', zoom: undefined, padding: 32 })).toEqual({
      view: { x: 10, y: 20, zoom: 2 },
      width: 800,
      height: 600,
    })
    expect(exportFrame(source, { region: 'view', zoom: 4, padding: 32 })).toEqual({
      view: { x: 10, y: 20, zoom: 4 },
      width: 1600,
      height: 1200,
    })
  })

  it('frames every node with its radius and the padding', () => {
    expect(exportFrame(source, { region: 'graph', zoom: 1, padding: 10 })).toEqual({
      view: { x: 100, y: 0, zoom: 1 },
      width: 440,
      height: 140,
    })
    expect(() => exportFrame(source, { region: 'graph', zoom: 0, padding: 10 })).toThrow(RangeError)
  })
})

describe('fitLabels', () => {
  function frameOf(options: GraphDefinitionOptions, labels: LabelMode) {
    const model = createGraphModel()
    const scene = createScene()
    const definition = defineGraph(options)
    model.setMarks(definition.marks)
    scene.setDefinition(definition)
    const changes = model.flush()
    scene.apply(model, changes)
    const positions = new Positions()
    placeNodes(model, positions, changes)
    const states = new StateBuffers()
    states.reserve(scene.nodes.capacity, scene.edges.capacity)
    const source = { nodes: scene.nodes, edges: scene.edges, positions, states }
    const frame = exportFrame(
      { ...source, view: { x: 0, y: 0, zoom: 1 }, width: 400, height: 300 },
      { region: 'graph', zoom: 1, padding: 10 },
    )
    return labels === 'none' ? frame : fitLabels(source, frame, labels, measure, 10)
  }

  const labelled: GraphDefinitionOptions = {
    marks: [
      nodes<Item>([{ id: 'a', x: 0, y: 0, label: 'abcdefghij' }], {
        x: 'x',
        y: 'y',
        size: () => 20,
        label: 'label',
      }),
    ],
    scales: { size: (value) => value },
  }

  it('grows the graph frame to hold every label with its halo', () => {
    const fitted = frameOf(labelled, 'visible')
    expect(fitted.width).toBeCloseTo(81.6)
    expect(fitted.height).toBeCloseTo(58.8)
    expect(fitted.view.x).toBeCloseTo(0)
    expect(fitted.view.y).toBeCloseTo(9.4)
    expect(frameOf(labelled, 'none')).toEqual({
      view: { x: 0, y: 0, zoom: 1 },
      width: 40,
      height: 40,
    })
  })

  it('frames loops beyond their node', () => {
    const fitted = frameOf(
      {
        marks: [
          edges<Link>([{ id: 'l', from: 'a', to: 'a' }], { source: 'from', target: 'to' }),
          nodes<Item>([{ id: 'a', x: 0, y: 0 }], { x: 'x', y: 'y', size: () => 20 }),
        ],
        scales: { size: (value) => value },
      },
      'none',
    )
    expect(fitted.width).toBeGreaterThan(50)
    expect(fitted.view.x).toBeGreaterThan(5)
    expect(fitted.view.y).toBeLessThan(-5)
  })
})
