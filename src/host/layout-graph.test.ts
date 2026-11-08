import { describe, expect, it } from 'vitest'
import { boxShape, EdgeColumns, NodeColumns } from '../core/columns'
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

  it('places moving nodes at non-finite positions and leaves fixed ones out', () => {
    const nodes = new NodeColumns()
    nodes.reserve(3)
    nodes.alive.set([1, 1, 1, 1])
    nodes.size.set([10, 10, 10, 10])
    const edges = new EdgeColumns()
    edges.reserve(2)
    edges.alive.set([1, 1, 1])
    edges.source.set([0, 1, 2])
    edges.target.set([1, 2, 3])
    const positions = new Positions()
    positions.set(0, 0, 0)
    positions.set(1, Number.NaN, 4)
    positions.set(2, 20, 0)
    positions.set(3, 30, Number.POSITIVE_INFINITY)
    nodes.keys.push('a', 'b', 'c', 'd')
    const graph = layoutGraph(
      nodes,
      edges,
      positions,
      1,
      (index) => index !== 3,
      () => undefined,
    )
    expect(Array.from(graph.alive.subarray(0, 4))).toEqual([1, 1, 1, 0])
    expect(Array.from(graph.movable.subarray(0, 4))).toEqual([1, 1, 1, 0])
    expect(Array.from(graph.edges)).toEqual([0, 1, 1, 2])
    const x = graph.xy[2] ?? Number.NaN
    const y = graph.xy[3] ?? Number.NaN
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    expect(Math.hypot(x - 10, y)).toBeLessThan(20)
  })

  it('gives boxes the radius of their outer circle and half extents', () => {
    const nodes = new NodeColumns()
    nodes.reserve(3)
    nodes.alive.set([1, 1, 1])
    nodes.size.set([20, 20, 20])
    nodes.shape.set([boxShape, 0, boxShape])
    nodes.width.set([80, 0, 60])
    nodes.screenUnits.set([0, 0, 1])
    const edges = new EdgeColumns()
    const positions = new Positions()
    for (let index = 0; index < 3; index++) positions.set(index, index * 10, 0)
    nodes.keys.push('a', 'b', 'c')
    const graph = layoutGraph(
      nodes,
      edges,
      positions,
      2,
      () => true,
      () => undefined,
    )
    expect(graph.radius[0]).toBeCloseTo(Math.hypot(40, 10), 5)
    expect(graph.radius[1]).toBe(10)
    expect(graph.radius[2]).toBeCloseTo(Math.hypot(15, 5), 5)
    expect(Array.from(graph.extents?.subarray(0, 6) ?? [])).toEqual([40, 10, 10, 10, 15, 5])
    nodes.shape.fill(0)
    expect(
      layoutGraph(
        nodes,
        edges,
        positions,
        2,
        () => true,
        () => undefined,
      ).extents,
    ).toBeUndefined()
  })
})
