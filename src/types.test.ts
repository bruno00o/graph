import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { describe, expectTypeOf, it } from 'vitest'
import {
  type Accessor,
  type AggregateEdge,
  type BuiltInState,
  defineGraph,
  type EdgeMark,
  type ElementKeys,
  edges,
  type FieldOf,
  type GraphDataStatus,
  type GraphDefinition,
  type GraphInstance,
  type GraphState,
  groups,
  hull,
  type KeyFieldOf,
  type LiveSource,
  lineWaypoints,
  type Mark,
  type NodeDatum,
  type NodeMark,
  type NodeOptions,
  nodes,
  type RawAccessor,
  raw,
  type SourceSubscription,
  type StatusListen,
} from './index'

type Person = {
  id: string
  name: string
  team: string
  score: number
  joined: Date
  alias?: string
}
type Link = { id: string; from: string; to: string; weight: number }
type Row = { name: string; parent: string | null }

const people: Person[] = []
const links: Link[] = []
const rows: Row[] = []

describe('public types', () => {
  it('infers the datum type from the data', () => {
    expectTypeOf(nodes(people, { color: 'team', size: 'score' })).toEqualTypeOf<
      NodeMark<Person, undefined>
    >()
    expectTypeOf(edges(links, { source: 'from', target: 'to' })).toEqualTypeOf<
      EdgeMark<Link, undefined>
    >()
  })

  it('passes the datum type to accessors', () => {
    nodes(people, {
      label: (person) => {
        expectTypeOf(person).toEqualTypeOf<Person>()
        return person.name
      },
    })
  })

  it('offers only the fields whose values fit the channel', () => {
    expectTypeOf<FieldOf<Person, number>>().toEqualTypeOf<'score'>()
    expectTypeOf<FieldOf<Person, string>>().toEqualTypeOf<'id' | 'name' | 'team' | 'alias'>()
    expectTypeOf<KeyFieldOf<Person>>().toEqualTypeOf<'id' | 'name' | 'team' | 'score'>()
    expectTypeOf<KeyFieldOf<Row>>().toEqualTypeOf<'name'>()
    expectTypeOf<Exclude<NodeOptions<Person>['size'], undefined>>().toEqualTypeOf<
      | 'score'
      | number
      | Accessor<Person, number | null | undefined>
      | RawAccessor<Person, number | null | undefined>
    >()
  })

  it('takes number literals and raw functions in size, width and colors', () => {
    nodes(people, { size: 30, color: raw((person) => (person.alias ? 'red' : null)) })
    nodes(people, {
      size: raw((person) => {
        expectTypeOf(person).toEqualTypeOf<Person>()
        return person.score * 2
      }),
    })
    edges(links, {
      source: 'from',
      target: 'to',
      width: 2,
      color: raw((link) => (link.weight > 1 ? '#c00' : undefined)),
      ends: { source: { width: 3 }, target: { width: raw((link) => link.weight) } },
    })
    groups(people, { by: 'team', size: raw((group) => group.count * 4) })
    expectTypeOf(raw((person: Person) => person.score)).toEqualTypeOf<RawAccessor<Person, number>>()
    // @ts-expect-error
    nodes(people, { color: 3 })
    // @ts-expect-error
    nodes(people, { size: raw((person) => person.name) })
    // @ts-expect-error
    edges(links, { source: 'from', target: 'to', width: '2' })
  })

  it('takes waypoints from a field or a function, as points, places or pairs', () => {
    type Road = Link & { via: { longitude: number; latitude: number }[]; bends: [number, number][] }
    const roads: Road[] = []
    edges(roads, { source: 'from', target: 'to', waypoints: 'via' })
    edges(roads, { source: 'from', target: 'to', waypoints: 'bends' })
    edges(roads, {
      source: 'from',
      target: 'to',
      waypoints: (road) => (road.weight > 1 ? [{ x: 0, y: 0 }, [1, 2]] : null),
    })
    edges(roads, {
      source: 'from',
      target: 'to',
      waypoints: (road) => lineWaypoints({ type: 'LineString', coordinates: road.bends }),
    })
    // @ts-expect-error
    edges(roads, { source: 'from', target: 'to', waypoints: 'weight' })
    // @ts-expect-error
    edges(roads, { source: 'from', target: 'to', waypoints: [{ x: 0, y: 0 }] })
    // @ts-expect-error
    edges(roads, { source: 'from', target: 'to', waypoints: () => [{ lon: 0, lat: 0 }] })
  })

  it('takes a box with a width that fits the label or a number, and a corner radius', () => {
    nodes(people, { shape: 'box', label: 'name' })
    nodes(people, { shape: 'box', width: 'label', cornerRadius: 4 })
    nodes(people, {
      shape: (person) => (person.score > 1 ? 'box' : 'circle'),
      width: (person) => (person.alias ? person.score * 10 : 'label'),
      cornerRadius: (person) => person.score,
    })
    groups(people, { by: 'team', shape: 'box', width: 120 })
    expectTypeOf<Exclude<NodeOptions<Person>['width'], undefined>>().toEqualTypeOf<
      number | 'label' | Accessor<Person, number | 'label'>
    >()
    // @ts-expect-error
    nodes(people, { shape: 'box', width: 'score' })
    // @ts-expect-error
    nodes(people, { shape: 'box', cornerRadius: 'round' })
    // @ts-expect-error
    nodes(people, { shape: 'rectangle' })
  })

  it('takes scales of its own on a mark', () => {
    nodes(people, {
      color: 'team',
      size: 'score',
      scales: { color: { domain: ['a', 'b'] }, size: { range: [4, 12] } },
    })
    edges(links, {
      source: 'from',
      target: 'to',
      width: 'weight',
      scales: { width: (value) => value / 2, color: { type: 'sequential' } },
    })
    // @ts-expect-error
    nodes(people, { scales: { width: { range: [1, 2] } } })
    // @ts-expect-error
    edges(links, { source: 'from', target: 'to', scales: { size: { range: [1, 2] } } })
    // @ts-expect-error
    edges(links, { source: 'from', target: 'to', aggregate: { scales: {} } })
  })

  it('accepts an image as a source or with a scale and a color, and badges per corner', () => {
    nodes(people, {
      image: (person) => (person.alias ? { src: person.alias, scale: 0.6, color: 'white' } : null),
      badges: {
        topRight: (person) => ({ text: person.score }),
        bottomLeft: (person) => (person.alias ? { fill: 'red' } : null),
      },
    })
    nodes(people, { image: 'avatar.png' })
    nodes(people, {
      outline: (person) => (person.alias ? 'red' : 'blue'),
      outlineWidth: 3,
      label: { text: 'name', background: (person) => (person.alias ? true : null) },
    })
    // @ts-expect-error
    nodes(people, { outlineWidth: 'name' })
    // @ts-expect-error
    nodes(people, { label: { text: 'name', background: 3 } })
    // @ts-expect-error
    nodes(people, { image: { scale: 0.6 } })
    // @ts-expect-error
    nodes(people, { badges: { middle: () => ({ text: 'x' }) } })
    edges(links, { source: 'from', target: 'to', label: 'id' })
    edges(links, {
      source: 'from',
      target: 'to',
      label: { text: (link) => String(link.weight), background: (link) => link.weight > 1 },
    })
    nodes(people, {
      label: {
        text: 'name',
        color: 'var(--graph-accent)',
        size: (person) => person.score,
        weight: 'bold',
        font: 'serif',
        placement: 'right',
        maxWidth: 120,
        minScreenSize: 12,
      },
    })
    edges(links, { source: 'from', target: 'to', label: { text: 'id', weight: 600, size: 10 } })
    // @ts-expect-error
    nodes(people, { label: { text: 'name', placement: 'middle' } })
    // @ts-expect-error
    nodes(people, { label: { text: 'name', weight: 'heavy' } })
    // @ts-expect-error
    edges(links, { source: 'from', target: 'to', label: { text: 'id', placement: 'top' } })
    // @ts-expect-error
    edges(links, { source: 'from', target: 'to', label: 'weight' })
    // @ts-expect-error
    edges(links, { source: 'from', target: 'to', label: { text: 'id', background: 2 } })
  })

  it('rejects fields of the wrong type', () => {
    // @ts-expect-error
    nodes(people, { size: 'name' })
    // @ts-expect-error
    nodes(people, { color: 'joined' })
    // @ts-expect-error
    edges(rows, { key: 'name', source: 'parent', target: 'name' })
  })

  it('requires a key when the data has no id field', () => {
    // @ts-expect-error
    nodes(rows)
    expectTypeOf(nodes(rows, { key: 'name' })).toEqualTypeOf<NodeMark<Row, undefined>>()
    expectTypeOf(
      edges(rows, { key: 'name', source: (row) => row.parent ?? row.name, target: 'name' }),
    ).toEqualTypeOf<EdgeMark<Row, undefined>>()
  })

  it('accepts a TanStack DB collection as a live source', () => {
    const collection = createCollection(
      localOnlyCollectionOptions({ id: 'types', getKey: (person: Person) => person.id }),
    )
    const mark = nodes(collection, {
      color: 'team',
      label: (person) => {
        expectTypeOf(person).toExtend<Person>()
        return person.name
      },
    })
    const named = nodes(collection, { name: 'people', layer: 'top' })
    expectTypeOf(named.name).toEqualTypeOf<'people'>()
    expectTypeOf(named.layer).toEqualTypeOf<'top'>()
    // @ts-expect-error
    nodes(collection, { key: 'name' })
    // @ts-expect-error
    edges(collection, { key: 'name', source: 'id', target: 'team' })
    const definition = defineGraph({ marks: [mark] })
    expectTypeOf(definition.marks).toEqualTypeOf<readonly (typeof mark)[]>()
    expectTypeOf(definition.marks).toExtend<readonly Mark[]>()
    expectTypeOf<NodeDatum<(typeof definition.marks)[number]>>().toExtend<Person>()
  })

  it('accepts sources that tell how far they have loaded', () => {
    const collection = createCollection(
      localOnlyCollectionOptions({ id: 'types-status', getKey: (person: Person) => person.id }),
    )
    const subscription = collection.subscribeChanges(() => {})
    expectTypeOf(collection).toExtend<LiveSource<Person>>()
    expectTypeOf(subscription).toExtend<SourceSubscription>()
    expectTypeOf({ subscribeChanges: () => ({ unsubscribe() {} }) }).toExtend<LiveSource<Person>>()
    const listen: StatusListen = () => () => {}
    expectTypeOf({
      subscribeChanges: () => ({ unsubscribe() {}, status: 'ready', on: listen }),
      status: 'loading',
      on: listen,
    }).toExtend<LiveSource<Person>>()
    // @ts-expect-error
    nodes({ subscribeChanges: () => ({ unsubscribe() {} }), status: 1 })
    // @ts-expect-error
    nodes({ subscribeChanges: () => ({ unsubscribe() {} }), on: (event: 'other') => event })
    expectTypeOf<GraphState['data']>().toEqualTypeOf<GraphDataStatus>()
    expectTypeOf<GraphDataStatus['failed']>().toEqualTypeOf<readonly LiveSource<unknown>[]>()
    expectTypeOf<GraphInstance['loaded']>().toEqualTypeOf<() => Promise<void>>()
  })

  it('types state names from the definition', () => {
    const definition = defineGraph({
      marks: [],
      states: { muted: { opacity: 0.2 }, selected: { stroke: 'red' } },
    })
    expectTypeOf(definition).toEqualTypeOf<GraphDefinition<'muted' | 'selected', never>>()
    type Instance = GraphInstance<'muted' | 'selected'>
    expectTypeOf<Parameters<Instance['states']['set']>[0]>().toEqualTypeOf<'muted'>()
    expectTypeOf<GraphState<'muted' | 'selected'>['states']>().toEqualTypeOf<{
      readonly muted: ElementKeys
    }>()
    expectTypeOf<Parameters<GraphInstance<never>['states']['set']>[0]>().toBeNever()
    expectTypeOf(defineGraph({ marks: [] })).toEqualTypeOf<GraphDefinition<never, never>>()
    expectTypeOf(definition).toExtend<GraphDefinition>()
    expectTypeOf<Instance>().toExtend<GraphInstance>()
  })

  it('takes one style for both kinds or one per kind, with the look of the others', () => {
    const definition = defineGraph({
      marks: [],
      states: {
        path: {
          nodes: { fill: 'red', label: 'always', others: { opacity: 0.2 } },
          edges: { stroke: 'red', others: { opacity: 0.2, hide: true } },
        },
        near: { raise: true, others: { opacity: 0.2, label: false } },
        hovered: { others: { opacity: 0.3 } },
        selected: { edges: { stroke: 'red' } },
      },
    })
    expectTypeOf(definition).toEqualTypeOf<
      GraphDefinition<'path' | 'near' | 'hovered' | 'selected', never>
    >()
    expectTypeOf<
      ReturnType<GraphInstance<'path' | 'near'>['states']['get']>
    >().toEqualTypeOf<ElementKeys>()
    defineGraph({
      marks: [],
      // @ts-expect-error
      states: { mixed: { opacity: 0.2, nodes: { fill: 'red' } } },
    })
    defineGraph({
      marks: [],
      // @ts-expect-error
      states: { nested: { others: { others: { opacity: 0.2 } } } },
    })
    defineGraph({
      marks: [],
      // @ts-expect-error
      states: { lifted: { others: { raise: true } } },
    })
    defineGraph({
      marks: [],
      // @ts-expect-error
      states: { label: { label: 'sometimes' } },
    })
  })

  it('types hull and anchor states from the definition', () => {
    const definition = defineGraph({
      marks: [],
      states: { muted: { opacity: 0.2 } },
      hulls: [hull({ state: 'muted' }), hull({ state: 'selected' }), hull({ nodes: ['a'] })],
    })
    expectTypeOf(definition).toEqualTypeOf<GraphDefinition<'muted', never>>()
    defineGraph({
      marks: [],
      states: { muted: { opacity: 0.2 } },
      // @ts-expect-error
      hulls: [hull({ state: 'other' })],
    })
    const mark = nodes(people)
    hull({ nodes: mark, by: 'team', color: (team) => `var(--${String(team)})` })
    hull({ nodes: mark, shape: 'smooth', padding: 8 })
    // @ts-expect-error
    hull({ nodes: mark, by: 'joined' })
    // @ts-expect-error
    hull({ nodes: ['a'], shape: 'square' })
    type Options = Parameters<GraphInstance<'muted'>['anchors']['set']>[1]
    expectTypeOf<NonNullable<Options['when']>>().toEqualTypeOf<'muted' | BuiltInState>()
  })

  it('types the parent channel and the aggregate options', () => {
    nodes(rows, { key: 'name', parent: 'parent', container: { shape: 'circle', padding: 8 } })
    // @ts-expect-error
    nodes(rows, { key: 'name', parent: 'missing' })
    // @ts-expect-error
    nodes(rows, { key: 'name', container: { shape: 'hexagon' } })
    nodes(rows, { key: 'name', container: { spread: (row) => row.name !== 'a', gap: 6 } })
    groups(rows, { by: 'parent', container: { spread: false, gap: (group) => group.count } })
    // @ts-expect-error
    nodes(rows, { key: 'name', container: { spread: 'yes' } })
    // @ts-expect-error
    nodes(rows, { key: 'name', container: { gap: '4px' } })
    edges(links, {
      source: 'from',
      target: 'to',
      aggregate: {
        width: (aggregate) => {
          expectTypeOf(aggregate).toEqualTypeOf<AggregateEdge<Link>>()
          expectTypeOf(aggregate.data).toEqualTypeOf<readonly Link[]>()
          return aggregate.count
        },
        label: (aggregate) => `${aggregate.count}`,
      },
    })
    edges(links, {
      source: 'from',
      target: 'to',
      // @ts-expect-error
      aggregate: { source: 'from' },
    })
  })

  it('types the time channel and the time window', () => {
    nodes<Person>(people, { time: 'joined' })
    nodes<Person>(people, { time: 'score' })
    nodes<Person>(people, { time: (person) => ({ start: person.joined, end: null }) })
    edges<Link>(links, { source: 'from', target: 'to', time: (link) => link.weight })
    // @ts-expect-error
    nodes<Person>(people, { time: 'name' })
    // @ts-expect-error
    nodes<Person>(people, { time: (person) => person.name })
    expectTypeOf<GraphInstance['time']['get']>().returns.toEqualTypeOf<{
      readonly start: number | null
      readonly end: number | null
    } | null>()
    defineGraph({ marks: [nodes<Person>(people)], time: { fade: 86_400_000 } })
  })
})
