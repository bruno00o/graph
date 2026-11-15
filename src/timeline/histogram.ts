import type { EdgeColumns, NodeColumns } from '../core/columns'
import { allTime, intersectThree } from '../core/periods'
import { orderByTime } from '../history/order'

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

export type SpanReader = (index: number, out: Float64Array) => Float64Array | null

class Pass {
  readonly span: Float64Array = new Float64Array(2)
  readonly removed: Changes = emptyChanges()
  readonly added: Changes = emptyChanges()
  changed = 0
  gaps = false
}

function note(changes: Changes, start: number, end: number): void {
  if (Number.isNaN(start)) return
  changes.starts.push(start)
  if (start === end) changes.instants.push(start)
  else changes.ends.push(end)
}

function noteAll(changes: Changes, list: Float64Array): void {
  for (let at = 0; at + 1 < list.length; at += 2) note(changes, list[at] ?? 0, list[at + 1] ?? 0)
}

function sameList(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false
  for (let at = 0; at < a.length; at++) if (!Object.is(a[at], b[at])) return false
  return true
}

const bits = new Float64Array(1)
const words = new BigInt64Array(bits.buffer)

function nextUp(value: number): number {
  if (value === 0) return Number.MIN_VALUE
  bits[0] = value
  words[0] = (words[0] ?? 0n) + (value > 0 ? 1n : -1n)
  return bits[0] ?? value
}

export class SpanCounts {
  starts: Float64Array = new Float64Array(0)
  ends: Float64Array = new Float64Array(0)
  instants: Float64Array = new Float64Array(0)
  gapStarts: Float64Array = new Float64Array(0)
  gapEnds: Float64Array = new Float64Array(0)
  #start: Float64Array = new Float64Array(0)
  #end: Float64Array = new Float64Array(0)
  #lists: (Float64Array | null)[] = []
  #listCount = 0

  get size(): number {
    return this.starts.length
  }

  count(from: number, to: number): number {
    const periods =
      lowerBound(this.starts, to) - upperBound(this.ends, from) - lowerBound(this.instants, from)
    if (this.gapStarts.length === 0) return periods
    let inside = 0
    const last = lowerBound(this.gapStarts, to)
    for (let at = upperBound(this.gapStarts, from); at < last; at++) {
      if ((this.gapEnds[at] ?? 0) < to) inside++
    }
    return periods - inside
  }

  update(capacity: number, read: SpanReader): boolean {
    this.#reserve(capacity)
    const pass = new Pass()
    for (let index = 0; index < this.#start.length; index++)
      this.#visit(index, capacity, read, pass)
    return this.#finish(pass)
  }

  patch(capacity: number, indices: Iterable<number>, read: SpanReader): boolean {
    this.#reserve(capacity)
    const pass = new Pass()
    for (const index of indices) {
      if (index < this.#start.length) this.#visit(index, capacity, read, pass)
    }
    return this.#finish(pass)
  }

  #reserve(capacity: number): void {
    if (this.#start.length >= capacity) return
    const start = new Float64Array(capacity).fill(never)
    start.set(this.#start)
    const end = new Float64Array(capacity).fill(never)
    end.set(this.#end)
    this.#start = start
    this.#end = end
  }

  #visit(index: number, capacity: number, read: SpanReader, pass: Pass): void {
    const span = pass.span
    let list: Float64Array | null = null
    if (index < capacity) list = read(index, span)
    else span[0] = span[1] = never
    const old = this.#listCount > 0 ? (this.#lists[index] ?? null) : null
    if (list) {
      if (old && sameList(old, list)) return
      pass.changed++
      pass.gaps = true
      if (old) noteAll(pass.removed, old)
      else {
        note(pass.removed, this.#start[index] ?? never, this.#end[index] ?? never)
        this.#listCount++
      }
      noteAll(pass.added, list)
      this.#lists[index] = list
      this.#start[index] = this.#end[index] = never
      return
    }
    const start = span[0] ?? never
    const end = span[1] ?? never
    if (!old) {
      const oldStart = this.#start[index] ?? never
      const oldEnd = this.#end[index] ?? never
      if (same(start, oldStart) && same(end, oldEnd)) return
      note(pass.removed, oldStart, oldEnd)
    } else {
      noteAll(pass.removed, old)
      this.#lists[index] = null
      this.#listCount--
      pass.gaps = true
    }
    pass.changed++
    note(pass.added, start, end)
    this.#start[index] = start
    this.#end[index] = end
  }

  #finish(pass: Pass): boolean {
    if (pass.changed === 0) return false
    if (pass.gaps) this.#gather()
    if (pass.changed * mergeRatio < this.starts.length) {
      const { removed, added } = pass
      this.starts = mergeSorted(this.starts, sorted(removed.starts), sorted(added.starts))
      this.ends = mergeSorted(this.ends, sorted(removed.ends), sorted(added.ends))
      this.instants = mergeSorted(this.instants, sorted(removed.instants), sorted(added.instants))
      return true
    }
    this.#rebuild()
    return true
  }

  #gather(): void {
    const lists = this.#lists
    let size = 0
    if (this.#listCount > 0) {
      for (let index = 0; index < lists.length; index++) {
        const list = lists[index]
        if (list) size += (list.length - 2) / 2
      }
    }
    const starts = new Float64Array(size)
    const ends = new Float64Array(size)
    let at = 0
    for (let index = 0; size > 0 && index < lists.length; index++) {
      const list = lists[index]
      if (!list) continue
      for (let bound = 2; bound + 1 < list.length; bound += 2) {
        const before = list[bound - 1] ?? 0
        starts[at] = before === list[bound - 2] ? nextUp(before) : before
        ends[at] = list[bound] ?? 0
        at++
      }
    }
    const ids = new Int32Array(size)
    for (let gap = 0; gap < size; gap++) ids[gap] = gap
    const order = orderByTime(starts, ids)
    const sortedStarts = new Float64Array(size)
    const sortedEnds = new Float64Array(size)
    for (let at = 0; at < size; at++) {
      const gap = order[at] ?? 0
      sortedStarts[at] = starts[gap] ?? 0
      sortedEnds[at] = ends[gap] ?? 0
    }
    this.gapStarts = sortedStarts
    this.gapEnds = sortedEnds
  }

  #rebuild(): void {
    const lists = this.#lists
    const startOf = this.#start
    const endOf = this.#end
    const listed = this.#listCount > 0
    let starts = 0
    let instants = 0
    for (let index = 0; index < startOf.length; index++) {
      const start = startOf[index] ?? never
      if (!Number.isNaN(start)) {
        starts++
        if (start === endOf[index]) instants++
        continue
      }
      const list = listed ? lists[index] : null
      if (!list) continue
      for (let at = 0; at + 1 < list.length; at += 2) {
        starts++
        if (list[at] === list[at + 1]) instants++
      }
    }
    const startList = new Float64Array(starts)
    const endList = new Float64Array(starts - instants)
    const instantList = new Float64Array(instants)
    let s = 0
    let e = 0
    let i = 0
    for (let index = 0; index < startOf.length; index++) {
      const start = startOf[index] ?? never
      if (!Number.isNaN(start)) {
        startList[s++] = start
        const end = endOf[index] ?? never
        if (start === end) instantList[i++] = start
        else endList[e++] = end
        continue
      }
      const list = listed ? lists[index] : null
      if (!list) continue
      for (let at = 0; at + 1 < list.length; at += 2) {
        const first = list[at] ?? 0
        const last = list[at + 1] ?? 0
        startList[s++] = first
        if (first === last) instantList[i++] = first
        else endList[e++] = last
      }
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

export function readNodeSpan(
  nodes: NodeColumns,
  index: number,
  out: Float64Array,
): Float64Array | null {
  out[0] = out[1] = never
  if (nodes.alive[index] !== 1 || !timed(nodes) || !nodes.time.timed(index)) return null
  const list = nodes.time.list(index)
  if (list) return list
  const start = nodes.time.start[index] ?? never
  if (start === Number.POSITIVE_INFINITY) return null
  out[0] = start
  out[1] = nodes.time.end[index] ?? never
  return null
}

export function incidentEdges(
  nodes: Uint32Array,
  nodeCapacity: number,
  edges: EdgeColumns,
): Uint32Array {
  if (nodes.length === 0) return new Uint32Array(0)
  const changed = new Uint8Array(nodeCapacity)
  for (const index of nodes) changed[index] = 1
  const found: number[] = []
  const { alive, source, target } = edges
  for (let index = 0; index < edges.capacity; index++) {
    if (alive[index] !== 1) continue
    if (changed[source[index] ?? 0] === 1 || changed[target[index] ?? 0] === 1) found.push(index)
  }
  return Uint32Array.from(found)
}

const ownSpan = new Float64Array(2)
const sourceSpan = new Float64Array(2)
const targetSpan = new Float64Array(2)

function periodsOf(spans: NodeColumns['time'], index: number, out: Float64Array): Float64Array {
  const list = spans.list(index)
  if (list) return list
  out[0] = spans.start[index] ?? Number.NEGATIVE_INFINITY
  out[1] = spans.end[index] ?? Number.POSITIVE_INFINITY
  return out
}

function closesAt(spans: NodeColumns['time'], index: number, moment: number): boolean {
  const start = spans.start[index] ?? 0
  return start < moment && spans.end[index] === moment
}

export function readEdgeSpan(
  nodes: NodeColumns,
  edges: EdgeColumns,
  index: number,
  out: Float64Array,
): Float64Array | null {
  out[0] = out[1] = never
  if (edges.alive[index] !== 1) return null
  const nodeTimes = nodes.time
  const edgeTimes = edges.time
  if (nodeTimes.count === 0 && edgeTimes.count === 0) return null
  const source = edges.source[index] ?? 0
  const target = edges.target[index] ?? 0
  const own = edgeTimes.count > 0 && edgeTimes.timed(index)
  const fromSource = nodeTimes.count > 0 && nodeTimes.timed(source)
  const fromTarget = nodeTimes.count > 0 && nodeTimes.timed(target)
  if (!own && !fromSource && !fromTarget) return null
  if (
    (own && edgeTimes.list(index)) ||
    (fromSource && nodeTimes.list(source)) ||
    (fromTarget && nodeTimes.list(target))
  ) {
    const periods = intersectThree(
      own ? periodsOf(edgeTimes, index, ownSpan) : allTime,
      fromSource ? periodsOf(nodeTimes, source, sourceSpan) : allTime,
      fromTarget ? periodsOf(nodeTimes, target, targetSpan) : allTime,
      true,
    )
    if (periods.length === 0 || periods === allTime) return null
    if (periods.length > 2) return periods
    if (periods[0] === Number.POSITIVE_INFINITY) return null
    out[0] = periods[0] ?? never
    out[1] = periods[1] ?? never
    return null
  }
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
  if (end < start || start === Number.POSITIVE_INFINITY) return null
  if (
    end === start &&
    ((own && closesAt(edgeTimes, index, end)) ||
      (fromSource && closesAt(nodeTimes, source, end)) ||
      (fromTarget && closesAt(nodeTimes, target, end)))
  ) {
    return null
  }
  out[0] = start
  out[1] = end
  return null
}
