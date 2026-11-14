import { createStore } from '@tanstack/store'
import { groupKey } from '../core/group-index'
import type { GraphIssue } from '../core/issues'
import { noReach } from '../core/path-query'
import { Positions } from '../core/positions'
import { createScene } from '../core/scene'
import { freeStateNames } from '../core/state-names'
import { noWalk } from '../core/support'
import { readWindow } from '../core/time-range'
import { toScreen, toWorld } from '../core/view'
import { dev } from '../dev'
import type { Key, Mark, Point } from '../types'
import { loadedData } from './data-status'
import { emptyKeys, toKeys } from './element-keys'
import type { ElementKeys } from './events'
import { exposeSnapshot } from './export-source'
import type {
  GraphCount,
  GraphInstance,
  GraphShapeCount,
  GraphState,
  GraphStore,
  MountGraphOptions,
} from './graph-instance'
import { exposeInternals } from './internals'
import { lensContains, lensView } from './lens'
import { readonlyOf } from './readonly-store'

interface Waiter {
  readonly resolve: () => void
  readonly reject: (reason: unknown) => void
}

const idle = Object.freeze({ running: false })
const idleLayout = Object.freeze({ running: false, progress: 0 })
const noIssues: readonly GraphIssue[] = Object.freeze([])
const noCount: GraphCount = Object.freeze({
  nodes: 0,
  edges: 0,
  pending: 0,
  shown: Object.freeze({ nodes: 0, edges: 0 }),
})
const noShapeCount: GraphShapeCount = Object.freeze({
  nodes: 0,
  edges: 0,
  pending: 0,
  shapes: 0,
  pendingShapes: 0,
  shown: Object.freeze({ nodes: 0, edges: 0, shapes: 0 }),
})

function nothing(): void {}

export function destroyedReason(): DOMException {
  return new DOMException('graph: the graph was destroyed', 'AbortError')
}

export function destroyedError(): Error {
  return new Error('graph: cannot export a destroyed graph')
}

export class FrameWaiters {
  readonly #pending: () => boolean
  #drawn: Waiter[] = []
  #idle: Waiter[] = []
  #request = 0

  constructor(pending: () => boolean) {
    this.#pending = pending
  }

  wait(): Promise<void> {
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject }
      if (this.#pending()) {
        this.#drawn.push(waiter)
        return
      }
      this.#idle.push(waiter)
      if (this.#request === 0) this.#request = requestAnimationFrame(() => this.#settleIdle())
    })
  }

  drawn(): void {
    if (this.#drawn.length === 0 && this.#idle.length === 0) return
    const waiting = [...this.#drawn, ...this.#idle]
    this.#drawn = []
    this.#idle = []
    for (const waiter of waiting) waiter.resolve()
  }

  reject(reason: unknown): void {
    if (this.#request !== 0) cancelAnimationFrame(this.#request)
    this.#request = 0
    const waiting = [...this.#drawn, ...this.#idle]
    this.#drawn = []
    this.#idle = []
    for (const waiter of waiting) waiter.reject(reason)
  }

  #settleIdle(): void {
    this.#request = 0
    const waiting = this.#idle
    this.#idle = []
    if (this.#pending()) {
      this.#drawn.push(...waiting)
      return
    }
    for (const waiter of waiting) waiter.resolve()
  }
}

export function afterDestroy<S extends string, M extends Mark>(
  store: GraphStore<S, M>,
  element: HTMLElement,
  signal: AbortSignal,
  reason: () => unknown,
  shaped: () => boolean,
): GraphInstance<S, M> {
  const state = (): GraphState => store.state as GraphState
  const size = () => ({ width: state().width, height: state().height })
  const has = (keys: ElementKeys | undefined, kind: 'node' | 'edge' | 'shape', key: Key) =>
    (kind === 'node' ? keys?.nodes : kind === 'edge' ? keys?.edges : keys?.shapes)?.includes(key) ??
    false
  const graph: GraphInstance = {
    store,
    view: {
      get: () => state().view,
      set: nothing,
      fit: nothing,
      zoomBy: nothing,
      toScreen: (point) => toScreen(state().view, size(), point),
      toWorld: (point) => toWorld(state().view, size(), point),
    },
    selection: { get: () => state().selection, set: nothing, clear: nothing },
    focus: { get: () => state().focused, set: nothing },
    states: {
      set: nothing,
      add: nothing,
      remove: nothing,
      clear: nothing,
      has: (name, target) => has(state().states[name], target.kind, target.key),
      get: (name) => state().states[name] ?? emptyKeys(shaped()),
    },
    positions: { get: () => undefined, set: nothing, snapshot: () => new Map() },
    layout: { run: () => Promise.resolve(false), stop: nothing },
    anchors: { set: () => nothing, remove: nothing },
    groups: {
      folded: () => state().folded,
      isFolded: (key) => state().folded.includes(key),
      fold: nothing,
      unfold: nothing,
      toggle: nothing,
      set: nothing,
      parent: () => undefined,
      children: () => [],
      keyOf: (name, value, parent) => groupKey(name, value, parent),
    },
    paths: { shortest: () => null, reach: () => noReach },
    layers: {
      names: () => [],
      hidden: () => state().hiddenLayers,
      isHidden: (name) => state().hiddenLayers.includes(name),
      hide: nothing,
      show: nothing,
      toggle: nothing,
      set: nothing,
    },
    support: { carriers: () => noWalk, carried: () => noWalk },
    bundling: { run: () => Promise.resolve(false) },
    routing: { run: () => Promise.resolve(false) },
    time: { get: () => state().time, set: nothing },
    lens: {
      get: () => state().lens,
      set: nothing,
      toWorld: (point: Point) => {
        const { view, lens } = state()
        const seen = lens && lensContains(lens, point) ? lensView(view, size(), lens) : view
        return toWorld(seen, size(), point)
      },
    },
    element,
    signal,
    destroyed: true,
    pick: () => null,
    neighbors: () => [],
    edgesOf: () => [],
    endpoints: () => undefined,
    datumOf: () => undefined,
    issues: () => noIssues,
    count: () => (shaped() ? noShapeCount : noCount),
    on: () => nothing,
    drawn: () => Promise.reject(reason()),
    loaded: () => Promise.reject(reason()),
    update: nothing,
    destroy: nothing,
  }
  return graph as unknown as GraphInstance<S, M>
}

function plain(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  )
}

export function untilDestroyed<T extends object>(live: T, dead: T, destroyed: () => boolean): T {
  const alive = live as Record<string, unknown>
  const gone = dead as Record<string, unknown>
  const guarded: Record<string, unknown> = {}
  for (const key of Object.keys(gone)) {
    const fallback = gone[key]
    if (typeof fallback === 'function') {
      guarded[key] = (...args: unknown[]) => {
        const owner = destroyed() ? gone : alive
        return (owner[key] as (...args: unknown[]) => unknown).apply(owner, args)
      }
    } else if (plain(fallback)) {
      guarded[key] = untilDestroyed(alive[key] as object, fallback, destroyed)
    } else {
      Object.defineProperty(guarded, key, { enumerable: true, get: () => alive[key] })
    }
  }
  return guarded as T
}

export function stillborn<S extends string, M extends Mark>(
  options: MountGraphOptions<S, M>,
  signal: AbortSignal,
): GraphInstance<S, M> {
  if (dev) console.warn('graph: the signal was aborted before the mount, nothing was mounted')
  const { definition } = options
  const shaped = definition.marks.some((mark) => mark.type === 'shapes')
  const element = document.createElement('div')
  element.setAttribute('data-graph', '')
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', options.ariaLabel)
  const store = createStore<GraphState>({
    view: options.view ?? options.initialView ?? { x: 0, y: 0, zoom: 1 },
    width: 0,
    height: 0,
    hovered: null,
    focused: null,
    selection: options.selection ? toKeys(options.selection, shaped) : emptyKeys(shaped),
    states: Object.fromEntries(
      freeStateNames(definition.states).map((name) => [name, emptyKeys(shaped)]),
    ),
    positionsVersion: 0,
    layout: idleLayout,
    folded: [...(options.folded ?? options.initialFolded ?? [])],
    bundling: idle,
    routing: idle,
    time: readWindow(options.time ?? options.initialTime ?? null),
    lens: null,
    hiddenLayers: [...new Set<string>(options.hiddenLayers ?? options.initialHiddenLayers ?? [])],
    data: loadedData,
  })
  const graph = afterDestroy(
    readonlyOf(store),
    element,
    signal,
    () => signal.reason,
    () => shaped,
  )
  const scene = createScene()
  scene.setDefinition(definition)
  exposeInternals(graph, {
    onMap: false,
    scene,
    positions: new Positions(),
    definition: () => definition,
    containers: () => null,
    palette: () => new Uint8Array(0),
    masks: () => new Uint32Array(0),
    edgeMembers: () => null,
    sight: () => ({ zoom: 1, time: null, layers: null, hide: null }),
    stamp: () => ({ scene: 0, positions: 0, palette: 0, containers: -1, detail: 0 }),
    watch: (watcher) => {
      watcher.destroy()
      return nothing
    },
    tool: () => false,
    draft: () => {},
    shape: () => null,
    globe: () => null,
  })
  exposeSnapshot(graph, () => {
    throw destroyedError()
  })
  return graph as unknown as GraphInstance<S, M>
}
