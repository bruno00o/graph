import { isKey, toAccessor } from '../core/accessor'
import type {
  HistoryCut,
  HistoryHost,
  HistoryStep,
  HistoryTrack,
  StepRecords,
} from '../core/history'
import { type Readiness, sourceReadiness, watchReadiness } from '../core/live-source'
import type {
  EdgeMark,
  HistoryEntry,
  Key,
  LiveSource,
  SourceChange,
  SourceSubscription,
  TimeInstant,
} from '../types'
import { before, HistoryIndex } from './index-store'

export interface EntryReader {
  key(entry: unknown): unknown
  time(entry: unknown): number
  values(entry: unknown): unknown
  skipped(count: number): void
}

let serial = 0

export function journalSerial(): number {
  return serial
}

const noAccess = (): unknown => undefined

function endOf(value: unknown): Key | null {
  return isKey(value) ? value : null
}

const nothing: HistoryCut = Object.freeze({ time: -Infinity, inclusive: false })

function grownInts(array: Int32Array, length: number): Int32Array {
  if (length <= array.length) return array
  const next = new Int32Array(Math.max(16, array.length * 2, length))
  next.set(array)
  return next
}

function grownStamps(array: Uint32Array, length: number): Uint32Array {
  if (length <= array.length) return array
  const next = new Uint32Array(Math.max(16, array.length * 2, length))
  next.set(array)
  return next
}

function extend(list: unknown[], length: number): void {
  while (list.length < length) list.push(undefined)
}

function readable(values: unknown): values is Record<string, unknown> {
  return typeof values === 'object' && values !== null
}

export function addEntry(
  index: HistoryIndex,
  reader: EntryReader,
  datum: unknown,
  entry?: Key,
): boolean {
  const key = reader.key(datum)
  const time = reader.time(datum)
  const values = reader.values(datum)
  if (
    !(
      (typeof key === 'string' || (typeof key === 'number' && Number.isFinite(key))) &&
      Number.isFinite(time) &&
      readable(values)
    )
  ) {
    return false
  }
  if (entry === undefined) index.load(key, time, values)
  else index.add(key, time, values, entry)
  return true
}

export function readEntries(reader: EntryReader, data: Iterable<unknown>): HistoryIndex {
  const index = new HistoryIndex()
  if (Array.isArray(data)) index.reserve(data.length)
  let skipped = 0
  for (const datum of data) if (!addEntry(index, reader, datum)) skipped++
  if (skipped > 0) reader.skipped(skipped)
  index.build()
  return index
}

export class Track implements HistoryTrack {
  readonly live: LiveSource<unknown> | null
  readonly #origin: object
  readonly #index: HistoryIndex
  readonly #reader: EntryReader
  readonly #guard: readonly string[]
  readonly #host: HistoryHost
  #subscription: SourceSubscription | null = null
  #unwatch: (() => void) | null = null
  #queue: SourceChange<unknown>[] = []
  #cut: HistoryCut = nothing
  #position = 0
  #active: Int32Array = new Int32Array(0)
  #built: Int32Array = new Int32Array(0)
  #stamp: Uint32Array = new Uint32Array(0)
  #journal: Uint32Array = new Uint32Array(0)
  #generation = 0
  #effective: unknown[] = []
  #base: unknown[] = []
  #rows: unknown[] = []
  #moved: Int32Array = new Int32Array(0)
  #ids: Int32Array = new Int32Array(0)
  #records: StepRecords | null = null
  #epoch = -1
  #slot = -1
  #mark: unknown = null
  #source: (datum: unknown) => unknown = noAccess
  #target: (datum: unknown) => unknown = noAccess
  #closed = false
  #users = 0
  readiness: Readiness = 'ready'

  constructor(
    origin: object,
    index: HistoryIndex | null,
    data: LiveSource<unknown> | null,
    reader: EntryReader,
    host: HistoryHost,
    guard: readonly string[],
  ) {
    this.#origin = origin
    this.#index = index ?? new HistoryIndex()
    this.#reader = reader
    this.#guard = guard
    this.#host = host
    this.live = data
    if (!data) return
    try {
      this.#subscription = data.subscribeChanges(
        (changes) => {
          this.#receive(changes)
        },
        { includeInitialState: true },
      )
      this.#unwatch = watchReadiness(data, this.#subscription, () => {
        this.#recheck()
      })
      this.readiness = sourceReadiness(data, this.#subscription)
    } catch (error) {
      this.close()
      throw error
    }
  }

  fits(origin: object, guard: readonly string[]): boolean {
    return (
      !this.#closed &&
      origin === this.#origin &&
      guard.length === this.#guard.length &&
      guard.every((name, at) => name === this.#guard[at])
    )
  }

  retain(): void {
    this.#users++
  }

  release(): void {
    if (--this.#users <= 0) this.close()
  }

  get queued(): boolean {
    return this.#queue.length > 0
  }

  drain(
    cut: HistoryCut,
    mark: (key: Key, forced?: boolean) => void,
    step: HistoryStep | null = null,
  ): void {
    if (this.#queue.length > 0) this.#apply(mark)
    if (step) this.#prepare(step)
    this.#move(
      cut,
      step
        ? (element) => this.#step(step, element)
        : (element) => mark(this.#index.keys[element] as Key),
    )
  }

  #prepare(step: HistoryStep): void {
    const records = step.records
    if (this.#records !== records || this.#epoch !== records.epoch || this.#slot !== step.slot) {
      this.#records = records
      this.#epoch = records.epoch
      this.#slot = step.slot
      this.#ids.fill(-1)
    }
    const count = this.#index.elementCount
    if (this.#ids.length < count) {
      const ids = new Int32Array(Math.max(16, this.#ids.length * 2, count)).fill(-1)
      ids.set(this.#ids)
      this.#ids = ids
    }
    if (records.ends && step.mark !== this.#mark) {
      this.#mark = step.mark
      const options = (step.mark as EdgeMark<unknown>).options
      this.#source = toAccessor<unknown, unknown>(options.source)
      this.#target = toAccessor<unknown, unknown>(options.target)
    }
  }

  #step(step: HistoryStep, element: number): void {
    const records = step.records
    let id = this.#ids[element] ?? -2
    if (id === -1) {
      const key = this.#index.keys[element]
      id = isKey(key) ? records.find(key) : -2
      if (id < 0) id = -2
      this.#ids[element] = id
    }
    const record = id < 0 ? undefined : records.at(id)
    if (!record || record.slot !== step.slot) return
    const datum = this.datumAt(element)
    if (datum === record.datum) return
    if (datum === undefined) records.defer(record.key)
    else if (
      records.ends &&
      !(
        endOf(this.#source(datum)) === record.source && endOf(this.#target(datum)) === record.target
      )
    ) {
      records.defer(record.key)
    } else {
      record.datum = datum
      records.updated(record)
    }
  }

  datumAt(element: number): unknown {
    const row = this.#rows[element]
    return row === undefined ? undefined : this.#datumOf(element, row)
  }

  datum(key: Key, row: unknown): unknown {
    const element = this.#index.elementOf(key)
    if (element < 0 || element >= this.#active.length) return row
    this.#rows[element] = row
    return this.#datumOf(element, row)
  }

  #datumOf(element: number, row: unknown): unknown {
    const count = this.#active[element] ?? 0
    if (count === 0 || !readable(row)) {
      if (this.#base[element] !== undefined) {
        this.#base[element] = undefined
        this.#effective[element] = undefined
      }
      return row
    }
    let from = 0
    let out: Record<string, unknown>
    if (this.#base[element] === row) {
      const built = this.#built[element] ?? 0
      if (built === count) return this.#effective[element]
      const previous = this.#effective[element]
      if (built > 0 && built < count && readable(previous)) {
        from = built
        out = this.#copy(previous)
      } else {
        out = this.#copy(row)
      }
    } else {
      out = this.#copy(row)
    }
    for (let at = from; at < count; at++) this.#merge(out, this.#index.at(element, at))
    if (Object.isFrozen(row)) Object.freeze(out)
    this.#base[element] = row
    this.#built[element] = count
    this.#effective[element] = out
    return out
  }

  entries(key: Key): readonly HistoryEntry[] | null {
    const index = this.#index
    const element = index.elementOf(key)
    const count = element < 0 ? 0 : index.count(element)
    if (count === 0) return null
    const entries: HistoryEntry[] = []
    for (let at = 0; at < count; at++) {
      const id = index.at(element, at)
      const time: TimeInstant = index.times[id] ?? 0
      entries.push(Object.freeze({ key, time, values: index.values[id] }))
    }
    return Object.freeze(entries)
  }

  element(key: Key): number {
    return this.#index.elementOf(key)
  }

  stamp(element: number): number {
    return element < 0 ? 0 : (this.#journal[element] ?? 0)
  }

  fold(
    element: number,
    row: unknown,
    visit: (datum: unknown, time: number) => void,
    fields: boolean,
  ): void {
    visit(row, -Infinity)
    const index = this.#index
    const count = element < 0 ? 0 : index.count(element)
    if (count === 0 || !readable(row)) return
    const times = index.times
    if (fields) {
      for (let at = 0; at < count; at++) {
        const id = index.at(element, at)
        visit(this.#unguarded(id), times[id] ?? 0)
      }
      return
    }
    const out = this.#copy(row)
    for (let at = 0; at < count; at++) {
      const id = index.at(element, at)
      this.#merge(out, id)
      visit(out, times[id] ?? 0)
    }
  }

  #unguarded(id: number): unknown {
    const values = this.#index.values[id] as Record<string, unknown>
    const guard = this.#guard
    for (let at = 0; at < guard.length; at++) {
      if (values[guard[at] as string] === undefined) continue
      const out: Record<string, unknown> = {}
      for (const name of Object.keys(values)) if (!guard.includes(name)) out[name] = values[name]
      return out
    }
    return values
  }

  #merge(out: Record<string, unknown>, id: number): void {
    const values = this.#index.values[id] as Record<string, unknown>
    const guard = this.#guard
    for (const name of Object.keys(values)) {
      const value = values[name]
      if (value !== undefined && !guard.includes(name)) out[name] = value
    }
  }

  forEachKey(visit: (key: Key) => void): void {
    const keys = this.#index.keys
    const active = this.#active
    for (let element = 0; element < active.length; element++) {
      if ((active[element] ?? 0) > 0) visit(keys[element] as Key)
    }
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#unwatch?.()
    this.#unwatch = null
    this.#subscription?.unsubscribe()
    this.#subscription = null
    this.#queue = []
  }

  #copy(row: Record<string, unknown>): Record<string, unknown> {
    const prototype: unknown = Object.getPrototypeOf(row)
    if (prototype === Object.prototype) return { ...row }
    return Object.assign(Object.create(prototype as object | null) as object, row) as Record<
      string,
      unknown
    >
  }

  #reserve(): void {
    const count = this.#index.elementCount
    if (count <= this.#active.length) return
    this.#active = grownInts(this.#active, count)
    this.#built = grownInts(this.#built, count)
    this.#stamp = grownStamps(this.#stamp, count)
    this.#journal = grownStamps(this.#journal, count)
    const length = this.#active.length
    extend(this.#rows, length)
    extend(this.#base, length)
    extend(this.#effective, length)
  }

  #receive(changes: ReadonlyArray<SourceChange<unknown>>): void {
    if (this.#closed || changes.length === 0) return
    for (const change of changes) this.#queue.push(change)
    this.#host.notify()
  }

  #recheck(): void {
    if (this.#closed || !this.live) return
    const readiness = sourceReadiness(this.live, this.#subscription)
    if (readiness === this.readiness) return
    this.readiness = readiness
    this.#host.recheck()
  }

  #apply(mark: (key: Key, forced?: boolean) => void): void {
    const index = this.#index
    const queue = this.#queue
    this.#queue = []
    let skipped = 0
    for (const change of queue) {
      index.remove(change.key)
      if (change.type === 'delete') continue
      if (!addEntry(index, this.#reader, change.value, change.key)) skipped++
    }
    if (skipped > 0) this.#reader.skipped(skipped)
    const changed = index.settle()
    if (!changed) return
    this.#reserve()
    const cut = this.#cut
    for (const [element, earliest] of changed) {
      this.#journal[element] = ++serial
      if (!before(earliest, cut)) {
        mark(index.keys[element] as Key, true)
        continue
      }
      this.#base[element] = undefined
      this.#effective[element] = undefined
      this.#active[element] = index.countBefore(element, cut)
      mark(index.keys[element] as Key)
    }
    this.#position = cut === nothing ? 0 : index.bound(cut)
  }

  #move(cut: HistoryCut, visit: (element: number) => void): void {
    const index = this.#index
    this.#reserve()
    const from = this.#position
    const to = index.bound(cut)
    this.#cut = cut
    if (from === to) return
    this.#position = to
    const active = this.#active
    if (Math.abs(to - from) * 4 > index.live) {
      for (let element = 0; element < index.elementCount; element++) {
        const count = index.countBefore(element, cut)
        if (count === (active[element] ?? 0)) continue
        active[element] = count
        visit(element)
      }
      return
    }
    const stamp = this.#stamp
    const generation = ++this.#generation
    const sorted = index.sorted
    const owners = index.owners
    const step = to > from ? 1 : -1
    const low = Math.min(from, to)
    const high = Math.max(from, to)
    const moved = this.#moved.length < high - low ? new Int32Array(high - low) : this.#moved
    this.#moved = moved
    let count = 0
    for (let at = low; at < high; at++) {
      const element = owners[sorted[at] ?? 0] ?? -1
      if (element < 0) continue
      active[element] = (active[element] ?? 0) + step
      if (stamp[element] === generation) continue
      stamp[element] = generation
      moved[count++] = element
    }
    for (let at = 0; at < count; at++) visit(moved[at] ?? 0)
  }
}
