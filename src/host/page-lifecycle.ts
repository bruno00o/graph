import { toWorld } from '../core/view'
import type { Mark, Point } from '../types'
import { canvasCapabilities } from './canvas-surface'
import type {
  GraphInstance,
  GraphState,
  GraphStore,
  MountGraphOptions,
  SurfaceCapabilities,
} from './graph-instance'
import { lensContains, lensView } from './lens'
import { coreAfterDestroy, coreStillborn, nothing } from './lifecycle'

interface Waiter {
  readonly resolve: () => void
  readonly reject: (reason: unknown) => void
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

export function graphElement(label: string): HTMLDivElement {
  const element = document.createElement('div')
  element.setAttribute('data-graph', '')
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', label)
  return element
}

export function afterDestroy<S extends string, M extends Mark>(
  store: GraphStore<S, M>,
  element: HTMLElement,
  signal: AbortSignal,
  reason: () => unknown,
  shaped: () => boolean,
  onMap = false,
): GraphInstance<S, M> {
  const state = (): GraphState => store.state as GraphState
  const size = () => ({ width: state().width, height: state().height })
  const graph: GraphInstance = {
    ...coreAfterDestroy(store as GraphStore, signal, reason, shaped),
    focus: { get: () => state().focused, set: nothing },
    anchors: { set: () => nothing, remove: nothing },
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
    drawsOnMap: onMap,
    drawn: () => Promise.reject(reason()),
    suspend: nothing,
    resume: nothing,
  }
  return graph as unknown as GraphInstance<S, M>
}

export function stillborn<S extends string, M extends Mark>(
  options: MountGraphOptions<S, M>,
  signal: AbortSignal,
  capabilities: SurfaceCapabilities = canvasCapabilities,
): GraphInstance<S, M> {
  return coreStillborn(options, capabilities, (store, shaped) =>
    afterDestroy(
      store,
      graphElement(options.ariaLabel),
      signal,
      () => signal.reason,
      shaped,
      capabilities.onMap,
    ),
  )
}
