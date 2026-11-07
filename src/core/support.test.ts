import { describe, expect, it } from 'vitest'
import { edges, nodes } from '../marks'
import type { Mark } from '../types'
import { createGraphModel } from './graph-model'
import type { GraphIssue } from './source-table'
import { SupportIndex } from './support'

const ends = { source: 'source', target: 'target' } as const

interface Link {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly over?: readonly string[]
}

const places = ['a', 'b', 'c'].map((id) => ({ id }))

function setup(marks: readonly Mark[]) {
  const model = createGraphModel()
  const support = new SupportIndex(model)
  model.setMarks(marks)
  support.setMarks(marks)
  const flush = () => {
    const issues: GraphIssue[] = []
    const changed = support.apply(model.flush(), issues)
    return { changed, issues }
  }
  return { model, support, flush }
}

describe('SupportIndex', () => {
  it('stays inactive without supportedBy', () => {
    const marks = [nodes(places), edges<Link>([{ id: 'e', source: 'a', target: 'b' }], ends)]
    const { support, flush } = setup(marks)
    expect(support.active).toBe(false)
    expect(flush()).toEqual({ changed: false, issues: [] })
  })

  it('reports carriers that name no edge, then forgets them once they arrive', () => {
    const upper: Link[] = [{ id: 'u', source: 'a', target: 'c', over: ['s1', 's2'] }]
    const first: Link[] = [{ id: 's1', source: 'a', target: 'b' }]
    const second: Link[] = [...first, { id: 's2', source: 'b', target: 'c' }]
    const upperMark = edges(upper, { ...ends, supportedBy: 'over' })
    const { model, support, flush } = setup([nodes(places), edges(first, ends), upperMark])
    expect(flush()).toEqual({
      changed: true,
      issues: [{ type: 'missing-carrier', kind: 'edges', key: 'u', carrier: 's2' }],
    })
    expect(support.carriers('u').edges).toEqual(['s1'])
    const marks = [nodes(places), edges(second, ends), upperMark]
    model.setMarks(marks)
    support.setMarks(marks)
    expect(flush()).toEqual({ changed: false, issues: [] })
    expect(support.carriers('u').edges).toEqual(['s1', 's2'])
    const shorter = [nodes(places), edges(first, ends), upperMark]
    model.setMarks(shorter)
    support.setMarks(shorter)
    expect(flush()).toEqual({
      changed: true,
      issues: [{ type: 'missing-carrier', kind: 'edges', key: 'u', carrier: 's2' }],
    })
    expect(support.carried('s1').edges).toEqual(['u'])
  })

  it('relinks an edge whose carriers change and unlinks a removed one', () => {
    const lower: Link[] = [
      { id: 's1', source: 'a', target: 'b' },
      { id: 's2', source: 'b', target: 'c' },
    ]
    const lowerMark = edges(lower, ends)
    const { model, support, flush } = setup([
      nodes(places),
      lowerMark,
      edges<Link>([{ id: 'u', source: 'a', target: 'c', over: ['s1'] }], {
        ...ends,
        supportedBy: 'over',
      }),
    ])
    flush()
    expect(support.version).toBe(1)
    model.setMarks([
      nodes(places),
      lowerMark,
      edges<Link>([{ id: 'u', source: 'a', target: 'c', over: ['s2'] }], {
        ...ends,
        supportedBy: 'over',
      }),
    ])
    expect(flush().changed).toBe(true)
    expect(support.carried('s1').edges).toEqual([])
    expect(support.carried('s2').edges).toEqual(['u'])
    model.setMarks([nodes(places), lowerMark])
    expect(flush().changed).toBe(true)
    expect(support.carried('s2').edges).toEqual([])
    expect(support.carriers('u').edges).toEqual([])
    expect(support.version).toBe(3)
  })
})
