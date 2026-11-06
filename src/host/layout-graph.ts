import { containerShape, type EdgeColumns, type NodeColumns } from '../core/columns'
import type { Positions } from '../core/positions'
import type { Key, LayoutGraph } from '../types'

export function layoutGraph(
  nodes: NodeColumns,
  edges: EdgeColumns,
  positions: Positions,
  zoom: number,
  movable: (index: number) => boolean,
  datum: (key: Key) => unknown,
  groupLinks?: Uint32Array,
): LayoutGraph {
  const capacity = nodes.capacity
  const alive = nodes.alive.slice(0, capacity)
  for (let index = 0; index < capacity; index++) {
    if (nodes.shape[index] === containerShape) alive[index] = 0
  }
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
  const linked = (index: number): boolean => {
    if (edges.alive[index] !== 1) return false
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
    return source !== target && alive[source] === 1 && alive[target] === 1
  }
  let count = 0
  for (let index = 0; index < edges.capacity; index++) {
    if (linked(index)) count++
  }
  const pairs = new Uint32Array(count * 2)
  let at = 0
  for (let index = 0; index < edges.capacity; index++) {
    if (!linked(index)) continue
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
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
    ...(groupLinks && groupLinks.length > 0 ? { groupLinks } : {}),
    keys,
    datum: (index) => {
      const key = keys[index]
      return key === undefined || alive[index] !== 1 ? undefined : datum(key)
    },
  }
}
