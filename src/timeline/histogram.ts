import type { EdgeColumns, NodeColumns } from '../core/columns'

const never = Number.NaN
const mergeRatio = 8

function lowerBound(values: Float64Array, value: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((values[middle] ?? 0) < value) low = middle + 1
    else high = middle
  }
  return low
}

function upperBound(values: Float64Array, value: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((values[middle] ?? 0) <= value) low = middle + 1
    else high = middle
  }
  return low
}

function same(a: number, b: number): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b))
}

function sorted(values: number[]): Float64Array {
  return Float64Array.from(values).sort()
}

export function mergeSorted(
  base: Float64Array,
  removed: Float64Array,
  added: Float64Array,
): Float64Array {
  const result = new Float64Array(base.length - removed.length + added.length)
  let at = 0
  let skip = 0
  let take = 0
  for (let index = 0; index < base.length; index++) {
    const value = base[index] ?? 0
    if (skip < removed.length && removed[skip] === value) {
      skip++
      continue
    }
    while (take < added.length && (added[take] ?? 0) < value) result[at++] = added[take++] ?? 0
    result[at++] = value
  }
  while (take < added.length) result[at++] = added[take++] ?? 0
  return at === result.length ? result : result.subarray(0, at)
}

interface Changes {
  starts: number[]
  ends: number[]
  instants: number[]
}

function emptyChanges(): Changes {
  return { starts: [], ends: [], instants: [] }
}

function note(changes: Changes, start: number, end: number): void {
  if (Number.isNaN(start)) return
  changes.starts.push(start)
  if (start === end) changes.instants.push(start)
  else changes.ends.push(end)
}

export class SpanCounts {
  starts: Float64Array = new Float64Array(0)
  ends: Float64Array = new Float64Array(0)
  instants: Float64Array = new Float64Array(0)
  #start: Float64Array = new Float64Array(0)
  #end: Float64Array = new Float64Array(0)

  get size(): number {
    return this.starts.length
  }

  count(from: number, to: number): number {
    return (
      lowerBound(this.starts, to) - upperBound(this.ends, from) - lowerBound(this.instants, from)
    )
  }

  update(capacity: number, read: (index: number, out: Float64Array) => void): boolean {
    if (this.#start.length < capacity) {
      const start = new Float64Array(capacity).fill(never)
      start.set(this.#start)
      const end = new Float64Array(capacity).fill(never)
      end.set(this.#end)
      this.#start = start
      this.#end = end
    }
    const span = new Float64Array(2)
    const removed = emptyChanges()
    const added = emptyChanges()
    let changed = 0
    for (let index = 0; index < this.#start.length; index++) {
      if (index < capacity) read(index, span)
      else span[0] = span[1] = never
      const start = span[0] ?? never
      const end = span[1] ?? never
      const oldStart = this.#start[index] ?? never
      const oldEnd = this.#end[index] ?? never
      if (same(start, oldStart) && same(end, oldEnd)) continue
      changed++
      note(removed, oldStart, oldEnd)
      note(added, start, end)
      this.#start[index] = start
      this.#end[index] = end
    }
    if (changed === 0) return false
    if (changed * mergeRatio < this.starts.length) {
      this.starts = mergeSorted(this.starts, sorted(removed.starts), sorted(added.starts))
      this.ends = mergeSorted(this.ends, sorted(removed.ends), sorted(added.ends))
      this.instants = mergeSorted(this.instants, sorted(removed.instants), sorted(added.instants))
      return true
    }
    this.#rebuild()
    return true
  }

  #rebuild(): void {
    let starts = 0
    let instants = 0
    for (let index = 0; index < this.#start.length; index++) {
      const start = this.#start[index] ?? never
      if (Number.isNaN(start)) continue
      starts++
      if (start === this.#end[index]) instants++
    }
    const startList = new Float64Array(starts)
    const endList = new Float64Array(starts - instants)
    const instantList = new Float64Array(instants)
    let s = 0
    let e = 0
    let i = 0
    for (let index = 0; index < this.#start.length; index++) {
      const start = this.#start[index] ?? never
      if (Number.isNaN(start)) continue
      const end = this.#end[index] ?? never
      startList[s++] = start
      if (start === end) instantList[i++] = start
      else endList[e++] = end
    }
    this.starts = startList.sort()
    this.ends = endList.sort()
    this.instants = instantList.sort()
  }

  first(): number {
    let first = Number.POSITIVE_INFINITY
    for (const values of [this.starts, this.ends, this.instants]) {
      const at = upperBound(values, Number.NEGATIVE_INFINITY)
      if (at < values.length) first = Math.min(first, values[at] ?? first)
    }
    return first
  }

  last(): number {
    let last = Number.NEGATIVE_INFINITY
    const ends = this.ends
    const finiteEnds = lowerBound(ends, Number.POSITIVE_INFINITY)
    if (finiteEnds > 0) last = Math.max(last, ends[finiteEnds - 1] ?? last)
    for (const values of [this.starts, this.instants]) {
      const finite = lowerBound(values, Number.POSITIVE_INFINITY)
      if (finite > 0) last = Math.max(last, (values[finite - 1] ?? last) + 1)
    }
    return last
  }
}

function timed(columns: NodeColumns | EdgeColumns): boolean {
  return columns.time.count > 0
}

export function readNodeSpan(nodes: NodeColumns, index: number, out: Float64Array): void {
  if (nodes.alive[index] !== 1 || !timed(nodes) || !nodes.time.timed(index)) {
    out[0] = out[1] = never
    return
  }
  out[0] = nodes.time.start[index] ?? never
  out[1] = nodes.time.end[index] ?? never
}

export function readEdgeSpan(
  nodes: NodeColumns,
  edges: EdgeColumns,
  index: number,
  out: Float64Array,
): void {
  out[0] = out[1] = never
  if (edges.alive[index] !== 1) return
  const nodeTimes = nodes.time
  const edgeTimes = edges.time
  if (nodeTimes.count === 0 && edgeTimes.count === 0) return
  const source = edges.source[index] ?? 0
  const target = edges.target[index] ?? 0
  const own = edgeTimes.count > 0 && edgeTimes.timed(index)
  const fromSource = nodeTimes.count > 0 && nodeTimes.timed(source)
  const fromTarget = nodeTimes.count > 0 && nodeTimes.timed(target)
  if (!own && !fromSource && !fromTarget) return
  let start = own ? (edgeTimes.start[index] ?? 0) : Number.NEGATIVE_INFINITY
  let end = own ? (edgeTimes.end[index] ?? 0) : Number.POSITIVE_INFINITY
  if (fromSource) {
    start = Math.max(start, nodeTimes.start[source] ?? start)
    end = Math.min(end, nodeTimes.end[source] ?? end)
  }
  if (fromTarget) {
    start = Math.max(start, nodeTimes.start[target] ?? start)
    end = Math.min(end, nodeTimes.end[target] ?? end)
  }
  if (end < start) return
  out[0] = start
  out[1] = end
}
