import type { Layered } from './structure'

const maxSweeps = 24
const minSweeps = 4
const budget = 4_000_000
const patience = 4

export function sweepCount(graph: Layered): number {
  return Math.max(
    minSweeps,
    Math.min(maxSweeps, Math.floor(budget / (graph.count + graph.upper.length + 1))),
  )
}

export function orderLayers(graph: Layered): void {
  const { slots, order, position, slotOf, componentSlots } = graph
  let widest = 0
  for (let slot = 0; slot + 1 < slots.length; slot++) {
    widest = Math.max(widest, (slots[slot + 1] ?? 0) - (slots[slot] ?? 0))
  }
  const tree = new Int32Array(widest + 1)
  const packed = new Float64Array(widest)
  const span = 2 ** Math.ceil(Math.log2(widest + 1))
  const precision = 2 ** 52 / (span * span)
  const scratch = new Int32Array(widest)
  const best = new Int32Array(order.length)
  const sweeps = sweepCount(graph)
  for (let c = 0; c + 1 < componentSlots.length; c++) {
    const first = componentSlots[c] ?? 0
    const last = componentSlots[c + 1] ?? 0
    if (last - first < 2) continue
    let fewest = crossings(graph, first, last, tree)
    if (fewest === 0) continue
    const from = slots[first] ?? 0
    const to = slots[last] ?? 0
    best.set(order.subarray(from, to), from)
    let stale = 0
    for (let sweep = 0; sweep < sweeps && stale < patience && fewest > 0; sweep++) {
      if (sweep % 2 === 0) {
        for (let slot = first + 1; slot < last; slot++)
          sortSlot(graph, slot, true, packed, scratch, span, precision)
      } else {
        for (let slot = last - 2; slot >= first; slot--)
          sortSlot(graph, slot, false, packed, scratch, span, precision)
      }
      const found = crossings(graph, first, last, tree)
      if (found < fewest) {
        fewest = found
        best.set(order.subarray(from, to), from)
        stale = 0
      } else {
        stale++
      }
    }
    order.set(best.subarray(from, to), from)
    for (let at = from; at < to; at++) {
      const node = order[at] ?? 0
      position[node] = at - (slots[slotOf[node] ?? 0] ?? 0)
    }
  }
}

function sortSlot(
  graph: Layered,
  slot: number,
  downward: boolean,
  packed: Float64Array,
  scratch: Int32Array,
  span: number,
  precision: number,
): void {
  const { order, position } = graph
  const lists = downward ? graph.up : graph.down
  const ends = downward ? graph.upper : graph.lower
  const start = graph.slots[slot] ?? 0
  const end = graph.slots[slot + 1] ?? 0
  let size = 0
  for (let at = start; at < end; at++) {
    const node = order[at] ?? 0
    const a = lists.start[node] ?? 0
    const b = lists.start[node + 1] ?? 0
    if (a === b) continue
    let sum = 0
    for (let k = a; k < b; k++) sum += position[ends[lists.items[k] ?? 0] ?? 0] ?? 0
    packed[size++] = Math.floor((sum / (b - a)) * precision) * span + (at - start)
  }
  if (size < 2) return
  packed.subarray(0, size).sort()
  for (let k = 0; k < size; k++) scratch[k] = order[start + ((packed[k] ?? 0) % span)] ?? 0
  let next = 0
  for (let at = start; at < end; at++) {
    const node = order[at] ?? 0
    if ((lists.start[node] ?? 0) === (lists.start[node + 1] ?? 0)) continue
    order[at] = scratch[next++] ?? 0
  }
  for (let at = start; at < end; at++) position[order[at] ?? 0] = at - start
}

export function crossings(graph: Layered, first: number, last: number, tree: Int32Array): number {
  const { slots, order, position, down, lower } = graph
  let total = 0
  for (let slot = first; slot + 1 < last; slot++) {
    const size = (slots[slot + 2] ?? 0) - (slots[slot + 1] ?? 0)
    tree.fill(0, 0, size + 1)
    let inserted = 0
    for (let at = slots[slot] ?? 0; at < (slots[slot + 1] ?? 0); at++) {
      const node = order[at] ?? 0
      const a = down.start[node] ?? 0
      const b = down.start[node + 1] ?? 0
      for (let k = a; k < b; k++) {
        let sum = 0
        for (let i = (position[lower[down.items[k] ?? 0] ?? 0] ?? 0) + 1; i > 0; i -= i & -i) {
          sum += tree[i] ?? 0
        }
        total += inserted - sum
      }
      for (let k = a; k < b; k++) {
        for (let i = (position[lower[down.items[k] ?? 0] ?? 0] ?? 0) + 1; i <= size; i += i & -i) {
          tree[i] = (tree[i] ?? 0) + 1
        }
        inserted++
      }
    }
  }
  return total
}
