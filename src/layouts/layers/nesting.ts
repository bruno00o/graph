import { groupTree } from '../../core/group-tree'
import type { LayoutGraph } from '../../types'
import { type Adjacency, adjacency } from './adjacency'
import { type Layered, slotted } from './structure'

export const member = 0
export const opening = 1
export const closing = 2

export interface Clusters {
  readonly count: number
  readonly parent: Int32Array
  readonly depth: Int32Array
  readonly owner: Int32Array
  readonly padding: Float64Array
  readonly alongBefore: Float64Array
  readonly alongAfter: Float64Array
  readonly acrossBefore: Float64Array
  readonly acrossAfter: Float64Array
  readonly round: boolean
}

export interface Nesting {
  readonly clusters: Clusters
  readonly level: Int32Array
  readonly owner: Int32Array
  readonly side: Uint8Array
  readonly mate: Int32Array
  readonly above: Int32Array
  readonly below: Int32Array
  readonly top: Int32Array
  readonly bottom: Int32Array
}

export type Sides = readonly [number, number, number, number]

export function clustersOf(
  graph: LayoutGraph,
  indices: readonly number[],
  sides: Sides,
): Clusters | null {
  const groups = graph.groups
  const tree = groupTree(graph.capacity, graph.alive, groups)
  if (!tree || !groups) return null
  const has = new Uint8Array(tree.count)
  for (const index of indices) {
    for (let slot = tree.groupOf[index] ?? -1; slot >= 0 && has[slot] === 0; ) {
      has[slot] = 1
      slot = tree.parent[slot] ?? -1
    }
  }
  const id = new Int32Array(tree.count).fill(-1)
  let count = 0
  for (let slot = 0; slot < tree.count; slot++) if (has[slot] === 1) id[slot] = count++
  if (count === 0) return null
  const parent = new Int32Array(count)
  const depth = new Int32Array(count)
  const padding = new Float64Array(count)
  const margins = [0, 1, 2, 3].map(() => new Float64Array(count))
  const space = groups.labelSpace
  let round = false
  for (let slot = 0; slot < tree.count; slot++) {
    const c = id[slot] ?? -1
    if (c < 0) continue
    const above = tree.parent[slot] ?? -1
    const p = above >= 0 ? (id[above] ?? -1) : -1
    parent[c] = p
    depth[c] = p >= 0 ? (depth[p] ?? 0) + 1 : 0
    padding[c] = tree.padding[slot] ?? 0
    if (tree.circle[slot] === 1) round = true
    const node = tree.node[slot] ?? 0
    sides.forEach((side, at) => {
      const value = space?.[node * 4 + side] ?? 0
      const target = margins[at] as Float64Array
      target[c] = Number.isFinite(value) && value > 0 ? value : 0
    })
  }
  const owner = new Int32Array(indices.length)
  indices.forEach((index, at) => {
    const slot = tree.groupOf[index] ?? -1
    owner[at] = slot >= 0 ? (id[slot] ?? -1) : -1
  })
  const [alongBefore, alongAfter, acrossBefore, acrossAfter] = margins as [
    Float64Array,
    Float64Array,
    Float64Array,
    Float64Array,
  ]
  return {
    count,
    parent,
    depth,
    owner,
    padding,
    alongBefore,
    alongAfter,
    acrossBefore,
    acrossAfter,
    round,
  }
}

export interface NestedGraph {
  readonly count: number
  readonly successors: Adjacency
  readonly lengths: Int32Array
  readonly topological: Int32Array
}

export function nestingGraph(
  real: number,
  successors: Adjacency,
  topological: Int32Array,
  clusters: Clusters,
): NestedGraph {
  const { count: clusterCount, parent, owner } = clusters
  const count = real + clusterCount * 2
  const start = new Int32Array(count + 1)
  for (let node = 0; node < real; node++) {
    const degree = (successors.start[node + 1] ?? 0) - (successors.start[node] ?? 0)
    const c = owner[node] ?? -1
    start[node + 1] = degree + (c >= 0 ? 1 : 0)
    if (c >= 0) start[real + c + 1] = (start[real + c + 1] ?? 0) + 1
  }
  for (let c = 0; c < clusterCount; c++) {
    const p = parent[c] ?? -1
    if (p < 0) continue
    start[real + p + 1] = (start[real + p + 1] ?? 0) + 1
    start[real + clusterCount + c + 1] = 1
  }
  for (let node = 0; node < count; node++)
    start[node + 1] = (start[node + 1] ?? 0) + (start[node] ?? 0)
  const items = new Int32Array(start[count] ?? 0)
  const lengths = new Int32Array(items.length)
  const fill = start.slice(0, count)
  const push = (from: number, to: number, length: number) => {
    const at = fill[from] ?? 0
    items[at] = to
    lengths[at] = length
    fill[from] = at + 1
  }
  for (let node = 0; node < real; node++) {
    for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
      push(node, successors.items[k] ?? 0, 1)
    }
    const c = owner[node] ?? -1
    if (c >= 0) {
      push(node, real + clusterCount + c, 0)
      push(real + c, node, 0)
    }
  }
  for (let c = 0; c < clusterCount; c++) {
    const p = parent[c] ?? -1
    if (p < 0) continue
    push(real + p, real + c, 0)
    push(real + clusterCount + c, real + clusterCount + p, 0)
  }
  const order = new Int32Array(count)
  for (let c = 0; c < clusterCount; c++) {
    order[c] = real + c
    order[real + clusterCount + c] = real + clusterCount * 2 - 1 - c
  }
  order.set(topological, clusterCount)
  return { count, successors: { start, items }, lengths, topological: order }
}

function rangesOf(
  real: number,
  layer: Int32Array,
  component: Int32Array,
  clusters: Clusters,
): { top: Int32Array; bottom: Int32Array; part: Int32Array } {
  const { count, parent, owner } = clusters
  const top = new Int32Array(count).fill(0x7fffffff)
  const bottom = new Int32Array(count).fill(-1)
  const part = new Int32Array(count).fill(-1)
  for (let node = 0; node < real; node++) {
    const c = owner[node] ?? -1
    if (c < 0) continue
    const at = layer[node] ?? 0
    top[c] = Math.min(top[c] ?? 0, at)
    bottom[c] = Math.max(bottom[c] ?? 0, at)
    part[c] = component[node] ?? 0
  }
  for (let c = count - 1; c >= 0; c--) {
    const p = parent[c] ?? -1
    if (p < 0) continue
    top[p] = Math.min(top[p] ?? 0, top[c] ?? 0)
    bottom[p] = Math.max(bottom[p] ?? 0, bottom[c] ?? 0)
    if ((part[p] ?? -1) < 0) part[p] = part[c] ?? 0
  }
  return { top, bottom, part }
}

function holderAt(
  level: number,
  source: number,
  target: number,
  clusters: Clusters,
  top: Int32Array,
  bottom: Int32Array,
): number {
  const { parent, depth } = clusters
  const depthOf = (c: number) => (c < 0 ? -1 : (depth[c] ?? 0))
  let a = source
  let b = target
  while (depthOf(a) > depthOf(b)) a = parent[a] ?? -1
  while (depthOf(b) > depthOf(a)) b = parent[b] ?? -1
  while (a !== b) {
    a = parent[a] ?? -1
    b = parent[b] ?? -1
  }
  const common = a
  for (let c = source; c !== common; c = parent[c] ?? -1) {
    if ((bottom[c] ?? 0) >= level) return c
  }
  for (let c = target; c !== common; c = parent[c] ?? -1) {
    if ((top[c] ?? 0) <= level) return c
  }
  return common
}

export function expandNested(
  real: number,
  layer: Int32Array,
  component: Int32Array,
  successors: Adjacency,
  radius: Float64Array,
  clusters: Clusters,
): { layered: Layered; nest: Nesting } {
  const { top, bottom, part } = rangesOf(real, layer, component, clusters)
  const clusterCount = clusters.count
  let dummies = 0
  let segments = 0
  for (let node = 0; node < real; node++) {
    for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
      const span = (layer[successors.items[k] ?? 0] ?? 0) - (layer[node] ?? 0)
      dummies += span - 1
      segments += span
    }
  }
  let borders = 0
  for (let c = 0; c < clusterCount; c++) borders += ((bottom[c] ?? 0) - (top[c] ?? 0) + 1) * 2
  segments += borders - clusterCount * 2
  const count = real + dummies + borders
  const layers = new Int32Array(count)
  const components = new Int32Array(count)
  const half = new Float64Array(count)
  const owner = new Int32Array(count)
  const side = new Uint8Array(count)
  const mate = new Int32Array(count).fill(-1)
  const above = new Int32Array(count).fill(-1)
  const below = new Int32Array(count).fill(-1)
  layers.set(layer.subarray(0, real))
  components.set(component.subarray(0, real))
  half.set(radius.subarray(0, real))
  owner.set(clusters.owner.subarray(0, real))
  const upper = new Int32Array(segments)
  const lower = new Int32Array(segments)
  let next = real
  let segment = 0
  for (let node = 0; node < real; node++) {
    const from = layer[node] ?? 0
    const source = clusters.owner[node] ?? -1
    for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
      const target = successors.items[k] ?? 0
      const into = clusters.owner[target] ?? -1
      let previous = node
      for (let level = from + 1; level < (layer[target] ?? 0); level++) {
        layers[next] = level
        components[next] = component[node] ?? 0
        owner[next] = holderAt(level, source, into, clusters, top, bottom)
        upper[segment] = previous
        lower[segment] = next
        segment++
        previous = next++
      }
      upper[segment] = previous
      lower[segment] = target
      segment++
    }
  }
  for (let c = 0; c < clusterCount; c++) {
    let previous = -1
    for (let level = top[c] ?? 0; level <= (bottom[c] ?? 0); level++) {
      const left = next++
      const right = next++
      for (const node of [left, right]) {
        layers[node] = level
        components[node] = part[c] ?? 0
        owner[node] = c
      }
      side[left] = opening
      side[right] = closing
      mate[left] = right
      mate[right] = left
      if (previous >= 0) {
        above[left] = previous
        above[right] = previous + 1
        below[previous] = left
        below[previous + 1] = right
        upper[segment] = previous
        lower[segment++] = left
        upper[segment] = previous + 1
        lower[segment++] = right
      }
      previous = left
    }
  }
  const { componentSlots, slots, slotOf, order, position } = slotted(
    real,
    count,
    layer,
    component,
    layers,
    components,
  )
  nestOrder(slots, order, position, owner, side, clusters)
  const ids = Int32Array.from({ length: segments }, (_, at) => at)
  const layered: Layered = {
    real,
    count,
    half,
    upper,
    lower,
    up: adjacency(count, lower, ids),
    down: adjacency(count, upper, ids),
    slots,
    slotOf,
    order,
    position,
    componentSlots,
  }
  return {
    layered,
    nest: { clusters, level: layers, owner, side, mate, above, below, top, bottom },
  }
}

function nestOrder(
  slots: Int32Array,
  order: Int32Array,
  position: Int32Array,
  owner: Int32Array,
  side: Uint8Array,
  clusters: Clusters,
): void {
  const { count, parent } = clusters
  const childStart = new Int32Array(count + 1)
  for (let c = 0; c < count; c++) {
    const p = parent[c] ?? -1
    if (p >= 0) childStart[p + 1] = (childStart[p + 1] ?? 0) + 1
  }
  for (let c = 0; c < count; c++)
    childStart[c + 1] = (childStart[c + 1] ?? 0) + (childStart[c] ?? 0)
  const children = new Int32Array(Math.max(0, childStart[count] ?? 0))
  const fill = childStart.slice(0, count)
  for (let c = 0; c < count; c++) {
    const p = parent[c] ?? -1
    if (p < 0) continue
    const at = fill[p] ?? 0
    children[at] = c
    fill[p] = at + 1
  }
  const enter = new Int32Array(count)
  const exit = new Int32Array(count)
  const stack = new Int32Array(count * 2)
  let clock = 1
  for (let root = 0; root < count; root++) {
    if ((parent[root] ?? -1) >= 0) continue
    let depth = 0
    stack[depth++] = root
    while (depth > 0) {
      const top = stack[depth - 1] ?? 0
      if (top >= 0) {
        enter[top] = clock++
        stack[depth - 1] = -1 - top
        for (let k = (childStart[top + 1] ?? 0) - 1; k >= (childStart[top] ?? 0); k--) {
          stack[depth++] = children[k] ?? 0
        }
      } else {
        exit[-1 - top] = clock++
        depth--
      }
    }
  }
  let widest = 0
  for (let slot = 0; slot + 1 < slots.length; slot++) {
    widest = Math.max(widest, (slots[slot + 1] ?? 0) - (slots[slot] ?? 0))
  }
  const span = 2 ** Math.ceil(Math.log2(widest + 1))
  const packed = new Float64Array(widest)
  const scratch = new Int32Array(widest)
  for (let slot = 0; slot + 1 < slots.length; slot++) {
    const start = slots[slot] ?? 0
    const end = slots[slot + 1] ?? 0
    for (let at = start; at < end; at++) {
      const node = order[at] ?? 0
      const c = owner[node] ?? -1
      const key =
        c < 0
          ? 0
          : side[node] === opening
            ? 2 * (enter[c] ?? 0)
            : side[node] === closing
              ? 2 * (exit[c] ?? 0)
              : 2 * (enter[c] ?? 0) + 1
      packed[at - start] = key * span + (at - start)
    }
    const size = end - start
    packed.subarray(0, size).sort()
    for (let k = 0; k < size; k++) scratch[k] = order[start + ((packed[k] ?? 0) % span)] ?? 0
    for (let k = 0; k < size; k++) {
      const node = scratch[k] ?? 0
      order[start + k] = node
      position[node] = k
    }
  }
}

export function separations(graph: Layered, nest: Nesting, spacing: number): Float64Array {
  const { slots, order, half, real } = graph
  const { owner, side, clusters } = nest
  const { padding, acrossBefore, acrossAfter } = clusters
  const separation = new Float64Array(graph.count)
  const gap = (node: number) => (side[node] !== member || node < real ? spacing : spacing / 2)
  for (let slot = 0; slot + 1 < slots.length; slot++) {
    for (let at = slots[slot] ?? 0; at + 1 < (slots[slot + 1] ?? 0); at++) {
      const left = order[at] ?? 0
      const right = order[at + 1] ?? 0
      const a = side[left] ?? member
      const b = side[right] ?? member
      let value: number
      if (a === opening) {
        const pad = padding[owner[left] ?? 0] ?? 0
        value =
          b === member
            ? pad + (half[right] ?? 0)
            : b === opening
              ? pad + (acrossBefore[owner[right] ?? 0] ?? 0)
              : 0
      } else if (b === closing) {
        const pad = padding[owner[right] ?? 0] ?? 0
        value = a === member ? (half[left] ?? 0) + pad : pad + (acrossAfter[owner[left] ?? 0] ?? 0)
      } else {
        const reach = a === member ? (half[left] ?? 0) : (acrossAfter[owner[left] ?? 0] ?? 0)
        const lead = b === member ? (half[right] ?? 0) : (acrossBefore[owner[right] ?? 0] ?? 0)
        value = reach + lead + (gap(left) + gap(right)) / 2
      }
      separation[left] = value
    }
  }
  return separation
}

export interface Extents {
  readonly before: Float64Array
  readonly after: Float64Array
  readonly left: Float64Array
  readonly right: Float64Array
}

export function extentsOf(graph: Layered, nest: Nesting): Extents {
  const { count, half, real } = graph
  const { owner, side, level, top, bottom, clusters } = nest
  const { parent, padding, alongBefore, alongAfter, acrossBefore, acrossAfter } = clusters
  const before = new Float64Array(count)
  const after = new Float64Array(count)
  const left = new Float64Array(count)
  const right = new Float64Array(count)
  for (let node = 0; node < count; node++) {
    const kind = side[node] ?? member
    if (kind === member && node >= real) continue
    const at = level[node] ?? 0
    const own = kind === member ? (half[node] ?? 0) : 0
    let stack = 0
    let reach = 0
    for (let c = owner[node] ?? -1; c >= 0 && top[c] === at; c = parent[c] ?? -1) {
      stack += padding[c] ?? 0
      reach = Math.max(reach, stack + (alongBefore[c] ?? 0))
    }
    before[node] = own + Math.max(stack, reach)
    stack = 0
    reach = 0
    for (let c = owner[node] ?? -1; c >= 0 && bottom[c] === at; c = parent[c] ?? -1) {
      stack += padding[c] ?? 0
      reach = Math.max(reach, stack + (alongAfter[c] ?? 0))
    }
    after[node] = own + Math.max(stack, reach)
    const c = owner[node] ?? 0
    left[node] = kind === member ? own : kind === opening ? (acrossBefore[c] ?? 0) : 0
    right[node] = kind === member ? own : kind === closing ? (acrossAfter[c] ?? 0) : 0
  }
  return { before, after, left, right }
}
