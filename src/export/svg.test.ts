import { describe, expect, it } from 'vitest'
import { gridInput } from '../core/background-grid'
import { BridgeFinder, BridgeSet } from '../core/bridges'
import type { EdgeColumns } from '../core/columns'
import { EdgePaths } from '../core/edge-paths'
import { flowSpeed } from '../core/flow'
import { createGraphModel } from '../core/graph-model'
import { HullLayer } from '../core/hull-layer'
import { Positions, placeNodes } from '../core/positions'
import { Projection } from '../core/projection'
import { createScene } from '../core/scene'
import { StateBuffers } from '../core/state-buffers'
import { readWindow, timeFilter } from '../core/time-range'
import { defineGraph } from '../define-graph'
import { ContainerBoxes } from '../host/containers'
import type { LabelMode } from '../host/renderer'
import { hull } from '../hulls'
import { edges, nodes } from '../marks'
import { shapes } from '../shapes'
import { lightTheme } from '../theme/tokens'
import type {
  BridgeShape,
  GraphDefinitionOptions,
  Hull,
  Key,
  NodeOptions,
  ShapeGeometry,
  ShapeOptions,
  StateLook,
  StateStyle,
} from '../types'
import type { LineLayout } from '../webgl/glyph-atlas'
import type { TextMeasure } from '../webgl/label-layer'
import { type ExportFrame, exportFrame } from './frame'
import { fitLabels, selectLabels } from './labels'
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

function arches(edges: EdgeColumns, positions: Positions, height: number): EdgePaths {
  const listed: number[] = []
  const ends: number[] = []
  const points: number[] = []
  const offsets = [0]
  for (let index = 0; index < edges.capacity; index++) {
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
    if (edges.alive[index] !== 1 || source === target) continue
    listed.push(index)
    ends.push(source, target)
    for (let k = 0; k <= 10; k++) {
      const u = k / 10
      points.push(
        positions.x(source) + (positions.x(target) - positions.x(source)) * u,
        positions.y(source) +
          (positions.y(target) - positions.y(source)) * u +
          Math.sin(Math.PI * u) * height,
      )
    }
    offsets.push(points.length / 2)
  }
  const paths = new EdgePaths()
  paths.reserve(edges.capacity)
  paths.start(
    {
      edges: Uint32Array.from(listed),
      ends: Uint32Array.from(ends),
      paths: { offsets: Uint32Array.from(offsets), points: Float32Array.from(points) },
    },
    1,
    positions,
  )
  paths.mix = 1
  return paths
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
  extra: {
    labels?: LabelMode
    frame?: Partial<ExportFrame>
    background?: string
    time?: number
    arch?: number
    bridges?: BridgeShape
    waypoints?: boolean
  } = {},
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
  const alwaysNodes: number[] = []
  names.forEach((name, bit) => {
    const style = setup.states?.[name] ?? {}
    const look = (from: StateLook) => ({
      ...(from.opacity !== undefined ? { opacity: from.opacity } : {}),
      ...(from.strokeWidth !== undefined ? { strokeWidth: from.strokeWidth } : {}),
      ...(from.halo !== undefined ? { halo: from.halo } : {}),
      ...(from.label !== undefined ? { label: from.label } : {}),
      ...(from.stroke !== undefined ? { stroke: scene.palette.id(from.stroke) } : {}),
      ...(from.flow !== undefined ? { flow: flowSpeed(from.flow) } : {}),
    })
    for (const kind of ['nodes', 'edges'] as const) {
      states.setStyle(
        kind,
        bit,
        { ...look(style), raise: style.raise ?? bit < 3 },
        style.others ? look(style.others) : null,
      )
    }
    for (const key of setup.members?.[name] ?? []) {
      const node = model.node(key)
      if (node && style.label === 'always') alwaysNodes.push(node.index)
    }
    for (const key of setup.members?.[name] ?? []) {
      const node = model.node(key)
      const edge = model.edge(key)
      if (node) {
        states.setNode(node.index, (states.nodeMask[node.index] ?? 0) | (1 << bit))
        if (style.raise ?? bit < 3) highlightedNodes.push(node.index)
      }
      if (edge) {
        states.setEdge(edge.index, (states.edgeMask[edge.index] ?? 0) | (1 << bit))
        if (style.raise ?? bit < 3) highlightedEdges.push(edge.index)
      }
    }
  })
  states.setHighlighted(highlightedNodes, highlightedEdges)
  states.setAlways(alwaysNodes, [])
  const hulls = new HullLayer()
  hulls.setHulls(definition.hulls)
  hulls.update(
    { model, nodes: scene.nodes, positions, palette: scene.palette, stateNodes: () => [] },
    Number.POSITIVE_INFINITY,
    () => 0,
  )
  const bridges = new BridgeSet()
  if (extra.bridges) {
    bridges.shape = extra.bridges
    new BridgeFinder({
      edges: scene.edges,
      positions,
      paths: null,
      radius: () => 5,
      shown: () => true,
      maxEdges: 100,
    }).step(Number.POSITIVE_INFINITY, bridges)
  }
  const grid = gridInput(definition.background, scene.palette)
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
    grid,
    shapes: scene.shapes,
    hulls: hulls.shapes,
    palette,
    theme: {
      labelInk: rgba('#191d22'),
      labelMuted: rgba('#5b6167'),
      labelHalo: rgba('#f7f7f4'),
      labelPaper: rgba('#f7f7f4'),
      halo: rgba('#c9370047'),
      lensFill: rgba('#f7f7f4'),
      lensRing: rgba('#5b6167'),
      lensShadow: rgba('#191d2229'),
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
    ...(extra.time !== undefined ? { time: extra.time } : {}),
    ...(extra.arch !== undefined ? { bundles: arches(scene.edges, positions, extra.arch) } : {}),
    ...(extra.bridges ? { bridges } : {}),
    ...(extra.waypoints ? { bundles: waypointPaths(scene.edges) } : {}),
  })
}

function waypointPaths(edges: EdgeColumns): EdgePaths {
  const paths = new EdgePaths()
  paths.fixed = edges.waypoints
  paths.reserve(edges.capacity)
  return paths
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

type Member = {
  id: string
  x?: number
  y?: number
  parent?: string
  shape?: 'rectangle' | 'circle'
}

const members: Member[] = [
  { id: 'g' },
  { id: 'h', shape: 'circle' },
  { id: 'a', parent: 'g', x: -100, y: 0 },
  { id: 'b', parent: 'g', x: -40, y: 0 },
  { id: 'c', parent: 'h', x: 100, y: 0 },
]

function renderGroups(
  folded: Key[] = [],
  hulls: Hull<never>[] = [],
  betweenGroups: 'members' | 'groups' = 'members',
) {
  const model = createGraphModel()
  const scene = createScene()
  const projection = new Projection(model)
  projection.setFolded(folded)
  const definition = defineGraph({
    marks: [
      edges<Link>([{ id: 'ac', from: 'a', to: 'c' }], {
        source: 'from',
        target: 'to',
        betweenGroups,
      }),
      nodes<Member>(members, {
        x: 'x',
        y: 'y',
        parent: 'parent',
        label: 'id',
        container: { shape: (member) => member.shape ?? 'rectangle' },
      }),
    ],
    hulls,
  })
  model.setMarks(definition.marks)
  scene.setDefinition(definition)
  const changes = model.flush()
  const projected = projection.apply(changes)
  scene.apply(projection.view, projected.scene)
  const positions = new Positions()
  placeNodes(model, positions, changes)
  const containers = new ContainerBoxes()
  containers.sync(
    projection.containers,
    projection.containerVersion,
    projection.hierarchy,
    scene.nodes,
    positions,
    1,
    1,
  )
  scene.nodes.containerBoxes = containers.boxes
  const layer = new HullLayer()
  layer.setHulls(definition.hulls)
  layer.update(
    {
      model,
      nodes: scene.nodes,
      positions,
      palette: scene.palette,
      containers,
      stateNodes: () => [],
    },
    Number.POSITIVE_INFINITY,
    () => 0,
  )
  const states = new StateBuffers()
  states.reserve(scene.nodes.capacity, scene.edges.capacity)
  const palette = new Uint8Array(scene.palette.colors.length * 4)
  scene.palette.colors.forEach((color, id) => {
    palette.set(rgba(color), id * 4)
  })
  const svg = writeSvg({
    nodes: scene.nodes,
    edges: scene.edges,
    layers: scene.layers,
    positions,
    states,
    containers,
    hulls: layer.shapes,
    palette,
    theme: {
      labelInk: rgba('#191d22'),
      labelMuted: rgba('#5b6167'),
      labelHalo: rgba('#f7f7f4'),
      labelPaper: rgba('#f7f7f4'),
      halo: rgba('#c9370047'),
      lensFill: rgba('#f7f7f4'),
      lensRing: rgba('#5b6167'),
      lensShadow: rgba('#191d2229'),
      font: 'sans-serif',
    },
    frame: { view: { x: 0, y: 0, zoom: 1 }, width: 400, height: 300 },
    background: rgba('#f7f7f4'),
    labels: 'all',
    measure,
    images: new Map(),
    title: null,
  })
  const frame = exportFrame(
    {
      nodes: scene.nodes,
      edges: scene.edges,
      positions,
      boxes: containers.boxes,
      hulls: layer.shapes,
      view: { x: 0, y: 0, zoom: 1 },
      width: 400,
      height: 300,
    },
    { region: 'graph', zoom: 1, padding: 0 },
  )
  return { svg, frame }
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

  it('draws each end in its own color and width, with a continuous dash pattern', () => {
    const split = (states: Setup = {}) =>
      render(
        {
          marks: [
            edges<Link>([{ id: 'ab', from: 'a', to: 'b' }], {
              source: 'from',
              target: 'to',
              arrow: 'target',
              dash: 'dashed',
              ends: {
                split: () => 0.25,
                source: { stroke: () => '#ff0000', width: () => 2 },
                target: { stroke: () => '#0000ff', width: () => 4, label: () => 'end' },
              },
            }),
            nodes<Item>(
              [
                { id: 'a', x: -100, y: 0 },
                { id: 'b', x: 100, y: 0 },
              ],
              { x: 'x', y: 'y', size: () => 20 },
            ),
          ],
          scales: { size: (value) => value, width: (value) => value },
        },
        states,
      )
    const svg = split()
    const piece =
      /<path d="M([\d.-]+) [\d.-]+L([\d.-]+) [\d.-]+" fill="none" stroke="(#[0-9a-f]+)" stroke-width="(\d+)" stroke-dasharray="12 8" stroke-dashoffset="([\d.]+)"/g
    expect([...svg.matchAll(piece)].map((match) => match.slice(1))).toEqual([
      ['110', '155', '#ff0000', '2', '0'],
      ['155', '274', '#0000ff', '4', '45'],
    ])
    expect(svg).toContain('fill="#0000ff"/>')
    expect(svg).toContain('>end</text>')
    const lit = split({ states: { lit: { stroke: '#00ff00' } }, members: { lit: ['ab'] } })
    expect(lit).not.toContain('#ff0000')
    expect(lit).not.toContain('stroke="#0000ff"')
  })

  it('draws flowing edges as dashes moved to the time of the export', () => {
    const flowing = (flow: boolean | number): GraphDefinitionOptions => ({
      marks: [
        edges<Link>([{ id: 'ab', from: 'a', to: 'b' }], { source: 'from', target: 'to', flow }),
        nodes<Item>(
          [
            { id: 'a', x: -100, y: 0 },
            { id: 'b', x: 100, y: 0 },
          ],
          { x: 'x', y: 'y' },
        ),
      ],
    })
    expect(render(flowing(true))).toContain('stroke-dasharray="4.8 3.2" stroke-dashoffset="0"')
    expect(render(flowing(true), {}, { time: 0.05 })).toContain('stroke-dashoffset="6"')
    expect(render(flowing(-40), {}, { time: 0.05 })).toContain('stroke-dashoffset="2"')
    expect(render(flowing(false), {}, { time: 0.05 })).not.toContain('stroke-dasharray')
    const stopped = render(
      flowing(true),
      { states: { still: { flow: false } }, members: { still: ['ab'] } },
      { time: 0.05 },
    )
    expect(stopped).not.toContain('stroke-dasharray')
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

  it('draws the others of a state and its always labels below the threshold', () => {
    const svg = render(
      pair,
      {
        states: {
          selected: {},
          hovered: {},
          focused: {},
          near: { label: 'always', others: { opacity: 0.25 } },
        },
        members: { near: ['a'] },
      },
      { frame: { view: { x: 0, y: 0, zoom: 0.3 } } },
    )
    expect(svg).toContain('>Alpha</text>')
    expect(svg).not.toContain('>Beta</text>')
    expect(svg).toContain('<g opacity="0.25"><circle cx="230"')
    expect(svg).not.toContain('<g opacity="0.25"><circle cx="170"')
  })

  it('draws the members of a raised free state on top, as on screen', () => {
    const plain = { selected: {}, hovered: {}, focused: {} }
    const drawn = (raise: boolean) =>
      render(pair, {
        states: { ...plain, path: { stroke: '#c93700', raise } },
        members: { path: ['a'] },
      })
    const order = (svg: string) => [
      svg.indexOf('<circle cx="100" cy="150"'),
      svg.indexOf('<circle cx="300" cy="150"'),
    ]
    const [below, above] = order(drawn(false))
    expect(below).toBeGreaterThan(-1)
    expect(below).toBeLessThan(above ?? 0)
    const [raised, other] = order(drawn(true))
    expect(raised).toBeGreaterThan(other ?? 0)
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

  const boxes = (
    extra: Partial<NodeOptions<Item, undefined, undefined>> = {},
  ): GraphDefinitionOptions => ({
    marks: [
      edges<Link>(
        [
          { id: 'ab', from: 'a', to: 'b' },
          { id: 'aa', from: 'a', to: 'a' },
        ],
        { source: 'from', target: 'to', arrow: 'target' },
      ),
      nodes<Item>(
        [
          { id: 'a', x: -100, y: 0, label: 'Alpha', shape: 'square' },
          { id: 'b', x: 100, y: 0, label: 'Beta' },
        ],
        {
          x: 'x',
          y: 'y',
          label: 'label',
          shape: 'box',
          size: 20,
          width: 80,
          cornerRadius: 4,
          fill: (item) => (item.shape === 'square' ? '#1f2a44' : '#f2e6b0'),
          ...extra,
        },
      ),
    ],
  })

  it('draws boxes as rounded rectangles and stops edges at their border', () => {
    const svg = render(boxes())
    expect(svg).toContain('<rect x="60" y="140" width="80" height="20" rx="4" fill="#1f2a44"/>')
    expect(svg).toContain('<rect x="260" y="140" width="80" height="20" rx="4" fill="#f2e6b0"/>')
    expect(svg).toMatch(/<path d="M140 150L2[45]\d(\.\d+)? 150" fill="none"/)
    expect(svg).toMatch(/<path d="M140 147\.05C[^"]+" fill="none"/)
    expect(svg).toMatch(/<path d="M132\.95 140L/)
  })

  it('writes the label inside a box in paper on a dark fill and in ink on a light one', () => {
    const svg = render(boxes())
    expect(svg).toMatch(/fill="#f7f7f4">Alpha<\/text>/)
    expect(svg).toMatch(/fill="#191d22">Beta<\/text>/)
    expect(svg).not.toMatch(/stroke="#f7f7f4" stroke-width="3.2"[^>]*>(Alpha|Beta)</)
    const colored = render(boxes({ label: { text: 'label', color: '#ff0000' } }))
    expect(colored).toMatch(/fill="#ff0000">Alpha<\/text>/)
  })

  it('places badges on the corners of a box', () => {
    const svg = render(
      boxes({ size: 40, width: 120, cornerRadius: 0, badges: { topRight: () => ({}) } }),
    )
    expect(svg).toContain('<rect x="150.25" y="120.25" width="19.5" height="19.5" rx="9.75"')
  })

  it('draws unfolded groups as containers behind the edges and the nodes', () => {
    const { svg, frame } = renderGroups()
    const box = '<rect x="76" y="126" width="108" height="48" rx="16" fill="#e7efee"/>'
    const border =
      '<rect x="76.5" y="126.5" width="107" height="47" rx="15.5" fill="none" stroke="#6e8d8b" stroke-width="1"/>'
    const ring = '<circle cx="300" cy="150" r="24" fill="#e7efee"/>'
    expect(svg).toContain(box)
    expect(svg).toContain(border)
    expect(svg).toContain(ring)
    expect(svg).toContain(
      '<circle cx="300" cy="150" r="23.5" fill="none" stroke="#6e8d8b" stroke-width="1"/>',
    )
    const edge = svg.indexOf('<path d="M')
    expect(svg.indexOf(box)).toBeLessThan(edge)
    expect(svg.indexOf(ring)).toBeLessThan(edge)
    expect(count(svg, /fill="#e7efee"/)).toBe(2)
    const title = /translate\(130 ([\d.]+)\) scale/.exec(svg)
    expect(Number(title?.[1])).toBeLessThan(126)
    expect(frame).toEqual({ view: { x: 0, y: 0, zoom: 1 }, width: 248, height: 48 })
  })

  it('draws an edge between groups from container border to container border', () => {
    const { svg } = renderGroups([], [], 'groups')
    expect(svg).toContain('<path d="M184 150L276 150"')
  })

  it('draws hulls over the containers and under the edges, around the container boxes', () => {
    const { svg, frame } = renderGroups([], [hull({ nodes: ['g', 'c'], fill: '#ff0000' })])
    const path = svg.match(/<path d="([^"]+)" fill="#ff0000"\/>/)?.[1] ?? ''
    const xs = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number).filter((_, at) => at % 2 === 0)
    expect(Math.min(...xs)).toBeCloseTo(76 - 16, 0)
    const at = svg.indexOf('fill="#ff0000"')
    expect(svg.indexOf('<circle cx="300" cy="150" r="24" fill="#e7efee"/>')).toBeLessThan(at)
    expect(svg.indexOf('rx="16" fill="#e7efee"')).toBeLessThan(at)
    expect(at).toBeLessThan(svg.indexOf('<path d="M', at + 1))
    expect(frame.width).toBeGreaterThan(248 + 16)
  })

  it('draws a folded group as a node, without a container', () => {
    const { svg } = renderGroups(['g'])
    expect(svg).not.toContain('rx="16"')
    expect(count(svg, /fill="#e7efee"/)).toBe(1)
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

describe('bridges', () => {
  const crossing: GraphDefinitionOptions = {
    marks: [
      edges<Link>(
        [
          { id: 'ab', from: 'a', to: 'b' },
          { id: 'cd', from: 'c', to: 'd' },
        ],
        { source: 'from', target: 'to' },
      ),
      nodes<Item>(
        [
          { id: 'a', x: -100, y: 0 },
          { id: 'b', x: 100, y: 0 },
          { id: 'c', x: 0, y: -100 },
          { id: 'd', x: 0, y: 100 },
        ],
        { x: 'x', y: 'y' },
      ),
    ],
  }

  const bodies = (svg: string) =>
    [...svg.matchAll(/<path d="(M[^"]+)" fill="none"/g)].map((match) => match[1] ?? '')

  it('hops the horizontal edge over the vertical one with a half circle', () => {
    const [horizontal, vertical] = bodies(render(crossing, {}, { bridges: 'arc' }))
    expect(horizontal).toMatch(/L196 150A4 4 0 0 1 204 150L/)
    expect(vertical).not.toMatch(/A/)
  })

  it('breaks the line for a gap', () => {
    const [horizontal] = bodies(render(crossing, {}, { bridges: 'gap' }))
    expect(horizontal).toMatch(/L196 150M204 150L/)
  })

  it('draws plain lines without bridges', () => {
    const [horizontal] = bodies(render(crossing))
    expect(count(horizontal ?? '', /[AM]/g)).toBe(1)
  })
})

describe('bundled edges', () => {
  const bundled = (label?: string): GraphDefinitionOptions => ({
    marks: [
      edges<Link>([{ id: 'ab', from: 'a', to: 'b', ...(label ? { label } : {}) }], {
        source: 'from',
        target: 'to',
        arrow: 'target',
        label: 'label',
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

  it('draws a bundled edge along its path with its arrow head', () => {
    const svg = render(bundled(), {}, { arch: 60 })
    const body = svg.match(/<path d="(M[^"]+)" fill="none"/)?.[1] ?? ''
    expect(count(body, /L/g)).toBeGreaterThan(4)
    const ys = [...body.matchAll(/[ML][\d.-]+ ([\d.-]+)/g)].map((match) => Number(match[1]))
    expect(Math.max(...ys)).toBeCloseTo(210, 0)
    expect(count(svg, /<path d="M[^"]+Z" fill="#7f858c"\/>/)).toBe(1)
  })

  it('anchors the label of a bundled edge at the middle of its path', () => {
    const svg = render(bundled('link'), {}, { arch: 60 })
    expect(svg).toMatch(/<g transform="translate\(200 210\)/)
  })
})

describe('waypoint edges', () => {
  const routed = (via: [number, number][]): GraphDefinitionOptions => ({
    marks: [
      edges<Link & { via: [number, number][] }>(
        [{ id: 'ab', from: 'a', to: 'b', label: 'link', via }],
        {
          source: 'from',
          target: 'to',
          arrow: 'target',
          label: 'label',
          waypoints: 'via',
        },
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

  it('draws the edge through its waypoints with sharp corners and its arrow head', () => {
    const svg = render(routed([[0, 80]]), {}, { waypoints: true })
    const body = svg.match(/<path d="(M[^"]+)" fill="none"/)?.[1] ?? ''
    expect(body).toContain('L200 230')
    expect(count(body, /L/g)).toBe(2)
    expect(count(svg, /<path d="M[^"]+Z" fill="#7f858c"\/>/)).toBe(1)
  })

  it('anchors the label at the middle of the path length', () => {
    const svg = render(routed([[0, 80]]), {}, { waypoints: true })
    expect(svg).toMatch(/<g transform="translate\(200 230\)/)
  })

  it('draws a straight edge without waypoints', () => {
    const svg = render(routed([]), {}, { waypoints: true })
    const body = svg.match(/<path d="(M[^"]+)" fill="none"/)?.[1] ?? ''
    expect(count(body, /L/g)).toBe(1)
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

  it('frames hulls with their screen padding and outline', () => {
    const hulls = new HullLayer()
    hulls.setHulls([hull({ nodes: ['a', 'b'], padding: 20, strokeWidth: 4 })])
    hulls.update(
      { model, nodes: scene.nodes, positions, palette: scene.palette, stateNodes: () => [] },
      Number.POSITIVE_INFINITY,
      () => 0,
    )
    const framed = exportFrame(
      { ...source, hulls: hulls.shapes },
      { region: 'graph', zoom: 1, padding: 10 },
    )
    expect(framed.width).toBeCloseTo(400 + (10 + 20 + 2) * 2 + 20, 0)
    expect(framed.view.x).toBeCloseTo(100, 1)
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

describe('graph region with labels', () => {
  type Timed = Item & { at: number }
  const front: Timed[] = [{ id: 'a', x: 0, y: 0, label: 'Shown', at: 10 }]
  const back: Timed[] = [{ id: 'b', x: 400, y: 0, label: 'Gone', at: 1000 }]
  const theme = {
    labelInk: rgba('#191d22'),
    labelMuted: rgba('#5b6167'),
    labelHalo: rgba('#f7f7f4'),
    labelPaper: rgba('#f7f7f4'),
    halo: rgba('#c9370047'),
    lensFill: rgba('#f7f7f4'),
    lensRing: rgba('#5b6167'),
    lensShadow: rgba('#191d2229'),
    font: 'sans-serif',
  }

  function exported(filter: 'layer' | 'time' | 'hide', labels: LabelMode) {
    const model = createGraphModel()
    const scene = createScene()
    const definition = defineGraph({
      marks: [
        nodes(front, {
          name: 'front',
          layer: 'front',
          x: 'x',
          y: 'y',
          label: 'label',
          time: 'at',
        }),
        nodes(back, {
          name: 'back',
          layer: 'back',
          x: 'x',
          y: 'y',
          label: 'label',
          time: 'at',
        }),
      ],
    })
    model.setMarks(definition.marks)
    scene.setDefinition(definition)
    const changes = model.flush()
    scene.apply(model, changes)
    const positions = new Positions()
    placeNodes(model, positions, changes)
    const states = new StateBuffers()
    states.reserve(scene.nodes.capacity, scene.edges.capacity)
    if (filter === 'hide') {
      states.setStyle('nodes', 3, { hide: true })
      states.setNode(model.node('b')?.index ?? 0, 1 << 3)
    }
    const source = { nodes: scene.nodes, edges: scene.edges, positions, states }
    const given = exportFrame(
      {
        ...source,
        view: { x: 0, y: 0, zoom: 1 },
        width: 400,
        height: 300,
        layers: filter === 'layer' ? scene.markLayers.filter(new Set(['back'])) : null,
        window: filter === 'time' ? timeFilter(readWindow({ start: 0, end: 100 }), 0) : null,
        hide: states.hide,
      },
      { region: 'graph', zoom: 1, padding: 10 },
    )
    const frame = labels === 'none' ? given : fitLabels(source, given, labels, measure, 10)
    const palette = new Uint8Array(scene.palette.colors.length * 4).fill(255)
    const svg = writeSvg({
      nodes: scene.nodes,
      edges: scene.edges,
      layers: scene.layers,
      positions,
      states,
      palette,
      theme,
      frame,
      background: rgba('#f7f7f4'),
      labels,
      measure,
      images: new Map(),
      title: null,
    })
    return { given, frame, svg }
  }

  for (const filter of ['layer', 'time', 'hide'] as const) {
    it(`keeps the ${filter} filter of the frame once the labels are fitted`, () => {
      const plain = exported(filter, 'none')
      const fitted = exported(filter, 'visible')
      expect(fitted.frame.layers).toBe(fitted.given.layers)
      expect(fitted.frame.window).toBe(fitted.given.window)
      expect(fitted.frame.hide).toBe(fitted.given.hide)
      expect(count(fitted.svg, /<circle /)).toBe(count(plain.svg, /<circle /))
      expect(fitted.svg).toContain('Shown')
      expect(fitted.svg).not.toContain('Gone')
      expect(fitted.frame.width).toBeLessThan(200)
    })
  }
})

describe('labels under a state outline', () => {
  function labelled(outlineWidth: number | null) {
    const model = createGraphModel()
    const scene = createScene()
    const definition = defineGraph({
      marks: [
        nodes<Item>([{ id: 'a', x: 0, y: 0, label: 'abcdefghij' }], {
          x: 'x',
          y: 'y',
          size: 20,
          label: 'label',
        }),
      ],
    })
    model.setMarks(definition.marks)
    scene.setDefinition(definition)
    const changes = model.flush()
    scene.apply(model, changes)
    const positions = new Positions()
    placeNodes(model, positions, changes)
    const states = new StateBuffers()
    states.reserve(scene.nodes.capacity, scene.edges.capacity)
    if (outlineWidth !== null) {
      states.setStyle('nodes', 3, { outlineWidth })
      states.setNode(0, 1 << 3)
    }
    const source = { nodes: scene.nodes, edges: scene.edges, positions, states }
    const frame = exportFrame(
      { ...source, view: { x: 0, y: 0, zoom: 1 }, width: 400, height: 300 },
      { region: 'graph', zoom: 1, padding: 0 },
    )
    const placed: number[] = []
    selectLabels(source, frame, 'visible', measure, {
      node: (_, label) => placed.push(label.top),
      edge: () => {},
    })
    return { frame, fitted: fitLabels(source, frame, 'visible', measure, 0), placed }
  }

  it('frames the node and its label with the outline of the state', () => {
    const plain = labelled(null)
    const outlined = labelled(12)
    expect(outlined.placed).toEqual(plain.placed)
    expect(outlined.frame.width).toBeCloseTo(plain.frame.width + 24)
    expect(outlined.fitted.height - plain.fitted.height).toBeCloseTo(12 + 12)
  })
})

describe('background grid and hulls', () => {
  const numbers = (path: string) => [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number)

  it('draws the grid levels as patterns under everything, in the theme colors', () => {
    const svg = render({ ...pair, background: { grid: 'lines' } })
    const patterns = [...svg.matchAll(/<pattern [^>]*width="(\d+)"[^>]*><g fill="(#[0-9a-f]{6})"/g)]
    expect(patterns.map((match) => [match[1], match[2]])).toEqual([
      ['16', '#c4e0dd'],
      ['64', '#9fc8c4'],
      ['256', '#9fc8c4'],
    ])
    expect(svg).toContain('x="7.5" y="5.5" width="16"')
    expect(svg.indexOf('fill="url(#')).toBeLessThan(svg.indexOf('<circle'))
  })

  it('fades the finest level in and grows the dots of coarser levels', () => {
    const svg = render(
      { ...pair, background: { grid: 'dots', spacing: 10 } },
      {},
      { frame: { view: { x: 0, y: 0, zoom: 0.8 } } },
    )
    const first = svg.match(
      /<pattern [^>]*><g fill="#c4e0dd" fill-opacity="([\d.]+)"><circle [^>]*r="([\d.]+)"/,
    )
    expect(Number(first?.[1])).toBeCloseTo(Math.log(8 / 4) / Math.log(4), 3)
    expect(first?.[2]).toBe('0.8')
    expect(svg).toMatch(/<g fill="#9fc8c4"><circle [^>]*r="1.3"\/>/)
  })

  it('draws a single level of dots that grow with the zoom when not adaptive', () => {
    const svg = render(
      { ...pair, background: { grid: 'dots', spacing: 20, adaptive: false } },
      {},
      { frame: { view: { x: 0, y: 0, zoom: 2 } } },
    )
    const patterns = [
      ...svg.matchAll(/<pattern [^>]*width="([\d.]+)"[^>]*><g[^>]*><circle [^>]*r="([\d.]+)"/g),
    ]
    expect(patterns.map((match) => [match[1], match[2]])).toEqual([['40', '1.6']])
  })

  it('draws hull fills, then outlines, under the edges and nodes', () => {
    const svg = render({ ...pair, hulls: [hull({ nodes: ['a', 'b'] })] })
    const fill = svg.match(/<path d="([^"]+)" fill="#e7efee"\/>/)
    const stroke = svg.match(/<path d="([^"]+)" fill="none" stroke="#6e8d8b" stroke-width="1"/)
    expect(fill?.[1]).toBe(stroke?.[1])
    const xs = numbers(fill?.[1] ?? '').filter((_, at) => at % 2 === 0)
    expect(Math.min(...xs)).toBeCloseTo(200 - 124, 0)
    expect(Math.max(...xs)).toBeCloseTo(200 + 124, 0)
    expect(svg.indexOf('fill="#e7efee"')).toBeLessThan(svg.indexOf('stroke="#6e8d8b"'))
    expect(svg.indexOf('stroke="#6e8d8b"')).toBeLessThan(svg.indexOf('<circle'))
  })

  it('keeps the hull padding in screen pixels at any zoom', () => {
    const svg = render(
      { ...pair, hulls: [hull({ nodes: ['a'], padding: 10, strokeWidth: 0, fill: '#ff0000' })] },
      {},
      { frame: { view: { x: 0, y: 0, zoom: 2 } } },
    )
    const path = svg.match(/<path d="([^"]+)" fill="#ff0000"\/>/)?.[1] ?? ''
    const xs = numbers(path).filter((_, at) => at % 2 === 0)
    expect(Math.min(...xs)).toBeCloseTo(200 - 200 - 16 - 10, 0)
    expect(svg).not.toContain('stroke-linejoin="round"/>')
  })

  it('draws neither without a background or hulls', () => {
    const svg = render(pair)
    expect(svg).not.toContain('<pattern')
    expect(svg).not.toContain('stroke-linejoin="round"/>')
  })
})

describe('shapes', () => {
  type Zone = { id: string; geometry: ShapeGeometry; dash?: 'solid' | 'dashed' | 'dotted' }
  const zone = (zones: Zone[], options: Omit<ShapeOptions<Zone>, 'key'> = {}) => ({
    marks: [...pair.marks, shapes(zones, { dash: (item) => item.dash ?? 'solid', ...options })],
  })

  it('draws polygons with their holes under the edges and the nodes, fill then outline', () => {
    const svg = render(
      zone([
        {
          id: 'z',
          geometry: {
            rings: [
              [
                [-50, -50],
                [50, -50],
                [50, 50],
                [-50, 50],
              ],
              [
                [-10, -10],
                [10, -10],
                [10, 10],
                [-10, 10],
              ],
            ],
          },
        },
      ]),
    )
    const fill = svg.match(/<path d="([^"]+)" fill="#5b6167" fill-opacity="0.102"\/>/)
    expect(fill?.[1]?.match(/Z/g)?.length).toBe(2)
    expect(fill?.[1]).toContain('M150 100')
    const stroke = svg.indexOf('stroke="#868c92" stroke-width="1"')
    expect(stroke).toBeGreaterThan(svg.indexOf('fill-opacity="0.102"'))
    expect(stroke).toBeLessThan(svg.indexOf('<g><path'))
  })

  it('draws circles, rings and rounded rectangles as paths', () => {
    const svg = render(
      zone(
        [
          { id: 'c', geometry: { center: { x: 0, y: 0 }, radius: 20, inner: 10 } },
          { id: 'r', geometry: { x: 0, y: 0, width: 40, height: 20, cornerRadius: 4 } },
        ],
        { fill: '#ff0000', stroke: null },
      ),
    )
    const paths = [...svg.matchAll(/<path d="([^"]+)" fill-rule="evenodd" fill="#ff0000"\/>/g)]
    expect(paths.length).toBe(2)
    expect(paths[0]?.[1]).toBe(
      'M200 130A20 20 0 1 1 200 170A20 20 0 1 1 200 130ZM200 140A10 10 0 1 1 200 160A10 10 0 1 1 200 140Z',
    )
    expect(paths[1]?.[1]).toContain('A4 4 0 0 1 240 154')
  })

  it('draws lines without fill and dashes fitted to closed outlines', () => {
    const svg = render(
      zone([
        {
          id: 'l',
          geometry: {
            points: [
              [0, 0],
              [40, 0],
            ],
          },
        },
        { id: 'b', geometry: { x: 0, y: 0, width: 24, height: 24 }, dash: 'dashed' },
      ]),
    )
    expect(svg).toContain('<path d="M200 150L240 150" fill="none" stroke="#868c92"')
    expect(svg).toContain('<path d="M212 150H224V174H200V150Z" fill-rule="evenodd"')
    expect(svg).toContain('stroke-dasharray="4.8 3.2"')
  })

  it('draws the shape outline color only with a shape mark', () => {
    const svg = render(zone([{ id: 'b', geometry: { x: 0, y: 0, width: 10, height: 10 } }]), {}, {})
    expect(svg).toContain('#868c92')
    expect(render(pair)).not.toContain('#868c92')
  })
})
