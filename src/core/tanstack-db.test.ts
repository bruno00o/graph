import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { describe, expect, it, vi } from 'vitest'
import { edges, nodes } from '../marks'
import { createGraphModel } from './graph-model'

type Person = { id: string; name: string }
type Link = { id: string; from: string; to: string }

describe('TanStack DB collections', () => {
  it('feed the graph through their change stream', async () => {
    const people = createCollection(
      localOnlyCollectionOptions({
        id: 'people',
        getKey: (person: Person) => person.id,
        initialData: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      }),
    )
    const links = createCollection(
      localOnlyCollectionOptions({
        id: 'links',
        getKey: (link: Link) => link.id,
        initialData: [{ id: 'ac', from: 'a', to: 'c' }],
      }),
    )
    const schedule = vi.fn()
    const model = createGraphModel({ schedule })
    model.setMarks([
      nodes(people, { label: 'name' }),
      edges(links, { source: 'from', target: 'to' }),
    ])

    await vi.waitFor(() => expect(schedule).toHaveBeenCalled())
    const initial = model.flush()
    expect(initial.nodes.added.map((ref) => ref.key)).toEqual(['a', 'b'])
    expect(initial.edges.pending).toEqual(['ac'])

    people.insert({ id: 'c', name: 'C' })
    people.update('a', (draft) => {
      draft.name = 'A2'
    })
    people.delete('b')
    await vi.waitFor(() => expect(schedule.mock.calls.length).toBeGreaterThan(1))
    const changes = model.flush()
    expect(changes.nodes.added.map((ref) => ref.key)).toEqual(['c'])
    expect(changes.nodes.updated.map((ref) => ref.key)).toEqual(['a'])
    expect(changes.nodes.removed.map((ref) => ref.key)).toEqual(['b'])
    expect(changes.edges.added.map((ref) => ref.key)).toEqual(['ac'])
    expect(model.node('a')?.datum).toMatchObject({ name: 'A2' })

    model.destroy()
  })
})
