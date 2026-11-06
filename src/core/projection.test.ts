import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import type { AggregateEdge, GraphDefinitionOptions, Key } from '../types'
import { containerShape } from './columns'
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
    edges<Link>(links, { ...linkOptions, width: 'weight', ...(aggregate ? { aggregate } : {}) }),
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
