import { containerShape, type EdgeColumns, type NodeColumns } from '../core/columns'
import type { Hierarchy } from '../core/hierarchy'
import type { Positions } from '../core/positions'
import type { Key, LayoutGraph, LayoutGroups } from '../types'

const circle = 2

export interface LayoutContainers {
  readonly indices: ReadonlySet<number>
  readonly hierarchy: Hierarchy
}

function groupsOf(
  nodes: NodeColumns,
  alive: Uint8Array,
  containers: LayoutContainers,
): LayoutGroups | undefined {
  const { indices, hierarchy } = containers
  if (indices.size === 0) return undefined
  const capacity = alive.length
  const parent = new Int32Array(capacity).fill(-1)
  const holder = (index: number): number => {
    const above = hierarchy.parent[index] ?? -1
    return above >= 0 && indices.has(above) ? above : -1
  }
  for (let index = 0; index < capacity; index++) {
    if (alive[index] === 1 || indices.has(index)) parent[index] = holder(index)
  }
  const order: number[] = []
  for (const index of indices) if (parent[index] === -1) order.push(index)
  for (let at = 0; at < order.length; at++) {
    const index = order[at] ?? 0
    for (
      let child = hierarchy.firstChild[index] ?? -1;
      child >= 0;
      child = hierarchy.nextSibling[child] ?? -1
    ) {
      if (indices.has(child)) order.push(child)
    }
  }
  const padding = new Float32Array(capacity)
  const round = new Uint8Array(capacity)
  for (const index of order) {
    padding[index] = nodes.padding[index] ?? 0
    round[index] = nodes.container[index] === circle ? 1 : 0
  }
  return { order: Uint32Array.from(order), parent, padding, circle: round }
}

export function layoutGraph(
  nodes: NodeColumns,
  edges: EdgeColumns,
  positions: Positions,
  zoom: number,
  movable: (index: number) => boolean,
  datum: (key: Key) => unknown,
  groupLinks?: Uint32Array,
  containers?: LayoutContainers,
): LayoutGraph {
  const capacity = nodes.capacity
  const present = nodes.alive.slice(0, capacity)
  const alive = present.slice()
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
  const groups = containers ? groupsOf(nodes, alive, containers) : undefined
  return {
    capacity,
    alive,
    movable: mobile,
    xy,
    radius,
    edges: pairs,
    ...(groupLinks && groupLinks.length > 0 ? { groupLinks } : {}),
    ...(groups ? { groups } : {}),
    keys,
    datum: (index) => {
      const key = keys[index]
      return key === undefined || present[index] !== 1 ? undefined : datum(key)
    },
  }
}
