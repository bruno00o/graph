import { createStore, type Store } from '@tanstack/store'
import { createGraphModel, type GraphChanges } from '../core/graph-model'
import { Positions, placeNodes } from '../core/positions'
import { createScene } from '../core/scene'
import { StateBuffers } from '../core/state-buffers'
import {
  type Bounds,
  easeInOut,
  fitBounds,
  interpolateView,
  panBy,
  toScreen,
  toWorld,
  wheelFactor,
  zoomAround,
} from '../core/view'
import { observeTheme, ThemeResolver } from '../dom/theme'
import type { GraphDefinition, Key, Point, View } from '../types'
import { createWebglRenderer } from '../webgl/renderer'
import type { Renderer } from './renderer'

export interface GraphState {
  readonly view: View
  readonly width: number
  readonly height: number
}

export interface ViewOptions {
  readonly duration?: number
}

export interface FitOptions extends ViewOptions {
  readonly padding?: number
}

export interface GraphView {
  get(): View
  set(view: View, options?: ViewOptions): void
  fit(keys?: Iterable<Key>, options?: FitOptions): void
  zoomBy(factor: number, options?: ViewOptions): void
  toScreen(point: Point): Point
  toWorld(point: Point): Point
}

export interface MountGraphOptions {
  readonly definition: GraphDefinition
  readonly ariaLabel: string
  readonly initialView?: View
}

export interface GraphInstance {
  readonly store: Store<GraphState>
  readonly view: GraphView
  readonly element: HTMLElement
  update(options: Partial<Omit<MountGraphOptions, 'initialView'>>): void
  destroy(): void
}

export type RendererFactory = (canvas: HTMLCanvasElement) => Renderer

interface Animation {
  readonly from: View
  readonly to: View
  readonly start: number
  readonly duration: number
}

const defaultPadding = 32

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function createGraphHost(
  container: HTMLElement,
  options: MountGraphOptions,
  createRenderer: RendererFactory,
): GraphInstance {
  let definition = options.definition
  const element = document.createElement('div')
  element.setAttribute('data-graph', '')
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', options.ariaLabel)
  element.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden'
  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none'
  element.append(canvas)
  container.append(element)

  let frameRequest = 0
  let needsFlush = false
  let full = true
  let destroyed = false
  let contextLost = false
  let positionsVersion = -1
  let paletteCount = 0
  let paletteColors = new Uint8Array(256 * 4)
  let animation: Animation | null = null
  let pendingFit: FitOptions | null = options.initialView ? null : { padding: defaultPadding }
  let pixelRatio = window.devicePixelRatio || 1

  const store = createStore<GraphState>({
    view: options.initialView ?? { x: 0, y: 0, zoom: 1 },
    width: 0,
    height: 0,
  })
  const model = createGraphModel({ schedule: () => request(true) })
  const scene = createScene()
  const positions = new Positions()
  const states = new StateBuffers()
  const themeResolver = new ThemeResolver(element)
  let renderer = createRenderer(canvas)

  function request(flush = false): void {
    if (flush) needsFlush = true
    if (frameRequest !== 0 || destroyed) return
    frameRequest = requestAnimationFrame(frame)
  }

  function setView(view: View): void {
    store.setState((state) => ({ ...state, view }))
    request()
  }

  function viewport(): { width: number; height: number } {
    const { width, height } = store.get()
    return { width, height }
  }

  function resolvePalette(from: number): void {
    const colors = scene.palette.colors
    if (colors.length * 4 > paletteColors.length) {
      const next = new Uint8Array(Math.max(colors.length * 4, paletteColors.length * 2))
      next.set(paletteColors)
      paletteColors = next
    }
    themeResolver.palette(colors, paletteColors, from)
    paletteCount = colors.length
    renderer.setPalette(paletteColors, paletteCount)
  }

  function refreshTheme(): void {
    renderer.setTheme(themeResolver.theme())
    resolvePalette(0)
    request()
  }

  function bounds(keys?: Iterable<Key>): Bounds | null {
    const nodes = scene.nodes
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const include = (index: number) => {
      if (nodes.alive[index] !== 1) return
      const radius = nodes.screenUnits[index] === 1 ? 0 : (nodes.size[index] ?? 0) / 2
      minX = Math.min(minX, positions.x(index) - radius)
      minY = Math.min(minY, positions.y(index) - radius)
      maxX = Math.max(maxX, positions.x(index) + radius)
      maxY = Math.max(maxY, positions.y(index) + radius)
    }
    if (keys) {
      for (const key of keys) {
        const record = model.node(key)
        if (record) include(record.index)
      }
    } else {
      for (let index = 0; index < nodes.capacity; index++) include(index)
    }
    return maxX < minX ? null : { minX, minY, maxX, maxY }
  }

  function animateTo(target: View, duration = 0): void {
    const ms = reducedMotion() ? 0 : duration
    if (ms <= 0) {
      animation = null
      setView(target)
      return
    }
    animation = { from: store.get().view, to: target, start: performance.now(), duration: ms }
    request()
  }

  function fitTo(keys: Iterable<Key> | undefined, fitOptions: FitOptions): boolean {
    const box = bounds(keys)
    const size = viewport()
    if (!box || size.width === 0 || size.height === 0) return false
    animateTo(fitBounds(box, size, fitOptions.padding ?? defaultPadding), fitOptions.duration)
    return true
  }

  function applyChanges(changes: GraphChanges): void {
    scene.apply(model, changes)
    placeNodes(model, positions, changes)
  }

  function frame(now: number): void {
    frameRequest = 0
    if (destroyed || contextLost) return
    if (needsFlush) {
      needsFlush = false
      applyChanges(model.flush())
    }
    if (pendingFit && fitTo(undefined, pendingFit)) pendingFit = null
    if (animation) {
      const t = Math.min(1, (now - animation.start) / animation.duration)
      const view = interpolateView(animation.from, animation.to, easeInOut(t))
      if (t >= 1) animation = null
      store.setState((state) => ({ ...state, view }))
    }
    const dirty = scene.takeDirty()
    if (dirty.palette || scene.palette.colors.length !== paletteCount) resolvePalette(paletteCount)
    states.reserve(scene.nodes.capacity, scene.edges.capacity)
    renderer.sync({
      scene,
      dirty,
      positions,
      positionsChanged: positions.version !== positionsVersion,
      states,
      full,
    })
    full = false
    positionsVersion = positions.version
    const { view, width, height } = store.get()
    const pending = renderer.render({ view, width, height, pixelRatio })
    if (pending || animation) request()
  }

  function resize(width: number, height: number): void {
    pixelRatio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * pixelRatio))
    canvas.height = Math.max(1, Math.round(height * pixelRatio))
    store.setState((state) => ({ ...state, width, height }))
    request()
  }

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1]
    if (entry) resize(entry.contentRect.width, entry.contentRect.height)
  })
  resizeObserver.observe(element)
  const stopTheme = observeTheme(element, refreshTheme)

  let drag: { id: number; x: number; y: number } | null = null

  function local(event: PointerEvent | WheelEvent): Point {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !definition.interaction.pan) return
    animation = null
    drag = { id: event.pointerId, ...local(event) }
    canvas.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return
    const point = local(event)
    const view = panBy(store.get().view, point.x - drag.x, point.y - drag.y)
    drag = { id: drag.id, ...point }
    setView(view)
  }

  function onPointerUp(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return
    drag = null
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }

  function onWheel(event: WheelEvent): void {
    const zoom = definition.interaction.zoom
    if (!zoom) return
    event.preventDefault()
    animation = null
    const { view, height } = store.get()
    const factor = wheelFactor(event.deltaY, event.deltaMode, height, zoom.speed)
    setView(zoomAround(view, viewport(), local(event), factor))
  }

  function onContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
  }

  function onContextRestored(): void {
    contextLost = false
    renderer = createRenderer(canvas)
    full = true
    refreshTheme()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)

  model.setMarks(definition.marks)
  scene.setDefinition(definition)
  refreshTheme()
  request(true)

  const view: GraphView = {
    get: () => store.get().view,
    set: (next, viewOptions = {}) => animateTo(next, viewOptions.duration),
    fit: (keys, fitOptions = {}) => {
      if (!fitTo(keys, fitOptions)) pendingFit = keys ? null : fitOptions
    },
    zoomBy: (factor, viewOptions = {}) => {
      const size = viewport()
      const center = { x: size.width / 2, y: size.height / 2 }
      animateTo(zoomAround(store.get().view, size, center, factor), viewOptions.duration)
    },
    toScreen: (point) => toScreen(store.get().view, viewport(), point),
    toWorld: (point) => toWorld(store.get().view, viewport(), point),
  }

  return {
    store,
    view,
    element,
    update(next) {
      if (next.ariaLabel !== undefined) element.setAttribute('aria-label', next.ariaLabel)
      if (next.definition && next.definition !== definition) {
        definition = next.definition
        model.setMarks(definition.marks)
        scene.setDefinition(definition)
        request(true)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      if (frameRequest !== 0) cancelAnimationFrame(frameRequest)
      resizeObserver.disconnect()
      stopTheme()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      model.destroy()
      renderer.destroy()
      themeResolver.destroy()
      element.remove()
    },
  }
}

export function mountGraph(container: HTMLElement, options: MountGraphOptions): GraphInstance {
  return createGraphHost(container, options, createWebglRenderer)
}
