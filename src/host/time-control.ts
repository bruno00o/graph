import { readWindow, sameWindow, type TimeFilter, timeFilter } from '../core/time-range'
import type { GraphDefinition, TimeWindow, TimeWindowInput } from '../types'
import type { Emitter, GraphTimeEvent } from './events'
import type { GraphState, GraphTime } from './graph-instance'
import { isolated } from './isolate'

export interface TimeSource {
  readonly controlled: boolean
  readonly emitter: Emitter
  definition(): GraphDefinition
  patch(next: Partial<GraphState>): void
  request(): void
}

export class TimeControl {
  window: TimeWindow | null
  filter: TimeFilter | null
  fade: number
  #listener: ((event: GraphTimeEvent) => void) | undefined
  readonly #source: TimeSource

  constructor(
    source: TimeSource,
    window: TimeWindowInput | null,
    listener: ((event: GraphTimeEvent) => void) | undefined,
  ) {
    this.#source = source
    this.#listener = isolated(listener)
    this.window = readWindow(window)
    const fade = source.definition().time.fade
    this.filter = timeFilter(this.window, fade)
    this.fade = fade
  }

  listen(listener: (event: GraphTimeEvent) => void): void {
    this.#listener = isolated(listener)
  }

  apply(next: TimeWindow | null): void {
    if (sameWindow(next, this.window)) return
    this.window = next
    this.filter = timeFilter(next, this.fade)
    this.#source.patch({ time: next })
    this.#source.emitter.emit('timechange', { window: next })
    this.#source.request()
  }

  ask(next: TimeWindow | null): void {
    if (!this.#source.controlled) {
      this.apply(next)
      return
    }
    if (!sameWindow(next, this.window)) this.#listener?.({ window: next })
  }

  refreshFade(): void {
    const fade = this.#source.definition().time.fade
    if (fade === this.fade) return
    this.fade = fade
    this.filter = timeFilter(this.window, fade)
  }

  api(): GraphTime {
    return {
      get: () => this.window,
      set: (next) => this.ask(readWindow(next)),
    }
  }
}
