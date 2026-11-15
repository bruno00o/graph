import type { HistoryEntry, Key, LiveSource, TimeWindow } from '../types'
import type { Readiness } from './live-source'

export interface HistoryCut {
  readonly time: number
  readonly inclusive: boolean
}

export const noEntries: readonly HistoryEntry[] = Object.freeze([])

export const wholeHistory: HistoryCut = Object.freeze({ time: Infinity, inclusive: true })

export function cutOf(window: TimeWindow | null): HistoryCut {
  if (window === null || window.end === null) return wholeHistory
  return { time: window.end, inclusive: window.start === window.end }
}

export interface HistoryHost {
  notify(): void
  recheck(): void
}

export interface HistoryTrack {
  readonly readiness: Readiness
  readonly live: LiveSource<unknown> | null
  drain(cut: HistoryCut, mark: (key: Key) => void): void
  datum(key: Key, row: unknown): unknown
  entries(key: Key): readonly HistoryEntry[] | null
  forEachKey(visit: (key: Key) => void): void
  retain(): void
  release(): void
}

export interface HistoryMarkOptions {
  readonly key?: unknown
  readonly time?: unknown
}

export interface HistoryEngine {
  track(options: HistoryMarkOptions, current: HistoryTrack | null, host: HistoryHost): HistoryTrack
}

const engines = new WeakMap<object, HistoryEngine>()

export function registerHistoryEngine(source: object, engine: HistoryEngine): void {
  engines.set(source, engine)
}

export function historyEngineOf(source: unknown): HistoryEngine | undefined {
  return typeof source === 'object' && source !== null ? engines.get(source) : undefined
}
