import { groupGap, separateGroups } from '../core/group-separation'
import { groupTree } from '../core/group-tree'
import type { LayoutGraph } from '../types'

export function clearRoom(graph: LayoutGraph): Float32Array | null {
  const tree = groupTree(graph.capacity, graph.alive, graph.groups)
  if (!tree) return null
  const fixed = new Uint8Array(graph.capacity)
  for (let index = 0; index < graph.capacity; index++) {
    fixed[index] = graph.movable[index] === 1 ? 0 : 1
  }
  const xy = Float32Array.from(graph.xy)
  separateGroups(tree, graph.alive, graph.radius, fixed, xy, {
    spacing: 0,
    groupSpacing: groupGap,
    rounds: 64,
    nodes: 'moved',
  })
  return xy
}
