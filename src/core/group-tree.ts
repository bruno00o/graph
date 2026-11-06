import type { LayoutGroups } from '../types'

export interface GroupTree {
  readonly count: number
  readonly roots: number
  readonly levels: number
  readonly node: Int32Array
  readonly slotOf: Int32Array
  readonly parent: Int32Array
  readonly depth: Int32Array
  readonly first: Int32Array
  readonly children: Int32Array
  readonly padding: Float64Array
  readonly circle: Uint8Array
  readonly groupOf: Int32Array
}

export function groupTree(
  capacity: number,
  alive: Uint8Array,
  groups: LayoutGroups | undefined,
): GroupTree | null {
  if (!groups || groups.order.length === 0) return null
  const isGroup = new Uint8Array(capacity)
  const listed: number[] = []
  for (const index of groups.order) {
    if (index >= capacity || isGroup[index] === 1 || alive[index] === 1) continue
    isGroup[index] = 1
    listed.push(index)
  }
  if (listed.length === 0) return null
  const parentOf = (index: number): number => {
    const parent = groups.parent[index] ?? -1
    return parent >= 0 && parent < capacity && isGroup[parent] === 1 && parent !== index
      ? parent
      : -1
  }
  const childStart = new Int32Array(capacity).fill(-1)
  const childNext = new Int32Array(capacity).fill(-1)
  const childTail = new Int32Array(capacity).fill(-1)
  const roots: number[] = []
  for (const index of listed) {
    const parent = parentOf(index)
    if (parent < 0) {
      roots.push(index)
      continue
    }
    if (childStart[parent] === -1) childStart[parent] = index
    else childNext[childTail[parent] ?? 0] = index
    childTail[parent] = index
  }
  const slotOf = new Int32Array(capacity).fill(-1)
  const order: number[] = [...roots]
  roots.forEach((index, at) => {
    slotOf[index] = at
  })
  const firstOf: number[] = []
  const countOf: number[] = []
  for (let at = 0; at < order.length; at++) {
    const index = order[at] ?? 0
    firstOf.push(order.length)
    let count = 0
    for (let child = childStart[index] ?? -1; child >= 0; child = childNext[child] ?? -1) {
      if (slotOf[child] !== -1) continue
      slotOf[child] = order.length
      order.push(child)
      count++
    }
    countOf.push(count)
  }
  const count = order.length
  const node = Int32Array.from(order)
  const parent = new Int32Array(count).fill(-1)
  const depth = new Int32Array(count)
  const padding = new Float64Array(count)
  const circle = new Uint8Array(count)
  let levels = 0
  for (let slot = 0; slot < count; slot++) {
    const index = node[slot] ?? 0
    const above = parentOf(index)
    const parentSlot = above >= 0 ? (slotOf[above] ?? -1) : -1
    parent[slot] = parentSlot
    depth[slot] = parentSlot >= 0 ? (depth[parentSlot] ?? 0) + 1 : 0
    levels = Math.max(levels, (depth[slot] ?? 0) + 1)
    const pad = groups.padding[index] ?? 0
    padding[slot] = Number.isFinite(pad) && pad > 0 ? pad : 0
    circle[slot] = groups.circle[index] === 1 ? 1 : 0
  }
  const groupOf = new Int32Array(capacity).fill(-1)
  for (let index = 0; index < capacity; index++) {
    if (alive[index] !== 1) continue
    const above = groups.parent[index] ?? -1
    if (above >= 0 && above < capacity) groupOf[index] = slotOf[above] ?? -1
  }
  return {
    count,
    roots: roots.length,
    levels,
    node,
    slotOf,
    parent,
    depth,
    first: Int32Array.from(firstOf),
    children: Int32Array.from(countOf),
    padding,
    circle,
    groupOf,
  }
}
