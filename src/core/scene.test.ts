import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import type { GraphDefinition, GraphDefinitionOptions } from '../types'
import { arrowCodes, cornerCodes, dashCodes, noColor, shapeCodes } from './columns'
import { createGraphModel } from './graph-model'
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
})
