import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import type { AggregateEdge, EdgeOptions, GraphDefinitionOptions, Key } from '../types'
import { createGraphModel } from './graph-model'
import { Projection } from './projection'
import { createScene } from './scene'

type Item = { id: string; parent?: string | null }
type Link = { id: string; from: string; to: string; kind?: string }

const item = (id: string, parent: string | null = null): Item => ({ id, parent })
const link = (id: string, from: string, to: string, kind = 'k'): Link => ({ id, from, to, kind })

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
  render(options)
  const drawn = () => {
    const rows: string[] = []
    for (let index = 0; index < scene.edges.capacity; index++) {
      if (scene.edges.alive[index] !== 1) continue
      const ends = [scene.edges.source[index] ?? 0, scene.edges.target[index] ?? 0]
      const keys = projection.keysAt(index) ?? [scene.edges.keys[index]]
      rows.push(`${ends.map((at) => scene.nodes.keys[at]).join('>')} ${keys.join(',')}`)
    }
    return rows.sort()
  }
  const aggregateOf = (key: Key) => projection.aggregateAt(projection.edgeIndexOf(key))
  return { model, scene, projection, render, fold, drawn, aggregateOf }
}

const nested = [
  item('A'),
  item('A1', 'A'),
  item('A2', 'A'),
  item('a', 'A1'),
  item('a2', 'A1'),
  item('b', 'A'),
  item('c', 'A2'),
  item('y'),
]

const linkOptions = { source: 'from', target: 'to' } as const

function graph(
  links: Link[],
  options: Partial<EdgeOptions<Link>> = {},
  items: Item[] = nested,
): GraphDefinitionOptions {
  return {
    marks: [
      nodes<Item>(items, { parent: 'parent' }),
      edges<Link>(links, { ...linkOptions, betweenGroups: 'groups', ...options }),
    ],
  }
}

describe('edges between groups', () => {
  it('lifts each end to the child of the innermost group that holds both', () => {
    const { drawn, aggregateOf } = setup(
      graph([
        link('aa2', 'a', 'a2'),
        link('ac', 'a', 'c'),
        link('ab', 'a', 'b'),
        link('ay', 'a', 'y'),
      ]),
    )
    expect(drawn()).toEqual(['A1>A2 ac', 'A1>b ab', 'A>y ay', 'a>a2 aa2'])
    expect(aggregateOf('ac')).toMatchObject({ source: 'A1', target: 'A2', count: 1, keys: ['ac'] })
    expect(aggregateOf('aa2')).toBeNull()
  })

  it('draws one aggregated edge per pair of groups and direction', () => {
    const { drawn, aggregateOf } = setup(
      graph([link('ac', 'a', 'c'), link('a2c', 'a2', 'c'), link('ca', 'c', 'a')]),
    )
    expect(drawn()).toEqual(['A1>A2 ac,a2c', 'A2>A1 ca'])
    expect(aggregateOf('ca')).toMatchObject({ source: 'A2', target: 'A1', count: 1 })
    const both = setup(
      graph([link('ac', 'a', 'c'), link('a2c', 'a2', 'c'), link('ca', 'c', 'a')], {
        merge: { directed: false },
      }),
    )
    expect(both.drawn()).toEqual(['A1>A2 ac,a2c,ca'])
    expect(both.aggregateOf('ca')).toMatchObject({
      forward: { count: 2, keys: ['ac', 'a2c'] },
      backward: { count: 1, keys: ['ca'] },
    })
  })

  it('splits by the merge value and styles from the aggregate', () => {
    const { drawn, scene, projection } = setup(
      graph(
        [link('ac', 'a', 'c', 'x'), link('a2c', 'a2', 'c', 'y'), link('a2c2', 'a2', 'c', 'y')],
        {
          merge: { by: 'kind' },
          aggregate: { label: (aggregate: AggregateEdge<Link>) => String(aggregate.count) },
        },
      ),
    )
    expect(drawn()).toEqual(['A1>A2 a2c,a2c2', 'A1>A2 ac'])
    expect(scene.edges.label[projection.edgeIndexOf('a2c')]).toBe('2')
    expect(scene.edges.label[projection.edgeIndexOf('ac')]).toBe('1')
  })

  it('keeps the edges between nodes in the default mode', () => {
    const { drawn } = setup(
      graph([link('ac', 'a', 'c'), link('ay', 'a', 'y')], { betweenGroups: undefined }),
    )
    expect(drawn()).toEqual(['a>c ac', 'a>y ay'])
  })

  it('switches between the two modes and back', () => {
    const links = [link('ac', 'a', 'c'), link('a2c', 'a2', 'c'), link('aa2', 'a', 'a2')]
    const { drawn, render } = setup(graph(links, { betweenGroups: 'members' }))
    expect(drawn()).toEqual(['a2>c a2c', 'a>a2 aa2', 'a>c ac'])
    const lifted = render(graph(links))
    expect(drawn()).toEqual(['A1>A2 ac,a2c', 'a>a2 aa2'])
    expect(lifted.scene.edges.updated.map((ref) => ref.key)).not.toContain('aa2')
    expect(lifted.reshaped).toBe(false)
    render(graph(links, { betweenGroups: 'members' }))
    expect(drawn()).toEqual(['a2>c a2c', 'a>a2 aa2', 'a>c ac'])
  })

  it('follows folds, nested and outer', () => {
    const links = [link('ac', 'a', 'c'), link('ay', 'a', 'y'), link('aa2', 'a', 'a2')]
    const { drawn, fold } = setup(graph(links))
    fold(['A1'])
    expect(drawn()).toEqual(['A1>A2 ac', 'A>y ay'])
    fold(['A'])
    expect(drawn()).toEqual(['A>y ay'])
    fold([])
    expect(drawn()).toEqual(['A1>A2 ac', 'A>y ay', 'a>a2 aa2'])
  })

  it('lifts again when a node or a group changes parent, arrives late or leaves', () => {
    const links = [link('ac', 'a', 'c'), link('ay', 'a', 'y')]
    const { drawn, render } = setup(graph(links))
    render(
      graph(
        links,
        {},
        nested.map((each) => (each.id === 'c' ? item('c') : each)),
      ),
    )
    expect(drawn()).toEqual(['A>c ac', 'A>y ay'])
    render(
      graph(
        links,
        {},
        nested.map((each) => (each.id === 'A2' ? item('A2') : each)),
      ),
    )
    expect(drawn()).toEqual(['A>A2 ac', 'A>y ay'])
    const late = nested.filter((each) => each.id !== 'A')
    render(graph(links, {}, late))
    expect(drawn()).toEqual(['A1>A2 ac', 'A1>y ay'])
    render(graph(links, {}, nested))
    expect(drawn()).toEqual(['A1>A2 ac', 'A>y ay'])
  })

  it('draws the edges between groups without bundles, routes or bridges', () => {
    const { scene, projection } = setup(graph([link('ac', 'a', 'c'), link('aa2', 'a', 'a2')]))
    const between = projection.edgeIndexOf('ac')
    const inside = projection.edgeIndexOf('aa2')
    expect(scene.edges.bundle[between]).toBe(0)
    expect(scene.edges.route[between]).toBe(0)
    expect(scene.edges.bridge[between]).toBe(0)
    expect(scene.edges.bundle[inside]).toBe(1)
    expect(scene.edges.route[inside]).toBe(1)
  })

  it('takes only the two modes', () => {
    edges<Link>([], { ...linkOptions, betweenGroups: 'members' })
    // @ts-expect-error
    edges<Link>([], { ...linkOptions, betweenGroups: 'nodes' })
  })
})
