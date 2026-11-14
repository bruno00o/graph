import { describe, expect, it } from 'vitest'
import { NodeOrder } from './node-order'

function alive(count: number, dead: readonly number[] = []): Uint8Array {
  const flags = new Uint8Array(count).fill(1)
  for (const index of dead) flags[index] = 0
  return flags
}

function listed(order: NodeOrder): number[] {
  return [...order.list.subarray(0, order.length)]
}

describe('NodeOrder', () => {
  it('does nothing until a mark asks for an order', () => {
    const order = new NodeOrder()
    order.set(0, 5)
    expect(order.settle(alive(3), 3)).toBe(false)
    expect(order.rankOf(2)).toBe(2)
    expect(order.version).toBe(0)
  })

  it('sorts by value, then by index, negative values and fractions included', () => {
    const order = new NodeOrder()
    order.use()
    const values = [3, -1, 0.5, 3, -0, Number.NEGATIVE_INFINITY, -2.25, 1e300]
    for (const [index, value] of values.entries()) order.set(index, value)
    expect(order.settle(alive(values.length), values.length)).toBe(true)
    expect(listed(order)).toEqual([6, 1, 4, 5, 2, 0, 3, 7])
    expect(order.rankOf(6)).toBe(0)
    expect(order.rankOf(7)).toBe(7)
  })

  it('reads a missing or non-finite value as 0', () => {
    const order = new NodeOrder()
    order.use()
    order.set(0, Number.NaN)
    order.set(1, 'high')
    order.set(2, -1)
    order.set(3, undefined)
    order.settle(alive(4), 4)
    expect(listed(order)).toEqual([2, 0, 1, 3])
  })

  it('leaves dead indices out of the list', () => {
    const order = new NodeOrder()
    order.use()
    for (let index = 0; index < 5; index++) order.set(index, -index)
    order.settle(alive(5, [1, 3]), 5)
    expect(listed(order)).toEqual([4, 2, 0])
  })

  it('merges a few changes into the sorted list', () => {
    const order = new NodeOrder()
    order.use()
    const count = 100
    for (let index = 0; index < count; index++) order.set(index, (index * 37) % count)
    order.settle(alive(count), count)
    const version = order.version
    order.set(10, -5)
    order.set(20, 1000)
    order.remove(30)
    expect(order.settle(alive(count, [30]), count)).toBe(true)
    expect(order.version).toBe(version + 1)
    const list = listed(order)
    expect(list).toHaveLength(count - 1)
    expect(list[0]).toBe(10)
    expect(list.at(-1)).toBe(20)
    expect(list).not.toContain(30)
    const expected = Array.from({ length: count }, (_, index) => index)
      .filter((index) => index !== 30)
      .sort((a, b) => order.valueOf(a) - order.valueOf(b) || a - b)
    expect(list).toEqual(expected)
    list.forEach((index, rank) => {
      expect(order.rankOf(index)).toBe(rank)
    })
  })

  it('skips the work when nothing changed', () => {
    const order = new NodeOrder()
    order.use()
    order.set(0, 1)
    order.set(1, 2)
    order.settle(alive(2), 2)
    const version = order.version
    order.set(0, 1)
    expect(order.settle(alive(2), 2)).toBe(false)
    expect(order.version).toBe(version)
  })

  it('adds new indices beyond the first capacity', () => {
    const order = new NodeOrder()
    order.use()
    order.set(0, 2)
    order.settle(alive(1), 1)
    for (let index = 1; index < 200; index++) order.set(index, 200 - index)
    order.settle(alive(200), 200)
    const list = listed(order)
    expect(list[0]).toBe(199)
    expect(list.at(-1)).toBe(1)
    expect(list).toHaveLength(200)
  })
})
