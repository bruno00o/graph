import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { describe, expectTypeOf, it } from 'vitest'
import {
  defineGraph,
  edges,
  type GraphInstance,
  groups,
  type HistoryEntry,
  type HistorySource,
  type HistoryValues,
  type NodeMark,
  nodes,
} from '../index'
import { historyFrom } from '.'

type Item = { id: string; name: string; status: string; weight: number }
type Link = { id: string; from: string; to: string }
type Change = { id: string; node: string; time: number; status?: string; flagged?: boolean }

const items: Item[] = []
const links: Link[] = []
const changes: Change[] = []

describe('history types', () => {
  it('reads the values of entries through a function', () => {
    const history = historyFrom(changes, {
      key: 'node',
      values: (change) => ({ status: change.status }),
    })
    expectTypeOf(history).toEqualTypeOf<HistorySource<{ status: string | undefined }>>()
    const mark = nodes(items, { label: 'name', history })
    expectTypeOf(mark).toEqualTypeOf<NodeMark<Item, undefined, undefined>>()
  })

  it('reads entries already shaped as history entries', () => {
    const entries: HistoryEntry<HistoryValues<Item>>[] = []
    const history = historyFrom(entries)
    expectTypeOf(history).toEqualTypeOf<HistorySource<HistoryValues<Item>>>()
    nodes(items, { history })
    nodes(items, { history: historyFrom([{ key: 'a', time: 1, values: { weight: 2 } }]) })
  })

  it('reads the values of entries from one field', () => {
    type Patch = { id: string; node: string; at: Date; patch: Partial<Item> }
    const patches: Patch[] = []
    const history = historyFrom(patches, { key: 'node', time: 'at', values: 'patch' })
    expectTypeOf(history).toEqualTypeOf<HistorySource<Partial<Item>>>()
    nodes(items, { history })
  })

  it('refuses values that do not belong to the items', () => {
    const wrongType = historyFrom(changes, { key: 'node', values: () => ({ weight: 'heavy' }) })
    // @ts-expect-error
    nodes(items, { history: wrongType })
    const unknownField = historyFrom(changes, { key: 'node', values: () => ({ color: 'red' }) })
    // @ts-expect-error
    nodes(items, { history: unknownField })
    // @ts-expect-error
    historyFrom(changes, { key: 'node', time: 'status', values: () => ({}) })
  })

  it('lets the ends of an edge change', () => {
    const history = historyFrom(changes, { key: 'node', values: () => ({ to: 'b' }) })
    edges(links, { source: 'from', target: 'to', history })
  })

  it('takes a live source of entries', () => {
    const collection = createCollection(
      localOnlyCollectionOptions<Change>({ getKey: (change) => change.id }),
    )
    const history = historyFrom(collection, {
      key: 'node',
      values: (change) => ({ status: change.status }),
    })
    expectTypeOf(history).toEqualTypeOf<HistorySource<{ status: string | undefined }>>()
    nodes(items, { history })
  })

  it('keeps history out of groups', () => {
    const history = historyFrom(changes, { key: 'node', values: () => ({}) })
    // @ts-expect-error
    groups(items, { by: 'status', history })
  })

  it('types the entries a graph reads', () => {
    const definition = defineGraph({
      marks: [nodes(items), edges(links, { source: 'from', target: 'to' })],
    })
    type Instance = GraphInstance<never, (typeof definition.marks)[number]>
    const read = (graph: Instance) => ({
      node: graph.history.of({ kind: 'node', key: 'a' }),
      edge: graph.history.of({ kind: 'edge', key: 'a' }),
      instant: graph.history.instant(),
    })
    expectTypeOf(read).returns.toEqualTypeOf<{
      node: readonly HistoryEntry<HistoryValues<Item>>[]
      edge: readonly HistoryEntry<HistoryValues<Link>>[]
      instant: number
    }>()
  })
})
