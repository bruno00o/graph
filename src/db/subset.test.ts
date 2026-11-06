import {
  createCollection,
  createLiveQueryCollection,
  gte,
  inArray,
  type LoadSubsetOptions,
  localOnlyCollectionOptions,
  or,
  parseWhereExpression,
} from '@tanstack/db'
import { describe, expect, it, vi } from 'vitest'
import { createGraphModel, type ElementRef } from '../core/graph-model'
import { edges, nodes } from '../marks'
import type { Key } from '../types'
import { subset } from './subset'

type Item = { id: string; score: number }
type Link = { id: string; from: string; to: string }
type Row = Record<string, unknown>

const keys = (refs: readonly ElementRef[]): Key[] => refs.map((ref) => ref.key).sort()

function matches(where: LoadSubsetOptions['where']): (row: Row) => boolean {
  if (!where) return () => true
  const field = (path: string[]) => path.at(-1) ?? ''
  return parseWhereExpression<(row: Row) => boolean>(where, {
    handlers: {
      gte: (path: string[], value: number) => (row: Row) => Number(row[field(path)]) >= value,
      in: (path: string[], values: unknown[]) => (row: Row) => values.includes(row[field(path)]),
      or:
        (...tests: Array<(row: Row) => boolean>) =>
        (row: Row) =>
          tests.some((test) => test(row)),
    },
  }) as (row: Row) => boolean
}

function remote<T extends { id: string }>(id: string, rows: readonly T[]) {
  const loads: LoadSubsetOptions[] = []
  const unloads: LoadSubsetOptions[] = []
  const collection = createCollection<T, string>({
    id,
    getKey: (row) => row.id,
    syncMode: 'on-demand',
    gcTime: 0,
    sync: {
      sync: ({ begin, write, commit, markReady, collection: target }) => {
        markReady()
        const owners = new Map<string, number>()
        const held = new Map<LoadSubsetOptions, string[]>()
        return {
          loadSubset: async (options) => {
            loads.push(options)
            const test = matches(options.where)
            const found = rows.filter((row) => test(row as Row))
            held.set(
              options,
              found.map((row) => row.id),
            )
            for (const row of found) owners.set(row.id, (owners.get(row.id) ?? 0) + 1)
            await Promise.resolve()
            begin()
            for (const row of found) if (!target.has(row.id)) write({ type: 'insert', value: row })
            commit()
          },
          unloadSubset: (options) => {
            unloads.push(options)
            const owned = held.get(options) ?? []
            held.delete(options)
            begin()
            for (const key of owned) {
              const count = (owners.get(key) ?? 1) - 1
              if (count > 0) {
                owners.set(key, count)
                continue
              }
              owners.delete(key)
              if (target.has(key)) write({ type: 'delete', key })
            }
            commit()
          },
        }
      },
    },
  })
  return { collection, loads, unloads }
}

const items: Item[] = [
  { id: 'a', score: 1 },
  { id: 'b', score: 5 },
  { id: 'c', score: 9 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]
const linkOptions = { source: 'from', target: 'to' } as const

describe('subset', () => {
  it('filters a collection and swaps filters by the difference only', async () => {
    const people = createCollection(
      localOnlyCollectionOptions({
        id: 'subset-local',
        getKey: (item: Item) => item.id,
        initialData: items,
      }),
    )
    const schedule = vi.fn()
    const model = createGraphModel({ schedule })
    model.setMarks([nodes(subset(people, (row) => gte(row.score, 5)))])
    await vi.waitFor(() => expect(schedule).toHaveBeenCalled())
    expect(keys(model.flush().nodes.added)).toEqual(['b', 'c'])
    const datum = model.node('c')?.datum

    model.setMarks([nodes(subset(people, (row) => gte(row.score, 1)))])
    const changes = model.flush()
    expect(keys(changes.nodes.added)).toEqual(['a'])
    expect(changes.nodes.updated).toEqual([])
    expect(model.node('c')?.datum).toBe(datum)

    people.update('c', (draft) => {
      draft.score = 0
    })
    await vi.waitFor(() => expect(model.flush().nodes.removed).toHaveLength(1))
    expect(model.node('c')).toBeUndefined()
    model.destroy()
  })

  it('loads what the graph asks for from an on-demand collection', async () => {
    const people = remote('subset-people', items)
    const relations = remote('subset-relations', links)
    const model = createGraphModel()
    const define = (score: number, around: string[]) => [
      nodes(subset(people.collection, (row) => gte(row.score, score))),
      edges(
        subset(relations.collection, (row) =>
          or(inArray(row.from, around), inArray(row.to, around)),
        ),
        linkOptions,
      ),
    ]

    model.setMarks(define(5, ['b']))
    expect(people.loads).toHaveLength(1)
    expect(relations.loads).toHaveLength(1)
    expect(matches(people.loads[0]?.where)({ score: 4 })).toBe(false)
    expect(model.flush().nodes.added).toEqual([])

    await vi.waitFor(() => expect(people.collection.size).toBe(2))
    await vi.waitFor(() => expect(relations.collection.size).toBe(2))
    const loaded = model.flush()
    expect(keys(loaded.nodes.added)).toEqual(['b', 'c'])
    expect(keys(loaded.edges.added)).toEqual(['bc'])
    expect(loaded.edges.pending).toEqual(['ab'])

    model.setMarks(define(1, ['b']))
    expect(people.unloads).toHaveLength(1)
    await vi.waitFor(() => expect(people.collection.size).toBe(3))
    const widened = model.flush()
    expect(keys(widened.nodes.added)).toEqual(['a'])
    expect(keys(widened.edges.added)).toEqual(['ab'])
    expect(widened.nodes.removed).toEqual([])

    model.setMarks(define(9, []))
    await vi.waitFor(() => expect(people.collection.size).toBe(1))
    await vi.waitFor(() => expect(relations.collection.size).toBe(0))
    const narrowed = model.flush()
    expect(keys(narrowed.nodes.removed)).toEqual(['a', 'b'])
    expect(keys(narrowed.edges.removed)).toEqual(['ab', 'bc'])
    expect(model.pendingEdges()).toEqual([])
    model.destroy()
  })

  it('releases what it loaded when the graph lets go', async () => {
    const people = remote('subset-release', items)
    const model = createGraphModel()
    model.setMarks([nodes(subset(people.collection, (row) => gte(row.score, 5)))])
    await vi.waitFor(() => expect(people.collection.size).toBe(2))
    model.destroy()
    expect(people.unloads).toHaveLength(1)
    await vi.waitFor(() => expect(people.collection.size).toBe(0))
  })

  it('types marks and filters by the rows of the collection', () => {
    const people = createCollection(
      localOnlyCollectionOptions({
        id: 'subset-types',
        getKey: (item: Item) => item.id,
        initialData: items,
      }),
    )
    const strong = subset(people, (row) => gte(row.score, 5))
    expect(nodes(strong, { size: 'score' }).data).toBe(strong)
    // @ts-expect-error
    nodes(strong, { size: 'missing' })
    // @ts-expect-error
    subset(people, (row) => gte(row.missing, 5))
  })

  it('passes the where of a live query down to an on-demand collection', async () => {
    const people = remote('subset-live-query', items)
    const strong = createLiveQueryCollection((q) =>
      q.from({ person: people.collection }).where(({ person }) => gte(person.score, 5)),
    )
    const schedule = vi.fn()
    const model = createGraphModel({ schedule })
    model.setMarks([nodes(strong)])
    await vi.waitFor(() => expect(people.loads).toHaveLength(1))
    expect(matches(people.loads[0]?.where)({ score: 9 })).toBe(true)
    expect(matches(people.loads[0]?.where)({ score: 1 })).toBe(false)
    await vi.waitFor(() => expect(strong.size).toBe(2))
    await vi.waitFor(() => expect(schedule).toHaveBeenCalled())
    expect(keys(model.flush().nodes.added)).toEqual(['b', 'c'])
    model.destroy()
  })
})
