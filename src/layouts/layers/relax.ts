import type { Layered } from './structure'

const sweeps = 16
const realWeight = 1
const mixedWeight = 2
const virtualWeight = 8

export function relaxNodes(graph: Layered, spacing: number): Float64Array {
  const { count, slots, order, half, real, up, down, upper, lower, componentSlots } = graph
  const x = new Float64Array(count)
  const offset = new Float64Array(count)
  const target = new Float64Array(count)
  const weight = new Float64Array(count)
  const pooled = new Float64Array(count)
  const mass = new Float64Array(count)
  const size = new Int32Array(count)
  const gap = (node: number) => (node < real ? spacing : spacing / 2)
  const pull = (a: number, b: number) =>
    a < real ? (b < real ? realWeight : mixedWeight) : b < real ? mixedWeight : virtualWeight
  for (let slot = 0; slot + 1 < slots.length; slot++) {
    const from = slots[slot] ?? 0
    const to = slots[slot + 1] ?? 0
    let reach = 0
    for (let at = from; at < to; at++) {
      const node = order[at] ?? 0
      if (at > from) {
        const previous = order[at - 1] ?? 0
        reach += (half[previous] ?? 0) + (half[node] ?? 0) + (gap(previous) + gap(node)) / 2
      }
      offset[node] = reach
    }
    for (let at = from; at < to; at++) {
      const node = order[at] ?? 0
      x[node] = (offset[node] ?? 0) - reach / 2
    }
  }
  const settle = (slot: number) => {
    const from = slots[slot] ?? 0
    const to = slots[slot + 1] ?? 0
    for (let at = from; at < to; at++) {
      const node = order[at] ?? 0
      let sum = 0
      let total = 0
      for (let k = up.start[node] ?? 0; k < (up.start[node + 1] ?? 0); k++) {
        const other = upper[up.items[k] ?? 0] ?? 0
        const w = pull(node, other)
        sum += w * (x[other] ?? 0)
        total += w
      }
      for (let k = down.start[node] ?? 0; k < (down.start[node + 1] ?? 0); k++) {
        const other = lower[down.items[k] ?? 0] ?? 0
        const w = pull(node, other)
        sum += w * (x[other] ?? 0)
        total += w
      }
      target[at - from] = (total > 0 ? sum / total : (x[node] ?? 0)) - (offset[node] ?? 0)
      weight[at - from] = total > 0 ? total : 1e-9
    }
    let blocks = 0
    for (let i = 0; i < to - from; i++) {
      let value = target[i] ?? 0
      let w = weight[i] ?? 0
      let n = 1
      while (blocks > 0 && (pooled[blocks - 1] ?? 0) >= value) {
        const before = mass[blocks - 1] ?? 0
        value = ((pooled[blocks - 1] ?? 0) * before + value * w) / (before + w)
        w += before
        n += size[blocks - 1] ?? 0
        blocks--
      }
      pooled[blocks] = value
      mass[blocks] = w
      size[blocks] = n
      blocks++
    }
    let at = from
    for (let b = 0; b < blocks; b++) {
      for (let k = 0; k < (size[b] ?? 0); k++) {
        const node = order[at++] ?? 0
        x[node] = (pooled[b] ?? 0) + (offset[node] ?? 0)
      }
    }
  }
  for (let c = 0; c + 1 < componentSlots.length; c++) {
    const first = componentSlots[c] ?? 0
    const last = componentSlots[c + 1] ?? 0
    if (last - first < 2) continue
    for (let sweep = 0; sweep < sweeps; sweep++) {
      if (sweep % 2 === 0) for (let slot = first; slot < last; slot++) settle(slot)
      else for (let slot = last - 1; slot >= first; slot--) settle(slot)
    }
  }
  return x
}
