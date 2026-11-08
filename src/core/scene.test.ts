import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, groups, nodes } from '../marks'
import type { GraphDefinition, GraphDefinitionOptions, LabelPlacement, NodeOptions } from '../types'
import { arrowCodes, cornerCodes, dashCodes, noColor, placementCodes, shapeCodes } from './columns'
import { createGraphModel } from './graph-model'
import type { TextWidth } from './label-width'
import { Projection } from './projection'
import { raw } from './raw'
import { createScene } from './scene'

type Item = { id: string; group?: string; score?: number; name?: string }
type Link = { id: string; from: string; to: string; kind?: string; weight?: number }

function setup(options: GraphDefinitionOptions) {
  const model = createGraphModel()
  const scene = createScene()
  const render = (next: GraphDefinitionOptions) => {
    const definition: GraphDefinition = defineGraph(next)
    model.setMarks(definition.marks)
    scene.setDefinition(definition)
    scene.apply(model, model.flush())
    return scene.takeDirty()
  }
  const first = render(options)
  const nodeIndex = (key: string) => model.node(key)?.index ?? -1
  const fill = (key: string) => scene.palette.colors[scene.nodes.fill[nodeIndex(key)] ?? -1]
  const size = (key: string) => scene.nodes.size[nodeIndex(key)]
  return { model, scene, render, first, nodeIndex, fill, size }
}

const linkOptions = { source: 'from', target: 'to' } as const

describe('createScene', () => {
  it('marks great circle edges and keeps them out of bundles', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const links: Link[] = [
      { id: 'ab', from: 'a', to: 'b', kind: 'route' },
      { id: 'bc', from: 'b', to: 'c' },
    ]
    const { scene, model } = setup({
      marks: [
        nodes<Item>(items),
        edges<Link>(links, { ...linkOptions, geodesic: (link) => link.kind === 'route' }),
      ],
    })
    const at = (key: string) => model.edge(key)?.index ?? -1
    expect(scene.edges.geodesic[at('ab')]).toBe(1)
    expect(scene.edges.geodesic[at('bc')]).toBe(0)
    expect(scene.edges.bundle[at('ab')]).toBe(0)
    expect(scene.edges.bundle[at('bc')]).toBe(1)
  })

  it('writes the flow speed of edges and counts the flowing ones', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const links: Link[] = [
      { id: 'ab', from: 'a', to: 'b', weight: 25 },
      { id: 'bc', from: 'b', to: 'c' },
      { id: 'ca', from: 'c', to: 'a', kind: 'still' },
    ]
    const flow = (link: Link) => (link.kind === 'still' ? false : (link.weight ?? true))
    const { scene, model, render } = setup({
      marks: [nodes<Item>(items), edges<Link>(links, { ...linkOptions, flow })],
    })
    const speed = (key: string) => scene.edges.flow[model.edge(key)?.index ?? -1]
    expect([speed('ab'), speed('bc'), speed('ca')]).toEqual([25, 40, 0])
    expect(scene.edges.flowCount).toBe(2)
    render({ marks: [nodes<Item>(items), edges<Link>(links.slice(1), { ...linkOptions, flow })] })
    expect(scene.edges.flowCount).toBe(1)
    render({ marks: [nodes<Item>(items), edges<Link>(links, linkOptions)] })
    expect(scene.edges.flowCount).toBe(0)
  })

  it('bends parallel edges into lanes and orders loops', () => {
    const { scene, model, render } = setup({
      marks: [
        nodes<Item>([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
        edges<Link>(
          [
            { id: 'ab', from: 'a', to: 'b' },
            { id: 'ba', from: 'b', to: 'a' },
            { id: 'bc', from: 'b', to: 'c' },
            { id: 'aa', from: 'a', to: 'a' },
            { id: 'aa2', from: 'a', to: 'a' },
          ],
          linkOptions,
        ),
      ],
    })
    const bend = (key: string) => scene.edges.bend[model.edge(key)?.index ?? -1]
    expect(bend('ab')).toBeCloseTo(-0.06)
    expect(bend('ba')).toBeCloseTo(-0.06)
    expect(bend('bc')).toBe(0)
    expect([bend('aa'), bend('aa2')]).toEqual([0, 1])
    const dirty = render({
      marks: [
        nodes<Item>([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
        edges<Link>(
          [
            { id: 'ab', from: 'a', to: 'b' },
            { id: 'bc', from: 'b', to: 'c' },
            { id: 'aa2', from: 'a', to: 'a' },
          ],
          linkOptions,
        ),
      ],
    })
    expect(bend('ab')).toBe(0)
    expect(bend('aa2')).toBe(0)
    expect(dirty.edges.has(model.edge('ab')?.index ?? -1)).toBe(true)
    expect(dirty.edges.has(model.edge('aa2')?.index ?? -1)).toBe(true)
  })

  it('applies theme defaults', () => {
    const { scene, model, fill, size } = setup({
      marks: [
        nodes<Item>([{ id: 'a' }, { id: 'b' }]),
        edges<Link>([{ id: 'ab', from: 'a', to: 'b' }], linkOptions),
      ],
    })
    expect(size('a')).toBe(16)
    expect(fill('a')).toBe('var(--graph-node)')
    expect(scene.palette.colors[scene.nodes.stroke[0] ?? -1]).toBe('var(--graph-node-ring)')
    expect(scene.nodes.shape[0]).toBe(shapeCodes.circle)
    expect(scene.nodes.opacity[0]).toBe(1)
    expect(scene.nodes.label[0]).toBeNull()
    const edge = model.edge('ab')?.index ?? -1
    expect(scene.edges.width[edge]).toBe(1.5)
    expect(scene.palette.colors[scene.edges.color[edge] ?? -1]).toBe('var(--graph-edge)')
    expect([scene.edges.source[edge], scene.edges.target[edge]]).toEqual([0, 1])
  })

  it('maps channels through shared scales', () => {
    const { scene, model, fill, size } = setup({
      marks: [
        nodes<Item>(
          [
            { id: 'a', group: 'x', score: 0, name: 'A' },
            { id: 'b', group: 'y', score: 100 },
          ],
          { color: 'group', size: 'score', label: { text: 'name', secondary: 'group' } },
        ),
        edges<Link>([{ id: 'ab', from: 'a', to: 'b', kind: 'y' }], {
          ...linkOptions,
          color: 'kind',
        }),
      ],
    })
    expect(fill('a')).toBe('var(--graph-cat-1)')
    expect(fill('b')).toBe('var(--graph-cat-2)')
    expect(size('a')).toBe(8)
    expect(size('b')).toBe(32)
    expect(scene.nodes.label[0]).toBe('A')
    expect(scene.nodes.secondary[0]).toBe('x')
    const edge = model.edge('ab')?.index ?? -1
    expect(scene.palette.colors[scene.edges.color[edge] ?? -1]).toBe('var(--graph-cat-2)')
  })

  it('lets final styles win over channels', () => {
    const { scene, model, fill } = setup({
      marks: [
        nodes<Item>([{ id: 'a', group: 'x' }], {
          color: 'group',
          fill: '#123456',
          shape: 'diamond',
          opacity: 3,
          badges: {
            topRight: () => ({ text: 2 }),
            bottomLeft: () => null,
            topLeft: () => ({ fill: '#00aa00' }),
          },
        }),
        edges<Link>([{ id: 'aa', from: 'a', to: 'a' }], {
          ...linkOptions,
          stroke: (link) => (link.id === 'aa' ? 'black' : 'white'),
          dash: 'dotted',
          arrow: 'both',
        }),
      ],
    })
    expect(fill('a')).toBe('#123456')
    expect(scene.nodes.shape[0]).toBe(shapeCodes.diamond)
    expect(scene.nodes.opacity[0]).toBe(1)
    const colors = scene.palette.colors
    expect(
      (scene.nodes.badges[0] ?? []).map((badge) => [
        badge.corner,
        badge.text,
        colors[badge.fill],
        colors[badge.color],
      ]),
    ).toEqual([
      [cornerCodes.topLeft, null, '#00aa00', 'var(--graph-badge-ink)'],
      [cornerCodes.topRight, '2', 'var(--graph-badge-fill)', 'var(--graph-badge-ink)'],
    ])
    const edge = model.edge('aa')?.index ?? -1
    expect(scene.palette.colors[scene.edges.color[edge] ?? -1]).toBe('black')
    expect(scene.edges.dash[edge]).toBe(dashCodes.dotted)
    expect(scene.edges.arrow[edge]).toBe(arrowCodes.both)
  })

  it('draws an outline only when asked, two pixels wide by default', () => {
    const { scene, nodeIndex } = setup({
      marks: [
        nodes<Item>([{ id: 'a' }, { id: 'b' }], {
          outline: (item) => (item.id === 'a' ? null : 'var(--graph-accent)'),
        }),
        nodes<Item>([{ id: 'c' }], { outline: 'var(--graph-accent)', outlineWidth: 5 }),
        nodes<Item>([{ id: 'd' }], { outlineWidth: 3 }),
        nodes<Item>([{ id: 'e' }], { outline: () => null, outlineWidth: 4 }),
      ],
    })
    const outline = (key: string) => {
      const index = nodeIndex(key)
      return [
        scene.palette.colors[scene.nodes.outline[index] ?? -1],
        scene.nodes.outlineWidth[index],
      ]
    }
    expect(outline('a')).toEqual(['var(--graph-node-ring)', 0])
    expect(outline('b')).toEqual(['var(--graph-accent)', 2])
    expect(outline('c')).toEqual(['var(--graph-accent)', 5])
    expect(outline('d')).toEqual(['var(--graph-node-ring)', 3])
    expect(outline('e')).toEqual(['var(--graph-node-ring)', 0])
  })

  it('reads label backgrounds as a color, the theme default or nothing', () => {
    const { scene, nodeIndex } = setup({
      marks: [
        nodes<Item>([{ id: 'a' }, { id: 'b' }, { id: 'c', group: 'x' }, { id: 'd', group: '' }], {
          label: {
            text: 'id',
            background: (item) =>
              item.id === 'a' ? true : item.id === 'b' ? false : (item.group ?? null),
          },
        }),
        nodes<Item>([{ id: 'e' }], { label: 'id' }),
      ],
    })
    const background = (key: string) => {
      const color = scene.nodes.labelBackground[nodeIndex(key)] ?? noColor
      return color === noColor ? null : scene.palette.colors[color]
    }
    expect(background('a')).toBe('var(--graph-label-background)')
    expect(background('b')).toBeNull()
    expect(background('c')).toBe('x')
    expect(background('d')).toBeNull()
    expect(background('e')).toBeNull()
  })

  it('reads edge labels as text or with a background', () => {
    const { scene, model } = setup({
      marks: [
        nodes<Item>([{ id: 'a' }, { id: 'b' }]),
        edges<Link>(
          [
            { id: 'ab', from: 'a', to: 'b', kind: 'x' },
            { id: 'ba', from: 'b', to: 'a' },
          ],
          { ...linkOptions, label: { text: 'id', background: (link) => link.kind ?? true } },
        ),
        edges<Link>([{ id: 'aa', from: 'a', to: 'a' }], { ...linkOptions, label: 'id' }),
      ],
    })
    const read = (key: string) => {
      const index = model.edge(key)?.index ?? -1
      const color = scene.edges.labelBackground[index] ?? noColor
      return [scene.edges.label[index], color === noColor ? null : scene.palette.colors[color]]
    }
    expect(read('ab')).toEqual(['ab', 'x'])
    expect(read('ba')).toEqual(['ba', 'var(--graph-label-background)'])
    expect(read('aa')).toEqual(['aa', null])
  })

  it('reads label styles for nodes and edges', () => {
    const { scene, model, nodeIndex } = setup({
      marks: [
        nodes<Item>([{ id: 'a', score: 2 }, { id: 'b' }], {
          label: {
            text: 'id',
            color: (item) => (item.score ? 'var(--graph-accent)' : ''),
            size: (item) => item.score ?? -1,
            weight: (item) => (item.score ? 'bold' : 650.4),
            font: 'serif',
            placement: (item) => (item.score ? 'right' : ('middle' as string as LabelPlacement)),
            maxWidth: 80,
            minScreenSize: (item) => item.score ?? Number.NaN,
          },
        }),
        edges<Link>([{ id: 'ab', from: 'a', to: 'b' }], {
          ...linkOptions,
          label: { text: 'id', weight: 'normal', size: 9, color: 'red' },
        }),
      ],
    })
    const a = nodeIndex('a')
    const b = nodeIndex('b')
    const nodesOf = scene.nodes
    expect(scene.palette.colors[nodesOf.labelColor[a] ?? -1]).toBe('var(--graph-accent)')
    expect(nodesOf.labelColor[b]).toBe(noColor)
    expect([nodesOf.labelSize[a], nodesOf.labelSize[b]]).toEqual([2, 0])
    expect([nodesOf.labelWeight[a], nodesOf.labelWeight[b]]).toEqual([700, 650])
    expect(nodesOf.labelFont[a]).toBe('serif')
    expect([nodesOf.labelPlacement[a], nodesOf.labelPlacement[b]]).toEqual([2, 0])
    expect(nodesOf.labelMaxWidth[a]).toBe(80)
    expect([nodesOf.labelMinScreenSize[a], nodesOf.labelMinScreenSize[b]]).toEqual([2, 0])
    const edge = model.edge('ab')?.index ?? -1
    expect(scene.edges.labelWeight[edge]).toBe(400)
    expect(scene.edges.labelSize[edge]).toBe(9)
    expect(scene.palette.colors[scene.edges.labelColor[edge] ?? -1]).toBe('red')
    expect(scene.edges.labelFont[edge]).toBeNull()
  })

  it('reads images as a source or with a scale and a color', () => {
    const { scene, nodeIndex } = setup({
      marks: [
        nodes<Item>(
          [
            { id: 'a', name: 'a.png' },
            { id: 'b', name: 'b.svg' },
            { id: 'c', name: '' },
            { id: 'd' },
          ],
          {
            image: (item) =>
              item.id === 'b'
                ? { src: item.name ?? '', scale: 0.6, color: 'var(--graph-paper)' }
                : (item.name ?? null),
          },
        ),
      ],
    })
    const image = (key: string) => {
      const index = nodeIndex(key)
      const color = scene.nodes.imageColor[index] ?? noColor
      return [
        scene.nodes.image[index],
        scene.nodes.imageScale[index],
        color === noColor ? null : scene.palette.colors[color],
      ]
    }
    expect(image('a')).toEqual(['a.png', 1, null])
    expect(image('b')).toEqual(['b.svg', Math.fround(0.6), 'var(--graph-paper)'])
    expect(image('c')).toEqual([null, 1, null])
    expect(image('d')).toEqual([null, 1, null])
  })

  it('rescales untouched elements when the data extent changes', () => {
    const a = { id: 'a', score: 0 }
    const b = { id: 'b', score: 100 }
    const { render, size, nodeIndex } = setup({ marks: [nodes<Item>([a, b], { size: 'score' })] })
    expect(size('b')).toBe(32)
    const dirty = render({
      marks: [nodes<Item>([a, b, { id: 'c', score: 400 }], { size: 'score' })],
    })
    expect(size('b')).toBe(20)
    expect(size('c')).toBe(32)
    expect([...dirty.nodes].sort()).toEqual(['a', 'b', 'c'].map(nodeIndex))

    render({ marks: [nodes<Item>([a, b], { size: 'score' })] })
    expect(size('b')).toBe(32)
  })

  it('keeps category colors when the data changes', () => {
    const { render, fill } = setup({
      marks: [
        nodes<Item>(
          [
            { id: 'a', group: 'x' },
            { id: 'b', group: 'y' },
          ],
          { color: 'group' },
        ),
      ],
    })
    render({
      marks: [
        nodes<Item>(
          [
            { id: 'c', group: 'z' },
            { id: 'b', group: 'y' },
          ],
          { color: 'group' },
        ),
      ],
    })
    expect(fill('b')).toBe('var(--graph-cat-2)')
    expect(fill('c')).toBe('var(--graph-cat-3)')
  })

  it('re-evaluates everything only when scale options really change', () => {
    const data = [
      { id: 'a', score: 1 },
      { id: 'b', score: 2 },
    ]
    const mark = nodes<Item>(data, { size: 'score' })
    const { render, size } = setup({ marks: [mark], scales: { size: { range: [10, 20] } } })
    expect(size('b')).toBe(20)
    expect(render({ marks: [mark], scales: { size: { range: [10, 20] } } }).nodes.size).toBe(0)
    const dirty = render({ marks: [mark], scales: { size: { range: [10, 40] } } })
    expect(dirty.nodes.size).toBe(2)
    expect(size('b')).toBe(40)
  })

  it('keeps a single value of the data, clamped to the range', () => {
    const one = [{ id: 'a' }, { id: 'b' }]
    const { size, render, scene, model } = setup({
      marks: [
        nodes<Item>(one, { size: () => 30 }),
        edges<Link>([{ id: 'ab', from: 'a', to: 'b' }], { ...linkOptions, width: () => 3 }),
      ],
    })
    expect(size('a')).toBe(30)
    expect(scene.edges.width[model.edge('ab')?.index ?? -1]).toBe(3)
    render({ marks: [nodes<Item>(one, { size: () => 60 })] })
    expect(size('a')).toBe(32)
  })

  it('draws number literals and raw values as given, outside the extents', () => {
    const items = [
      { id: 'a', score: 0 },
      { id: 'b', score: 100 },
      { id: 'c', score: 4 },
    ]
    const links: Link[] = [
      { id: 'ab', from: 'a', to: 'b', weight: 9 },
      { id: 'bc', from: 'b', to: 'c', weight: 1 },
    ]
    const { size, scene, model, fill } = setup({
      marks: [
        nodes<Item>(items.slice(0, 2), { size: 'score' }),
        nodes<Item>(items.slice(2), { size: raw((item) => (item.score ?? 0) * 10), color: 'id' }),
        edges<Link>(links.slice(0, 1), { ...linkOptions, width: 2.5 }),
        edges<Link>(links.slice(1), {
          ...linkOptions,
          width: raw((link) => link.weight),
          color: raw(() => '#123456'),
          ends: { target: { width: 7, color: raw(() => '#654321') } },
        }),
      ],
    })
    expect([size('a'), size('b'), size('c')]).toEqual([8, 32, 40])
    expect(scene.scales().size.extent).toEqual([0, 100])
    const edge = (key: string) => model.edge(key)?.index ?? -1
    expect(scene.edges.width[edge('ab')]).toBe(2.5)
    expect(scene.edges.width[edge('bc')]).toBe(7)
    expect(scene.scales().width.extent).toBeNull()
    expect(scene.palette.colors[scene.edges.color[edge('bc')] ?? -1]).toBe('#123456')
    const ends = scene.edges.ends
    expect(ends?.width[edge('bc') * 2]).toBe(1)
    expect(scene.palette.colors[ends?.color[edge('bc') * 2 + 1] ?? -1]).toBe('#654321')
    expect(fill('c')).toBe('var(--graph-cat-1)')
    expect(scene.scales().edgeColor[edge('bc')]).toBeUndefined()
  })

  it('gives a mark with scales of its own its own extents and categories', () => {
    const items = [
      { id: 'a', score: 0, group: 'x' },
      { id: 'b', score: 10, group: 'y' },
    ]
    const others = [
      { id: 'c', score: 1000, group: 'z' },
      { id: 'd', score: 2000, group: 'y' },
    ]
    const links: Link[] = [
      { id: 'ab', from: 'a', to: 'b', weight: 1, kind: 'k' },
      { id: 'cd', from: 'c', to: 'd', weight: 100, kind: 'k' },
    ]
    const definition = () => ({
      marks: [
        nodes<Item>(items, { size: 'score', color: 'group' }),
        nodes<Item>(others, {
          size: 'score',
          color: 'group',
          scales: { size: { range: [10, 20] }, color: { range: ['red', 'blue'] } },
        }),
        edges<Link>(links.slice(0, 1), { ...linkOptions, width: 'weight', color: 'kind' }),
        edges<Link>(links.slice(1), {
          ...linkOptions,
          width: 'weight',
          color: 'kind',
          scales: { width: {} },
        }),
      ],
    })
    const { size, fill, scene, model, render } = setup(definition())
    expect([size('a'), size('b')]).toEqual([8, 32])
    expect([size('c'), size('d')]).toEqual([10, 20])
    expect([fill('a'), fill('b')]).toEqual(['var(--graph-cat-1)', 'var(--graph-cat-2)'])
    expect([fill('c'), fill('d')]).toEqual(['red', 'blue'])
    const edge = (key: string) => model.edge(key)?.index ?? -1
    expect(scene.edges.width[edge('ab')]).toBe(1)
    expect(scene.edges.width[edge('cd')]).toBe(6)
    expect(scene.palette.colors[scene.edges.color[edge('cd')] ?? -1]).toBe('var(--graph-cat-3)')
    const scales = scene.scales()
    expect(scales.size.extent).toEqual([0, 10])
    expect(scales.sizes[1]?.extent).toEqual([1000, 2000])
    expect(scales.sizes[0]).toBeNull()
    expect(scales.widths[1]?.extent).toEqual([100, 100])
    expect(scales.width.extent).toEqual([1, 1])
    expect(render(definition()).nodes.size).toBe(0)
    const dirty = render({
      marks: [
        nodes<Item>(items, { size: 'score', color: 'group' }),
        nodes<Item>(others, {
          size: 'score',
          color: 'group',
          scales: { size: { range: [10, 40] }, color: { range: ['red', 'blue'] } },
        }),
        ...definition().marks.slice(2),
      ],
    })
    expect(dirty.nodes.size).toBe(4)
    expect(size('d')).toBe(40)
    expect(fill('d')).toBe('blue')
  })

  it('moves an element from one scale to another with its mark', () => {
    const shared = { id: 'a', score: 5 }
    const own = nodes<Item>([{ id: 'b', score: 50 }], { size: 'score', scales: { size: {} } })
    const { size, scene, render } = setup({
      marks: [nodes<Item>([{ id: 'c', score: 1 }, shared], { size: 'score' }), own],
    })
    expect(scene.scales().size.extent).toEqual([1, 5])
    render({
      marks: [nodes<Item>([{ id: 'c', score: 1 }], { size: 'score' }), own],
    })
    expect(scene.scales().size.extent).toEqual([1, 1])
    render({
      marks: [
        nodes<Item>([{ id: 'c', score: 1 }], { size: 'score' }),
        nodes<Item>([{ id: 'b', score: 50 }, shared], { size: 'score', scales: { size: {} } }),
      ],
    })
    expect(scene.scales().sizes[1]?.extent).toEqual([5, 50])
    expect(scene.scales().size.extent).toEqual([1, 1])
    expect(size('a')).toBe(8)
    render({ marks: [nodes<Item>([{ id: 'c', score: 1 }, shared], { size: 'score' })] })
    expect(scene.scales().size.extent).toEqual([1, 5])
    expect(scene.scales().sizes).toEqual([null])
    expect(size('a')).toBe(32)
  })

  it('reads the scales of a group mark', () => {
    const items = [
      { id: 'a', group: 'x', score: 1 },
      { id: 'b', group: 'x', score: 2 },
      { id: 'c', group: 'y', score: 3 },
    ]
    const { scene } = setup({
      marks: [
        nodes<Item>(items, { size: 'score' }),
        groups<Item>(items, {
          by: 'group',
          size: (group) => group.count,
          scales: { size: { range: [20, 40] } },
        }),
      ],
    })
    expect(scene.scales().size.extent).toEqual([1, 3])
    expect(scene.scales().sizes[1]?.extent).toEqual([1, 2])
  })

  it('colors sequential values from the shared extent', () => {
    const { fill } = setup({
      marks: [
        nodes<Item>(
          [
            { id: 'a', score: 0 },
            { id: 'b', score: 10 },
          ],
          { color: 'score' },
        ),
      ],
      scales: { color: { type: 'sequential', range: ['white', 'black'] } },
    })
    expect(fill('a')).toBe('white')
    expect(fill('b')).toBe('black')
  })

  it('clears removed elements', () => {
    const { render, scene, first } = setup({
      marks: [nodes<Item>([{ id: 'a', name: 'A' }], { label: 'name' })],
    })
    expect([...first.nodes]).toEqual([0])
    const dirty = render({ marks: [nodes<Item>([], { label: 'name' })] })
    expect([...dirty.nodes]).toEqual([0])
    expect(scene.nodes.alive[0]).toBe(0)
    expect(scene.nodes.label[0]).toBeNull()
  })

  it('exposes layers in mark order', () => {
    const items = nodes<Item>([{ id: 'a' }])
    const links = edges<Link>([], linkOptions)
    const { scene, render, first } = setup({ marks: [links, items] })
    expect(scene.layers).toEqual([
      { kind: 'edges', slot: 0 },
      { kind: 'nodes', slot: 0 },
    ])
    expect(first.layers).toBe(true)
    expect(first.palette).toBe(true)
    const again = render({ marks: [links, items] })
    expect(again.layers).toBe(false)
    expect(again.palette).toBe(false)
  })

  it('writes the look and labels of each end of an edge', () => {
    type Pair = { id: string; from: string; to: string; out: number; back: number }
    const { scene, model } = setup({
      marks: [
        nodes<Item>([{ id: 'a' }, { id: 'b' }]),
        edges<Pair>([{ id: 'ab', from: 'a', to: 'b', out: 0, back: 10 }], {
          ...linkOptions,
          ends: {
            split: () => 1.4,
            source: { color: 'out', width: 'out', dash: () => 'dashed', label: () => 'out' },
            target: {
              color: 'back',
              stroke: () => 'red',
              width: 'back',
              label: { text: () => 'back', background: true, size: 14 },
            },
          },
        }),
      ],
      scales: {
        color: { type: 'sequential', range: ['white', 'black'] },
        width: (value) => 1 + value / 2,
      },
    })
    const index = model.edge('ab')?.index ?? -1
    const ends = scene.edges.ends
    if (!ends) throw new Error('no ends')
    const color = (id: number) => scene.palette.colors[ends.color[id] ?? -1]
    expect(ends.styled[index]).toBe(1)
    expect(ends.styledCount).toBe(1)
    expect(ends.split[index]).toBe(1)
    expect(color(index * 2)).toBe('white')
    expect(color(index * 2 + 1)).toBe('red')
    expect([ends.width[index * 2], ends.width[index * 2 + 1]]).toEqual([1, 6])
    expect(scene.edges.width[index]).toBe(6)
    expect([ends.dash[index * 2], ends.dash[index * 2 + 1]]).toEqual([dashCodes.dashed, 0])
    expect([ends.label[index * 2], ends.label[index * 2 + 1]]).toEqual(['out', 'back'])
    expect(ends.labelBackground[index * 2]).toBe(noColor)
    expect(ends.labelBackground[index * 2 + 1]).not.toBe(noColor)
    expect(ends.labelSize[index * 2 + 1]).toBe(14)
    expect(scene.scales().endColor.slice(index * 2, index * 2 + 2)).toEqual([0, null])
  })

  it('falls back to the edge look and clears ends when a mark drops them', () => {
    const items = nodes<Item>([{ id: 'a' }, { id: 'b' }])
    const link: Link = { id: 'ab', from: 'a', to: 'b', kind: 'x' }
    const { scene, model, render } = setup({
      marks: [
        items,
        edges<Link>([link], {
          ...linkOptions,
          color: 'kind',
          dash: 'dotted',
          ends: { target: { label: 'id' } },
        }),
      ],
    })
    const index = model.edge('ab')?.index ?? -1
    const ends = scene.edges.ends
    if (!ends) throw new Error('no ends')
    expect(ends.styled[index]).toBe(0)
    expect(ends.color[index * 2 + 1]).toBe(scene.edges.color[index])
    expect(ends.dash[index * 2 + 1]).toBe(dashCodes.dotted)
    expect(ends.label[index * 2 + 1]).toBe('ab')
    expect(ends.labeled).toBe(1)
    render({ marks: [items, edges<Link>([link], linkOptions)] })
    expect(ends.label[index * 2 + 1]).toBeNull()
    expect(ends.labeled).toBe(0)
    expect(ends.split[index]).toBeNaN()
  })

  it('shares the color and width extents with the values of the ends', () => {
    type Pair = { id: string; from: string; to: string; out: number }
    const items = nodes<Item>(
      [
        { id: 'a', score: 0 },
        { id: 'b', score: 10 },
      ],
      { color: 'score' },
    )
    const pair = (out: number) =>
      edges<Pair>([{ id: 'ab', from: 'a', to: 'b', out }], {
        ...linkOptions,
        ends: { source: { color: 'out', width: 'out' } },
      })
    const scales = {
      color: { type: 'sequential', range: ['white', 'black'] },
      width: { range: [1, 5] },
    } as const
    const { render, fill, scene, model } = setup({ marks: [items, pair(20)], scales })
    expect(fill('b')).not.toBe('black')
    expect(scene.scales().width.extent).toEqual([20, 20])
    const index = model.edge('ab')?.index ?? -1
    render({ marks: [items, pair(10)], scales })
    expect(fill('b')).toBe('black')
    expect(scene.palette.colors[scene.edges.ends?.color[index * 2] ?? -1]).toBe('black')
  })
})

describe('scales that follow their mark', () => {
  const own = { color: { type: 'categorical' } } as const

  it('keeps the colors of a mark with its own scale when an earlier mark is removed', () => {
    const a = () => nodes<Item>([{ id: 'a', group: 'x' }], { color: 'group', scales: own })
    const b = () => nodes<Item>([{ id: 'b', group: 'y' }], { color: 'group', scales: own })
    const { fill, render } = setup({ marks: [a(), b()] })
    expect(fill('b')).toBe('var(--graph-cat-1)')
    render({ marks: [b()] })
    expect(fill('b')).toBe('var(--graph-cat-1)')
  })

  it('keeps the colors of marks with their own scales when they swap places', () => {
    const a = () => nodes<Item>([{ id: 'a', group: 'x' }], { color: 'group', scales: own })
    const b = () => nodes<Item>([{ id: 'b', group: 'y' }], { color: 'group', scales: own })
    const { fill, render } = setup({ marks: [a(), b()] })
    expect([fill('a'), fill('b')]).toEqual(['var(--graph-cat-1)', 'var(--graph-cat-1)'])
    render({ marks: [b(), a()] })
    expect([fill('a'), fill('b')]).toEqual(['var(--graph-cat-1)', 'var(--graph-cat-1)'])
  })

  it('follows the name of a mark whose data is replaced', () => {
    const mark = (name: string, items: Item[]) =>
      nodes<Item, string>(items, { name, color: 'group', scales: own })
    const { fill, render } = setup({
      marks: [
        mark('left', [
          { id: 'a', group: 'x' },
          { id: 'b', group: 'y' },
        ]),
        mark('right', [{ id: 'c', group: 'z' }]),
      ],
    })
    render({
      marks: [mark('right', [{ id: 'd', group: 'w' }]), mark('left', [{ id: 'e', group: 'y' }])],
    })
    expect(fill('e')).toBe('var(--graph-cat-2)')
    expect(fill('d')).toBe('var(--graph-cat-2)')
  })
})

describe('bounded palette and categories', () => {
  it('keeps the palette bounded by the colors in use', () => {
    const batch = (round: number) =>
      Array.from({ length: 100 }, (_, at) => ({ id: `n${at}`, name: `#${round}${at}` }))
    const mark = (round: number) => nodes<Item>(batch(round), { fill: (item) => item.name ?? '' })
    const { scene, render, fill } = setup({ marks: [mark(0)] })
    const first = scene.palette.colors.length
    for (let round = 1; round < 20; round++) render({ marks: [mark(round)] })
    expect(scene.palette.colors.length).toBeLessThanOrEqual(first)
    expect(fill('n7')).toBe('#197')
  })

  it('gives the id of a color no longer drawn to a new color, with a new version', () => {
    const mark = (name: string) =>
      nodes<Item>([{ id: 'a', name }], { fill: (item) => item.name ?? '' })
    const { scene, render, fill, nodeIndex } = setup({ marks: [mark('red')] })
    const id = scene.nodes.fill[nodeIndex('a')]
    const version = scene.palette.version
    render({ marks: [mark('blue')] })
    expect(fill('a')).toBe('blue')
    expect(scene.nodes.fill[nodeIndex('a')]).toBe(id)
    const changed: string[] = []
    scene.palette.changed(version, (_, color) => changed.push(color))
    expect(changed).toEqual(['blue'])
  })

  it('forgets categories no longer drawn once they outnumber the range', () => {
    const batch = (round: number) =>
      Array.from({ length: 10 }, (_, at) => ({ id: `n${at}`, group: `g${round}-${at}` }))
    const { scene, render } = setup({ marks: [nodes<Item>(batch(0), { color: 'group' })] })
    for (let round = 1; round < 50; round++) {
      render({ marks: [nodes<Item>(batch(round), { color: 'group' })] })
    }
    const categories = [...scene.scales().color.scale.categories()]
    expect(categories).toHaveLength(12)
    for (let at = 0; at < 10; at++) expect(categories).toContain(`g49-${at}`)
  })

  it('keeps the categories drawn and their colors', () => {
    const items = (list: string[]) => list.map((group, at) => ({ id: `n${at}`, group }))
    const all = Array.from({ length: 14 }, (_, at) => `g${at}`)
    const { scene, render, fill } = setup({ marks: [nodes<Item>(items(all), { color: 'group' })] })
    expect([...scene.scales().color.scale.categories()]).toHaveLength(14)
    const kept = fill('n13')
    render({ marks: [nodes<Item>(items(['g0', 'g1', 'g13']), { color: 'group' })] })
    expect([...scene.scales().color.scale.categories()]).toHaveLength(12)
    expect(fill('n2')).toBe(kept)
  })
})

describe('values out of a function scale', () => {
  it('keeps a finite size and width when a function scale gives NaN or Infinity', () => {
    const items = [
      { id: 'a', score: -1 },
      { id: 'b', score: 0 },
      { id: 'c', score: 10 },
    ]
    const { size, scene, model } = setup({
      marks: [
        nodes<Item>(items, { size: 'score' }),
        edges<Link>([{ id: 'ab', from: 'a', to: 'b', weight: 0 }], {
          ...linkOptions,
          width: 'weight',
        }),
      ],
      scales: { size: (value) => Math.log(value), width: (value) => 1 / value },
    })
    expect(size('a')).toBe(16)
    expect(size('b')).toBe(16)
    expect(size('c')).toBeCloseTo(Math.log(10))
    expect(scene.edges.width[model.edge('ab')?.index ?? -1]).toBe(1.5)
  })

  it('ignores a function color scale that gives no color', () => {
    const items = [
      { id: 'a', score: 1 },
      { id: 'b', score: 2 },
    ]
    const scale = (value: unknown) => (value === 2 ? 'red' : (7 as unknown as string))
    const { fill } = setup({
      marks: [nodes<Item>(items, { color: 'score' })],
      scales: { color: scale },
    })
    expect(fill('a')).toBe('var(--graph-node)')
    expect(fill('b')).toBe('red')
  })

  it('never draws a negative stroke width', () => {
    const { scene, nodeIndex } = setup({
      marks: [nodes<Item>([{ id: 'a' }], { strokeWidth: () => -3 })],
    })
    expect(scene.nodes.strokeWidth[nodeIndex('a')]).toBe(0)
  })
})

describe('colors replaced by a final style', () => {
  it('leaves a color replaced by fill out of the drawn categories', () => {
    const items = [
      { id: 'a', group: 'x' },
      { id: 'b', group: 'y', name: 'black' },
    ]
    const { scene, nodeIndex } = setup({
      marks: [nodes<Item>(items, { color: 'group', fill: (item) => item.name ?? '' })],
    })
    const drawn = scene.scales().nodeColor
    expect(drawn[nodeIndex('a')]).toBe('x')
    expect(drawn[nodeIndex('b')]).toBeUndefined()
    expect([...scene.scales().color.scale.categories()]).toEqual(['x'])
  })
})

describe('groups and scales', () => {
  it('leaves an unfolded group out of the size extent and the categories', () => {
    type Member = { id: string; parent: string | null; weight: number; kind: string }
    const items: Member[] = [
      { id: 'g', parent: null, weight: 1000, kind: 'box' },
      { id: 'a', parent: 'g', weight: 1, kind: 'x' },
      { id: 'b', parent: 'g', weight: 10, kind: 'y' },
    ]
    const model = createGraphModel()
    const scene = createScene()
    const projection = new Projection(model)
    const definition = defineGraph({
      marks: [nodes<Member>(items, { parent: 'parent', size: 'weight', color: 'kind' })],
    })
    model.setMarks(definition.marks)
    projection.setMarks(definition.marks)
    scene.setDefinition(definition)
    scene.apply(projection.view, projection.apply(model.flush()).scene)
    expect(scene.scales().size.extent).toEqual([1, 10])
    expect(scene.nodes.size[model.node('b')?.index ?? -1]).toBe(32)
    expect([...scene.scales().color.scale.categories()]).toEqual(['x', 'y'])
  })
})

describe('lanes of parallel edges', () => {
  it('flips the bend of a parallel edge whose direction flips on the same pair', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    const before: Link[] = [
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'ab2', from: 'a', to: 'b' },
    ]
    const after: Link[] = [
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'ab2', from: 'b', to: 'a' },
    ]
    const { scene, model, render } = setup({
      marks: [nodes<Item>(items), edges<Link>(before, linkOptions)],
    })
    const bend = (key: string) => scene.edges.bend[model.edge(key)?.index ?? -1]
    render({ marks: [nodes<Item>(items), edges<Link>(after, linkOptions)] })
    const fresh = setup({ marks: [nodes<Item>(items), edges<Link>(after, linkOptions)] })
    const freshBend = (key: string) =>
      fresh.scene.edges.bend[fresh.model.edge(key)?.index ?? -1] ?? 0
    expect(freshBend('ab2')).toBeCloseTo(-0.06)
    expect(bend('ab2')).toBeCloseTo(freshBend('ab2'))
  })
})

describe('box nodes', () => {
  const advance: TextWidth = (text) => Array.from(text).length * 0.5

  function boxed(
    options: NodeOptions<Item, undefined, undefined>,
    items: Item[] = [{ id: 'a', name: 'abcd' }],
  ) {
    const model = createGraphModel()
    let measure = advance
    const scene = createScene((text, weight, font) => measure(text, weight, font))
    const render = (next: NodeOptions<Item, undefined, undefined>) => {
      const definition = defineGraph({ marks: [nodes<Item>(items, next)] })
      model.setMarks(definition.marks)
      scene.setDefinition(definition)
      scene.apply(model, model.flush())
      scene.takeDirty()
    }
    render(options)
    const at = (key: string) => model.node(key)?.index ?? -1
    return {
      scene,
      render,
      at,
      setMeasure: (next: TextWidth) => {
        measure = next
      },
    }
  }

  it('fits the width to the label with half the height of room on each side', () => {
    const { scene, at } = boxed({ shape: 'box', size: 20, label: 'name' })
    expect(scene.nodes.shape[at('a')]).toBe(shapeCodes.box)
    expect(scene.nodes.width[at('a')]).toBeCloseTo(4 * 0.5 * 12 + 20, 5)
    expect(scene.nodes.corner[at('a')]).toBeCloseTo(5, 5)
    expect(scene.nodes.labelPlacement[at('a')]).toBe(placementCodes.center)
  })

  it('never draws a box narrower than its height', () => {
    const { scene, at } = boxed({ shape: 'box', size: 40 })
    expect(scene.nodes.width[at('a')]).toBe(40)
    const short = boxed({ shape: 'box', size: 40, label: 'name' }, [{ id: 'a', name: 'i' }])
    expect(short.scene.nodes.width[short.at('a')]).toBe(46)
  })

  it('fits a label placed outside the box to the height only', () => {
    const { scene, at } = boxed({
      shape: 'box',
      size: 20,
      label: { text: 'name', placement: 'bottom' },
    })
    expect(scene.nodes.width[at('a')]).toBe(20)
    expect(scene.nodes.labelPlacement[at('a')]).toBe(placementCodes.bottom)
  })

  it('cuts the label of a fixed width box unless it sets its own maximum', () => {
    const fixed = boxed({ shape: 'box', size: 20, width: 60, cornerRadius: 3, label: 'name' })
    expect(fixed.scene.nodes.width[fixed.at('a')]).toBe(60)
    expect(fixed.scene.nodes.corner[fixed.at('a')]).toBe(3)
    expect(fixed.scene.nodes.labelMaxWidth[fixed.at('a')]).toBe(40)
    const own = boxed({
      shape: 'box',
      size: 20,
      width: 60,
      label: { text: 'name', maxWidth: 200 },
    })
    expect(own.scene.nodes.labelMaxWidth[own.at('a')]).toBe(200)
  })

  it('measures the main and secondary lines in the size and weight of the label', () => {
    const { scene, at } = boxed({
      shape: 'box',
      size: 20,
      label: { text: 'name', secondary: () => 'abcdefghijkl', size: 10 },
    })
    expect(scene.nodes.width[at('a')]).toBeCloseTo(12 * 0.5 * (11 / 12) * 10 + 20, 5)
  })

  it('remeasures fitted boxes when the measure changes, and marks them dirty', () => {
    const { scene, at, setMeasure, render } = boxed({ shape: 'box', size: 20, label: 'name' })
    expect(scene.remeasure()).toBe(false)
    setMeasure((text) => Array.from(text).length)
    expect(scene.remeasure()).toBe(true)
    expect(scene.nodes.width[at('a')]).toBeCloseTo(4 * 12 + 20, 5)
    expect(scene.takeDirty().nodes.has(at('a'))).toBe(true)
    render({ shape: 'circle', size: 20, label: 'name' })
    expect(scene.nodes.width[at('a')]).toBe(0)
    expect(scene.remeasure()).toBe(false)
  })
})
