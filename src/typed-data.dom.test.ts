import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { densityBundling } from './bundling'
import {
  type AggregateEdge,
  defineGraph,
  type EdgeBundling,
  type EdgeDatum,
  type EdgeEnd,
  type EdgeMark,
  type EdgeRouting,
  type EdgeTarget,
  edges,
  type GraphCount,
  type GraphDefinition,
  type GraphDragEvent,
  type GraphInstance,
  type GraphIssue,
  type GraphPointerEvent,
  type GraphShapeCount,
  type GraphState,
  type GraphTarget,
  type HasShapes,
  type Key,
  type KeyList,
  type LayerName,
  type Mark,
  mountGraph,
  type NodeDatum,
  type NodeMark,
  type NodeTarget,
  nodes,
  type ShapeDatum,
  type ShapeGeometry,
  type ShapeIssue,
  type ShapeMark,
} from './index'
import { grid, rings } from './layouts'
import { orthogonalRouting } from './routing'
import { shapes } from './shapes'
import { type FakeDom, fakeRenderer, installDom } from './testing/dom'

vi.mock('./webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

type Person = { id: string; name: string; team: string; score: number }
type Company = { id: string; title: string; size: number }
type Link = { id: string; from: string; to: string; weight: number }
type Ownership = { id: string; owner: string; company: string; share: number }
type Zone = { id: string; outline: ShapeGeometry; rank: number }
type Area = { code: number; geometry: ShapeGeometry | null }

const people: Person[] = []
const companies: Company[] = []
const links: Link[] = []
const ownerships: Ownership[] = []
const zones: Zone[] = []
const areas: Area[] = []

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

  it('types the options of edge ends and the end under the pointer', () => {
    const graph = mount(
      defineGraph({
        marks: [
          edges(links, {
            source: 'from',
            target: 'to',
            ends: {
              split: (link) => link.weight,
              source: { color: 'weight', label: { text: (link) => link.id, background: true } },
              target: { width: 'weight', dash: () => 'dotted' },
            },
          }),
          nodes(people),
        ],
      }),
    )
    graph.on('click', ({ target }) => {
      if (target?.kind === 'edge') expectTypeOf(target.end).toEqualTypeOf<EdgeEnd | undefined>()
    })
    edges(links, {
      source: 'from',
      target: 'to',
      ends: {
        source: {
          // @ts-expect-error
          color: 'missing',
        },
      },
    })
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
      expectTypeOf(target.direction).toEqualTypeOf<'forward' | 'backward' | undefined>()
      if (target.mark === 'link' && target.aggregate && target.direction) {
        expectTypeOf(target.aggregate[target.direction].data).toEqualTypeOf<readonly Link[]>()
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

  it('types the layer names', () => {
    const definition = defineGraph({
      marks: [
        nodes(people, { layer: 'people' }),
        edges(links, { source: 'from', target: 'to', layer: 'links' }),
        edges(ownerships, { source: 'owner', target: 'company' }),
      ],
      states: { carrier: { halo: true } },
      support: { carriers: 'carrier' },
    })
    type Marks = (typeof definition.marks)[number]
    expectTypeOf<Marks>().toEqualTypeOf<
      | NodeMark<Person, undefined, 'people'>
      | EdgeMark<Link, undefined, 'links'>
      | EdgeMark<Ownership, undefined>
    >()
    expectTypeOf<LayerName<Marks>>().toEqualTypeOf<'people' | 'links'>()
    expectTypeOf<LayerName<Mark>>().toEqualTypeOf<string>()
    const graph = mount(definition)
    expectTypeOf(graph.layers.hidden()).toEqualTypeOf<readonly ('people' | 'links')[]>()
    graph.layers.toggle('links')
    // @ts-expect-error
    graph.layers.toggle('other')
    graph.on('layerchange', ({ hidden }) => {
      expectTypeOf(hidden).toEqualTypeOf<readonly ('people' | 'links')[]>()
    })
    expectTypeOf(graph).toExtend<GraphInstance>()
    expect(() =>
      defineGraph({
        marks: [nodes(people)],
        states: { carrier: { halo: true } },
        // @ts-expect-error
        support: { carriers: 'other' },
      }),
    ).toThrow(TypeError)
  })

  it('accepts name and layer with explicit item types on the marks', () => {
    const named = edges<Link>(links, {
      name: 'routes',
      layer: 'flights',
      source: 'from',
      target: 'to',
    })
    expectTypeOf(named).toEqualTypeOf<EdgeMark<Link, string | undefined, string | undefined>>()
    const plain = edges<Link>(links, { source: 'from', target: 'to' })
    expectTypeOf(plain).toEqualTypeOf<EdgeMark<Link, undefined, undefined>>()
    const keyed = nodes<Company>(companies, { name: 'company', layer: 'orgs', key: 'title' })
    expectTypeOf(keyed).toEqualTypeOf<NodeMark<Company, string | undefined, string | undefined>>()
    const unkeyed = nodes<Person>(people, { name: 'person' })
    expectTypeOf(unkeyed).toEqualTypeOf<NodeMark<Person, string | undefined, string | undefined>>()
    const inferred = nodes(people, { name: 'person', layer: 'people' })
    expectTypeOf(inferred).toEqualTypeOf<NodeMark<Person, 'person', 'people'>>()
    const unnamed = edges(links, { source: 'from', target: 'to' })
    expectTypeOf(unnamed).toEqualTypeOf<EdgeMark<Link, undefined, undefined>>()
    const definition = defineGraph({ marks: [named, keyed, nodes(people, { name: 'person' })] })
    const graph = mount(definition)
    graph.layers.toggle('anything')
    // @ts-expect-error
    edges<Link>(links, { name: 1, source: 'from', target: 'to' })
    // @ts-expect-error
    nodes<Person>(people, { layer: 2 })
    expect(named.name).toBe('routes')
    expect(named.layer).toBe('flights')
  })

  it('refuses a bare string where a list of keys is expected', () => {
    const graph: GraphInstance = mount(defineGraph({ marks: [nodes(people)] }))
    const keys: Iterable<Key> = ['a']
    const names: readonly string[] = ['a']
    const generated = function* () {
      yield 'a'
    }
    for (const list of [
      ['a', 1],
      names,
      ['a', 'b'] as const,
      ['a', 1] as [string, number],
      new Set<Key>(['a']),
      new Map<Key, number>([['a', 1]]).keys(),
      generated(),
      keys,
    ]) {
      graph.groups.fold(list)
      graph.groups.unfold(list)
      graph.groups.set(list)
      graph.selection.set({ nodes: list, edges: list })
      graph.view.fit({ nodes: list, edges: list })
    }
    graph.layers.hide(names)
    graph.layers.show(new Set(['a']))
    graph.layers.set(generated())
    expectTypeOf<KeyList>().toEqualTypeOf<Iterable<Key> & object>()
    expectTypeOf<KeyList<'a'>>().toExtend<KeyList>()
    expectTypeOf<string>().not.toExtend<KeyList>()
    expectTypeOf<string[]>().toExtend<KeyList<string>>()
    const refused = (key: string) => {
      // @ts-expect-error
      graph.groups.fold(key)
      // @ts-expect-error
      graph.groups.unfold('a')
      // @ts-expect-error
      graph.groups.set('a')
      // @ts-expect-error
      graph.layers.hide('a')
      // @ts-expect-error
      graph.layers.show('a')
      // @ts-expect-error
      graph.layers.set('a')
      // @ts-expect-error
      graph.selection.set({ nodes: 'a' })
      // @ts-expect-error
      graph.view.fit({ edges: 'a' })
      // @ts-expect-error
      graph.layout.run(undefined, { keys: 'a' })
      // @ts-expect-error
      graph.layout.run(undefined, { fit: { nodes: 'a' } })
      // @ts-expect-error
      graph.anchors.set(document.createElement('div'), { nodes: 'a' })
      // @ts-expect-error
      graph.groups.fold(Math.random() > 0.5 ? 'a' : ['a'])
      const definition: GraphDefinition = defineGraph({ marks: [nodes(people)] })
      const options = { definition, ariaLabel: 'graph' }
      // @ts-expect-error
      mountGraph(document.createElement('div'), { ...options, initialFolded: 'a' })
      // @ts-expect-error
      mountGraph(document.createElement('div'), { ...options, folded: 'a' })
      // @ts-expect-error
      mountGraph(document.createElement('div'), { ...options, initialHiddenLayers: 'a' })
      // @ts-expect-error
      mountGraph(document.createElement('div'), { ...options, hiddenLayers: 'a' })
      // @ts-expect-error
      mountGraph(document.createElement('div'), { ...options, selection: { nodes: 'a' } })
      // @ts-expect-error
      graph.update({ folded: 'a' })
    }
    expect(refused).toBeTypeOf('function')
  })

  it('keeps layer and state names on lists of keys', () => {
    const definition = defineGraph({
      marks: [
        nodes(people, { layer: 'people' }),
        edges(links, { source: 'from', target: 'to', layer: 'links' }),
      ],
      states: { near: {} },
    })
    const graph = mount(definition)
    graph.layers.hide(['people'])
    graph.layers.set(new Set(['links'] as const))
    graph.states.set('near', { nodes: new Set(['a']), edges: ['b'] })
    const options = { definition, ariaLabel: 'graph' }
    const refused = () => {
      // @ts-expect-error
      graph.layers.hide(['other'])
      // @ts-expect-error
      graph.layers.hide('people')
      // @ts-expect-error
      graph.states.set('near', { nodes: 'a' })
      // @ts-expect-error
      graph.states.add('far', { nodes: ['a'] })
      // @ts-expect-error
      mountGraph(document.createElement('div'), { ...options, initialHiddenLayers: ['other'] })
    }
    const other = mountGraph(document.createElement('div'), {
      ...options,
      initialHiddenLayers: ['links'],
      initialFolded: new Set<Key>(),
    })
    mounted.push(other)
    expectTypeOf(other.layers.hidden()).toEqualTypeOf<readonly ('people' | 'links')[]>()
    expect(refused).toBeTypeOf('function')
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

  it('types the edge items that a routing reads, and the route and bridge options', () => {
    const reading: EdgeRouting<Link> = {
      name: 'reading',
      options: {},
      radius: 4,
      maxEdges: 10,
      start(graph, listener) {
        expectTypeOf(graph.datum(0)).toEqualTypeOf<Link | undefined>()
        expectTypeOf(graph.extents).toEqualTypeOf<Float32Array>()
        listener.end({ offsets: new Uint32Array(1), points: new Float32Array(0) })
        return { stop: () => {} }
      },
    }
    defineGraph({
      marks: [
        nodes(people),
        edges(links, {
          source: 'from',
          target: 'to',
          route: (link) => link.weight > 1,
          bridge: (link) => link.id !== 'x',
        }),
      ],
      routing: reading,
      bridges: { shape: 'gap' },
    })
    defineGraph({
      marks: [nodes(people), edges(links, { source: 'from', target: 'to' })],
      routing: orthogonalRouting({ axis: 'vertical' }),
      bridges: true,
    })
    const companyRouting = orthogonalRouting() as EdgeRouting<Company>
    defineGraph({
      marks: [nodes(people), edges(links, { source: 'from', target: 'to' })],
      // @ts-expect-error
      routing: companyRouting,
    })
    edges(links, {
      source: 'from',
      target: 'to',
      // @ts-expect-error
      route: (link) => link.missing,
    })
  })

  it('types shape marks and keeps shapes out of targets', () => {
    const zoneMark = shapes(zones, { name: 'zone', geometry: 'outline', order: 'rank' })
    expectTypeOf(zoneMark).toEqualTypeOf<ShapeMark<Zone, 'zone'>>()
    const areaMark = shapes(areas, { key: 'code', fill: (area) => (area.code > 1 ? 'red' : null) })
    expectTypeOf(areaMark).toEqualTypeOf<ShapeMark<Area, undefined>>()
    const explicit = shapes<Zone>(zones, { name: 'zone', geometry: 'outline' })
    expectTypeOf(explicit).toEqualTypeOf<ShapeMark<Zone, string | undefined>>()
    // @ts-expect-error
    shapes(areas)
    // @ts-expect-error
    shapes(zones, { geometry: 'rank' })
    // @ts-expect-error
    shapes(zones, { layer: 'zones' })
    // @ts-expect-error
    shapes(zones, { strokeWidth: 'rank' })
    const definition = defineGraph({
      marks: [zoneMark, areaMark, nodes(people), edges(links, { source: 'from', target: 'to' })],
    })
    type Marks = (typeof definition.marks)[number]
    expectTypeOf<HasShapes<Marks>>().toEqualTypeOf<true>()
    expectTypeOf<ShapeDatum<Marks>>().toEqualTypeOf<Zone | Area>()
    expectTypeOf<NodeDatum<Marks>>().toEqualTypeOf<Person>()
    expectTypeOf<EdgeDatum<Marks>>().toEqualTypeOf<Link>()
    const graph = mount(definition)
    expectTypeOf(graph).toExtend<GraphInstance>()
    expectTypeOf(graph.count()).toEqualTypeOf<GraphShapeCount>()
    expectTypeOf(graph.issues()).toEqualTypeOf<readonly GraphIssue<Marks>[]>()
    expectTypeOf<ShapeIssue>().toExtend<GraphIssue<Marks>>()
    expectTypeOf(graph.pick({ x: 0, y: 0 })).toEqualTypeOf<
      NodeTarget<Person, undefined> | EdgeTarget<Link, undefined> | null
    >()
    graph.view.fit({ shapes: ['a'], nodes: ['b'] })
    // @ts-expect-error
    graph.view.fit({ shapes: 'a' })
  })

  it('keeps the counts and the issues of graphs without shapes as they were', () => {
    const graph = mount(
      defineGraph({ marks: [nodes(people), edges(links, { source: 'from', target: 'to' })] }),
    )
    expectTypeOf(graph.count()).toEqualTypeOf<GraphCount>()
    type Issue = ReturnType<typeof graph.issues>[number]
    expectTypeOf<Extract<Issue, { type: 'invalid-shape' }>>().toBeNever()
    expectTypeOf<Extract<Issue, { kind: 'shapes' }>>().toBeNever()
    expectTypeOf<HasShapes<Mark>>().toEqualTypeOf<false>()
    expectTypeOf<ShapeIssue>().toExtend<GraphIssue>()
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
