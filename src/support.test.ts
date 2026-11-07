import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { describe, expect, it } from 'vitest'
import { edges, nodes } from './marks'
import { createSupportFinder } from './support'

const ends = { source: 'source', target: 'target' } as const

interface Place {
  readonly id: string
}

interface Link {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly over?: string | readonly string[]
}

const places: Place[] = ['a', 'b', 'c', 'd'].map((id) => ({ id }))

const lower: Link[] = [
  { id: 's1', source: 'a', target: 'b' },
  { id: 's2', source: 'b', target: 'c' },
  { id: 's3', source: 'c', target: 'd' },
]
const middle: Link[] = [
  { id: 'm1', source: 'a', target: 'c', over: ['s1', 's2'] },
  { id: 'm2', source: 'c', target: 'd', over: 's3' },
]
const upper: Link[] = [{ id: 'u1', source: 'a', target: 'd', over: ['m1', 'm2'] }]

function finder(links: readonly (readonly Link[])[]) {
  return createSupportFinder({
    marks: [
      nodes(places),
      ...links.map((data, at) =>
        edges(data, { ...ends, layer: `layer ${at}`, supportedBy: 'over' }),
      ),
    ],
  })
}

describe('createSupportFinder', () => {
  it('walks down to the carriers, by depth, with their ends', () => {
    const support = finder([lower, middle, upper])
    expect(support.carriers('u1')).toEqual({
      edges: ['m1', 'm2', 's1', 's2', 's3'],
      depths: [1, 1, 2, 2, 2],
      nodes: ['a', 'c', 'd', 'b'],
    })
    expect(support.carriers('u1', { maxDepth: 1 }).edges).toEqual(['m1', 'm2'])
    expect(support.carriers('u1', { maxDepth: 0 }).edges).toEqual([])
    expect(support.carriers('s1').edges).toEqual([])
    expect(support.carriers('missing').edges).toEqual([])
    expect(() => support.carriers('u1', { maxDepth: -1 })).toThrow(RangeError)
  })

  it('walks up to the carried edges', () => {
    const support = finder([lower, middle, upper])
    expect(support.carried('s2')).toEqual({
      edges: ['m1', 'u1'],
      depths: [1, 2],
      nodes: ['a', 'c', 'd'],
    })
    expect(support.carried('s3').edges).toEqual(['m2', 'u1'])
    expect(support.carried('u1').edges).toEqual([])
  })

  it('stops on cycles and skips carriers that name no edge', () => {
    const support = finder([
      [
        { id: 'x', source: 'a', target: 'b', over: ['y', 'gone'] },
        { id: 'y', source: 'b', target: 'c', over: 'x' },
      ],
    ])
    expect(support.carriers('x').edges).toEqual(['y'])
    expect(support.carried('x').edges).toEqual(['y'])
  })

  it('follows live sources and stops after destroy', () => {
    const collection = createCollection(
      localOnlyCollectionOptions<Link>({
        getKey: (each) => each.id,
        initialData: [...middle],
      }),
    )
    const support = createSupportFinder({
      marks: [
        nodes(places),
        edges(lower, ends),
        edges(collection, { ...ends, supportedBy: (link) => link.over ?? null }),
      ],
    })
    expect(support.carried('s3').edges).toEqual(['m2'])
    collection.update('m2', (draft) => {
      draft.over = ['s2']
    })
    expect(support.carried('s3').edges).toEqual([])
    expect(support.carried('s2').edges).toEqual(['m1', 'm2'])
    collection.delete('m1')
    expect(support.carried('s2').edges).toEqual(['m2'])
    support.destroy()
    expect(support.carried('s2').edges).toEqual([])
  })
})
