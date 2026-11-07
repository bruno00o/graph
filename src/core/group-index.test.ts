import { describe, expect, it } from 'vitest'
import type { Key, SourceChange } from '../types'
import { toAccessor } from './accessor'
import { GroupIndex, GroupSource, groupKey } from './group-index'

type Item = { id: string; zone: string | null; area?: string }

const spec = (min = 1) => ({
  name: 'zone',
  by: toAccessor<unknown, unknown>('zone'),
  key: toAccessor<unknown, unknown>('id'),
  parent: null,
  min,
})

describe('GroupIndex', () => {
  it('groups items by value under keys apart from data keys', () => {
    const index = new GroupIndex<Item>(spec())
    index.add({ id: 'a', zone: 'north' })
    index.add({ id: 'b', zone: 'north' })
    index.add({ id: 'c', zone: 'south' })
    index.add({ id: 'd', zone: null })
    expect(index.groupOf('a')).toBe(groupKey('zone', 'north', undefined))
    expect(index.groupOf('d')).toBeUndefined()
    expect(index.items().map((item) => [item.value, item.count, item.keys])).toEqual([
      ['north', 2, ['a', 'b']],
      ['south', 1, ['c']],
    ])
    expect(groupKey('zone', 1, undefined)).not.toBe(groupKey('zone', '1', undefined))
  })

  it('moves the members of a group that reaches or leaves the minimum', () => {
    const index = new GroupIndex<Item>(spec(2))
    index.add({ id: 'a', zone: 'north' })
    expect(index.groupOf('a')).toBeUndefined()
    expect(index.takeMoved()).toEqual([])
    index.add({ id: 'b', zone: 'north' })
    expect(index.takeMoved()).toEqual(['a', 'b'])
    index.add({ id: 'c', zone: 'north' })
    expect(index.takeMoved()).toEqual(['c'])
    index.set('c', { id: 'c', zone: 'south' })
    expect(index.takeMoved()).toEqual(['c'])
    index.delete('b')
    expect(index.takeMoved()).toEqual(['b', 'a'])
    expect(index.items()).toEqual([])
  })

  it('nests groups in the group of the data their items share', () => {
    const index = new GroupIndex<Item>({ ...spec(), parent: toAccessor('area') })
    index.add({ id: 'a', zone: 'north', area: 'x' })
    index.add({ id: 'b', zone: 'north', area: 'y' })
    const [first, second] = index.items()
    expect(first).toMatchObject({ value: 'north', parent: 'x', keys: ['a'] })
    expect(second).toMatchObject({ value: 'north', parent: 'y', keys: ['b'] })
  })
})

describe('GroupSource', () => {
  it('turns the changes of a live source into changes of groups', () => {
    let emit: (changes: SourceChange<Item>[]) => void = () => {}
    const live = {
      subscribeChanges(callback: (changes: SourceChange<Item>[]) => void) {
        emit = callback
        callback([{ type: 'insert', key: 'a', value: { id: 'a', zone: 'north' } }])
        return { unsubscribe: () => {} }
      },
    }
    const source = new GroupSource(live, spec())
    const seen: [string, Key, number][] = []
    source.subscribeChanges((changes) => {
      for (const change of changes) seen.push([change.type, change.value.value, change.value.count])
    })
    emit([
      { type: 'insert', key: 'b', value: { id: 'b', zone: 'north' } },
      { type: 'insert', key: 'c', value: { id: 'c', zone: 'south' } },
    ])
    emit([{ type: 'delete', key: 'c', value: { id: 'c', zone: 'south' } }])
    expect(seen).toEqual([
      ['insert', 'north', 1],
      ['update', 'north', 2],
      ['insert', 'south', 1],
      ['delete', 'south', 1],
    ])
    expect(source.index.takeMoved()).toEqual(['a', 'b', 'c'])
  })
})
