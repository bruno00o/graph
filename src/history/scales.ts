import type {
  PastColor,
  PastModel,
  PastNumber,
  PastProbe,
  PastRecord,
  PastScales,
  PastSink,
} from '../core/history'
import { combineExtents, type Extent, ExtentTracker } from '../scales/extent'
import type { Mark } from '../types'
import { journalSerial } from './track'

type PastState = PastColor | PastNumber

class Several {
  constructor(readonly values: readonly unknown[]) {}
}

class Folded {
  stamps: number[] = []
  rows: unknown[] = []
  tokens: unknown[] = []
  colors: (PastColor | undefined)[] = []
  numbers: (PastNumber | undefined)[] = []
  values: unknown[] = []
}

const kinds = ['nodes', 'edges', 'shapes'] as const

const lookFields = ['history', 'color', 'size', 'width'] as const
const endFields = ['color', 'width'] as const

type Options = Readonly<Record<string, unknown>>

interface EndsOptions {
  readonly source?: unknown
  readonly target?: unknown
}

interface LookOptions extends Options {
  readonly ends?: EndsOptions
}

function sameEnd(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return endFields.every((name) => (a as Options)[name] === (b as Options)[name])
}

class Token {
  constructor(readonly fields: boolean) {}
}

function plain(channel: unknown): boolean {
  return channel === undefined || typeof channel === 'string' || typeof channel === 'number'
}

function plainEnd(end: unknown): boolean {
  if (end === undefined) return true
  if (typeof end !== 'object' || end === null) return false
  return endFields.every((name) => plain((end as Options)[name]))
}

function fieldsOnly(options: LookOptions): boolean {
  return (
    plain(options['color']) &&
    plain(options['size']) &&
    plain(options['width']) &&
    plainEnd(options.ends?.source) &&
    plainEnd(options.ends?.target)
  )
}

function optionsOf(mark: Mark): LookOptions {
  return (mark as unknown as { readonly options: LookOptions }).options
}

function sameLook(a: Mark, b: Mark): boolean {
  const before = optionsOf(a)
  const after = optionsOf(b)
  if (!lookFields.every((name) => before[name] === after[name])) return false
  const was = before.ends
  const now = after.ends
  return was === now || (sameEnd(was?.source, now?.source) && sameEnd(was?.target, now?.target))
}

function earlier(a: readonly [unknown, number], b: readonly [unknown, number]): number {
  return a[1] - b[1]
}

export class Scales implements PastScales {
  #folded: Folded[] = [new Folded(), new Folded(), new Folded()]
  #trackers = new Map<PastState, (ExtentTracker | undefined)[]>()
  readonly #touched = new Set<PastState>()
  readonly #pending = new Map<PastColor, Map<unknown, number>>()
  #tokens = new WeakMap<Mark, Token>()
  #rows = -1
  #serial = -1
  #still = false
  #marks: readonly Mark[] = []
  #model: PastModel | null = null
  #probe: PastProbe | null = null
  #time = 0
  #categorical = false
  #colorLow = Infinity
  #colorHigh = -Infinity
  #low = Infinity
  #high = -Infinity
  readonly #seen = new Map<unknown, number>()

  readonly #sink: PastSink = {
    color: (value) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (value < this.#colorLow) this.#colorLow = value
        if (value > this.#colorHigh) this.#colorHigh = value
      }
      if (this.#categorical && value !== null && value !== undefined && !this.#seen.has(value)) {
        this.#seen.set(value, this.#time)
      }
    },
    number: (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return
      if (value < this.#low) this.#low = value
      if (value > this.#high) this.#high = value
    },
  }

  readonly #visit = (datum: unknown, time: number): void => {
    this.#time = time
    this.#probe?.(datum, this.#sink)
  }

  define(marks: readonly Mark[]): boolean {
    const before = this.#marks
    const tokens = new WeakMap<Mark, Token>()
    let changed = false
    for (const mark of marks) {
      const position = marks.filter((other) => other.type === mark.type).indexOf(mark)
      const previous = before.filter((other) => other.type === mark.type)[position]
      const kept = previous && this.#tokens.get(previous)
      if (optionsOf(mark)['history'] === undefined) {
        if (kept) changed = true
        continue
      }
      const token =
        kept && previous && sameLook(previous, mark) ? kept : new Token(fieldsOnly(optionsOf(mark)))
      if (token !== kept) changed = true
      tokens.set(mark, token)
    }
    this.#tokens = tokens
    this.#marks = marks
    return changed
  }

  begin(model: PastModel): void {
    this.#model = model
    const rows = model.rowVersion?.() ?? -1
    const serial = journalSerial()
    this.#still = rows >= 0 && rows === this.#rows && serial === this.#serial
    this.#rows = rows
    this.#serial = serial
  }

  read(
    kind: number,
    record: PastRecord,
    color: PastColor | null,
    number: PastNumber | null,
    probe: PastProbe,
  ): void {
    const { index, key } = record
    const token = record.look === undefined ? this.#tokens.get(record.mark) : undefined
    const folded = this.#folded[kind] as Folded
    if (
      this.#still &&
      token !== undefined &&
      (folded.stamps[index] ?? -1) >= 0 &&
      folded.tokens[index] === token &&
      folded.colors[index] === (color ?? undefined) &&
      folded.numbers[index] === (number ?? undefined)
    ) {
      return
    }
    const trail =
      token && (color || number) ? this.#model?.trail?.(kinds[kind] ?? 'nodes', key) : null
    const hold = trail?.hold
    if (!token || !trail || !hold) {
      this.drop(kind, index)
      return
    }
    const row = trail.row
    const element = hold.element(key)
    const stamp = hold.stamp(element)
    if (
      folded.stamps[index] === stamp &&
      folded.rows[index] === row &&
      folded.tokens[index] === token &&
      folded.colors[index] === (color ?? undefined) &&
      folded.numbers[index] === (number ?? undefined)
    ) {
      return
    }
    this.drop(kind, index)
    this.#probe = probe
    this.#categorical = color?.scale.kind === 'categorical'
    this.#colorLow = this.#low = Infinity
    this.#colorHigh = this.#high = -Infinity
    const seen = this.#seen
    seen.clear()
    hold.fold(element, row, this.#visit, token.fields)
    this.#probe = null
    folded.stamps[index] = stamp
    folded.rows[index] = row
    folded.tokens[index] = token
    folded.colors[index] = color ?? undefined
    folded.numbers[index] = number ?? undefined
    if (number) this.#extend(number, kind, index, this.#low, this.#high)
    if (!color) return
    this.#extend(color, kind, index, this.#colorLow, this.#colorHigh)
    if (seen.size === 0) return
    color.pastHeld ??= new Map()
    const held = color.pastHeld
    let pending = this.#pending.get(color)
    if (!pending) {
      pending = new Map()
      this.#pending.set(color, pending)
    }
    for (const [value, time] of seen) {
      held.set(value, (held.get(value) ?? 0) + 1)
      const known = pending.get(value)
      if (known !== undefined && known <= time) continue
      pending.delete(value)
      pending.set(value, time)
    }
    folded.values[index] =
      seen.size === 1 ? seen.keys().next().value : new Several([...seen.keys()])
  }

  drop(kind: number, index: number): void {
    const folded = this.#folded[kind] as Folded
    const color = folded.colors[index]
    const number = folded.numbers[index]
    if (color === undefined && number === undefined) return
    folded.stamps[index] = -1
    folded.colors[index] = undefined
    folded.numbers[index] = undefined
    if (number) this.#extend(number, kind, index, Infinity, -Infinity)
    if (!color) return
    this.#extend(color, kind, index, Infinity, -Infinity)
    const values = folded.values[index]
    folded.values[index] = undefined
    if (values === undefined) return
    const held = color.pastHeld
    for (const value of values instanceof Several ? values.values : [values]) {
      const count = (held?.get(value) ?? 0) - 1
      if (count > 0) {
        held?.set(value, count)
        continue
      }
      held?.delete(value)
      color.idle.add(value)
    }
  }

  settle(): void {
    for (const state of this.#touched) {
      let extent: Extent | null = null
      for (const tracker of this.#trackers.get(state) ?? []) {
        extent = combineExtents(extent, tracker?.extent ?? null)
      }
      state.past = extent
    }
    this.#touched.clear()
    for (const [state, values] of this.#pending) {
      if (state.scale.kind !== 'categorical') continue
      for (const [value] of [...values].sort(earlier)) state.scale.map(value, null)
    }
    this.#pending.clear()
  }

  refold(): void {
    for (const folded of this.#folded) folded.stamps = []
  }

  reset(): void {
    this.#folded = [new Folded(), new Folded(), new Folded()]
    this.#trackers = new Map()
    this.#touched.clear()
    this.#pending.clear()
  }

  #extend(state: PastState, kind: number, index: number, low: number, high: number): void {
    let trackers = this.#trackers.get(state)
    if (!trackers) {
      if (low > high) return
      trackers = []
      this.#trackers.set(state, trackers)
    }
    let tracker = trackers[kind]
    if (!tracker) {
      if (low > high) return
      tracker = new ExtentTracker()
      trackers[kind] = tracker
    }
    this.#touched.add(state)
    if (low > high) {
      tracker.delete(index * 2)
      tracker.delete(index * 2 + 1)
      return
    }
    tracker.set(index * 2, low)
    tracker.set(index * 2 + 1, high)
  }
}
