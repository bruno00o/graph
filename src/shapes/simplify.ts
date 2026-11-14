export const detailedFrom = 256
const coarsest = 64
const reduction = 4

let heap = new Int32Array(64)
let place = new Int32Array(64)
let before = new Int32Array(64)
let after = new Int32Array(64)

function reserve(size: number): void {
  if (heap.length >= size) return
  const length = Math.max(size, heap.length * 2)
  heap = new Int32Array(length)
  place = new Int32Array(length)
  before = new Int32Array(length)
  after = new Int32Array(length)
}

function triangle(points: Float64Array, a: number, b: number, c: number): number {
  const ax = points[a * 2] ?? 0
  const ay = points[a * 2 + 1] ?? 0
  return (
    Math.abs(
      ((points[b * 2] ?? 0) - ax) * ((points[c * 2 + 1] ?? 0) - ay) -
        ((points[c * 2] ?? 0) - ax) * ((points[b * 2 + 1] ?? 0) - ay),
    ) / 2
  )
}

function less(areas: Float64Array, a: number, b: number): boolean {
  const x = areas[a] ?? 0
  const y = areas[b] ?? 0
  return x < y || (x === y && a < b)
}

function swap(i: number, j: number): void {
  const a = heap[i] ?? 0
  const b = heap[j] ?? 0
  heap[i] = b
  heap[j] = a
  place[b] = i
  place[a] = j
}

function up(areas: Float64Array, i: number): void {
  let at = i
  while (at > 0) {
    const parent = (at - 1) >> 1
    if (!less(areas, heap[at] ?? 0, heap[parent] ?? 0)) return
    swap(at, parent)
    at = parent
  }
}

function down(areas: Float64Array, i: number, size: number): void {
  let at = i
  for (;;) {
    const left = at * 2 + 1
    if (left >= size) return
    const right = left + 1
    const child = right < size && less(areas, heap[right] ?? 0, heap[left] ?? 0) ? right : left
    if (!less(areas, heap[child] ?? 0, heap[at] ?? 0)) return
    swap(at, child)
    at = child
  }
}

function refresh(
  points: Float64Array,
  areas: Float64Array,
  n: number,
  floor: number,
  size: number,
) {
  const at = place[n] ?? -1
  if (at < 0) return
  const was = areas[n] ?? 0
  const next = Math.max(triangle(points, before[n] ?? 0, n, after[n] ?? 0), floor)
  areas[n] = next
  if (next < was) up(areas, at)
  else down(areas, at, size)
}

function eliminate(
  points: Float64Array,
  areas: Float64Array,
  steps: Int32Array | null,
  start: number,
  end: number,
  closed: boolean,
): void {
  const count = end - start
  const keep = closed ? 3 : 2
  for (let k = start; k < end; k++) areas[k] = Number.POSITIVE_INFINITY
  if (count <= keep) return
  for (let k = start; k < end; k++) {
    before[k] = k > start ? k - 1 : closed ? end - 1 : -1
    after[k] = k < end - 1 ? k + 1 : closed ? start : -1
  }
  let size = 0
  for (let k = start; k < end; k++) {
    const a = before[k] ?? -1
    const c = after[k] ?? -1
    if (a < 0 || c < 0) {
      place[k] = -1
      continue
    }
    areas[k] = triangle(points, a, k, c)
    heap[size] = k
    place[k] = size
    up(areas, size)
    size++
  }
  let left = count
  let floor = 0
  while (left > keep && size > 0) {
    const k = heap[0] ?? 0
    size--
    if (size > 0) {
      swap(0, size)
      down(areas, 0, size)
    }
    place[k] = -1
    floor = Math.max(floor, areas[k] ?? 0)
    areas[k] = floor
    if (steps) steps[k] = count - left
    const a = before[k] ?? -1
    const c = after[k] ?? -1
    after[a] = c
    before[c] = a
    left--
    refresh(points, areas, a, floor, size)
    refresh(points, areas, c, floor, size)
  }
  while (size > 0) {
    size--
    const k = heap[size] ?? 0
    place[k] = -1
    areas[k] = Number.POSITIVE_INFINITY
  }
}

export function effectiveAreas(
  points: Float64Array,
  rings: Uint32Array,
  closed: boolean,
  steps: Int32Array | null = null,
): Float64Array {
  const count = points.length / 2
  const areas = new Float64Array(count)
  reserve(count)
  let start = 0
  for (const end of rings) {
    eliminate(points, areas, steps, start, end, closed)
    start = end
  }
  return areas
}

function distance(points: Float64Array, k: number, a: number, b: number): number {
  const ax = points[a * 2] ?? 0
  const ay = points[a * 2 + 1] ?? 0
  const dx = (points[b * 2] ?? 0) - ax
  const dy = (points[b * 2 + 1] ?? 0) - ay
  const px = (points[k * 2] ?? 0) - ax
  const py = (points[k * 2 + 1] ?? 0) - ay
  const length = dx * dx + dy * dy
  const t = length > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / length)) : 0
  return Math.hypot(px - t * dx, py - t * dy)
}

function ringError(
  points: Float64Array,
  kept: readonly number[],
  first: number,
  last: number,
  start: number,
  end: number,
  closed: boolean,
): number {
  let worst = 0
  for (let j = first; j < last; j++) {
    const a = kept[j] ?? 0
    const wrap = j + 1 === last
    if (wrap && !closed) break
    const b = wrap ? (kept[first] ?? 0) : (kept[j + 1] ?? 0)
    let k = a + 1
    for (;;) {
      if (k === end) {
        if (!closed) break
        k = start
      }
      if (k === b) break
      worst = Math.max(worst, distance(points, k, a, b))
      k++
    }
  }
  return worst
}

export interface Simplified {
  readonly area: number
  readonly error: number
  readonly points: Float64Array
  readonly rings: Uint32Array
  readonly kept: Uint32Array
}

export function simplifiedLevels(
  points: Float64Array,
  rings: Uint32Array,
  closed: boolean,
): Simplified[] {
  const count = points.length / 2
  if (count < detailedFrom) return []
  const steps = new Int32Array(count)
  const areas = effectiveAreas(points, rings, closed, steps)
  const order: number[] = []
  for (let k = 0; k < count; k++) if (Number.isFinite(areas[k])) order.push(k)
  order.sort((a, b) => (areas[a] ?? 0) - (areas[b] ?? 0) || (steps[a] ?? 0) - (steps[b] ?? 0))
  const rank = new Int32Array(count).fill(count)
  order.forEach((k, at) => {
    rank[k] = at
  })
  const fixed = count - order.length
  const levels: Simplified[] = []
  let target = count
  for (;;) {
    target = Math.floor(target / reduction)
    if (target < Math.max(coarsest, fixed)) break
    const removed = count - target
    const area = areas[order[removed - 1] ?? 0] ?? 0
    const kept: number[] = []
    const ends: number[] = []
    let start = 0
    let error = 0
    for (const end of rings) {
      const first = kept.length
      for (let k = start; k < end; k++) if ((rank[k] ?? 0) >= removed) kept.push(k)
      error = Math.max(error, ringError(points, kept, first, kept.length, start, end, closed))
      ends.push(kept.length)
      start = end
    }
    if (kept.length >= count) break
    const xy = new Float64Array(kept.length * 2)
    kept.forEach((k, at) => {
      xy[at * 2] = points[k * 2] ?? 0
      xy[at * 2 + 1] = points[k * 2 + 1] ?? 0
    })
    levels.push({
      area,
      error,
      points: xy,
      rings: Uint32Array.from(ends),
      kept: Uint32Array.from(kept),
    })
  }
  return levels
}
