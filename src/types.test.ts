import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { describe, expectTypeOf, it } from 'vitest'
import {
  type Accessor,
  defineGraph,
  type EdgeMark,
  type ElementKeys,
  edges,
  type FieldOf,
  type GraphDefinition,
  type GraphInstance,
  type GraphState,
  type KeyFieldOf,
  type Mark,
  type NodeMark,
  type NodeOptions,
  nodes,
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
    expectTypeOf(nodes(people, { color: 'team', size: 'score' })).toEqualTypeOf<NodeMark<Person>>()
    expectTypeOf(edges(links, { source: 'from', target: 'to' })).toEqualTypeOf<EdgeMark<Link>>()
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
      'score' | Accessor<Person, number | null | undefined>
    >()
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
    expectTypeOf(nodes(rows, { key: 'name' })).toEqualTypeOf<NodeMark<Row>>()
    expectTypeOf(
      edges(rows, { key: 'name', source: (row) => row.parent ?? row.name, target: 'name' }),
    ).toEqualTypeOf<EdgeMark<Row>>()
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
    expectTypeOf(defineGraph({ marks: [mark] }).marks).toEqualTypeOf<readonly Mark[]>()
  })

  it('types state names from the definition', () => {
    const definition = defineGraph({
      marks: [],
      states: { muted: { opacity: 0.2 }, selected: { stroke: 'red' } },
    })
    expectTypeOf(definition).toEqualTypeOf<GraphDefinition<'muted' | 'selected'>>()
    type Instance = GraphInstance<'muted' | 'selected'>
    expectTypeOf<Parameters<Instance['states']['set']>[0]>().toEqualTypeOf<'muted'>()
    expectTypeOf<GraphState<'muted' | 'selected'>['states']>().toEqualTypeOf<{
      readonly muted: ElementKeys
    }>()
    expectTypeOf<Parameters<GraphInstance<never>['states']['set']>[0]>().toBeNever()
    expectTypeOf(defineGraph({ marks: [] })).toEqualTypeOf<GraphDefinition<never>>()
    expectTypeOf(definition).toExtend<GraphDefinition>()
    expectTypeOf<Instance>().toExtend<GraphInstance>()
  })
})
