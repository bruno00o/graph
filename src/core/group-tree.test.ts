import { describe, expect, it } from 'vitest'
import type { LayoutGroups } from '../types'
import { groupTree } from './group-tree'

function groups(parent: number[], order: number[]): LayoutGroups {
  return {
    order: Uint32Array.from(order),
    parent: Int32Array.from(parent),
    padding: new Float32Array(parent.length).fill(8),
    circle: new Uint8Array(parent.length),
  }
}

describe('groupTree', () => {
  it('orders the groups level by level, with the children of each group side by side', () => {
    const alive = Uint8Array.from([0, 0, 0, 1, 1, 1, 1])
    const tree = groupTree(7, alive, groups([-1, 0, -1, 1, 0, 2, -1], [0, 1, 2]))
    expect(tree).not.toBeNull()
    if (!tree) return
    expect(tree.count).toBe(3)
    expect(tree.roots).toBe(2)
    expect([...tree.node]).toEqual([0, 2, 1])
    expect([...tree.parent]).toEqual([-1, -1, 0])
    expect([...tree.depth]).toEqual([0, 0, 1])
    expect(tree.first[0]).toBe(2)
    expect(tree.children[0]).toBe(1)
    expect([...tree.groupOf.slice(3)]).toEqual([2, 0, 1, -1])
  })

  it('leaves out groups caught in a cycle and indices that are nodes', () => {
    const alive = Uint8Array.from([0, 0, 1, 1])
    const tree = groupTree(4, alive, groups([1, 0, -1, 0], [0, 1, 2]))
    expect(tree).toBeNull()
  })

  it('has nothing to build without unfolded groups', () => {
    expect(groupTree(2, Uint8Array.from([1, 1]), undefined)).toBeNull()
    expect(groupTree(2, Uint8Array.from([1, 1]), groups([-1, -1], []))).toBeNull()
  })
})
