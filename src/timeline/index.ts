import { createStore, type ReadonlyStore } from '@tanstack/store'
import type { LogCursor } from '../core/change-log'
import { readWindow, sameWindow, toTime } from '../core/time-range'
import { internalsOf } from '../host/internals'
import type { GraphInstance } from '../host/mount-graph'
import type { Mark, TimeInstant, TimeWindow, TimeWindowInput } from '../types'
import { addTime, boundaries, chooseStep, type TimeStep, type TimeUnit } from './calendar'
import { incidentEdges, readEdgeSpan, readNodeSpan, SpanCounts } from './histogram'

export type { TimeUnit }

/**
 * How playback moves the window: `'slide'` moves both ends and keeps its width, `'grow'` keeps
 * the start and moves the end, so the window gathers everything since the start.
 */
export type TimelineMode = 'slide' | 'grow'

/** End of the window an action moves: `'start'`, `'end'` or `'both'`. */
export type TimelineEnd = 'start' | 'end' | 'both'

/** Options of `createTimeline`. */
export interface TimelineOptions {
  /**
   * Number of histogram bins to aim for across the range of the bar. Bins follow the calendar
   * (a day, a week, a month…), so the actual number differs a little.
   * @default 80
   */
  readonly bins?: number
  /**
   * Number of ticks to aim for across the range of the bar.
   * @default 6
   */
  readonly ticks?: number
  /**
   * Speed of playback, in milliseconds of data time per second. Defaults to a twentieth of the
   * extent per second, so that playback crosses the extent in twenty seconds.
   */
  readonly speed?: number
  /**
   * How playback and `step` move the window.
   * @default 'slide'
   */
  readonly mode?: TimelineMode
  /**
   * Playback starts again from the beginning of the extent when it reaches the end, instead of
   * stopping there.
   * @default false
   */
  readonly loop?: boolean
  /**
   * Time range the bar covers, in milliseconds or dates. An end left out or `null` comes from the
   * data: the earliest start and the latest end among nodes and edges.
   */
  readonly extent?: TimeWindowInput | null
}

/** A closed range of time, in milliseconds since the epoch. */
export interface TimeRange {
  /** Start, in milliseconds. */
  readonly start: number
  /** End, in milliseconds. */
  readonly end: number
}

/** A bin of the histogram: how many nodes and edges exist in a stretch of time. */
export interface TimelineBin {
  /** Start of the bin, in milliseconds, included. */
  readonly start: number
  /** End of the bin, in milliseconds, left out. */
  readonly end: number
  /** Nodes whose time meets the bin. Nodes without time are not counted. */
  readonly nodes: number
  /**
   * Edges that meet the bin, counted over the time when the edge and both its ends exist. Edges
   * whose time and ends have no time are not counted.
   */
  readonly edges: number
}

/** A tick of the bar, at the start of a calendar unit. */
export interface TimelineTick {
  /** Time of the tick, in milliseconds. */
  readonly time: number
  /** Calendar unit the ticks fall on, to choose how to write them. */
  readonly unit: TimeUnit
}

/** State of a timeline: extent and range of the bar, histogram, ticks, window and playback. */
export interface TimelineState {
  /** Time range of the data, or of the `extent` option, or `null` when no element has time. */
  readonly extent: TimeRange | null
  /** Time range the bar shows: the extent, or a part of it after `zoom`. */
  readonly range: TimeRange | null
  /** Histogram over the range, in time order. */
  readonly bins: readonly TimelineBin[]
  /** Calendar unit of the bins. */
  readonly unit: TimeUnit
  /** Number of calendar units in a bin. */
  readonly step: number
  /** Ticks over the range, in time order. */
  readonly ticks: readonly TimelineTick[]
  /** Time window of the graph, or `null` when every element shows. */
  readonly window: TimeWindow | null
  /** Whether playback runs. */
  readonly playing: boolean
  /** Speed of playback, in milliseconds of data time per second. */
  readonly speed: number
  /** How playback and `step` move the window. */
  readonly mode: TimelineMode
  /** Whether playback starts again at the end. */
  readonly loop: boolean
}

/** A timeline made by `createTimeline`, for the default renderer or for a renderer of its own. */
export interface Timeline {
  /** Store of the state. Subscribe to it to render the timeline. */
  readonly store: ReadonlyStore<TimelineState>
  /**
   * Sets the window of the graph, or removes it with `null`. An end left out or `null` is open.
   * Throws a `RangeError` for an end that is not a finite time, or a start after the end.
   */
  set(window: TimeWindowInput | null): void
  /** Sets the window of the graph to the time between two moments, given in any order. */
  brush(start: TimeInstant, end: TimeInstant): void
  /** Moves the window by an amount of time, in milliseconds, keeping its width. */
  move(by: number): void
  /**
   * Moves one end of the window, or both, by a number of bins, following the calendar. Without a
   * window, starts one on the first bin, or on the last for a negative count.
   */
  nudge(end: TimelineEnd, count: number): void
  /**
   * Moves the window by a number of bins: both ends in `'slide'` mode, the end in `'grow'` mode.
   * Defaults to one bin forward.
   */
  step(count?: number): void
  /** Removes the window: every element shows again. */
  clear(): void
  /**
   * Zooms the bar by a factor, above 1 to zoom in, around a time in milliseconds. Defaults to the
   * middle of the range. The range stays inside the extent.
   */
  zoom(factor: number, at?: number): void
  /** Moves the range of the bar by an amount of time, in milliseconds, inside the extent. */
  pan(by: number): void
  /** Shows the whole extent on the bar again. */
  fit(): void
  /**
   * Starts playback. Without a window, it starts with one a tenth of the extent wide; at the end of
   * the extent, it starts again from the beginning.
   */
  play(): void
  /** Stops playback where it is. */
  pause(): void
  /** Starts or stops playback. */
  toggle(): void
  /** Replaces the options. Options left out take their default value. */
  update(options?: TimelineOptions): void
  /** Stops playback and stops following the graph. The window stays. */
  destroy(): void
}

interface Settings {
  readonly bins: number
  readonly ticks: number
  readonly speed: number | null
  readonly mode: TimelineMode
  readonly loop: boolean
  readonly extent: { readonly start: number | null; readonly end: number | null } | null
}

const minInterval = 50
const costRatio = 10
const longestTick = 100
const playbackSeconds = 20
const startWidth = 10
const remembered = 8

function positive(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`createTimeline: ${name} must be a positive number`)
  }
  return value
}

function resolve(options: TimelineOptions): Settings {
  return {
    bins: Math.round(positive(options.bins, 80, 'bins')),
    ticks: Math.round(positive(options.ticks, 6, 'ticks')),
    speed: options.speed === undefined ? null : positive(options.speed, 1, 'speed'),
    mode: options.mode === 'grow' ? 'grow' : 'slide',
    loop: options.loop === true,
    extent: options.extent ? readWindow(options.extent) : null,
  }
}

function instant(value: TimeInstant): number {
  const time = toTime(value)
  if (Number.isNaN(time)) throw new RangeError('timeline: a time must be a finite number or date')
  return time
}

type Frame = (callback: (now: number) => void) => number

function frames(): { readonly request: Frame; readonly cancel: (id: number) => void } {
  const request = globalThis.requestAnimationFrame
  if (typeof request === 'function') {
    return {
      request: (callback) => request(callback),
      cancel: (id) => globalThis.cancelAnimationFrame(id),
    }
  }
  return {
    request: (callback) => Number(setTimeout(() => callback(performance.now()), 16)),
    cancel: (id) => clearTimeout(id),
  }
}

/**
 * Follows the time of the nodes and edges of a graph: extent, a histogram of how many exist over
 * time, ticks, and the time window of the graph, which it moves by brushing, stepping and
 * playback. The histogram is counted again only when the data changes.
 */
export function createTimeline<S extends string, M extends Mark>(
  graph: GraphInstance<S, M>,
  options: TimelineOptions = {},
): Timeline {
  const internals = internalsOf(graph, 'createTimeline')
  let settings = resolve(options)
  const nodeCounts = new SpanCounts()
  const edgeCounts = new SpanCounts()
  const clock = frames()
  let extent: TimeRange | null = null
  let zoomed: TimeRange | null = null
  let binStep: TimeStep = { unit: 'day', count: 1 }
  let readScene = -1
  let nodeCursor: LogCursor | null = null
  let edgeCursor: LogCursor | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastRead = Number.NEGATIVE_INFINITY
  let cooldown = minInterval
  let destroyed = false
  let playing = false
  let frame = 0
  let lastTick = -1
  let head: TimeWindow | null = null
  const requested: TimeWindow[] = []

  const store = createStore<TimelineState>({
    extent: null,
    range: null,
    bins: [],
    unit: 'day',
    step: 1,
    ticks: [],
    window: graph.time.get(),
    playing: false,
    speed: 0,
    mode: settings.mode,
    loop: settings.loop,
  })
  const readonlyStore: ReadonlyStore<TimelineState> = createStore(() => store.state)

  function patch(next: Partial<TimelineState>): void {
    store.setState((state) => ({ ...state, ...next }))
  }

  function readExtent(): TimeRange | null {
    let start = Math.min(nodeCounts.first(), edgeCounts.first())
    let end = Math.max(nodeCounts.last(), edgeCounts.last())
    const fixed = settings.extent
    if (fixed?.start !== null && fixed?.start !== undefined) start = fixed.start
    if (fixed?.end !== null && fixed?.end !== undefined) end = fixed.end
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
    return { start, end: end > start ? end : start + 1 }
  }

  function snapped(range: TimeRange): TimeRange {
    const step = chooseStep(range.end - range.start, settings.bins)
    const times = boundaries(range.start, range.end, step, settings.bins * 4 + 8)
    return { start: times[0] ?? range.start, end: times[times.length - 1] ?? range.end }
  }

  function clampRange(range: TimeRange, outer: TimeRange): TimeRange {
    const span = Math.min(range.end - range.start, outer.end - outer.start)
    const start = Math.min(Math.max(range.start, outer.start), outer.end - span)
    return { start, end: start + span }
  }

  function speedOf(): number {
    if (settings.speed !== null) return settings.speed
    return extent ? (extent.end - extent.start) / playbackSeconds : 0
  }

  function layout(): void {
    const outer = extent ? snapped(extent) : null
    const range = outer && zoomed ? clampRange(zoomed, outer) : outer
    if (!range) {
      patch({ extent: null, range: null, bins: [], ticks: [], speed: speedOf() })
      return
    }
    const span = range.end - range.start
    binStep = chooseStep(span, settings.bins)
    const times = boundaries(range.start, range.end, binStep, settings.bins * 4 + 8)
    const bins: TimelineBin[] = []
    for (let at = 1; at < times.length; at++) {
      const start = times[at - 1] ?? 0
      const end = times[at] ?? 0
      bins.push({
        start,
        end,
        nodes: nodeCounts.count(start, end),
        edges: edgeCounts.count(start, end),
      })
    }
    const tickStep = chooseStep(span, settings.ticks)
    const ticks: TimelineTick[] = []
    for (const time of boundaries(range.start, range.end, tickStep, settings.ticks * 4 + 8)) {
      if (time >= range.start && time <= range.end) ticks.push({ time, unit: tickStep.unit })
    }
    patch({
      extent,
      range,
      bins,
      unit: binStep.unit,
      step: binStep.count,
      ticks,
      speed: speedOf(),
      mode: settings.mode,
      loop: settings.loop,
    })
  }

  function read(): void {
    timer = undefined
    if (destroyed) return
    const start = performance.now()
    readScene = internals.stamp().scene
    const { nodes, edges } = internals.scene
    const nodeChanges = nodeCursor ? nodes.time.changes.since(nodeCursor) : null
    const edgeChanges = edgeCursor ? edges.time.changes.since(edgeCursor) : null
    const readNode = (index: number, out: Float64Array) => readNodeSpan(nodes, index, out)
    const readEdge = (index: number, out: Float64Array) => readEdgeSpan(nodes, edges, index, out)
    let nodesChanged: boolean
    let edgesChanged: boolean
    if (nodeChanges && edgeChanges) {
      nodesChanged = nodeCounts.patch(nodes.capacity, nodeChanges, readNode)
      const incident = incidentEdges(nodeChanges, nodes.capacity, edges)
      const touched = new Uint32Array(edgeChanges.length + incident.length)
      touched.set(edgeChanges)
      touched.set(incident, edgeChanges.length)
      edgesChanged = edgeCounts.patch(edges.capacity, touched, readEdge)
    } else {
      nodesChanged = nodeCounts.update(nodes.capacity, readNode)
      edgesChanged = edgeCounts.update(edges.capacity, readEdge)
    }
    nodeCursor = nodes.time.changes.cursor()
    edgeCursor = edges.time.changes.cursor()
    if (nodesChanged || edgesChanged || store.state.range === null) {
      extent = readExtent()
      layout()
    }
    lastRead = performance.now()
    cooldown = Math.max(minInterval, (lastRead - start) * costRatio)
  }

  function schedule(): void {
    if (timer !== undefined || destroyed) return
    timer = setTimeout(read, Math.max(0, lastRead + cooldown - performance.now()))
  }

  function request(window: TimeWindow | null): void {
    if (window) {
      requested.push(window)
      if (requested.length > remembered) requested.shift()
    }
    head = window
    graph.time.set(window)
  }

  function current(): TimeWindow | null {
    return playing ? head : graph.time.get()
  }

  function bound(time: number | null, fallback: number | undefined): number | null {
    return time ?? fallback ?? null
  }

  function nudge(end: TimelineEnd, count: number): void {
    if (destroyed || !Number.isFinite(count)) return
    const shift = Math.trunc(count) * binStep.count
    const window = current()
    if (!window) {
      const bins = store.state.bins
      const bin = count < 0 ? bins[bins.length - 1] : bins[0]
      if (bin) request({ start: bin.start, end: bin.end })
      return
    }
    const startOf = bound(window.start, end === 'start' ? extent?.start : undefined)
    const endOf = bound(window.end, end === 'end' ? extent?.end : undefined)
    let start = startOf
    let finish = endOf
    if (end !== 'end' && start !== null) start = addTime(start, binStep.unit, shift)
    if (end !== 'start' && finish !== null) finish = addTime(finish, binStep.unit, shift)
    if (start !== null && finish !== null && start > finish) {
      if (end === 'start') start = finish
      else finish = start
    }
    request({ start, end: finish })
  }

  function startingHead(range: TimeRange): TimeWindow {
    const window = graph.time.get()
    if (settings.mode === 'grow') {
      const start = window ? window.start : range.start
      const end = window?.end ?? start ?? range.start
      return { start, end: end >= range.end ? (start ?? range.start) : end }
    }
    const fallback = (range.end - range.start) / startWidth
    const width =
      window && window.start !== null && window.end !== null ? window.end - window.start : fallback
    const start = window?.start ?? range.start
    if (start + width >= range.end) return { start: range.start, end: range.start + width }
    return { start, end: start + width }
  }

  function advance(elapsed: number): void {
    const range = extent
    const window = head
    if (!range || !window || window.end === null) {
      pause()
      return
    }
    const by = (speedOf() * elapsed) / 1000
    let stop = false
    let next: TimeWindow
    if (settings.mode === 'grow') {
      let end = window.end + by
      if (end >= range.end) {
        if (settings.loop) end = window.start ?? range.start
        else {
          end = range.end
          stop = true
        }
      }
      next = { start: window.start, end }
    } else {
      const start = window.start ?? range.start
      const width = window.end - start
      let from = start + by
      if (from + width >= range.end) {
        if (settings.loop) from = range.start
        else {
          from = range.end - width
          stop = true
        }
      }
      next = { start: from, end: from + width }
    }
    request(next)
    if (stop) pause()
  }

  function tick(now: number): void {
    frame = 0
    if (!playing || destroyed) return
    const elapsed = lastTick < 0 ? 0 : Math.min(now - lastTick, longestTick)
    lastTick = now
    advance(elapsed)
    if (playing) frame = clock.request(tick)
  }

  function play(): void {
    if (playing || destroyed || !extent) return
    playing = true
    lastTick = -1
    patch({ playing: true })
    request(startingHead(extent))
    frame = clock.request(tick)
  }

  function pause(): void {
    if (!playing) return
    playing = false
    if (frame !== 0) clock.cancel(frame)
    frame = 0
    patch({ playing: false })
  }

  const stopTime = graph.on('timechange', ({ window }) => {
    if (playing && !requested.some((asked) => sameWindow(asked, window))) head = window
    if (!sameWindow(store.state.window, window)) patch({ window })
  })

  const stopWatch = internals.watch({
    frame() {
      if (internals.stamp().scene !== readScene) schedule()
    },
    destroy: () => destroy(),
  })

  function destroy(): void {
    if (destroyed) return
    pause()
    destroyed = true
    clearTimeout(timer)
    stopWatch()
    stopTime()
  }

  read()

  return {
    store: readonlyStore,
    set(window) {
      if (destroyed) return
      request(readWindow(window))
    },
    brush(start, end) {
      if (destroyed) return
      const a = instant(start)
      const b = instant(end)
      request({ start: Math.min(a, b), end: Math.max(a, b) })
    },
    move(by) {
      const window = current()
      if (destroyed || !window || !Number.isFinite(by) || by === 0) return
      request({
        start: window.start === null ? null : window.start + by,
        end: window.end === null ? null : window.end + by,
      })
    },
    nudge,
    step(count = 1) {
      nudge(settings.mode === 'grow' ? 'end' : 'both', count)
    },
    clear() {
      if (destroyed) return
      pause()
      request(null)
    },
    zoom(factor, at) {
      const range = store.state.range
      if (destroyed || !extent || !range || !(factor > 0) || !Number.isFinite(factor)) return
      const outer = snapped(extent)
      const span = range.end - range.start
      const least = Math.min(settings.bins, span)
      const next = Math.min(Math.max(span / factor, least), outer.end - outer.start)
      const center = at ?? (range.start + range.end) / 2
      const start = center - ((center - range.start) / span) * next
      zoomed = next >= outer.end - outer.start ? null : { start, end: start + next }
      layout()
    },
    pan(by) {
      const range = store.state.range
      if (destroyed || !extent || !range || !zoomed || !Number.isFinite(by)) return
      zoomed = clampRange({ start: range.start + by, end: range.end + by }, snapped(extent))
      layout()
    },
    fit() {
      if (destroyed || !zoomed) return
      zoomed = null
      layout()
    },
    play,
    pause,
    toggle() {
      if (playing) pause()
      else play()
    },
    update(next = {}) {
      if (destroyed) return
      settings = resolve(next)
      extent = readExtent()
      layout()
    },
    destroy,
  }
}

export {
  mountTimeline,
  type TimelineFormat,
  type TimelineLabels,
  type TimelineView,
  type TimelineViewOptions,
} from './view'
