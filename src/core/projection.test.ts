import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import type { AggregateEdge, GraphDefinitionOptions, Key } from '../types'
import { arrowCodes, containerShape } from './columns'
import { createGraphModel } from './graph-model'
import { Projection } from './projection'
import { createScene } from './scene'

type Item = { id: string; parent?: string | null }
type Link = { id: string; from: string; to: string; weight?: number }

const item = (id: string, parent: string | null = null): Item => ({ id, parent })
const link = (id: string, from: string, to: string, weight = 1): Link => ({ id, from, to, weight })
const linkOptions = { source: 'from', target: 'to' } as const

function setup(options: GraphDefinitionOptions, folded: Key[] = []) {
  const model = createGraphModel()
  const scene = createScene()
  const projection = new Projection(model)
  projection.setFolded(folded)
  const step = () => {
    const result = projection.apply(model.flush())
    scene.apply(projection.view, result.scene)
    scene.takeDirty()
    return result
  }
  const render = (next: GraphDefinitionOptions) => {
    const definition = defineGraph(next)
    model.setMarks(definition.marks)
    projection.setMarks(definition.marks)
    scene.setDefinition(definition)
    return step()
  }
  const fold = (keys: Key[]) => {
    projection.setFolded(keys)
    return step()
  }
  const first = render(options)
  const nodeIndex = (key: Key) => model.node(key)?.index ?? -1
  const alive = (key: Key) => scene.nodes.alive[nodeIndex(key)] === 1
  const container = (key: Key) => scene.nodes.shape[nodeIndex(key)] === containerShape
  const drawnEdges = () => {
    const drawn: [Key | undefined, Key | undefined][] = []
    for (let index = 0; index < scene.edges.capacity; index++) {
      if (scene.edges.alive[index] !== 1) continue
      drawn.push([
        scene.nodes.keys[scene.edges.source[index] ?? 0],
        scene.nodes.keys[scene.edges.target[index] ?? 0],
      ])
    }
    return drawn.sort((a, b) => String(a).localeCompare(String(b)))
  }
  return { model, scene, projection, render, fold, first, nodeIndex, alive, container, drawnEdges }
}

const tree = [
  item('g'),
  item('h'),
  item('a', 'g'),
  item('b', 'g'),
  item('c', 'h'),
  item('d', 'h'),
  item('x'),
]

const links = [
  link('ab', 'a', 'b'),
  link('ac', 'a', 'c', 2),
  link('bd', 'b', 'd', 3),
  link('cx', 'c', 'x'),
  link('dx', 'd', 'x'),
]

const graph = (aggregate?: Parameters<typeof edges<Link>>[1]['aggregate']) => ({
  marks: [
    edges<Link>(links, { ...linkOptions, width: 'weight', aggregate }),
    nodes<Item>(tree, { parent: 'parent' }),
  ],
})

describe('Projection', () => {
  it('passes changes through when no node has a parent', () => {
    const { first, projection } = setup({
      marks: [
        nodes<Item>([item('a'), item('b')]),
        edges<Link>([link('ab', 'a', 'b')], linkOptions),
      ],
    })
    expect(projection.active).toBe(false)
    expect(first.scene.nodes.added).toHaveLength(2)
    expect(first.scene.edges.added).toHaveLength(1)
  })

  it('draws unfolded groups as containers behind their children', () => {
    const { container, alive, drawnEdges, projection } = setup(graph())
    expect(projection.active).toBe(true)
    expect(container('g')).toBe(true)
    expect(container('h')).toBe(true)
    expect(container('a')).toBe(false)
    expect(alive('a')).toBe(true)
    expect(drawnEdges()).toHaveLength(5)
  })

  it('hides the descendants of a folded group and merges the edges it crosses', () => {
    const { fold, alive, container, drawnEdges, scene, projection, model } = setup(graph())
    const result = fold(['g', 'h'])
    expect(alive('a')).toBe(false)
    expect(alive('d')).toBe(false)
    expect(alive('g')).toBe(true)
    expect(container('g')).toBe(false)
    expect(drawnEdges()).toEqual([
      ['g', 'h'],
      ['h', 'x'],
    ])
    expect(result.concealed).toHaveLength(4)
    const carrier = projection.edgeIndexOf('ac')
    expect(projection.edgeIndexOf('bd')).toBe(carrier)
    expect(projection.edgeIndexOf('ab')).toBe(-1)
    expect(projection.aggregateAt(carrier)).toMatchObject({
      source: 'g',
      target: 'h',
      count: 2,
      keys: ['ac', 'bd'],
    })
    expect(scene.edges.width[carrier]).toBeGreaterThan(0)
    expect(model.edge('ac')?.index).toBeGreaterThanOrEqual(0)
  })

  it('styles aggregated edges from their count', () => {
    const { fold, scene, projection } = setup({
      ...graph({
        width: (aggregate: AggregateEdge<Link>) => aggregate.count,
        label: (aggregate) => String(aggregate.count),
      }),
      scales: { width: (value: number) => value },
    })
    fold(['g', 'h'])
    const pair = projection.edgeIndexOf('ac')
    expect(scene.edges.label[pair]).toBe('2')
    const width = scene.edges.width[pair] ?? 0
    fold(['g'])
    const single = projection.edgeIndexOf('ac')
    expect(scene.edges.label[single]).toBe('1')
    expect(width).toBeGreaterThan(scene.edges.width[single] ?? 0)
  })

  it('keeps the look of the first edge where the aggregate look sets undefined', () => {
    const left = setup(graph(), ['g', 'h'])
    const given = setup(graph({ width: undefined, color: undefined }), ['g', 'h'])
    const width = (state: typeof left) =>
      state.scene.edges.width[state.projection.edgeIndexOf('ac')]
    expect(width(given)).toBe(width(left))
    expect(width(given)).toBeGreaterThan(0)
  })

  it('keeps the ends of the first merged edge and their labels for a single member', () => {
    const { fold, scene, projection } = setup({
      marks: [
        edges<Link>(links, {
          ...linkOptions,
          ends: {
            split: (link) => (link.weight ?? 1) / 4,
            source: { width: 'weight', label: (link) => link.id },
          },
        }),
        nodes<Item>(tree, { parent: 'parent' }),
      ],
      scales: { width: (value: number) => value },
    })
    fold(['g', 'h'])
    const pair = projection.edgeIndexOf('ac')
    const ends = scene.edges.ends
    expect(ends?.split[pair]).toBe(0.5)
    expect(ends?.width[pair * 2]).toBe(2)
    expect(ends?.label[pair * 2]).toBeNull()
    fold(['g'])
    const single = projection.edgeIndexOf('ac')
    expect(ends?.label[single * 2]).toBe('ac')
  })

  it('restores the original edges on unfold', () => {
    const { fold, alive, container, drawnEdges, projection } = setup(graph())
    fold(['g', 'h'])
    const result = fold([])
    expect(alive('a')).toBe(true)
    expect(container('g')).toBe(true)
    expect(drawnEdges()).toHaveLength(5)
    expect(result.revealed).toHaveLength(4)
    expect(result.fresh).toHaveLength(0)
    expect(result.unfolded).toHaveLength(2)
    expect(projection.edgeIndexOf('ab')).toBeGreaterThanOrEqual(0)
    expect(projection.aggregateAt(projection.edgeIndexOf('ac'))).toBeNull()
  })

  it('folds nested groups to their outermost folded ancestor', () => {
    const { fold, alive, drawnEdges } = setup({
      marks: [
        edges<Link>([link('ab', 'a', 'b'), link('bx', 'b', 'x')], linkOptions),
        nodes<Item>([item('top'), item('inner', 'top'), item('a', 'inner'), item('b'), item('x')], {
          parent: 'parent',
        }),
      ],
    })
    fold(['inner'])
    expect(alive('a')).toBe(false)
    expect(drawnEdges()).toEqual([
      ['b', 'x'],
      ['inner', 'b'],
    ])
    fold(['inner', 'top'])
    expect(alive('inner')).toBe(false)
    expect(drawnEdges()).toEqual([
      ['b', 'x'],
      ['top', 'b'],
    ])
    fold(['top'])
    expect(drawnEdges()).toEqual([
      ['b', 'x'],
      ['top', 'b'],
    ])
    fold([])
    expect(drawnEdges()).toEqual([
      ['a', 'b'],
      ['b', 'x'],
    ])
  })

  it('reports missing parents and attaches them when they arrive', () => {
    const { first, render, container, projection } = setup({
      marks: [nodes<Item>([item('a', 'g')], { parent: 'parent' })],
    })
    expect(first.scene.issues).toEqual([
      { type: 'missing-parent', kind: 'nodes', key: 'a', parent: 'g' },
    ])
    const next = render({ marks: [nodes<Item>([item('a', 'g'), item('g')], { parent: 'parent' })] })
    expect(next.scene.issues).toEqual([])
    expect(container('g')).toBe(true)
    expect(projection.hierarchy.links).toBe(1)
  })

  it('treats cycles as roots and reports them', () => {
    const { first, container, alive } = setup({
      marks: [nodes<Item>([item('a', 'b'), item('b', 'a')], { parent: 'parent' })],
    })
    expect(first.scene.issues).toEqual([
      { type: 'parent-cycle', kind: 'nodes', key: 'a', parent: 'b' },
    ])
    expect(container('a')).toBe(true)
    expect(alive('b')).toBe(true)
  })

  it('keeps folded keys until the group arrives', () => {
    const { render, alive } = setup({ marks: [nodes<Item>([item('x')], { parent: 'parent' })] }, [
      'g',
    ])
    render({ marks: [nodes<Item>([item('x'), item('g'), item('a', 'g')], { parent: 'parent' })] })
    expect(alive('g')).toBe(true)
    expect(alive('a')).toBe(false)
  })

  it('reveals the children of a removed group and moves reparented nodes', () => {
    const { render, fold, alive, container } = setup(graph())
    fold(['g'])
    expect(alive('a')).toBe(false)
    render({
      marks: [
        nodes<Item>(
          tree.filter((node) => node.id !== 'g'),
          { parent: 'parent' },
        ),
      ],
    })
    expect(alive('a')).toBe(true)
    render({
      marks: [
        nodes<Item>(
          tree.map((node) => (node.id === 'x' ? item('x', 'h') : node)),
          { parent: 'parent' },
        ),
      ],
    })
    expect(container('h')).toBe(true)
    fold(['h'])
    expect(alive('x')).toBe(false)
  })

  it('marks children never shown as fresh when their group unfolds', () => {
    const { render, fold } = setup({ marks: [nodes<Item>([item('g')], { parent: 'parent' })] }, [
      'g',
    ])
    render({ marks: [nodes<Item>([item('g'), item('a', 'g')], { parent: 'parent' })] })
    const result = fold([])
    expect(result.fresh).toHaveLength(1)
    expect(result.unfolded).toHaveLength(1)
  })
})

type Wire = { id: string; from: string; to: string; kind: string }

const wire = (id: string, from: string, to: string, kind = 'a'): Wire => ({ id, from, to, kind })

const wires = [
  wire('ab1', 'a', 'b'),
  wire('ab2', 'a', 'b', 'b'),
  wire('ab3', 'a', 'b'),
  wire('ba1', 'b', 'a'),
  wire('ac1', 'a', 'c'),
]

const flat = [item('a'), item('b'), item('c')]

const merging = (
  merge: Parameters<typeof edges<Wire>>[1]['merge'],
  data: readonly Wire[] = wires,
  nodeData: readonly Item[] = flat,
) => ({
  marks: [
    edges<Wire>(data, {
      ...linkOptions,
      ...(merge !== undefined ? { merge } : {}),
      aggregate: { label: (aggregate) => `${aggregate.count}` },
    }),
    nodes<Item>(nodeData, { parent: 'parent' }),
  ],
})

describe('Projection merges', () => {
  it('merges parallel edges that go the same way, from two edges', () => {
    const { drawnEdges, projection, scene } = setup(merging(true))
    expect(drawnEdges()).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'a'],
    ])
    const carrier = projection.edgeIndexOf('ab2')
    expect(projection.edgeIndexOf('ab1')).toBe(carrier)
    const merged = projection.aggregateAt(carrier)
    expect(merged).toMatchObject({
      source: 'a',
      target: 'b',
      count: 3,
      keys: ['ab1', 'ab2', 'ab3'],
      data: [wires[0], wires[1], wires[2]],
    })
    expect(merged?.forward).toEqual({ count: 3, keys: merged?.keys, data: merged?.data })
    expect(merged?.backward).toEqual({ count: 0, keys: [], data: [] })
    expect(scene.edges.label[carrier]).toBe('3')
    expect(projection.aggregateAt(projection.edgeIndexOf('ba1'))).toBeNull()
  })

  it('merges both directions without direction', () => {
    const { drawnEdges, projection } = setup(merging({ directed: false }))
    expect(drawnEdges()).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ])
    expect(projection.aggregateAt(projection.edgeIndexOf('ba1'))?.count).toBe(4)
  })

  it('points a merge of both directions the way of its first edge and splits its edges', () => {
    const { render, projection } = setup(merging({ directed: false }))
    const merged = projection.aggregateAt(projection.edgeIndexOf('ba1'))
    expect(merged).toMatchObject({ source: 'a', target: 'b', count: 4 })
    expect(merged?.forward).toEqual({
      count: 3,
      keys: ['ab1', 'ab2', 'ab3'],
      data: [wires[0], wires[1], wires[2]],
    })
    expect(merged?.backward).toEqual({ count: 1, keys: ['ba1'], data: [wires[3]] })
    render(merging({ directed: false, min: 1 }, [wires[3], wires[4]] as Wire[]))
    const turned = projection.aggregateAt(projection.edgeIndexOf('ba1'))
    expect(turned).toMatchObject({ source: 'b', target: 'a', count: 1 })
    expect(turned?.forward.keys).toEqual(['ba1'])
    expect(turned?.backward.count).toBe(0)
  })

  it('takes the direction of the first edge of the data', () => {
    const { scene, projection, nodeIndex } = setup(
      merging({ directed: false }, [wires[3], wires[0]] as Wire[]),
    )
    const carrier = projection.edgeIndexOf('ab1')
    expect(projection.aggregateAt(carrier)).toMatchObject({ source: 'b', target: 'a' })
    expect(scene.edges.source[carrier]).toBe(nodeIndex('b'))
    expect(projection.aggregateAt(carrier)?.backward.keys).toEqual(['ab1'])
  })

  it('styles each end of a merge of both directions from its own direction', () => {
    const { scene, projection } = setup({
      marks: [
        edges<Wire>(wires, {
          ...linkOptions,
          arrow: 'target',
          ends: { target: { label: 'id' } },
          merge: { directed: false },
          aggregate: {
            ends: {
              source: { width: (aggregate) => aggregate.backward.count },
              target: {
                width: (aggregate) => aggregate.forward.count,
                label: (aggregate) => `${aggregate.forward.count}`,
              },
            },
          },
        }),
        nodes<Item>(flat, { parent: 'parent' }),
      ],
      scales: { width: (value: number) => value },
    })
    const pair = projection.edgeIndexOf('ab1')
    const ends = scene.edges.ends
    expect(ends?.width[pair * 2]).toBe(1)
    expect(ends?.width[pair * 2 + 1]).toBe(3)
    expect(ends?.label[pair * 2 + 1]).toBe('3')
    expect(scene.edges.arrow[pair]).toBe(arrowCodes.both)
  })

  it('keeps the ends of the first edge, and end labels only alone, without aggregate ends', () => {
    const { scene, projection } = setup({
      marks: [
        edges<Wire>(wires, {
          ...linkOptions,
          ends: { target: { width: () => 6, label: 'id' } },
          merge: { directed: false, min: 1 },
        }),
        nodes<Item>(flat, { parent: 'parent' }),
      ],
      scales: { width: (value: number) => value },
    })
    const pair = projection.edgeIndexOf('ab1')
    expect(scene.edges.ends?.width[pair * 2 + 1]).toBe(6)
    expect(scene.edges.ends?.label[pair * 2 + 1]).toBeNull()
    expect(scene.edges.ends?.label[projection.edgeIndexOf('ac1') * 2 + 1]).toBe('ac1')
  })

  it('keeps two opposite edges as two curves without merge', () => {
    const { drawnEdges, projection, scene } = setup(
      merging(undefined, [wires[0], wires[3]] as Wire[]),
    )
    expect(drawnEdges()).toEqual([
      ['a', 'b'],
      ['b', 'a'],
    ])
    expect(scene.edges.bend[projection.edgeIndexOf('ab1')]).not.toBe(0)
    expect(scene.edges.bend[projection.edgeIndexOf('ba1')]).not.toBe(0)
  })

  it('splits the merge by a value', () => {
    const { drawnEdges, projection } = setup(merging({ by: 'kind', directed: false, min: 1 }))
    expect(drawnEdges()).toEqual([
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'c'],
    ])
    const first = projection.aggregateAt(projection.edgeIndexOf('ab1'))
    expect(first).toMatchObject({ count: 3, value: 'a', keys: ['ab1', 'ab3', 'ba1'] })
    expect(projection.aggregateAt(projection.edgeIndexOf('ab2'))).toMatchObject({
      count: 1,
      value: 'b',
    })
    expect(projection.aggregateAt(projection.edgeIndexOf('ac1'))?.count).toBe(1)
  })

  it('draws edges one by one below the minimum and merges them once it is reached', () => {
    const { render, drawnEdges, projection } = setup(merging({ min: 4, directed: false }, wires))
    expect(projection.aggregateAt(projection.edgeIndexOf('ab1'))?.count).toBe(4)
    render(merging({ min: 4, directed: false }, wires.slice(1)))
    expect(drawnEdges()).toHaveLength(4)
    expect(projection.aggregateAt(projection.edgeIndexOf('ab2'))).toBeNull()
    render(merging({ min: 4, directed: false }, wires))
    expect(drawnEdges()).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ])
  })

  it('turns merging on and off without updating the other edges', () => {
    const { render, drawnEdges, projection } = setup(merging(undefined))
    expect(drawnEdges()).toHaveLength(5)
    const on = render(merging(true))
    expect(drawnEdges()).toHaveLength(3)
    expect(on.scene.edges.removed.map((ref) => ref.key).sort()).toEqual(['ab2', 'ab3'])
    expect(on.scene.edges.updated.map((ref) => ref.key)).toEqual(['ab1'])
    expect(projection.aggregateAt(projection.edgeIndexOf('ab1'))?.count).toBe(3)
    const off = render(merging(undefined))
    expect(drawnEdges()).toHaveLength(5)
    expect(off.scene.edges.added.map((ref) => ref.key).sort()).toEqual(['ab2', 'ab3'])
    expect(off.scene.edges.updated.map((ref) => ref.key)).toEqual(['ab1'])
    expect(projection.aggregateAt(projection.edgeIndexOf('ab2'))).toBeNull()
  })

  it('restyles merged edges when only the aggregate look changes', () => {
    const { render, scene, projection } = setup(merging(true))
    const next = render({
      marks: [
        edges<Wire>(wires, {
          ...linkOptions,
          merge: true,
          aggregate: { label: (aggregate) => `×${aggregate.count}` },
        }),
        nodes<Item>(flat, { parent: 'parent' }),
      ],
    })
    expect(next.scene.edges.updated.map((ref) => ref.key)).toEqual(['ab1'])
    expect(scene.edges.label[projection.edgeIndexOf('ab1')]).toBe('×3')
  })

  it('merges by value into folded groups, whatever the minimum', () => {
    const grouped = [item('g'), item('a', 'g'), item('b'), item('c', 'g')]
    const { fold, drawnEdges, projection } = setup(merging({ by: 'kind', min: 5 }, wires, grouped))
    expect(drawnEdges()).toHaveLength(5)
    fold(['g'])
    expect(drawnEdges()).toEqual([
      ['b', 'g'],
      ['g', 'b'],
      ['g', 'b'],
    ])
    expect(projection.aggregateAt(projection.edgeIndexOf('ab1'))).toMatchObject({
      source: 'g',
      target: 'b',
      count: 2,
      value: 'a',
    })
    fold([])
    expect(drawnEdges()).toHaveLength(5)
  })

  it('moves an edge whose value changes to its new merged edge', () => {
    const { render, projection } = setup(merging({ by: 'kind', min: 1 }))
    render(
      merging(
        { by: 'kind', min: 1 },
        wires.map((each) => ({ ...each, kind: 'a' })),
      ),
    )
    expect(projection.aggregateAt(projection.edgeIndexOf('ab2'))?.count).toBe(3)
    expect(projection.edgeIndexOf('ab2')).toBe(projection.edgeIndexOf('ab1'))
  })
})
