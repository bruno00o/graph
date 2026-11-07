import { wheelPixels } from '../core/view'
import { listenPinch } from '../dom/gestures'
import { themeColor } from '../theme/tokens'
import type { TimeWindow } from '../types'
import type { TimeUnit } from './calendar'
import type { Timeline, TimelineBin, TimelineEnd, TimelineState } from './index'

/**
 * Text of a time: `'tick'` for a tick of the bar, `'value'` for the value of a handle read by
 * assistive technologies. `unit` is the calendar unit of the ticks, or of the bins for a value.
 */
export type TimelineFormat = (time: number, unit: TimeUnit, use: 'tick' | 'value') => string

/** Accessible names of the controls of a timeline. The timeline writes no text of its own. */
export interface TimelineLabels {
  /** Name of the play button. */
  readonly play?: string
  /** Name of the handle of the start of the window. */
  readonly start?: string
  /** Name of the handle of the end of the window. */
  readonly end?: string
  /** Name of the window, which moves both ends at once. */
  readonly window?: string
  /**
   * Text of the window for assistive technologies, from the texts of its ends. Defaults to both
   * texts separated by a comma.
   */
  readonly range?: (start: string, end: string) => string
}

/** Options of `mountTimeline`. */
export interface TimelineViewOptions {
  /** Accessible names of the controls. */
  readonly labels?: TimelineLabels
  /** Accessible name of the whole timeline. */
  readonly ariaLabel?: string
  /**
   * Text of ticks and values. Defaults to dates and times written by `Intl.DateTimeFormat` for the
   * language of the page, as precise as the unit.
   */
  readonly format?: TimelineFormat
  /**
   * Height of the histogram, in CSS pixels.
   * @default 48
   */
  readonly height?: number
  /**
   * The wheel zooms the bar around the pointer, and pans it with Shift or a horizontal swipe.
   * @default true
   */
  readonly wheel?: boolean
  /**
   * Brushing and dragging snap the ends of the window to the bins. Alt turns snapping off for the
   * time of a gesture.
   * @default true
   */
  readonly snap?: boolean
}

/** A timeline in the page, made by `mountTimeline`. */
export interface TimelineView {
  /** The element of the timeline, for the application to place. */
  readonly element: HTMLElement
  /** Replaces the options. Options left out take their default value. */
  update(options?: TimelineViewOptions): void
  /** Removes the element. The timeline itself stays. */
  destroy(): void
}

const svgNamespace = 'http://www.w3.org/2000/svg'
const viewWidth = 1000
const dragSlop = 3
const pageStep = 10
const wheelScale = 300
let clips = 0
const border = `color-mix(in srgb, ${themeColor('ink')} 16%, transparent)`
const rootStyle = `display:grid;grid-template-columns:auto 1fr;column-gap:8px;row-gap:2px;align-items:center;box-sizing:border-box;padding:6px 10px;border:1px solid ${border};border-radius:4px;background:${themeColor('paper-raised')};color:${themeColor('ink')};font:11px/1.3 ${themeColor('font')};max-width:100%;user-select:none;-webkit-user-select:none`
const buttonStyle = `display:grid;place-items:center;width:28px;height:28px;padding:0;border:1px solid ${border};border-radius:50%;background:none;color:inherit;cursor:pointer`
const trackStyle = 'position:relative;touch-action:none;cursor:crosshair;min-width:0'
const brushStyle = `position:absolute;top:0;bottom:0;box-sizing:border-box;min-width:2px;border-inline:1px solid ${themeColor('accent')};background:color-mix(in srgb, ${themeColor('accent')} 10%, transparent);cursor:grab;outline-offset:1px`
const handleStyle = `position:absolute;top:50%;width:8px;height:22px;margin-left:-4px;transform:translateY(-50%);box-sizing:border-box;border:1px solid ${themeColor('accent')};border-radius:3px;background:${themeColor('paper-raised')};cursor:ew-resize;outline-offset:1px`
const ticksStyle = `grid-column:2;position:relative;height:14px;overflow:hidden;color:${themeColor('ink-muted')}`
const tickStyle = `position:absolute;top:0;padding-left:3px;border-left:1px solid ${border};white-space:nowrap`
const fills = {
  nodes: `color-mix(in srgb, ${themeColor('ink')} 30%, transparent)`,
  edges: `color-mix(in srgb, ${themeColor('ink')} 12%, transparent)`,
  nodesInside: themeColor('accent'),
  edgesInside: `color-mix(in srgb, ${themeColor('accent')} 38%, transparent)`,
}
const playIcon = 'M5 3.5v9l8-4.5z'
const pauseIcon = 'M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z'

const formats = new Map<string, Intl.DateTimeFormat>()

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const language = document.documentElement.lang || undefined
  const key = `${language ?? ''}|${JSON.stringify(options)}`
  let format = formats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(language, options)
    formats.set(key, format)
  }
  return format
}

function tickOptions(time: number, unit: TimeUnit): Intl.DateTimeFormatOptions {
  const date = new Date(time)
  if (unit === 'year') return { year: 'numeric' }
  if (unit === 'month') return date.getMonth() === 0 ? { year: 'numeric' } : { month: 'short' }
  if (unit === 'week' || unit === 'day') return { day: 'numeric', month: 'short' }
  if (unit === 'hour' || unit === 'minute') {
    return date.getHours() === 0 && date.getMinutes() === 0
      ? { day: 'numeric', month: 'short' }
      : { hour: '2-digit', minute: '2-digit' }
  }
  if (unit === 'second') return { hour: '2-digit', minute: '2-digit', second: '2-digit' }
  return { minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }
}

function valueOptions(unit: TimeUnit): Intl.DateTimeFormatOptions {
  if (unit === 'year') return { year: 'numeric' }
  if (unit === 'month') return { month: 'long', year: 'numeric' }
  if (unit === 'week' || unit === 'day') return { dateStyle: 'long' }
  if (unit === 'hour' || unit === 'minute') return { dateStyle: 'long', timeStyle: 'short' }
  if (unit === 'second') return { dateStyle: 'long', timeStyle: 'medium' }
  return { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }
}

function defaultFormat(time: number, unit: TimeUnit, use: 'tick' | 'value'): string {
  return formatter(use === 'tick' ? tickOptions(time, unit) : valueOptions(unit)).format(time)
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.style.cssText = style
  return node
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string | number>> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(svgNamespace, tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
  return node
}

type Drag =
  | { readonly kind: 'start'; readonly other: number | null }
  | { readonly kind: 'end'; readonly other: number | null }
  | { readonly kind: 'move'; readonly from: number; readonly window: TimeWindow }
  | { readonly kind: 'brush'; readonly from: number; readonly x: number; moved: boolean }

/**
 * Renders a timeline in a plain element styled by the `--graph-…` tokens: a play button, a
 * histogram of nodes and edges over time, the window as a brush with two handles, and ticks. The
 * window moves by pointer and keyboard; the wheel zooms the bar.
 */
export function mountTimeline(timeline: Timeline, options: TimelineViewOptions = {}): TimelineView {
  let settings = options
  let destroyed = false
  let drag: Drag | null = null
  let shownBins: readonly TimelineBin[] | null = null
  let shownTicks: TimelineState['ticks'] | null = null
  const clipId = `graph-timeline-clip-${++clips}`

  const root = element('div', rootStyle)
  root.setAttribute('data-graph-timeline', '')
  root.setAttribute('role', 'group')
  const button = element('button', buttonStyle)
  button.type = 'button'
  const icon = svg('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true' })
  const iconPath = svg('path', { d: playIcon, fill: 'currentColor' })
  icon.append(iconPath)
  button.append(icon)
  const track = element('div', trackStyle)
  const chart = svg('svg', {
    viewBox: `0 0 ${viewWidth} 100`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  })
  chart.style.cssText = 'display:block;width:100%;height:100%'
  const clip = svg('clipPath', { id: clipId })
  const clipRect = svg('rect', { x: 0, y: 0, width: viewWidth, height: 100 })
  clip.append(clipRect)
  const base = svg('g')
  const inside = svg('g', { 'clip-path': `url(#${clipId})` })
  chart.append(clip, base, inside)
  const brush = element('div', brushStyle)
  const startHandle = element('div', handleStyle)
  const endHandle = element('div', handleStyle)
  for (const node of [brush, startHandle, endHandle]) {
    node.tabIndex = 0
    node.setAttribute('role', 'slider')
    node.setAttribute('aria-orientation', 'horizontal')
  }
  brush.setAttribute('data-part', 'window')
  startHandle.setAttribute('data-part', 'start')
  endHandle.setAttribute('data-part', 'end')
  track.append(chart, brush, startHandle, endHandle)
  const ticks = element('div', ticksStyle)
  ticks.setAttribute('aria-hidden', 'true')
  root.append(button, track, ticks)

  function format(time: number, unit: TimeUnit, use: 'tick' | 'value'): string {
    return (settings.format ?? defaultFormat)(time, unit, use)
  }

  function share(time: number, state: TimelineState): number {
    const range = state.range
    if (!range) return 0
    return (time - range.start) / (range.end - range.start)
  }

  function drawBins(state: TimelineState): void {
    base.replaceChildren()
    inside.replaceChildren()
    let most = 0
    for (const bin of state.bins) most = Math.max(most, bin.nodes + bin.edges)
    if (most === 0) return
    for (const bin of state.bins) {
      const x = share(bin.start, state) * viewWidth
      const width = Math.max(0, (share(bin.end, state) - share(bin.start, state)) * viewWidth)
      const nodes = (bin.nodes / most) * 100
      const edges = (bin.edges / most) * 100
      const gap = width > 4 ? width * 0.12 : 0
      const bar = (y: number, height: number, fill: string) =>
        svg('rect', { x: x + gap / 2, y, width: Math.max(0, width - gap), height, fill })
      if (edges > 0) {
        base.append(bar(100 - nodes - edges, edges, fills.edges))
        inside.append(bar(100 - nodes - edges, edges, fills.edgesInside))
      }
      if (nodes > 0) {
        base.append(bar(100 - nodes, nodes, fills.nodes))
        inside.append(bar(100 - nodes, nodes, fills.nodesInside))
      }
    }
  }

  function drawTicks(state: TimelineState): void {
    ticks.replaceChildren()
    for (const tick of state.ticks) {
      const label = element('span', tickStyle)
      label.style.left = `${share(tick.time, state) * 100}%`
      label.textContent = format(tick.time, tick.unit, 'tick')
      ticks.append(label)
    }
  }

  function setValue(node: HTMLElement, now: number, min: number, max: number, text: string): void {
    node.setAttribute('aria-valuemin', String(Math.round(min)))
    node.setAttribute('aria-valuemax', String(Math.round(max)))
    node.setAttribute('aria-valuenow', String(Math.round(now)))
    node.setAttribute('aria-valuetext', text)
  }

  function label(node: HTMLElement, name: string | undefined): void {
    if (name) node.setAttribute('aria-label', name)
    else node.removeAttribute('aria-label')
  }

  function paint(state: TimelineState): void {
    const pressed = String(state.playing)
    if (button.getAttribute('aria-pressed') !== pressed) {
      button.setAttribute('aria-pressed', pressed)
      iconPath.setAttribute('d', state.playing ? pauseIcon : playIcon)
    }
    button.disabled = state.extent === null
    const window = state.window
    const range = state.range
    const extent = state.extent
    if (!window || !range || !extent) {
      clipRect.setAttribute('x', '0')
      clipRect.setAttribute('width', String(viewWidth))
      for (const node of [brush, startHandle, endHandle]) node.hidden = true
      return
    }
    const from = Math.max(0, Math.min(1, window.start === null ? 0 : share(window.start, state)))
    const to = Math.max(from, Math.min(1, window.end === null ? 1 : share(window.end, state)))
    clipRect.setAttribute('x', String(from * viewWidth))
    clipRect.setAttribute('width', String((to - from) * viewWidth))
    brush.hidden = false
    brush.style.left = `${from * 100}%`
    brush.style.width = `${(to - from) * 100}%`
    startHandle.hidden = window.start === null
    endHandle.hidden = window.end === null
    startHandle.style.left = `${from * 100}%`
    endHandle.style.left = `${to * 100}%`
    const low = Math.min(extent.start, range.start)
    const high = Math.max(extent.end, range.end)
    const start = window.start ?? low
    const end = window.end ?? high
    const startText = format(start, state.unit, 'value')
    const endText = format(end, state.unit, 'value')
    setValue(startHandle, start, low, end, startText)
    setValue(endHandle, end, start, high, endText)
    const join = settings.labels?.range ?? ((a: string, b: string) => `${a}, ${b}`)
    setValue(brush, start, low, high, join(startText, endText))
  }

  function render(): void {
    if (destroyed) return
    const state = timeline.store.state
    if (state.bins !== shownBins) {
      shownBins = state.bins
      drawBins(state)
    }
    if (state.ticks !== shownTicks) {
      shownTicks = state.ticks
      drawTicks(state)
    }
    paint(state)
  }

  function applySettings(): void {
    label(root, settings.ariaLabel)
    label(button, settings.labels?.play)
    label(startHandle, settings.labels?.start)
    label(endHandle, settings.labels?.end)
    label(brush, settings.labels?.window)
    track.style.height = `${Math.max(8, settings.height ?? 48)}px`
  }

  function timeAt(clientX: number): number {
    const state = timeline.store.state
    const range = state.range
    if (!range) return 0
    const box = track.getBoundingClientRect()
    const ratio = box.width > 0 ? (clientX - box.left) / box.width : 0
    return range.start + Math.max(0, Math.min(1, ratio)) * (range.end - range.start)
  }

  function snapTime(time: number, free: boolean): number {
    if (free || settings.snap === false) return time
    const bins = timeline.store.state.bins
    let best = time
    let distance = Number.POSITIVE_INFINITY
    for (const bin of bins) {
      for (const edge of [bin.start, bin.end]) {
        const gap = Math.abs(edge - time)
        if (gap < distance) {
          best = edge
          distance = gap
        }
      }
    }
    return best
  }

  function partOf(target: EventTarget | null): string | null {
    const node = target as HTMLElement | null
    return node && track.contains(node) ? node.getAttribute('data-part') : null
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !timeline.store.state.range) return
    const part = partOf(event.target)
    const window = timeline.store.state.window
    const time = timeAt(event.clientX)
    if (window && part === 'start') {
      drag = { kind: 'start', other: window.end }
    } else if (window && part === 'end') {
      drag = { kind: 'end', other: window.start }
    } else if (window && part === 'window') {
      drag = { kind: 'move', from: time, window }
      brush.style.cursor = 'grabbing'
    } else {
      drag = { kind: 'brush', from: snapTime(time, event.altKey), x: event.clientX, moved: false }
    }
    track.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  function shifted(window: TimeWindow, by: number): TimeWindow {
    return {
      start: window.start === null ? null : window.start + by,
      end: window.end === null ? null : window.end + by,
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const current = drag
    if (!current) return
    const time = timeAt(event.clientX)
    const free = event.altKey
    if (current.kind === 'start') {
      const at = snapTime(time, free)
      const other = current.other
      timeline.set({ start: other === null ? at : Math.min(at, other), end: other })
    } else if (current.kind === 'end') {
      const at = snapTime(time, free)
      const other = current.other
      timeline.set({ start: other, end: other === null ? at : Math.max(at, other) })
    } else if (current.kind === 'move') {
      const { window } = current
      const anchor = window.start ?? window.end ?? time
      timeline.set(shifted(window, snapTime(anchor + time - current.from, free) - anchor))
    } else {
      if (!current.moved && Math.abs(event.clientX - current.x) < dragSlop) return
      current.moved = true
      timeline.brush(current.from, snapTime(time, free))
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    const current = drag
    drag = null
    brush.style.cursor = 'grab'
    if (track.hasPointerCapture?.(event.pointerId)) track.releasePointerCapture(event.pointerId)
    if (current?.kind !== 'brush' || current.moved) return
    const time = timeAt(event.clientX)
    const state = timeline.store.state
    const window = state.window
    if (window && window.start !== null && window.end !== null) {
      const half = (window.end - window.start) / 2
      timeline.set(shifted(window, snapTime(time - half, event.altKey) - window.start))
      return
    }
    const bin = state.bins.find((candidate) => time >= candidate.start && time < candidate.end)
    if (bin) timeline.brush(bin.start, bin.end)
  }

  const onWheel = (event: WheelEvent) => {
    if (settings.wheel === false || !timeline.store.state.range) return
    event.preventDefault()
    const range = timeline.store.state.range
    const box = track.getBoundingClientRect()
    const deltaX = wheelPixels(event.deltaX, event.deltaMode, box.width)
    const deltaY = wheelPixels(event.deltaY, event.deltaMode, box.height)
    const horizontal = event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY)
    if (horizontal) {
      const delta = event.shiftKey && deltaX === 0 ? deltaY : deltaX
      if (box.width > 0) timeline.pan((delta / box.width) * (range.end - range.start))
      return
    }
    timeline.zoom(2 ** (-deltaY / wheelScale), timeAt(event.clientX))
  }

  const pinchGestures = listenPinch(track, {
    start: () => settings.wheel !== false && timeline.store.state.range !== null,
    change: ({ factor, clientX }) =>
      timeline.zoom(factor, clientX === null ? undefined : timeAt(clientX)),
  })

  function keyEnd(part: string | null): TimelineEnd | null {
    if (part === 'start' || part === 'end') return part
    return part === 'window' ? 'both' : null
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const end = keyEnd(partOf(event.target))
    if (!end) return
    const state = timeline.store.state
    const window = state.window
    const extent = state.extent
    let handled = true
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') timeline.nudge(end, 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') timeline.nudge(end, -1)
    else if (event.key === 'PageUp') timeline.nudge(end, pageStep)
    else if (event.key === 'PageDown') timeline.nudge(end, -pageStep)
    else if ((event.key === 'Home' || event.key === 'End') && window && extent) {
      const target = event.key === 'Home' ? extent.start : extent.end
      if (end === 'both') {
        const at = event.key === 'Home' ? window.start : window.end
        if (at !== null) timeline.set(shifted(window, target - at))
      } else if (end === 'start') {
        timeline.set({ start: Math.min(target, window.end ?? target), end: window.end })
      } else {
        timeline.set({ start: window.start, end: Math.max(target, window.start ?? target) })
      }
    } else handled = false
    if (handled) event.preventDefault()
  }

  const onClick = () => timeline.toggle()

  track.addEventListener('pointerdown', onPointerDown)
  track.addEventListener('pointermove', onPointerMove)
  track.addEventListener('pointerup', onPointerUp)
  track.addEventListener('pointercancel', onPointerUp)
  track.addEventListener('wheel', onWheel, { passive: false })
  track.addEventListener('keydown', onKeyDown)
  button.addEventListener('click', onClick)
  const subscription = timeline.store.subscribe(render)

  applySettings()
  render()

  return {
    element: root,
    update(next = {}) {
      if (destroyed) return
      settings = next
      shownBins = null
      shownTicks = null
      applySettings()
      render()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      subscription.unsubscribe()
      track.removeEventListener('pointerdown', onPointerDown)
      track.removeEventListener('pointermove', onPointerMove)
      track.removeEventListener('pointerup', onPointerUp)
      track.removeEventListener('pointercancel', onPointerUp)
      track.removeEventListener('wheel', onWheel)
      pinchGestures.stop()
      track.removeEventListener('keydown', onKeyDown)
      button.removeEventListener('click', onClick)
      root.remove()
    },
  }
}
