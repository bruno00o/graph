import {
  type Collection,
  createCollection,
  createLiveQueryCollection,
  eq,
  gte,
  type LoadSubsetOptions,
  localOnlyCollectionOptions,
} from '@tanstack/db'
import { describe, expect, it, vi } from 'vitest'
import { subset } from '../db/subset'
import { edges, nodes } from '../marks'
import type { LiveSource } from '../types'
import { createGraphModel } from './graph-model'

type Item = { id: string; score: number }
type Link = { id: string; from: string; to: string }

interface Batches<T extends object> {
  readonly collection: Collection<T, string>
  write(rows: readonly T[]): void
  ready(): void
  fail(error: unknown): void
}

function batches<T extends { id: string }>(id: string): Batches<T> {
  const controls: {
    write?: (rows: readonly T[]) => void
    ready?: () => void
    fail?: (error: unknown) => void
  } = {}
  const collection = createCollection<T, string>({
    id,
    getKey: (row) => row.id,
    gcTime: 0,
    sync: {
      sync: ({ begin, write, commit, markReady, fail }) => {
        controls.write = (rows) => {
          begin()
          for (const row of rows) write({ type: 'insert', value: row })
          commit()
        }
        controls.ready = markReady
        controls.fail = fail
      },
    },
  })
  return {
    collection,
    write: (rows) => controls.write?.(rows),
    ready: () => controls.ready?.(),
    fail: (error) => controls.fail?.(error),
  }
}

function onDemand<T extends { id: string; score: number }>(id: string, rows: readonly T[]) {
  const loads: Array<(error?: Error) => void> = []
  const collection = createCollection<T, string>({
    id,
    getKey: (row) => row.id,
    syncMode: 'on-demand',
    gcTime: 0,
    sync: {
      sync: ({ begin, write, commit, markReady }) => {
        markReady()
        return {
          loadSubset: (_options: LoadSubsetOptions) =>
            new Promise<void>((resolve, reject) => {
              loads.push((error) => {
                if (error) {
                  reject(error)
                  return
                }
                begin()
                for (const row of rows) write({ type: 'insert', value: row })
                commit()
                resolve()
              })
            }),
        }
      },
    },
  })
  return { collection, loads }
}

const items: Item[] = [
  { id: 'a', score: 1 },
  { id: 'b', score: 5 },
  { id: 'c', score: 9 },
]

describe('readiness of TanStack DB sources', () => {
  it('follows a collection that loads in several batches', async () => {
    const source = batches<Item>('ready-batches')
    const schedule = vi.fn()
    const model = createGraphModel({ schedule })
    model.setMarks([nodes(source.collection)])
    expect(source.collection.status).toBe('loading')
    expect(model.loadingSources).toBe(1)

    source.write([items[0] as Item])
    await vi.waitFor(() => expect(schedule).toHaveBeenCalled())
    expect(model.flush().nodes.added).toHaveLength(1)
    source.write([items[1] as Item, items[2] as Item])
    expect(model.loadingSources).toBe(1)

    schedule.mockClear()
    source.ready()
    expect(model.loadingSources).toBe(0)
    expect(schedule).toHaveBeenCalled()
    expect(model.flush().nodes.added).toHaveLength(2)
    model.destroy()
  })

  it('lists a collection whose first load fails', () => {
    const source = batches<Item>('ready-fails')
    const model = createGraphModel()
    model.setMarks([nodes(source.collection)])
    source.fail(new Error('offline'))
    expect(source.collection.status).toBe('error')
    expect(model.loadingSources).toBe(0)
    expect(model.failedSources()).toEqual([source.collection])
    model.destroy()
  })

  it('waits for a live query over collections that load', async () => {
    const people = batches<Item>('ready-query-people')
    const query = createLiveQueryCollection((q) =>
      q.from({ item: people.collection }).where(({ item }) => gte(item.score, 5)),
    )
    const model = createGraphModel()
    model.setMarks([nodes(query)])
    expect(model.loadingSources).toBe(1)
    people.write(items)
    people.ready()
    await vi.waitFor(() => expect(model.loadingSources).toBe(0))
    model.flush()
    expect([...model.nodes()].map((node) => node.key).sort()).toEqual(['b', 'c'])
    model.destroy()
  })

  it('waits for the rows of an on-demand collection asked for by subset', async () => {
    const remote = onDemand<Item>('ready-on-demand', items)
    const local = createCollection(
      localOnlyCollectionOptions({
        id: 'ready-links',
        getKey: (row: Link) => row.id,
        initialData: [{ id: 'bc', from: 'b', to: 'c' }],
      }),
    )
    const model = createGraphModel()
    model.setMarks([
      nodes(subset(remote.collection, (row) => gte(row.score, 5))),
      edges(
        subset(local, (row) => eq(row.from, 'b')),
        { source: 'from', target: 'to' },
      ),
    ])
    expect(remote.collection.status).toBe('ready')
    expect(model.loadingSources).toBe(1)
    expect(remote.loads).toHaveLength(1)
    remote.loads[0]?.()
    await vi.waitFor(() => expect(model.loadingSources).toBe(0))
    model.flush()
    expect(model.node('c')).toBeDefined()
    expect(model.edge('bc')).toBeDefined()
    model.destroy()
  })

  it('lists a subset whose rows fail to load, until they load again', async () => {
    const remote = onDemand<Item>('ready-on-demand-fails', items)
    const source = subset(remote.collection, (row) => gte(row.score, 5))
    const model = createGraphModel()
    model.setMarks([nodes(source)])
    expect(model.loadingSources).toBe(1)
    remote.loads[0]?.(new Error('offline'))
    await vi.waitFor(() => expect(model.failedSources()).toEqual([source]))
    expect(model.loadingSources).toBe(0)
    model.setMarks([nodes(subset(remote.collection, (row) => gte(row.score, 1)))])
    expect(model.failedSources()).toEqual([])
    expect(model.loadingSources).toBe(1)
    remote.loads[1]?.()
    await vi.waitFor(() => expect(model.loadingSources).toBe(0))
    model.destroy()
  })

  it('accepts collections, subsets and plain sources as live sources', () => {
    const local = createCollection(
      localOnlyCollectionOptions({ id: 'ready-types', getKey: (row: Item) => row.id }),
    )
    const query = createLiveQueryCollection((q) => q.from({ item: local }))
    const sources: LiveSource<Item>[] = [
      local,
      query,
      subset(local, (row) => gte(row.score, 1)),
      { subscribeChanges: () => ({ unsubscribe() {} }) },
    ]
    expect(sources).toHaveLength(4)
  })
})
