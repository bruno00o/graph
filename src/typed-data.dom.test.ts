import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { densityBundling } from './bundling'
import {
  type AggregateEdge,
  defineGraph,
  type EdgeBundling,
  type EdgeDatum,
  type EdgeMark,
  type EdgeTarget,
  edges,
  type GraphDefinition,
  type GraphDragEvent,
  type GraphInstance,
  type GraphPointerEvent,
  type GraphState,
  type GraphTarget,
  type Mark,
  mountGraph,
  type NodeDatum,
  type NodeMark,
  type NodeTarget,
  nodes,
} from './index'
import { grid, rings } from './layouts'
import { type FakeDom, fakeRenderer, installDom } from './testing/dom'

vi.mock('./webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

type Person = { id: string; name: string; team: string; score: number }
type Company = { id: string; title: string; size: number }
type Link = { id: string; from: string; to: string; weight: number }
type Ownership = { id: string; owner: string; company: string; share: number }

const people: Person[] = []
const companies: Company[] = []
const links: Link[] = []
const ownerships: Ownership[] = []

let dom: FakeDom
const mounted: GraphInstance[] = []

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  for (const graph of mounted.splice(0)) graph.destroy()
  dom.restore()
})

function mount<S extends string, M extends Mark>(
  definition: GraphDefinition<S, M>,
): GraphInstance<S, M> {
  const graph = mountGraph(document.createElement('div'), { definition, ariaLabel: 'graph' })
  mounted.push(graph)
  return graph
}

describe('typed data', () => {
  it('reports the name of the mark in targets', () => {
    const person: Person = { id: 'p', name: 'P', team: 'a', score: 1 }
    const company: Company = { id: 'c', title: 'C', size: 2 }
    const graph = mount(
      defineGraph({
        marks: [
          nodes([{ ...person, x: -100, y: 0 }], { name: 'person', x: 'x', y: 'y' }),
          nodes([{ ...company, x: 100, y: 0 }], { x: 'x', y: 'y' }),
        ],
      }),
    )
    dom.flushFrames()
    const at = (key: string) => graph.view.toScreen(graph.positions.get(key) ?? { x: 0, y: 0 })
    expect(graph.pick(at('p'))).toMatchObject({ kind: 'node', key: 'p', mark: 'person' })
    const unnamed = graph.pick(at('c'))
    expect(unnamed).toMatchObject({ kind: 'node', key: 'c' })
    expect(unnamed && 'mark' in unnamed && unnamed.mark === undefined).toBe(true)
  })

  it('infers the targets of one node mark and one edge mark without annotations', () => {
    const definition = defineGraph({
      marks: [edges(links, { source: 'from', target: 'to' }), nodes(people, { label: 'name' })],
    })
    expectTypeOf(definition).toEqualTypeOf<
      GraphDefinition<never, EdgeMark<Link, undefined> | NodeMark<Person, undefined>>
    >()
    const graph = mount(definition)
    expectTypeOf(graph.pick({ x: 0, y: 0 })).toEqualTypeOf<
      EdgeTarget<Link, undefined> | NodeTarget<Person, undefined> | null
    >()
    graph.on('click', ({ target }) => {
      if (target?.kind === 'node') expectTypeOf(target.datum).toEqualTypeOf<Person>()
      if (target?.kind === 'edge') expectTypeOf(target.datum).toEqualTypeOf<Link>()
      expectTypeOf(target?.mark).toEqualTypeOf<undefined>()
    })
    graph.on('pointerenter', ({ target }) => {
      expectTypeOf(target.datum).toEqualTypeOf<Person | Link>()
    })
    graph.on('dragstart', ({ target }) => {
      expectTypeOf(target).toEqualTypeOf<NodeTarget<Person, undefined>>()
    })
    graph.on('focuschange', ({ target }) => {
      if (target?.kind === 'node') expectTypeOf(target.datum).toEqualTypeOf<Person>()
    })
    expectTypeOf(graph.focus.get()).toEqualTypeOf(graph.pick({ x: 0, y: 0 }))
    graph.on('click', ({ target }) => {
      if (target?.kind === 'node') {
        // @ts-expect-error
        target.datum.weight
      }
    })
  })

  it('narrows datum between two node marks by mark name', () => {
    const definition = defineGraph({
      marks: [
        edges(ownerships, { name: 'ownership', source: 'owner', target: 'company' }),
        edges(links, { name: 'link', source: 'from', target: 'to' }),
        nodes(people, { name: 'person', label: 'name' }),
        nodes(companies, { name: 'company', label: 'title' }),
      ],
    })
    const graph = mount(definition)
    graph.on('click', ({ target }) => {
      if (target?.kind === 'node' && target.mark === 'person') {
        expectTypeOf(target.datum).toEqualTypeOf<Person>()
      }
      if (target?.kind === 'node') {
        expectTypeOf(target.datum).toEqualTypeOf<Person | Company>()
        expectTypeOf(target.mark).toEqualTypeOf<'person' | 'company'>()
        // @ts-expect-error
        target.datum.title
        // @ts-expect-error
        if (target.mark === 'people') return
      }
      switch (target?.mark) {
        case 'company':
          expectTypeOf(target.datum).toEqualTypeOf<Company>()
          break
        case 'ownership':
          expectTypeOf(target.datum).toEqualTypeOf<Ownership>()
          expectTypeOf(target.kind).toEqualTypeOf<'edge'>()
          break
      }
    })
    graph.on('dragend', ({ target }) => {
      if (target.mark === 'company') expectTypeOf(target.datum).toEqualTypeOf<Company>()
      // @ts-expect-error
      if (target.mark === 'link') return
    })
  })

  it('keeps unnamed marks apart from named ones', () => {
    const definition = defineGraph({
      marks: [nodes(people), nodes(companies, { name: 'company' })],
    })
    const graph = mount(definition)
    const target = graph.pick({ x: 0, y: 0 })
    if (target?.mark === undefined) expectTypeOf(target?.datum).toEqualTypeOf<Person | undefined>()
    else expectTypeOf(target.datum).toEqualTypeOf<Company>()
  })

  it('types aggregated edges by the edge mark', () => {
    const definition = defineGraph({
      marks: [
        nodes(people, { parent: () => null }),
        edges(links, { name: 'link', source: 'from', target: 'to' }),
        edges(ownerships, { name: 'ownership', source: 'owner', target: 'company' }),
      ],
    })
    const graph = mount(definition)
    graph.on('click', ({ target }) => {
      if (target?.kind !== 'edge') return
      expectTypeOf(target.aggregate).toEqualTypeOf<
        AggregateEdge<Link> | AggregateEdge<Ownership> | undefined
      >()
      if (target.mark === 'link' && target.aggregate) {
        expectTypeOf(target.aggregate.data).toEqualTypeOf<readonly Link[]>()
      }
    })
  })

  it('types the store, the state and the focus', () => {
    const definition = defineGraph({
      marks: [nodes(people, { name: 'person' }), edges(links, { source: 'from', target: 'to' })],
      states: { muted: { opacity: 0.2 } },
    })
    type Marks = (typeof definition.marks)[number]
    expectTypeOf<Marks>().toEqualTypeOf<NodeMark<Person, 'person'> | EdgeMark<Link, undefined>>()
    const graph = mount(definition)
    expectTypeOf(graph).toEqualTypeOf<GraphInstance<'muted', Marks>>()
    expectTypeOf(graph.store.state).toEqualTypeOf<GraphState<'muted', Marks>>()
    const hovered = graph.store.state.hovered
    if (hovered?.kind === 'node') expectTypeOf(hovered.datum).toEqualTypeOf<Person>()
    expectTypeOf(graph.store.get().focused).toEqualTypeOf<GraphTarget<Marks> | null>()
    expectTypeOf<NodeDatum<Marks>>().toEqualTypeOf<Person>()
    expectTypeOf<EdgeDatum<Marks>>().toEqualTypeOf<Link>()
  })

  it('keeps typed instances usable where an untyped one is expected', () => {
    const definition = defineGraph({
      marks: [nodes(people), edges(links, { source: 'from', target: 'to' })],
    })
    const graph = mount(definition)
    expectTypeOf(graph).toExtend<GraphInstance>()
    expectTypeOf(definition).toExtend<GraphDefinition>()
    expectTypeOf<GraphTarget>().toEqualTypeOf<NodeTarget | EdgeTarget>()
    expectTypeOf<NodeTarget['datum']>().toBeUnknown()
    expectTypeOf<GraphPointerEvent['target']>().toEqualTypeOf<NodeTarget | EdgeTarget | null>()
    expectTypeOf<GraphDragEvent['target']>().toEqualTypeOf<NodeTarget>()
    expectTypeOf<NodeDatum<Mark>>().toBeUnknown()
    const marks: Mark[] = []
    expectTypeOf(mount(defineGraph({ marks })).pick({ x: 0, y: 0 })).toEqualTypeOf<
      NodeTarget | EdgeTarget | null
    >()
  })

  it('refuses a definition with other data types on update', () => {
    const graph = mount(defineGraph({ marks: [nodes(people)] }))
    graph.update({ definition: defineGraph({ marks: [nodes(people)] }) })
    graph.update({ definition: defineGraph({ marks: [] }) })
    // @ts-expect-error
    graph.update({ definition: defineGraph({ marks: [nodes(companies)] }) })
  })

  it('types the edge items that a bundling reads', () => {
    const reading: EdgeBundling<Link | Ownership> = {
      name: 'reading',
      options: {},
      strength: 1,
      maxEdges: 10,
      start(graph, listener) {
        expectTypeOf(graph.datum(0)).toEqualTypeOf<Link | Ownership | undefined>()
        listener.end({ offsets: new Uint32Array(1), points: new Float32Array(0) })
        return { stop: () => {} }
      },
    }
    defineGraph({
      marks: [
        nodes(people),
        edges(links, { source: 'from', target: 'to' }),
        edges(ownerships, { source: 'owner', target: 'company' }),
      ],
      bundling: reading,
    })
    defineGraph({
      marks: [nodes(people), edges(links, { source: 'from', target: 'to' })],
      bundling: densityBundling(),
    })
    const companyBundling = densityBundling() as EdgeBundling<Company>
    defineGraph({
      marks: [nodes(people), edges(links, { source: 'from', target: 'to' })],
      // @ts-expect-error
      bundling: companyBundling,
    })
  })

  it('types the items that layouts compare', () => {
    defineGraph({
      marks: [nodes(people), edges(links, { source: 'from', target: 'to' })],
      layout: grid({
        order: (a: Person, b) => {
          expectTypeOf(b).toEqualTypeOf<Person>()
          return a.score - b.score
        },
      }),
    })
    defineGraph({
      marks: [nodes(people)],
      // @ts-expect-error
      layout: grid({ order: (a: Company, b) => a.size - b.size }),
    })
    const graph = mount(defineGraph({ marks: [nodes(people), nodes(companies)] }))
    graph.layout.run(
      rings({
        order: (a, b) => {
          expectTypeOf(a).toEqualTypeOf<Person | Company>()
          return String(a.id).localeCompare(b.id)
        },
      }),
    )
  })
})
