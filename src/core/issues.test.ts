import { describe, expect, it } from 'vitest'
import { describeIssues, type GraphIssue, IssueSet } from './issues'

const duplicate = (key: string | number): GraphIssue => ({
  type: 'duplicate-key',
  kind: 'nodes',
  key,
})

describe('IssueSet', () => {
  it('keeps one issue per problem and the first object found', () => {
    const set = new IssueSet()
    const first = duplicate('a')
    expect(set.refresh([first, duplicate('a'), duplicate(1), duplicate('1')])).toEqual([
      first,
      duplicate(1),
      duplicate('1'),
    ])
    const list = set.list
    expect(list).toHaveLength(3)
    expect(set.refresh([duplicate('1'), duplicate(1), duplicate('a')])).toBeNull()
    expect(set.list).toBe(list)
    expect(set.refresh([duplicate('a')])).toEqual([])
    expect(set.list).toEqual([first])
    expect(set.list[0]).toBe(first)
  })

  it('tells items without a key apart by identity', () => {
    const set = new IssueSet()
    const datum = { name: 'x' }
    const missing = (value: unknown): GraphIssue => ({
      type: 'missing-key',
      kind: 'edges',
      datum: value,
    })
    expect(set.refresh([missing(datum), missing({ name: 'x' }), missing(datum)])).toHaveLength(2)
    expect(set.refresh([missing(datum), missing(null), missing('null')])).toHaveLength(2)
    expect(set.list).toHaveLength(3)
  })

  it('does not mix up keys that join into the same text', () => {
    const set = new IssueSet()
    const parent = (key: string, value: string): GraphIssue => ({
      type: 'missing-parent',
      kind: 'nodes',
      key,
      parent: value,
    })
    set.refresh([parent('a|s1:b', 'c'), parent('a', 'b|s1:c')])
    expect(set.list).toHaveLength(2)
  })

  it('summarizes issues by type', () => {
    expect(describeIssues([duplicate('a')])).toBe(
      'graph: 1 new data issue (1 duplicate-key); graph.issues() lists them',
    )
  })
})
