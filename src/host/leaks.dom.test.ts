import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { densityBundling } from '../bundling'
import { defineGraph } from '../define-graph'
import { force } from '../layouts/force'
import { createLegend, mountLegend } from '../legend'
import { edges, nodes } from '../marks'
import { fakeRenderer } from '../testing/dom'
import { createTimeline, mountTimeline } from '../timeline'
import { createGraphHost, type GraphInstance } from './mount-graph'

class FakeWorker {
  static live = 0
  onmessage: unknown = null
  onerror: unknown = null
  terminated = false
  constructor() {
    FakeWorker.live++
  }
  postMessage(): void {}
  terminate(): void {
    if (!this.terminated) FakeWorker.live--
    this.terminated = true
  }
}

vi.mock('../minimap/worker?worker&inline', () => ({ default: FakeWorker }))

const { createMinimap } = await import('../minimap')

interface Item {
  readonly id: string
  readonly group: string
  readonly time: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = Array.from({ length: 30 }, (_, i) => ({
  id: `n${i}`,
  group: `g${i % 3}`,
  time: i * 1000,
}))
const links: Link[] = items.slice(1).map((item, i) => ({
  id: `e${i}`,
  from: items[i]?.id ?? 'n0',
  to: item.id,
}))

function definition() {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', flow: true }),
      nodes<Item>(items, { color: 'group', time: 'time' }),
    ],
    layout: force({ engine: 'cpu' }),
    bundling: densityBundling(),
    interaction: { lens: true },
    states: { lit: { opacity: 0.5 } },
  })
}

interface Census {
  windowListeners: number
  documentListeners: number
  mediaListeners: number
  resizeTargets: number
  intersectionTargets: number
  mutationObservers: number
  frames: number
  timers: number
}

const census: Census = {
  windowListeners: 0,
  documentListeners: 0,
  mediaListeners: 0,
  resizeTargets: 0,
  intersectionTargets: 0,
  mutationObservers: 0,
  frames: 0,
  timers: 0,
}

const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
const timers = new Set<unknown>()
const restore: (() => void)[] = []

function track(target: EventTarget, key: 'windowListeners' | 'documentListeners'): void {
  const add = target.addEventListener.bind(target)
  const remove = target.removeEventListener.bind(target)
  const seen = new Set<string>()
  const id = new WeakMap<object, number>()
  let next = 0
  const keyOf = (type: string, listener: unknown, options: unknown) => {
    const capture =
      typeof options === 'boolean'
        ? options
        : Boolean((options as AddEventListenerOptions | undefined)?.capture)
    if (!id.has(listener as object)) id.set(listener as object, next++)
    return `${type}:${id.get(listener as object)}:${capture}`
  }
  target.addEventListener = ((type: string, listener: EventListener, options?: unknown) => {
    if (listener) {
      const k = keyOf(type, listener, options)
      if (!seen.has(k)) {
        seen.add(k)
        census[key]++
      }
      const signal = (options as AddEventListenerOptions | undefined)?.signal
      signal?.addEventListener('abort', () => {
        if (seen.delete(k)) census[key]--
      })
    }
    add(type, listener, options as AddEventListenerOptions)
  }) as typeof target.addEventListener
  target.removeEventListener = ((type: string, listener: EventListener, options?: unknown) => {
    if (listener && seen.delete(keyOf(type, listener, options))) census[key]--
    remove(type, listener, options as EventListenerOptions)
  }) as typeof target.removeEventListener
  restore.push(() => {
    target.addEventListener = add
    target.removeEventListener = remove
  })
}

function install(): void {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  vi.stubGlobal('setTimeout', (callback: () => void, delay?: number, ...args: unknown[]) => {
    const handle = realSetTimeout(() => {
      timers.delete(handle)
      callback(...(args as []))
    }, delay)
    timers.add(handle)
    return handle
  })
  vi.stubGlobal('clearTimeout', (handle: unknown) => {
    timers.delete(handle)
    realClearTimeout(handle as number)
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      #targets = new Set<Element>()
      constructor(readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        if (!this.#targets.has(target)) census.resizeTargets++
        this.#targets.add(target)
        this.callback(
          [{ target, contentRect: { width: 800, height: 600 } } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        )
      }
      unobserve(target: Element) {
        if (this.#targets.delete(target)) census.resizeTargets--
      }
      disconnect() {
        census.resizeTargets -= this.#targets.size
        this.#targets.clear()
      }
    },
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      #targets = new Set<Element>()
      observe(target: Element) {
        if (!this.#targets.has(target)) census.intersectionTargets++
        this.#targets.add(target)
      }
      unobserve(target: Element) {
        if (this.#targets.delete(target)) census.intersectionTargets--
      }
      disconnect() {
        census.intersectionTargets -= this.#targets.size
        this.#targets.clear()
      }
    },
  )
  const RealMutation = globalThis.MutationObserver
  vi.stubGlobal(
    'MutationObserver',
    class extends RealMutation {
      #on = false
      override observe(target: Node, options?: MutationObserverInit) {
        if (!this.#on) census.mutationObservers++
        this.#on = true
        super.observe(target, options)
      }
      override disconnect() {
        if (this.#on) census.mutationObservers--
        this.#on = false
        super.disconnect()
      }
    },
  )
  const realMatch = window.matchMedia.bind(window)
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = realMatch(query)
    const add = list.addEventListener.bind(list)
    const remove = list.removeEventListener.bind(list)
    const seen = new Set<unknown>()
    list.addEventListener = ((type: string, listener: EventListener) => {
      if (!seen.has(listener)) census.mediaListeners++
      seen.add(listener)
      add(type, listener)
    }) as typeof list.addEventListener
    list.removeEventListener = ((type: string, listener: EventListener) => {
      if (seen.delete(listener)) census.mediaListeners--
      remove(type, listener)
    }) as typeof list.removeEventListener
    return list
  })
  window.matchMedia = globalThis.matchMedia
  track(window, 'windowListeners')
  track(document, 'documentListeners')
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('OffscreenCanvas', class {})
  vi.stubGlobal('ImageBitmapRenderingContext', class {})
  const original = HTMLCanvasElement.prototype.getContext
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    if (kind === 'bitmaprenderer') return { transferFromImageBitmap: () => {} }
    return original.call(this, kind as '2d')
  } as typeof HTMLCanvasElement.prototype.getContext)
}

function flush(rounds = 5): void {
  for (let round = 0; round < rounds && frames.size > 0; round++) {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(performance.now() + 10_000)
  }
}

function snapshot(): Census & { worker: number; frames: number; timers: number } {
  return { ...census, frames: frames.size, timers: timers.size, worker: FakeWorker.live }
}

function mountAll(): { graph: GraphInstance; destroy: () => void } {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(), ariaLabel: 'g' },
    fakeRenderer,
  )
  const legend = createLegend(graph, { highlight: 'lit' })
  const legendView = mountLegend(legend)
  const minimap = createMinimap(graph)
  const timeline = createTimeline(graph)
  const timelineView = mountTimeline(timeline)
  container.append(legendView.element, timelineView.element)
  const badge = document.createElement('span')
  graph.anchors.set(badge, { node: 'n1', side: 'top' })
  graph.lens.set({ at: { x: 100, y: 100 } })
  return {
    graph,
    destroy: () => {
      graph.destroy()
      legendView.destroy()
      timelineView.destroy()
      minimap.destroy()
      container.remove()
    },
  }
}

beforeEach(() => {
  install()
})

afterEach(() => {
  for (const undo of restore.splice(0)) undo()
  for (const handle of timers) clearTimeout(handle as number)
  timers.clear()
  frames.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('global resources', () => {
  it('counts what a mounted graph holds', () => {
    const baseline = snapshot()
    const { destroy } = mountAll()
    flush(2)
    const live = snapshot()
    expect(live.windowListeners).toBeGreaterThan(baseline.windowListeners)
    expect(live.documentListeners).toBeGreaterThan(baseline.documentListeners)
    expect(live.mediaListeners).toBeGreaterThan(baseline.mediaListeners)
    expect(live.resizeTargets).toBeGreaterThan(baseline.resizeTargets)
    expect(live.intersectionTargets).toBeGreaterThan(baseline.intersectionTargets)
    expect(live.mutationObservers).toBeGreaterThan(baseline.mutationObservers)
    expect(live.worker).toBeGreaterThan(baseline.worker)
    expect(live.timers).toBeGreaterThan(baseline.timers)
    destroy()
  })

  it('releases every global resource at destroy, even mid-layout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const baseline = snapshot()
    for (let round = 0; round < 20; round++) {
      const { destroy } = mountAll()
      flush(2)
      await new Promise((resolve) => setTimeout(resolve, 0))
      destroy()
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    flush()
    expect(snapshot()).toEqual(baseline)
  })

  it('releases everything when destroyed before the first frame', () => {
    const baseline = snapshot()
    for (let round = 0; round < 20; round++) mountAll().destroy()
    expect(snapshot()).toEqual(baseline)
  })
})

describe('companions of a destroyed graph', () => {
  function destroyedGraph(): GraphInstance {
    const { graph, destroy } = mountAll()
    flush(2)
    destroy()
    return graph
  }

  it('opens no worker, observer or timer for a minimap', () => {
    const graph = destroyedGraph()
    const baseline = snapshot()
    const minimap = createMinimap(graph, { corner: 'topLeft' })
    flush()
    expect(snapshot()).toEqual(baseline)
    expect(minimap.element.isConnected).toBe(false)
    minimap.update({ corner: 'bottomRight' })
    expect(snapshot()).toEqual(baseline)
  })

  it('makes an empty legend that never changes', () => {
    const graph = destroyedGraph()
    const baseline = snapshot()
    const legend = createLegend(graph, { highlight: 'lit' })
    const view = mountLegend(legend)
    flush()
    expect(legend.store.state.color).toBeNull()
    legend.toggle('c:string:g0')
    expect(legend.store.state.off).toEqual([])
    expect(snapshot()).toEqual(baseline)
    view.destroy()
  })

  it('makes a timeline that never plays', () => {
    const graph = destroyedGraph()
    const baseline = snapshot()
    const timeline = createTimeline(graph, { loop: true })
    const view = mountTimeline(timeline)
    timeline.play()
    expect(timeline.store.state.extent).toBeNull()
    expect(timeline.store.state.playing).toBe(false)
    expect(snapshot()).toEqual(baseline)
    view.destroy()
  })
})
