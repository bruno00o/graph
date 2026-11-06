import type { EdgeColumns, NodeColumns } from '../core/columns'
import type { Positions } from '../core/positions'
import type { Key, LayoutGraph } from '../types'

export function layoutGraph(
  nodes: NodeColumns,
  edges: EdgeColumns,
  positions: Positions,
  zoom: number,
  movable: (index: number) => boolean,
  datum: (key: Key) => unknown,
): LayoutGraph {
  const capacity = nodes.capacity
  const alive = nodes.alive.slice(0, capacity)
  const mobile = new Uint8Array(capacity)
  const xy = new Float32Array(capacity * 2)
  const radius = new Float32Array(capacity)
  for (let index = 0; index < capacity; index++) {
    if (alive[index] !== 1) continue
    xy[index * 2] = positions.x(index)
    xy[index * 2 + 1] = positions.y(index)
    const size = nodes.size[index] ?? 0
    radius[index] = nodes.screenUnits[index] === 1 ? size / 2 / zoom : size / 2
    const tracked = !Number.isNaN(positions.source[index * 2] ?? Number.NaN)
    if (!tracked && movable(index)) mobile[index] = 1
  }
  let count = 0
  for (let index = 0; index < edges.capacity; index++) {
    if (edges.alive[index] === 1 && edges.source[index] !== edges.target[index]) count++
  }
  const pairs = new Uint32Array(count * 2)
  let at = 0
  for (let index = 0; index < edges.capacity; index++) {
    if (edges.alive[index] !== 1) continue
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
    if (source === target) continue
    pairs[at++] = source
    pairs[at++] = target
  }
  const keys = nodes.keys.slice(0, capacity)
  return {
    capacity,
    alive,
    movable: mobile,
    xy,
    radius,
    edges: pairs,
    keys,
    datum: (index) => {
      const key = keys[index]
      return key === undefined || alive[index] !== 1 ? undefined : datum(key)
    },
  }
}
