import { describe, expect, it } from 'vitest'
import { hull } from './hulls'
import { grid, layers, radial, rings } from './layouts'
import { edges, groups, nodes } from './marks'

interface Item {
  readonly id: string
  readonly group: string
}

const items: Item[] = [
  { id: 'a', group: 'x' },
  { id: 'b', group: 'y' },
]
const links = [{ id: 'ab', from: 'a', to: 'b' }]

describe('options set to undefined', () => {
  it('are left out of the options a mark keeps', () => {
    const nodeMark = nodes(items, { color: 'group', size: undefined, label: undefined })
    expect(Object.keys(nodeMark.options)).toEqual(['color'])
    expect(Object.isFrozen(nodeMark.options)).toBe(true)
    const edgeMark = edges(links, { source: 'from', target: 'to', width: undefined })
    expect(Object.keys(edgeMark.options)).toEqual(['source', 'target'])
  })

  it('keep the defaults of a group mark', () => {
    const given = groups(items, {
      by: 'group',
      label: undefined,
      parent: undefined,
      min: undefined,
    })
    const left = groups(items, { by: 'group' })
    expect(given.options).toStrictEqual(left.options)
    expect(typeof given.options.label).toBe('function')
    expect(Object.keys(given.options)).toEqual(['label', 'key'])
  })

  it('are left out of hulls and instant layouts', () => {
    expect(hull({ state: 'selected', padding: undefined, fill: undefined }).options).toEqual({
      state: 'selected',
    })
    const keyed = hull({ nodes: ['a'], padding: undefined })
    expect(keyed.state).toBeNull()
    expect(Object.keys(keyed.options)).toEqual(['nodes'])
    expect(grid({ columns: undefined, spacing: undefined }).options).toStrictEqual(grid().options)
    expect(rings({ center: undefined }).options).toStrictEqual(rings().options)
    expect(radial({ root: undefined }).options).toStrictEqual(radial().options)
    expect(layers({ direction: undefined, root: undefined }).options).toStrictEqual(
      layers().options,
    )
  })
})
