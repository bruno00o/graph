import type { EdgeColumns } from './columns'
import { laneBend } from './edge-curve'
import type { IndexSet } from './index-set'

const empty = -1
const removed = -2

function hash(low: number, high: number): number {
  let h = Math.imul(low, 0x9e3779b1) ^ Math.imul(high + 0x7f4a7c15, 0x85ebca77)
  h ^= h >>> 15
  return Math.imul(h, 0x2c1b3c6d) ^ (h >>> 12)
}

function grown(array: Int32Array, length: number): Int32Array<ArrayBuffer> {
  const next = new Int32Array(length).fill(-1)
  next.set(array)
  return next
}

export interface EdgeLanes {
  reserve(count: number): void
  link(index: number, source: number, target: number): void
  unlink(index: number): void
  write(edges: EdgeColumns, dirty: IndexSet): void
}

export function createEdgeLanes(): EdgeLanes {
  let mask = -1
  let lows = new Uint32Array(0)
  let highs = new Uint32Array(0)
  let heads = new Int32Array(0)
  let tails = new Int32Array(0)
  let counts = new Int32Array(0)
  let stamps = new Uint32Array(0)
  let used = 0
  let live = 0
  let generation = 0
  let slots = new Int32Array(0)
  let nexts = new Int32Array(0)
  let prevs = new Int32Array(0)
  let touched: number[] = []

  function reserveIndex(index: number): void {
    if (index < slots.length) return
    const length = Math.max(64, slots.length * 2, index + 1)
    slots = grown(slots, length)
    nexts = grown(nexts, length)
    prevs = grown(prevs, length)
  }

  function locate(low: number, high: number): number {
    let slot = hash(low, high) & mask
    let free = -1
    for (;;) {
      const head = heads[slot] ?? empty
      if (head === empty) return -(free >= 0 ? free : slot) - 1
      if (head === removed) {
        if (free < 0) free = slot
      } else if (lows[slot] === low && highs[slot] === high) {
        return slot
      }
      slot = (slot + 1) & mask
    }
  }

  function resize(minimum: number): void {
    let capacity = 16
    while (capacity < minimum) capacity *= 2
    const oldLows = lows
    const oldHighs = highs
    const oldHeads = heads
    const oldTails = tails
    const oldCounts = counts
    mask = capacity - 1
    lows = new Uint32Array(capacity)
    highs = new Uint32Array(capacity)
    heads = new Int32Array(capacity).fill(empty)
    tails = new Int32Array(capacity).fill(-1)
    counts = new Int32Array(capacity)
    stamps = new Uint32Array(capacity)
    generation = 0
    used = 0
    live = 0
    for (let old = 0; old < oldHeads.length; old++) {
      const first = oldHeads[old] ?? empty
      if (first < 0) continue
      const low = oldLows[old] ?? 0
      const high = oldHighs[old] ?? 0
      const slot = -locate(low, high) - 1
      lows[slot] = low
      highs[slot] = high
      heads[slot] = first
      tails[slot] = oldTails[old] ?? -1
      counts[slot] = oldCounts[old] ?? 0
      used++
      live++
      for (let at = first; at >= 0; at = nexts[at] ?? -1) slots[at] = slot
    }
  }

  function unlink(index: number): void {
    const slot = slots[index] ?? -1
    if (slot < 0) return
    const prev = prevs[index] ?? -1
    const next = nexts[index] ?? -1
    if (prev >= 0) nexts[prev] = next
    else heads[slot] = next
    if (next >= 0) prevs[next] = prev
    else tails[slot] = prev
    slots[index] = -1
    const count = (counts[slot] ?? 1) - 1
    counts[slot] = count
    if (count === 0) {
      heads[slot] = removed
      live--
    } else {
      touched.push(heads[slot] ?? -1)
    }
  }

  function reservePairs(count: number): void {
    if ((used + count) * 2 > mask + 1) resize(Math.max(16, (live + count) * 2))
  }

  function link(index: number, source: number, target: number): void {
    reserveIndex(index)
    const low = Math.min(source, target)
    const high = Math.max(source, target)
    const current = slots[index] ?? -1
    if (current >= 0) {
      if (lows[current] === low && highs[current] === high) return
      unlink(index)
    }
    reservePairs(1)
    const found = locate(low, high)
    prevs[index] = -1
    nexts[index] = -1
    if (found >= 0) {
      const tail = tails[found] ?? -1
      nexts[tail] = index
      prevs[index] = tail
      tails[found] = index
      counts[found] = (counts[found] ?? 0) + 1
      slots[index] = found
    } else {
      const slot = -found - 1
      if (heads[slot] === empty) used++
      live++
      lows[slot] = low
      highs[slot] = high
      heads[slot] = index
      tails[slot] = index
      counts[slot] = 1
      slots[index] = slot
    }
    touched.push(index)
  }

  function write(edges: EdgeColumns, dirty: IndexSet): void {
    if (touched.length === 0) return
    generation = (generation + 1) >>> 0
    if (generation === 0) {
      stamps.fill(0)
      generation = 1
    }
    const bends = edges.bend
    for (const edge of touched) {
      const slot = edge >= 0 ? (slots[edge] ?? -1) : -1
      if (slot < 0 || stamps[slot] === generation) continue
      stamps[slot] = generation
      const count = counts[slot] ?? 0
      const loop = lows[slot] === highs[slot]
      if (count === 1 && !loop) {
        const only = heads[slot] ?? 0
        if (bends[only] !== 0) {
          bends[only] = 0
          dirty.add(only)
        }
        continue
      }
      let position = 0
      for (let at = heads[slot] ?? -1; at >= 0; at = nexts[at] ?? -1) {
        const source = edges.source[at] ?? 0
        const target = edges.target[at] ?? 0
        const bend = loop
          ? position
          : Math.fround(laneBend(position, count) * (source < target ? 1 : -1)) || 0
        if (bends[at] !== bend) {
          bends[at] = bend
          dirty.add(at)
        }
        position++
      }
    }
    touched = []
  }

  return { reserve: reservePairs, link, unlink, write }
}
