import { describe, expect, it } from 'vitest'
import { EdgeColumns, NodeColumns } from '../core/columns'
import { Positions } from '../core/positions'
import { layoutGraph } from './layout-graph'

describe('layoutGraph', () => {
  it('copies living nodes, keeps data positions and filters loops and dead edges', () => {
    const nodes = new NodeColumns()
    nodes.reserve(3)
    nodes.alive.set([1, 1, 0, 1])
    nodes.size.set([16, 20, 30, 40])
    nodes.screenUnits.set([0, 0, 0, 1])
    const edges = new EdgeColumns()
    edges.reserve(2)
    edges.alive.set([1, 1, 0])
    edges.source.set([0, 1, 0])
    edges.target.set([1, 1, 3])
    const positions = new Positions()
    positions.set(0, 1, 2)
    positions.set(1, 3, 4)
    positions.set(3, 5, 6)
    positions.follow(1, [3, 4])
    nodes.keys.push('a', 'b', 'c', 'd')
    const graph = layoutGraph(
      nodes,
      edges,
      positions,
      2,
      (index) => index !== 3,
      (key) => ({ key }),
    )
    expect(graph.capacity).toBe(nodes.capacity)
    expect(Array.from(graph.alive.subarray(0, 4))).toEqual([1, 1, 0, 1])
    expect(Array.from(graph.movable.subarray(0, 4))).toEqual([1, 0, 0, 0])
    expect(Array.from(graph.xy.subarray(0, 8))).toEqual([1, 2, 3, 4, 0, 0, 5, 6])
    expect(Array.from(graph.radius.subarray(0, 4))).toEqual([8, 10, 0, 10])
    expect(Array.from(graph.edges)).toEqual([0, 1])
    expect(graph.keys.slice(0, 4)).toEqual(['a', 'b', 'c', 'd'])
    expect(graph.datum(1)).toEqual({ key: 'b' })
    expect(graph.datum(2)).toBeUndefined()
  })
})
