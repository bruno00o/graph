import { type Nesting, opening } from './nesting'
import { crossings, sweepCount } from './order'
import type { Layered } from './structure'

const patience = 4

class NestedSort {
  readonly #graph: Layered
  readonly #nest: Nesting
  readonly #packed: Float64Array
  readonly #from: Int32Array
  readonly #to: Int32Array
  readonly #scratch: Int32Array
  readonly #sum: Float64Array
  readonly #weight: Float64Array
  readonly #center: Float64Array
  readonly #rows: Float64Array
  readonly key: Float64Array
  readonly #span: number
  readonly #scale: number
  #slot = 0
  #downward = true
  #own = false

  constructor(graph: Layered, nest: Nesting, widest: number) {
    this.#graph = graph
    this.#nest = nest
    this.#packed = new Float64Array(widest)
    this.#from = new Int32Array(widest)
    this.#to = new Int32Array(widest)
    this.#scratch = new Int32Array(widest)
    const clusterCount = nest.clusters.count
    this.#sum = new Float64Array(clusterCount)
    this.#weight = new Float64Array(clusterCount)
    this.#center = new Float64Array(clusterCount)
    this.#rows = new Float64Array(clusterCount)
    this.key = new Float64Array(clusterCount)
    this.#span = 2 ** Math.ceil(Math.log2(widest + 1))
    this.#scale = Math.floor(2 ** 52 / this.#span)
  }

  #norm(node: number): number {
    const { slots, slotOf, position } = this.#graph
    const slot = slotOf[node] ?? 0
    return ((position[node] ?? 0) + 0.5) / ((slots[slot + 1] ?? 0) - (slots[slot] ?? 0))
  }

  keys(from: number, to: number, downward: boolean): void {
    const graph = this.#graph
    const { order } = graph
    const { owner, side, mate, clusters } = this.#nest
    const { parent, depth } = clusters
    const sum = this.#sum
    const weight = this.#weight
    const center = this.#center
    const rows = this.#rows
    for (let at = from; at < to; at++) {
      const node = order[at] ?? 0
      if (side[node] !== opening) continue
      const c = owner[node] ?? 0
      sum[c] = 0
      weight[c] = 0
      center[c] = 0
      rows[c] = 0
    }
    const lists = downward ? graph.up : graph.down
    const ends = downward ? graph.upper : graph.lower
    const depthOf = (c: number) => (c < 0 ? -1 : (depth[c] ?? 0))
    for (let at = from; at < to; at++) {
      const node = order[at] ?? 0
      if (side[node] === opening) {
        const c = owner[node] ?? 0
        const position = graph.position
        const slot = graph.slotOf[node] ?? 0
        const size = (graph.slots[slot + 1] ?? 0) - (graph.slots[slot] ?? 0)
        center[c] =
          (center[c] ?? 0) +
          (((position[node] ?? 0) + (position[mate[node] ?? 0] ?? 0)) / 2 + 0.5) / size
        rows[c] = (rows[c] ?? 0) + 1
        continue
      }
      const a = lists.start[node] ?? 0
      const b = lists.start[node + 1] ?? 0
      if (a === b) continue
      const mine = owner[node] ?? -1
      if (mine < 0) continue
      for (let k = a; k < b; k++) {
        const other = ends[lists.items[k] ?? 0] ?? 0
        let x = mine
        let y = owner[other] ?? -1
        const value = this.#norm(other)
        while (depthOf(x) > depthOf(y)) {
          sum[x] = (sum[x] ?? 0) + value
          weight[x] = (weight[x] ?? 0) + 1
          x = parent[x] ?? -1
        }
        while (depthOf(y) > depthOf(x)) y = parent[y] ?? -1
        while (x !== y) {
          sum[x] = (sum[x] ?? 0) + value
          weight[x] = (weight[x] ?? 0) + 1
          x = parent[x] ?? -1
          y = parent[y] ?? -1
        }
      }
    }
    for (let at = from; at < to; at++) {
      const node = order[at] ?? 0
      if (side[node] !== opening) continue
      const c = owner[node] ?? 0
      const w = weight[c] ?? 0
      const here = (center[c] ?? 0) / Math.max(1, rows[c] ?? 0)
      this.key[c] = w > 0 ? ((sum[c] ?? 0) / w + here) / 2 : here
    }
  }

  #nodeKey(node: number): number {
    if (this.#own) return this.#norm(node)
    const graph = this.#graph
    const lists = this.#downward ? graph.up : graph.down
    const a = lists.start[node] ?? 0
    const b = lists.start[node + 1] ?? 0
    if (a === b) return this.#norm(node)
    const ends = this.#downward ? graph.upper : graph.lower
    let sum = 0
    for (let k = a; k < b; k++) sum += graph.position[ends[lists.items[k] ?? 0] ?? 0] ?? 0
    const near = this.#slot + (this.#downward ? -1 : 1)
    const size = (graph.slots[near + 1] ?? 0) - (graph.slots[near] ?? 0)
    return (sum / (b - a) + 0.5) / size
  }

  sort(slot: number, downward: boolean, own: boolean): void {
    this.#slot = slot
    this.#downward = downward
    this.#own = own
    const { slots } = this.#graph
    this.#scope(slots[slot] ?? 0, slots[slot + 1] ?? 0)
  }

  #scope(from: number, to: number): void {
    if (to - from < 2) {
      this.#nested(from, to)
      return
    }
    const graph = this.#graph
    const { order, position } = graph
    const { owner, side, mate } = this.#nest
    const start = graph.slots[this.#slot] ?? 0
    const packed = this.#packed
    const begin = this.#from
    const end = this.#to
    const span = this.#span
    const scale = this.#scale
    let size = 0
    for (let at = from; at < to; ) {
      const node = order[at] ?? 0
      let next = at + 1
      let key: number
      if (side[node] === opening) {
        next = start + (position[mate[node] ?? 0] ?? 0) + 1
        key = this.key[owner[node] ?? 0] ?? 0
      } else {
        key = this.#nodeKey(node)
      }
      begin[size] = at
      end[size] = next
      packed[size] = Math.floor(Math.min(1, Math.max(0, key)) * scale) * span + size
      size++
      at = next
    }
    if (size > 1) {
      packed.subarray(0, size).sort()
      const scratch = this.#scratch
      let write = 0
      for (let k = 0; k < size; k++) {
        const item = (packed[k] ?? 0) % span
        for (let at = begin[item] ?? 0; at < (end[item] ?? 0); at++) {
          scratch[write++] = order[at] ?? 0
        }
      }
      for (let k = 0; k < write; k++) {
        const node = scratch[k] ?? 0
        order[from + k] = node
        position[node] = from + k - start
      }
    }
    this.#nested(from, to)
  }

  #nested(from: number, to: number): void {
    const graph = this.#graph
    const { order, position } = graph
    const { side, mate } = this.#nest
    const start = graph.slots[this.#slot] ?? 0
    for (let at = from; at < to; at++) {
      const node = order[at] ?? 0
      if (side[node] !== opening) continue
      const close = start + (position[mate[node] ?? 0] ?? 0)
      this.#scope(at + 1, close)
      at = close
    }
  }
}

export function orderNested(graph: Layered, nest: Nesting): void {
  const { slots, order, position, slotOf, componentSlots } = graph
  let widest = 0
  for (let slot = 0; slot + 1 < slots.length; slot++) {
    widest = Math.max(widest, (slots[slot + 1] ?? 0) - (slots[slot] ?? 0))
  }
  const tree = new Int32Array(widest + 1)
  const best = new Int32Array(order.length)
  const sorter = new NestedSort(graph, nest, widest)
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
      const downward = sweep % 2 === 0
      sorter.keys(from, to, downward)
      if (downward) {
        sorter.sort(first, true, true)
        for (let slot = first + 1; slot < last; slot++) sorter.sort(slot, true, false)
      } else {
        sorter.sort(last - 1, false, true)
        for (let slot = last - 2; slot >= first; slot--) sorter.sort(slot, false, false)
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
