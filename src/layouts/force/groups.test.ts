import { describe, expect, it } from 'vitest'
import { groupedGraph, smallestGap, spread } from '../../testing/groups'
import { settle } from './runner'
import { ForceSimulation, resolveForce } from './simulation'

function run(cohesion?: number): { xy: Float32Array; members: readonly (readonly number[])[] } {
  const { graph, members } = groupedGraph()
  const settings = resolveForce(cohesion === undefined ? {} : { cohesion })
  const simulation = new ForceSimulation(graph, settings)
  while (!simulation.done) simulation.step()
  const xy = new Float32Array(graph.capacity * 2)
  for (let index = 0; index < graph.capacity; index++) {
    xy[index * 2] = simulation.x[index] ?? 0
    xy[index * 2 + 1] = simulation.y[index] ?? 0
  }
  settle(graph, simulation.tree, simulation.fixed, xy, settings)
  return { xy, members }
}

describe('force with groups', () => {
  it('keeps containers apart from each other and from the nodes next to them', () => {
    const { graph } = groupedGraph()
    const { xy } = run()
    expect(smallestGap(graph, xy)).toBeGreaterThan(8)
  })

  it('keeps the members of a group closer together with cohesion', () => {
    const loose = run(0)
    const tight = run()
    for (const group of [1, 2, 3, 4]) {
      const members = tight.members[group] ?? []
      expect(spread(tight.xy, members)).toBeLessThan(spread(loose.xy, members))
    }
  })

  it('moves no fixed node', () => {
    const { graph } = groupedGraph()
    const fixed = graph.capacity - 1
    graph.movable[fixed] = 0
    const simulation = new ForceSimulation(graph, resolveForce())
    while (!simulation.done) simulation.step()
    expect(simulation.x[fixed]).toBeCloseTo(graph.xy[fixed * 2] ?? 0, 4)
    expect(simulation.y[fixed]).toBeCloseTo(graph.xy[fixed * 2 + 1] ?? 0, 4)
  })
})
