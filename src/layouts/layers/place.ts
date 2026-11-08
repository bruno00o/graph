import type { Layered } from './structure'

interface Scratch {
  readonly root: Int32Array
  readonly align: Int32Array
  readonly start: Int32Array
  readonly fill: Int32Array
  readonly target: Int32Array
  readonly weight: Float64Array
  readonly incoming: Int32Array
  readonly queue: Int32Array
  readonly block: Float64Array
}

export interface Borders {
  readonly separation: Float64Array
  readonly above: Int32Array
  readonly below: Int32Array
}

export function placeNodes(graph: Layered, borders: Borders): Float64Array {
  const { count, slots, order, componentSlots, half } = graph
  const conflict = markConflicts(graph)
  markCrossings(graph, conflict, borders.above)
  const xs = [0, 1, 2, 3].map(() => new Float64Array(count))
  const scratch: Scratch = {
    root: new Int32Array(count),
    align: new Int32Array(count),
    start: new Int32Array(count + 1),
    fill: new Int32Array(count),
    target: new Int32Array(count),
    weight: new Float64Array(count),
    incoming: new Int32Array(count),
    queue: new Int32Array(count),
    block: new Float64Array(count),
  }
  const x = new Float64Array(count)
  const low = new Float64Array(4)
  const high = new Float64Array(4)
  for (let c = 0; c + 1 < componentSlots.length; c++) {
    const first = componentSlots[c] ?? 0
    const last = componentSlots[c + 1] ?? 0
    const from = slots[first] ?? 0
    const to = slots[last] ?? 0
    if (to - from < 2) continue
    let smallest = 0
    for (let variant = 0; variant < 4; variant++) {
      const downward = variant < 2
      const left = variant % 2 === 0
      const result = xs[variant] ?? x
      const chain = downward ? borders.above : borders.below
      alignBlocks(graph, conflict, first, last, downward, left, scratch, chain)
      compact(graph, first, last, left, scratch, result, borders.separation)
      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY
      for (let at = from; at < to; at++) {
        const node = order[at] ?? 0
        min = Math.min(min, (result[node] ?? 0) - (half[node] ?? 0))
        max = Math.max(max, (result[node] ?? 0) + (half[node] ?? 0))
      }
      low[variant] = min
      high[variant] = max
      if (max - min < (high[smallest] ?? 0) - (low[smallest] ?? 0)) smallest = variant
    }
    for (let at = from; at < to; at++) {
      const node = order[at] ?? 0
      let sum = 0
      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY
      for (let variant = 0; variant < 4; variant++) {
        const shift =
          variant % 2 === 0
            ? (low[smallest] ?? 0) - (low[variant] ?? 0)
            : (high[smallest] ?? 0) - (high[variant] ?? 0)
        const value = (xs[variant]?.[node] ?? 0) + shift
        sum += value
        min = Math.min(min, value)
        max = Math.max(max, value)
      }
      x[node] = (sum - min - max) / 2
    }
  }
  return x
}

function isDummy(graph: Layered, node: number): boolean {
  return node >= graph.real
}

function markConflicts(graph: Layered): Uint8Array {
  const { slots, order, position, up, upper, componentSlots } = graph
  const conflict = new Uint8Array(upper.length)
  for (let c = 0; c + 1 < componentSlots.length; c++) {
    const first = componentSlots[c] ?? 0
    const last = componentSlots[c + 1] ?? 0
    for (let slot = first; slot + 1 < last; slot++) {
      const above = (slots[slot + 1] ?? 0) - (slots[slot] ?? 0)
      const start = slots[slot + 1] ?? 0
      const end = slots[slot + 2] ?? 0
      let k0 = 0
      let scan = start
      for (let at = start; at < end; at++) {
        const node = order[at] ?? 0
        let inner = -1
        if (isDummy(graph, node) && (up.start[node] ?? 0) < (up.start[node + 1] ?? 0)) {
          const source = upper[up.items[up.start[node] ?? 0] ?? 0] ?? 0
          if (isDummy(graph, source)) inner = source
        }
        if (at !== end - 1 && inner < 0) continue
        const k1 = inner >= 0 ? (position[inner] ?? 0) : above - 1
        for (; scan <= at; scan++) {
          const below = order[scan] ?? 0
          for (let k = up.start[below] ?? 0; k < (up.start[below + 1] ?? 0); k++) {
            const segment = up.items[k] ?? 0
            const source = upper[segment] ?? 0
            const p = position[source] ?? 0
            if ((p < k0 || p > k1) && !(isDummy(graph, source) && isDummy(graph, below))) {
              conflict[segment] = 1
            }
          }
        }
        k0 = k1
      }
    }
  }
  return conflict
}

function markCrossings(graph: Layered, conflict: Uint8Array, above: Int32Array): void {
  const { slots, order, position, up, upper, componentSlots } = graph
  for (let c = 0; c + 1 < componentSlots.length; c++) {
    const first = componentSlots[c] ?? 0
    const last = componentSlots[c + 1] ?? 0
    for (let slot = first; slot + 1 < last; slot++) {
      const size = (slots[slot + 1] ?? 0) - (slots[slot] ?? 0)
      const start = slots[slot + 1] ?? 0
      const end = slots[slot + 2] ?? 0
      let k0 = 0
      let scan = start
      for (let at = start; at < end; at++) {
        const linked = above[order[at] ?? 0] ?? -1
        if (at !== end - 1 && linked < 0) continue
        const k1 = linked >= 0 ? (position[linked] ?? 0) : size - 1
        for (; scan <= at; scan++) {
          const below = order[scan] ?? 0
          for (let k = up.start[below] ?? 0; k < (up.start[below + 1] ?? 0); k++) {
            const segment = up.items[k] ?? 0
            const p = position[upper[segment] ?? 0] ?? 0
            if (p < k0 || p > k1) conflict[segment] = 1
          }
        }
        k0 = k1
      }
    }
  }
}

function alignBlocks(
  graph: Layered,
  conflict: Uint8Array,
  first: number,
  last: number,
  downward: boolean,
  left: boolean,
  scratch: Scratch,
  chain: Int32Array,
): void {
  const { slots, order, position, slotOf } = graph
  const { root, align } = scratch
  for (let at = slots[first] ?? 0; at < (slots[last] ?? 0); at++) {
    const node = order[at] ?? 0
    root[node] = node
    align[node] = node
  }
  const lists = downward ? graph.up : graph.down
  const ends = downward ? graph.upper : graph.lower
  const rankOf = (node: number) => {
    if (left) return position[node] ?? 0
    const slot = slotOf[node] ?? 0
    return (slots[slot + 1] ?? 0) - (slots[slot] ?? 0) - 1 - (position[node] ?? 0)
  }
  const step = downward ? 1 : -1
  for (let slot = downward ? first + 1 : last - 2; slot >= first && slot < last; slot += step) {
    const start = slots[slot] ?? 0
    const end = slots[slot + 1] ?? 0
    let reached = -1
    for (let i = 0; i < end - start; i++) {
      const node = order[left ? start + i : end - 1 - i] ?? 0
      const linked = chain[node] ?? -1
      if (linked >= 0) {
        align[linked] = node
        root[node] = root[linked] ?? linked
        align[node] = root[node] ?? node
        reached = rankOf(linked)
        continue
      }
      const a = lists.start[node] ?? 0
      const b = lists.start[node + 1] ?? 0
      const size = b - a
      if (size === 0) continue
      for (let m = (size - 1) >> 1; m <= size >> 1; m++) {
        if (align[node] !== node) break
        const segment = lists.items[left ? a + m : b - 1 - m] ?? 0
        if (conflict[segment] === 1) continue
        const neighbor = ends[segment] ?? 0
        const rank = rankOf(neighbor)
        if (reached < rank) {
          align[neighbor] = node
          root[node] = root[neighbor] ?? neighbor
          align[node] = root[node] ?? node
          reached = rank
        }
      }
    }
  }
}

function compact(
  graph: Layered,
  first: number,
  last: number,
  left: boolean,
  scratch: Scratch,
  x: Float64Array,
  separation: Float64Array,
): void {
  const { slots, order, position, slotOf } = graph
  const { root, start, fill, target, weight, incoming, queue, block } = scratch
  const from = slots[first] ?? 0
  const size = (slots[last] ?? 0) - from
  const local = (node: number) => (slots[slotOf[node] ?? 0] ?? 0) + (position[node] ?? 0) - from
  start.fill(0, 0, size + 1)
  incoming.fill(0, 0, size)
  block.fill(0, 0, size)
  for (let slot = first; slot < last; slot++) {
    const a = slots[slot] ?? 0
    const b = slots[slot + 1] ?? 0
    for (let i = 1; i < b - a; i++) {
      const before = local(root[order[left ? a + i - 1 : b - i] ?? 0] ?? 0)
      start[before + 1] = (start[before + 1] ?? 0) + 1
    }
  }
  for (let i = 0; i < size; i++) start[i + 1] = (start[i + 1] ?? 0) + (start[i] ?? 0)
  fill.set(start.subarray(0, size))
  for (let slot = first; slot < last; slot++) {
    const a = slots[slot] ?? 0
    const b = slots[slot + 1] ?? 0
    for (let i = 1; i < b - a; i++) {
      const u = order[left ? a + i - 1 : b - i] ?? 0
      const v = order[left ? a + i : b - 1 - i] ?? 0
      const before = local(root[u] ?? 0)
      const after = local(root[v] ?? 0)
      const at = fill[before] ?? 0
      target[at] = after
      weight[at] = separation[left ? u : v] ?? 0
      fill[before] = at + 1
      incoming[after] = (incoming[after] ?? 0) + 1
    }
  }
  let tail = 0
  for (let at = from; at < from + size; at++) {
    const node = order[at] ?? 0
    if (root[node] !== node) continue
    const id = at - from
    if (incoming[id] === 0) queue[tail++] = id
  }
  for (let head = 0; head < tail; head++) {
    const id = queue[head] ?? 0
    const value = block[id] ?? 0
    for (let k = start[id] ?? 0; k < (start[id + 1] ?? 0); k++) {
      const next = target[k] ?? 0
      block[next] = Math.max(block[next] ?? 0, value + (weight[k] ?? 0))
      incoming[next] = (incoming[next] ?? 0) - 1
      if (incoming[next] === 0) queue[tail++] = next
    }
  }
  for (let head = tail - 1; head >= 0; head--) {
    const id = queue[head] ?? 0
    const a = start[id] ?? 0
    const b = start[id + 1] ?? 0
    if (a === b) continue
    let least = Number.POSITIVE_INFINITY
    for (let k = a; k < b; k++) {
      least = Math.min(least, (block[target[k] ?? 0] ?? 0) - (weight[k] ?? 0))
    }
    block[id] = Math.max(block[id] ?? 0, least)
  }
  const sign = left ? 1 : -1
  for (let at = from; at < from + size; at++) {
    const node = order[at] ?? 0
    x[node] = sign * (block[local(root[node] ?? 0)] ?? 0)
  }
}
