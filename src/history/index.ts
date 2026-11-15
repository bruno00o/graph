import { toAccessor } from '../core/accessor'
import { type HistoryHost, registerHistoryEngine } from '../core/history'
import { isLiveSource } from '../core/live-source'
import { toTime } from '../core/time-range'
import { dev } from '../dev'
import type {
  Accessor,
  GraphData,
  HistoryEntry,
  HistorySource,
  HistoryValues,
  KeyChannel,
  LiveSource,
  TimeInstant,
} from '../types'
import type { HistoryIndex } from './index-store'
import { type EntryReader, readEntries, Track } from './track'

export type { HistoryEntry, HistorySource, HistoryValues }

/** Field of `T` whose values are moments, in milliseconds or as `Date`. */
export type TimeFieldOf<T> = {
  [K in keyof T]-?: T[K] extends TimeInstant | null | undefined ? K : never
}[keyof T]

/**
 * Options of `historyFrom`: how to read the key, the moment and the values of an entry. `V` is the
 * type of the values.
 */
export interface HistoryFromOptions<T, V = unknown> {
  /**
   * Field or function that gives the key of the node, edge or shape an entry changes.
   * @default 'key'
   */
  readonly key?: KeyChannel<T> | undefined
  /**
   * Field or function that gives the moment of an entry, in milliseconds or as a `Date`. An entry
   * without a valid moment is ignored, with a warning in development.
   * @default 'time'
   */
  readonly time?: TimeFieldOf<T> | Accessor<T, TimeInstant | null | undefined> | undefined
  /**
   * Field of the entry that holds its values, or a function that gives them: the fields the element
   * takes from the moment of the entry on. An entry whose values are not an object is ignored.
   * @default 'values'
   */
  readonly values?: keyof T | Accessor<T, V> | undefined
}

interface LooseOptions {
  readonly key?: unknown
  readonly time?: unknown
  readonly values?: unknown
}

class History {
  readonly #data: GraphData<unknown>
  readonly #reader: EntryReader
  #index: HistoryIndex | null = null
  #warned = false

  constructor(data: GraphData<unknown>, options: LooseOptions) {
    this.#data = data
    const key = toAccessor<unknown, unknown>((options.key as string | undefined) ?? 'key')
    const time = toAccessor<unknown, unknown>((options.time as string | undefined) ?? 'time')
    const values = toAccessor<unknown, unknown>(
      (options.values as string | Accessor<unknown, unknown> | undefined) ?? 'values',
    )
    this.#reader = {
      key,
      time: (entry) => toTime(time(entry)),
      values,
      skipped: (count) => {
        if (!dev || this.#warned) return
        this.#warned = true
        console.warn(
          `graph: history ignored ${count} entr${count === 1 ? 'y' : 'ies'} without a key, a valid time or values`,
        )
      },
    }
  }

  open(host: HistoryHost, guard: readonly string[]): Track {
    const data = this.#data
    if (isLiveSource(data)) return new Track(null, data, this.#reader, host, guard)
    this.#index ??= readEntries(this.#reader, data)
    return new Track(this.#index, null, this.#reader, host, guard)
  }
}

/**
 * History of a mark read from a live source of entries, each already a `HistoryEntry`. Pass it to
 * the `history` option of `nodes()`, `edges()` or `shapes()`.
 */
export function historyFrom<V>(
  data: LiveSource<HistoryEntry<V>>,
  options?: HistoryFromOptions<HistoryEntry<V>, V> & { readonly values?: 'values' | undefined },
): HistorySource<V>
/**
 * History of a mark read from entries, each already a `HistoryEntry`. Pass it to the `history`
 * option of `nodes()`, `edges()` or `shapes()`.
 */
export function historyFrom<V>(
  data: Iterable<HistoryEntry<V>>,
  options?: HistoryFromOptions<HistoryEntry<V>, V> & { readonly values?: 'values' | undefined },
): HistorySource<V>
/** History of a mark read from a live source of entries whose values a function gives. */
export function historyFrom<T, V>(
  data: LiveSource<T>,
  options: HistoryFromOptions<NoInfer<T>, V> & { readonly values: Accessor<NoInfer<T>, V> },
): HistorySource<V>
/** History of a mark read from entries whose values a function gives. */
export function historyFrom<T, V>(
  data: Iterable<T>,
  options: HistoryFromOptions<NoInfer<T>, V> & { readonly values: Accessor<NoInfer<T>, V> },
): HistorySource<V>
/** History of a mark read from a live source of entries whose values are in one field. */
export function historyFrom<T, F extends keyof T>(
  data: LiveSource<T>,
  options: HistoryFromOptions<NoInfer<T>> & { readonly values: F },
): HistorySource<NonNullable<T[F]>>
/** History of a mark read from entries whose values are in one field. */
export function historyFrom<T, F extends keyof T>(
  data: Iterable<T>,
  options: HistoryFromOptions<NoInfer<T>> & { readonly values: F },
): HistorySource<NonNullable<T[F]>>
export function historyFrom(
  data: GraphData<unknown>,
  options: LooseOptions = {},
): HistorySource<unknown> {
  const history = new History(data, options)
  registerHistoryEngine(history, history)
  return Object.freeze(history) as unknown as HistorySource<unknown>
}
