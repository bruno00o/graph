import type { ResolvedColorScale } from '../scales/color-scale'
import type { Extent } from '../scales/extent'
import type { HistoryEntry, Key, LiveSource, Mark, TimeWindow } from '../types'
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
  drain(cut: HistoryCut, mark: (key: Key, forced?: boolean) => void): void
  datum(key: Key, row: unknown): unknown
  entries(key: Key): readonly HistoryEntry[] | null
  forEachKey(visit: (key: Key) => void): void
  element(key: Key): number
  stamp(element: number): number
  fold(
    element: number,
    row: unknown,
    visit: (datum: unknown, time: number) => void,
    fields: boolean,
  ): void
  retain(): void
  release(): void
}

export interface HistoryMarkOptions {
  readonly key?: unknown
  readonly time?: unknown
}

export interface HistoryTrail {
  hold: HistoryTrack | null
  row: unknown
}

export interface PastColor {
  readonly scale: ResolvedColorScale
  readonly idle: Set<unknown>
  past: Extent | null
  pastHeld: Map<unknown, number> | null
}

export interface PastNumber {
  past: Extent | null
}

export interface PastSink {
  color(value: unknown): void
  number(value: unknown): void
}

export type PastProbe = (datum: unknown, sink: PastSink) => void

export interface PastModel {
  trail?(kind: 'nodes' | 'edges' | 'shapes', key: Key): HistoryTrail | null
  rowVersion?(): number
}

export interface PastRecord {
  readonly index: number
  readonly key: Key
  readonly mark: Mark
  readonly look?: Mark | undefined
}

export interface PastScales {
  define(marks: readonly Mark[]): boolean
  begin(model: PastModel): void
  read(
    kind: number,
    record: PastRecord,
    color: PastColor | null,
    number: PastNumber | null,
    probe: PastProbe,
  ): void
  drop(kind: number, index: number): void
  settle(): void
  refold(): void
  reset(): void
}

export interface HistoryEngine {
  track(options: HistoryMarkOptions, current: HistoryTrack | null, host: HistoryHost): HistoryTrack
  scales(): PastScales
}

const engines = new WeakMap<object, HistoryEngine>()

export function registerHistoryEngine(source: object, engine: HistoryEngine): void {
  engines.set(source, engine)
}

export function historyEngineOf(source: unknown): HistoryEngine | undefined {
  return typeof source === 'object' && source !== null ? engines.get(source) : undefined
}
