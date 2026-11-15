const digit = 1 << 16
const small = 64
const scratch = new Float64Array(1)
const scratchWords = new Uint32Array(scratch.buffer)
let counts: Uint32Array | null = null

function comparatorOrder(times: Float64Array, ids: Int32Array): Int32Array {
  const list = Array.from(ids)
  list.sort((a, b) => (times[a] ?? 0) - (times[b] ?? 0) || a - b)
  return Int32Array.from(list)
}

export function orderByTime(times: Float64Array, ids: Int32Array): Int32Array {
  const count = ids.length
  if (count <= small) return comparatorOrder(times, ids)
  const hi = new Uint32Array(count)
  const lo = new Uint32Array(count)
  for (let at = 0; at < count; at++) {
    scratch[0] = times[ids[at] ?? 0] ?? 0
    const low = scratchWords[0] ?? 0
    const high = scratchWords[1] ?? 0
    if ((high & 0x80000000) !== 0) {
      hi[at] = ~high >>> 0
      lo[at] = ~low >>> 0
    } else {
      hi[at] = (high | 0x80000000) >>> 0
      lo[at] = low
    }
  }
  counts ??= new Uint32Array(digit * 4)
  const histogram = counts
  histogram.fill(0)
  for (let at = 0; at < count; at++) {
    const low = lo[at] ?? 0
    const high = hi[at] ?? 0
    histogram[low & 0xffff] = (histogram[low & 0xffff] ?? 0) + 1
    histogram[digit + (low >>> 16)] = (histogram[digit + (low >>> 16)] ?? 0) + 1
    histogram[2 * digit + (high & 0xffff)] = (histogram[2 * digit + (high & 0xffff)] ?? 0) + 1
    histogram[3 * digit + (high >>> 16)] = (histogram[3 * digit + (high >>> 16)] ?? 0) + 1
  }
  let order = new Uint32Array(count)
  let next = new Uint32Array(count)
  for (let at = 0; at < count; at++) order[at] = at
  for (let pass = 0; pass < 4; pass++) {
    const base = pass * digit
    const words = pass < 2 ? lo : hi
    const shift = pass % 2 === 0 ? 0 : 16
    const first = words[0] ?? 0
    if ((histogram[base + ((first >>> shift) & 0xffff)] ?? 0) === count) continue
    let sum = 0
    for (let d = base; d < base + digit; d++) {
      const c = histogram[d] ?? 0
      histogram[d] = sum
      sum += c
    }
    for (let at = 0; at < count; at++) {
      const position = order[at] ?? 0
      const bucket = base + (((words[position] ?? 0) >>> shift) & 0xffff)
      const place = histogram[bucket] ?? 0
      histogram[bucket] = place + 1
      next[place] = position
    }
    const swap = order
    order = next
    next = swap
  }
  const sorted = new Int32Array(count)
  for (let at = 0; at < count; at++) sorted[at] = ids[order[at] ?? 0] ?? 0
  return sorted
}
