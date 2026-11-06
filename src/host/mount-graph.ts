import { createStore, type ReadonlyStore } from '@tanstack/store'
import { createGraphModel, type Endpoints, type GraphChanges } from '../core/graph-model'
import { nodesInside } from '../core/lasso'
import { PickIndex, type PickSource } from '../core/pick-index'
import { type PositionMoves, Positions, placeNodes } from '../core/positions'
import { createScene } from '../core/scene'
import { type ResolvedStateStyle, StateBuffers, type StateKind } from '../core/state-buffers'
import { freeStateNames, isBuiltInState } from '../core/state-names'
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
import { dev } from '../dev'
import { observeTheme, ThemeResolver } from '../dom/theme'
import { builtInStyles } from '../theme/tokens'
import type { FreeState, GraphDefinition, Key, Point, StateStyle, View } from '../types'
import { createWebglRenderer } from '../webgl/renderer'
import {
  type ElementKeys,
  type ElementKeysInput,
  Emitter,
  type GraphEventHandler,
  type GraphEventName,
  type GraphTarget,
} from './events'
import type { Renderer } from './renderer'
import { StateRegistry } from './state-registry'

export interface GraphState<S extends string = string> {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly hovered: GraphTarget | null
  readonly selection: ElementKeys
  readonly states: { readonly [K in FreeState<S>]: ElementKeys }
  readonly positionsVersion: number
}

export type GraphStore<S extends string = string> = ReadonlyStore<GraphState<S>>

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

export interface GraphElement {
  readonly kind: 'node' | 'edge'
  readonly key: Key
}

export interface GraphSelection {
  get(): ElementKeys
  set(keys: ElementKeysInput): void
  clear(): void
}

export interface GraphStates<N extends string = string> {
  set(name: N, keys: ElementKeysInput): void
  add(name: N, keys: ElementKeysInput): void
  remove(name: N, keys: ElementKeysInput): void
  clear(name?: N): void
  has(name: N, element: GraphElement): boolean
}

export interface GraphPositions {
  get(key: Key): Point | undefined
  set(entries: Iterable<readonly [Key, Point]>, options?: ViewOptions): void
}

export interface MountGraphOptions<S extends string = string> {
  readonly definition: GraphDefinition<S>
  readonly ariaLabel: string
  readonly initialView?: View
  readonly selection?: ElementKeysInput
  readonly onSelectionChange?: (selection: ElementKeys) => void
}

export interface GraphInstance<S extends string = string> {
  readonly store: GraphStore<S>
  readonly view: GraphView
  readonly selection: GraphSelection
  readonly states: GraphStates<FreeState<S>>
  readonly positions: GraphPositions
  readonly element: HTMLElement
  pick(point: Point): GraphTarget | null
  neighbors(key: Key): Key[]
  edgesOf(key: Key): Key[]
  endpoints(key: Key): Endpoints | undefined
  on<K extends GraphEventName>(name: K, handler: GraphEventHandler<K>): () => void
  update(options: Partial<Omit<MountGraphOptions<S>, 'initialView'>>): void
  destroy(): void
}

export type RendererFactory = (canvas: HTMLCanvasElement, invalidate: () => void) => Renderer

interface ViewAnimation {
  readonly from: View
  readonly to: View
  readonly start: number
  readonly duration: number
}

interface PositionAnimation {
  readonly id: number
  readonly indices: readonly number[]
  readonly from: Float32Array
  readonly to: Float32Array
  readonly start: number
  readonly duration: number
}

interface Gesture {
  readonly id: number
  readonly start: Point
  readonly target: GraphTarget | null
  readonly drag: NodeDrag | null
  readonly lasso: Point[] | null
  last: Point
  moved: boolean
}

const svgNamespace = 'http://www.w3.org/2000/svg'
const lassoStep = 3
const lassoStyle =
  'fill:color-mix(in srgb,var(--graph-accent,#c93700) 10%,transparent);stroke:var(--graph-accent,#c93700);stroke-width:1.5;stroke-dasharray:4 3;stroke-linejoin:round'

interface NodeDrag {
  readonly target: GraphTarget & { readonly kind: 'node' }
  readonly indices: readonly number[]
  readonly keys: readonly Key[]
  readonly offsets: Float32Array
  started: boolean
}

const defaultPadding = 32
const clickSlop = 4
const pickTolerance = 4
const highlightOrder = 2 ** 40
const layerOrder = 2 ** 26
const kindOf = { node: 'nodes', edge: 'edges' } as const satisfies Record<string, StateKind>
const noKeys: ElementKeys = Object.freeze({ nodes: [], edges: [] })

let reducedMotionQuery: MediaQueryList | undefined

function reducedMotion(): boolean {
  reducedMotionQuery ??= window.matchMedia?.('(prefers-reduced-motion: reduce)')
  return reducedMotionQuery?.matches ?? false
}

function toKeys(input: ElementKeysInput): ElementKeys {
  return { nodes: [...(input.nodes ?? [])], edges: [...(input.edges ?? [])] }
}

function sameList(a: readonly Key[], b: readonly Key[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((key) => set.has(key))
}

function sameKeys(a: ElementKeys, b: ElementKeys): boolean {
  return sameList(a.nodes, b.nodes) && sameList(a.edges, b.edges)
}

function sameTarget(a: GraphTarget | null, b: GraphTarget | null): boolean {
  return a === b || (a !== null && b !== null && a.kind === b.kind && a.key === b.key)
}

function resolveStyle(style: StateStyle, id: (color: string) => number): ResolvedStateStyle {
  return {
    ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
    ...(style.strokeWidth !== undefined ? { strokeWidth: style.strokeWidth } : {}),
    ...(style.halo !== undefined ? { halo: style.halo } : {}),
    ...(style.label !== undefined ? { label: style.label } : {}),
    ...(style.fill !== undefined ? { fill: id(style.fill) } : {}),
    ...(style.stroke !== undefined ? { stroke: id(style.stroke) } : {}),
  }
}

export function createGraphHost<S extends string = string>(
  container: HTMLElement,
  options: MountGraphOptions<S>,
  createRenderer: RendererFactory,
): GraphInstance<S> {
  let definition: GraphDefinition = options.definition
  const controlled = options.selection !== undefined
  let onSelectionChange = options.onSelectionChange
  let warnedEmpty = false
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
  let laterRequest: ReturnType<typeof setTimeout> | undefined
  let needsFlush = false
  let full = true
  let destroyed = false
  let contextLost = false
  let positionsVersion = -1
  let paletteCount = 0
  let paletteColors = new Uint8Array(256 * 4)
  let viewAnimation: ViewAnimation | null = null
  let positionAnimations: PositionAnimation[] = []
  let animationOwner = new Uint32Array(0)
  let animationSerial = 0
  let pendingFit: FitOptions | null = options.initialView ? null : { padding: defaultPadding }
  let pixelRatio = window.devicePixelRatio || 1
  let sceneVersion = 0
  let pickedScene = -1
  let pickedPositions = -1
  let gesture: Gesture | null = null

  const model = createGraphModel({ schedule: () => request(true) })
  const scene = createScene()
  const positions = new Positions()
  const buffers = new StateBuffers()
  const registry = new StateRegistry(model, buffers)
  const emitter = new Emitter()
  const pickIndex = new PickIndex()
  const themeResolver = new ThemeResolver(element)
  let renderer = createRenderer(canvas, () => request())

  registry.define(freeStateNames(definition.states))
  if (options.selection !== undefined) registry.set('selected', options.selection)
  const store = createStore<GraphState>({
    view: options.initialView ?? { x: 0, y: 0, zoom: 1 },
    width: 0,
    height: 0,
    hovered: null,
    selection: controlled ? registry.members('selected') : noKeys,
    states: freeStates(),
    positionsVersion: 0,
  })
  const readonlyStore: GraphStore = createStore(() => store.state)

  const layerPositions = { nodes: new Map<number, number>(), edges: new Map<number, number>() }
  const pickSource: PickSource = {
    nodes: scene.nodes,
    edges: scene.edges,
    positions,
    order: (kind, index) => {
      const slot = (kind === 'nodes' ? scene.nodes.slot[index] : scene.edges.slot[index]) ?? 0
      const mask = (kind === 'nodes' ? buffers.nodeMask[index] : buffers.edgeMask[index]) ?? 0
      const layer = layerPositions[kind].get(slot) ?? 0
      return ((mask & 3) !== 0 ? highlightOrder : 0) + layer * layerOrder + index
    },
  }

  function freeStates(): Record<string, ElementKeys> {
    return Object.fromEntries(
      freeStateNames(definition.states).map((name) => [name, registry.members(name)]),
    )
  }

  function patch(next: Partial<GraphState>): void {
    store.setState((state) => ({ ...state, ...next }))
  }

  function request(flush = false): void {
    if (flush) needsFlush = true
    if (frameRequest !== 0 || destroyed) return
    frameRequest = requestAnimationFrame(frame)
  }

  function requestLater(delay: number): void {
    if (laterRequest !== undefined || destroyed) return
    laterRequest = setTimeout(() => {
      laterRequest = undefined
      request()
    }, delay)
  }

  function commitView(view: View): void {
    patch({ view })
    emitter.emit('viewchange', { view })
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

  function applyStyles(): void {
    const id = (color: string) => scene.palette.id(color)
    for (const kind of ['nodes', 'edges'] as const) {
      registry.names.forEach((name, bit) => {
        const own = definition.states[name]
        const style = isBuiltInState(name) ? { ...builtInStyles[kind][name], ...own } : own
        buffers.setStyle(kind, bit, style ? resolveStyle(style, id) : null)
      })
      for (let bit = registry.names.length; bit < 32; bit++) buffers.setStyle(kind, bit, null)
    }
  }

  function applyLayers(): void {
    layerPositions.nodes.clear()
    layerPositions.edges.clear()
    scene.layers.forEach((layer, position) => {
      layerPositions[layer.kind].set(layer.slot, position)
    })
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
      viewAnimation = null
      commitView(target)
      return
    }
    viewAnimation = { from: store.get().view, to: target, start: performance.now(), duration: ms }
    request()
  }

  function fitTo(keys: Iterable<Key> | undefined, fitOptions: FitOptions): boolean {
    const box = bounds(keys)
    const size = viewport()
    if (!box || size.width === 0 || size.height === 0) return false
    animateTo(fitBounds(box, size, fitOptions.padding ?? defaultPadding), fitOptions.duration)
    return true
  }

  function target(kind: 'node' | 'edge', key: Key): GraphTarget | null {
    const record = kind === 'node' ? model.node(key) : model.edge(key)
    return record ? { kind, key, datum: record.datum } : null
  }

  function pickAt(point: Point): GraphTarget | null {
    if (!gesture?.drag && (pickedScene !== sceneVersion || pickedPositions !== positions.version)) {
      pickIndex.build(pickSource)
      pickedScene = sceneVersion
      pickedPositions = positions.version
    }
    const world = toWorld(store.get().view, viewport(), point)
    const hit = pickIndex.pick(pickSource, world.x, world.y, store.get().view.zoom, pickTolerance)
    if (!hit) return null
    const key = hit.kind === 'node' ? scene.nodes.keys[hit.index] : scene.edges.keys[hit.index]
    return key === undefined ? null : target(hit.kind, key)
  }

  function publishSelection(): void {
    const selection = registry.members('selected')
    patch({ selection })
    emitter.emit('selectionchange', selection)
    request()
  }

  function requestSelection(next: ElementKeys): void {
    if (controlled) {
      if (!sameKeys(registry.members('selected'), next)) onSelectionChange?.(next)
    } else if (registry.set('selected', next)) {
      publishSelection()
    }
  }

  function publishState(name: string): void {
    patch({ states: { ...store.get().states, [name]: registry.members(name) } })
    request()
  }

  function setHovered(next: GraphTarget | null, event: MouseEvent | null): void {
    const current = store.get().hovered
    if (sameTarget(current, next)) return
    registry.set('hovered', next ? { [kindOf[next.kind]]: [next.key] } : {})
    patch({ hovered: next })
    if (current && event) emitter.emit('pointerleave', { target: current, originalEvent: event })
    if (next && event) emitter.emit('pointerenter', { target: next, originalEvent: event })
    updateCursor()
    request()
  }

  let lassoLayer: SVGSVGElement | null = null

  function drawLasso(points: readonly Point[] | null): void {
    if (!points) {
      lassoLayer?.remove()
      lassoLayer = null
      return
    }
    if (!lassoLayer) {
      lassoLayer = document.createElementNS(svgNamespace, 'svg')
      lassoLayer.setAttribute('aria-hidden', 'true')
      lassoLayer.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible'
      const path = document.createElementNS(svgNamespace, 'path')
      path.style.cssText = lassoStyle
      lassoLayer.append(path)
      element.append(lassoLayer)
    }
    lassoLayer.firstElementChild?.setAttribute(
      'd',
      `M${points.map((point) => `${point.x} ${point.y}`).join('L')}Z`,
    )
  }

  function selectInside(points: readonly Point[]): void {
    const view = store.get().view
    const size = viewport()
    const polygon = points.map((point) => toWorld(view, size, point))
    const inside = nodesInside(polygon, scene.nodes, positions).filter(
      (key) => !registry.has('selected', 'nodes', key),
    )
    if (inside.length === 0) return
    const current = registry.members('selected')
    requestSelection({ ...current, nodes: [...current.nodes, ...inside] })
  }

  function updateCursor(): void {
    const interactive = definition.interaction.select !== false || definition.interaction.drag
    if (gesture?.lasso) canvas.style.cursor = 'crosshair'
    else if (gesture?.moved) canvas.style.cursor = 'grabbing'
    else if (store.get().hovered && interactive) canvas.style.cursor = 'pointer'
    else canvas.style.cursor = ''
  }

  function selectOnClick(clicked: GraphTarget | null, event: MouseEvent): void {
    const mode = definition.interaction.select
    if (mode === false) return
    const additive = mode === 'multiple' && (event.shiftKey || event.metaKey || event.ctrlKey)
    if (!clicked) {
      if (!additive) requestSelection(noKeys)
      return
    }
    const kind = kindOf[clicked.kind]
    const current = registry.members('selected')
    if (!additive) requestSelection({ ...noKeys, [kind]: [clicked.key] })
    else if (registry.has('selected', kind, clicked.key))
      requestSelection({ ...current, [kind]: current[kind].filter((key) => key !== clicked.key) })
    else requestSelection({ ...current, [kind]: [...current[kind], clicked.key] })
  }

  function applyChanges(changes: GraphChanges): void {
    scene.apply(model, changes)
    followPositions(placeNodes(model, positions, changes))
    buffers.reserve(scene.nodes.capacity, scene.edges.capacity)
    const result = registry.apply(changes)
    sceneVersion++
    applyLayers()
    if (result.selection) {
      publishSelection()
      if (controlled) onSelectionChange?.(registry.members('selected'))
    }
    const hovered = store.get().hovered
    if (result.hovered) {
      patch({ hovered: null })
      updateCursor()
    } else if (hovered) {
      const fresh = target(hovered.kind, hovered.key)
      if (fresh && fresh.datum !== hovered.datum) patch({ hovered: fresh })
    }
  }

  function movePositions(
    indices: readonly number[],
    to: readonly number[],
    duration: number,
  ): void {
    if (indices.length === 0) return
    const ms = reducedMotion() ? 0 : duration
    if (ms <= 0) {
      indices.forEach((index, i) => {
        if (index < animationOwner.length) animationOwner[index] = 0
        positions.set(index, to[i * 2] ?? 0, to[i * 2 + 1] ?? 0)
      })
    } else {
      if (positions.capacity > animationOwner.length) {
        const owner = new Uint32Array(positions.capacity)
        owner.set(animationOwner)
        animationOwner = owner
      }
      const id = ++animationSerial
      const from = new Float32Array(indices.length * 2)
      indices.forEach((index, i) => {
        animationOwner[index] = id
        from[i * 2] = positions.x(index)
        from[i * 2 + 1] = positions.y(index)
      })
      positionAnimations.push({
        id,
        indices,
        from,
        to: Float32Array.from(to),
        start: performance.now(),
        duration: ms,
      })
    }
    request()
  }

  function followPositions(moves: PositionMoves): void {
    if (moves.indices.length === 0) return
    const dragged = new Set(gesture?.drag?.indices)
    const indices: number[] = []
    const to: number[] = []
    moves.indices.forEach((index, i) => {
      if (dragged.has(index)) return
      indices.push(index)
      to.push(moves.to[i * 2] ?? 0, moves.to[i * 2 + 1] ?? 0)
    })
    movePositions(indices, to, definition.transitions.positions)
  }

  function stepPositions(now: number): void {
    positionAnimations = positionAnimations.filter((animation) => {
      const t = Math.max(0, Math.min(1, (now - animation.start) / animation.duration))
      const k = easeInOut(t)
      animation.indices.forEach((index, i) => {
        if (animationOwner[index] !== animation.id) return
        const fromX = animation.from[i * 2] ?? 0
        const fromY = animation.from[i * 2 + 1] ?? 0
        const toX = animation.to[i * 2] ?? 0
        const toY = animation.to[i * 2 + 1] ?? 0
        positions.set(index, fromX + (toX - fromX) * k, fromY + (toY - fromY) * k)
      })
      return t < 1
    })
  }

  function frame(now: number): void {
    frameRequest = 0
    if (destroyed || contextLost) return
    if (needsFlush) {
      needsFlush = false
      applyChanges(model.flush())
    }
    if (pendingFit && fitTo(undefined, pendingFit)) pendingFit = null
    if (viewAnimation) {
      const t = Math.min(1, (now - viewAnimation.start) / viewAnimation.duration)
      const view = interpolateView(viewAnimation.from, viewAnimation.to, easeInOut(t))
      if (t >= 1) viewAnimation = null
      patch({ view })
      emitter.emit('viewchange', { view })
    }
    if (positionAnimations.length > 0) stepPositions(now)
    registry.takeHighlighted()
    const dirty = scene.takeDirty()
    if (dirty.palette || scene.palette.colors.length !== paletteCount) resolvePalette(paletteCount)
    buffers.reserve(scene.nodes.capacity, scene.edges.capacity)
    const positionsChanged = positions.version !== positionsVersion
    renderer.sync({ scene, dirty, positions, positionsChanged, states: buffers, full })
    full = false
    if (positionsChanged) {
      positionsVersion = positions.version
      patch({ positionsVersion })
    }
    const { view, width, height } = store.get()
    const wait = renderer.render({ view, width, height, pixelRatio })
    if (viewAnimation || positionAnimations.length > 0) request()
    else if (wait >= 0) requestLater(wait)
  }

  function resize(width: number, height: number): void {
    pixelRatio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * pixelRatio))
    canvas.height = Math.max(1, Math.round(height * pixelRatio))
    if (dev && !warnedEmpty && (width === 0 || height === 0)) {
      warnedEmpty = true
      console.warn('graph: the container measures 0 px; give it a width and a height')
    }
    patch({ width, height })
    request()
  }

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1]
    if (entry) resize(entry.contentRect.width, entry.contentRect.height)
  })
  resizeObserver.observe(element)
  const stopTheme = observeTheme(element, refreshTheme)

  function local(event: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function pointerEvent(event: MouseEvent, hit: GraphTarget | null) {
    const point = local(event)
    return {
      target: hit,
      point,
      world: toWorld(store.get().view, viewport(), point),
      originalEvent: event,
    }
  }

  function startDrag(hit: GraphTarget, point: Point): NodeDrag | null {
    if (hit.kind !== 'node' || !definition.interaction.drag) return null
    const group = registry.has('selected', 'nodes', hit.key)
      ? registry.members('selected').nodes
      : [hit.key]
    const world = toWorld(store.get().view, viewport(), point)
    const keys: Key[] = []
    const indices: number[] = []
    for (const key of group) {
      const record = model.node(key)
      if (!record) continue
      keys.push(key)
      indices.push(record.index)
    }
    const offsets = new Float32Array(indices.length * 2)
    indices.forEach((index, i) => {
      if (index < animationOwner.length) animationOwner[index] = 0
      offsets[i * 2] = positions.x(index) - world.x
      offsets[i * 2 + 1] = positions.y(index) - world.y
    })
    return { target: { ...hit, kind: 'node' }, indices, keys, offsets, started: false }
  }

  function dragEvent(drag: NodeDrag, event: PointerEvent) {
    const point = local(event)
    return {
      target: drag.target,
      keys: drag.keys,
      point,
      world: toWorld(store.get().view, viewport(), point),
      originalEvent: event,
    }
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || gesture) return
    viewAnimation = null
    const point = local(event)
    const hit = pickAt(point)
    const drag = hit ? startDrag(hit, point) : null
    const { lasso, select } = definition.interaction
    const lassoing = !hit && event.shiftKey && lasso && select === 'multiple'
    gesture = {
      id: event.pointerId,
      start: point,
      last: point,
      target: hit,
      drag,
      lasso: lassoing ? [point] : null,
      moved: false,
    }
    canvas.setPointerCapture?.(event.pointerId)
    if (lassoing) updateCursor()
  }

  function onPointerMove(event: PointerEvent): void {
    const point = local(event)
    if (!gesture) {
      setHovered(pickAt(point), event)
      return
    }
    if (gesture.id !== event.pointerId) return
    if (
      !gesture.moved &&
      Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > clickSlop
    ) {
      gesture.moved = true
      updateCursor()
    }
    const lasso = gesture.lasso
    if (lasso) {
      const last = lasso[lasso.length - 1] ?? gesture.start
      if (gesture.moved && Math.hypot(point.x - last.x, point.y - last.y) >= lassoStep) {
        lasso.push(point)
        drawLasso(lasso)
      }
      gesture.last = point
      return
    }
    const drag = gesture.drag
    if (drag) {
      if (!gesture.moved) return
      if (!drag.started) {
        drag.started = true
        emitter.emit('dragstart', dragEvent(drag, event))
      }
      const world = toWorld(store.get().view, viewport(), point)
      drag.indices.forEach((index, i) => {
        positions.set(
          index,
          world.x + (drag.offsets[i * 2] ?? 0),
          world.y + (drag.offsets[i * 2 + 1] ?? 0),
        )
      })
      emitter.emit('drag', dragEvent(drag, event))
      if (emitter.has('positionchange')) {
        const moved = new Map<Key, Point>()
        drag.keys.forEach((key, i) => {
          const index = drag.indices[i] ?? 0
          moved.set(key, { x: positions.x(index), y: positions.y(index) })
        })
        emitter.emit('positionchange', { origin: 'drag', positions: moved })
      }
      request()
    } else if (definition.interaction.pan) {
      commitView(panBy(store.get().view, point.x - gesture.last.x, point.y - gesture.last.y))
    }
    gesture.last = point
  }

  function endGesture(event: PointerEvent, cancelled: boolean): void {
    if (!gesture || gesture.id !== event.pointerId) return
    const ended = gesture
    gesture = null
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (ended.drag?.started) emitter.emit('dragend', dragEvent(ended.drag, event))
    if (ended.lasso) {
      drawLasso(null)
      if (!cancelled && ended.moved) selectInside(ended.lasso)
    }
    if (!cancelled && !ended.moved) {
      emitter.emit('click', pointerEvent(event, ended.target))
      selectOnClick(ended.target, event)
    }
    if (!cancelled) setHovered(pickAt(local(event)), event)
    updateCursor()
  }

  function onPointerUp(event: PointerEvent): void {
    endGesture(event, false)
  }

  function onPointerCancel(event: PointerEvent): void {
    endGesture(event, true)
  }

  function onPointerLeave(event: PointerEvent): void {
    if (!gesture) setHovered(null, event)
  }

  function onDoubleClick(event: MouseEvent): void {
    emitter.emit('doubleclick', pointerEvent(event, pickAt(local(event))))
  }

  function onContextMenu(event: MouseEvent): void {
    emitter.emit('contextmenu', pointerEvent(event, pickAt(local(event))))
  }

  function onWheel(event: WheelEvent): void {
    const zoom = definition.interaction.zoom
    if (!zoom) return
    event.preventDefault()
    viewAnimation = null
    const { view, height } = store.get()
    const factor = wheelFactor(event.deltaY, event.deltaMode, height, zoom.speed)
    commitView(zoomAround(view, viewport(), local(event), factor))
  }

  function onContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
  }

  function onContextRestored(): void {
    contextLost = false
    renderer = createRenderer(canvas, () => request())
    full = true
    refreshTheme()
  }

  const listeners: ReadonlyArray<
    readonly [string, (event: never) => void, AddEventListenerOptions?]
  > = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerCancel],
    ['pointerleave', onPointerLeave],
    ['dblclick', onDoubleClick],
    ['contextmenu', onContextMenu],
    ['wheel', onWheel, { passive: false }],
    ['webglcontextlost', onContextLost],
    ['webglcontextrestored', onContextRestored],
  ]
  for (const [name, listener, listenerOptions] of listeners) {
    canvas.addEventListener(name, listener as EventListener, listenerOptions)
  }

  model.setMarks(definition.marks)
  scene.setDefinition(definition)
  applyLayers()
  applyStyles()
  refreshTheme()
  request(true)

  function declared(name: string): string {
    if (isBuiltInState(name) || !Object.hasOwn(definition.states, name)) {
      throw new Error(`graph: unknown state "${name}"`)
    }
    return name
  }

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

  const selection: GraphSelection = {
    get: () => store.get().selection,
    set: (keys) => requestSelection(toKeys(keys)),
    clear: () => requestSelection(noKeys),
  }

  const states: GraphStates = {
    set: (name, keys) => {
      if (registry.set(declared(name), keys)) publishState(name)
    },
    add: (name, keys) => {
      if (registry.add(declared(name), keys)) publishState(name)
    },
    remove: (name, keys) => {
      if (registry.remove(declared(name), keys)) publishState(name)
    },
    clear: (name) => {
      const names = name === undefined ? freeStateNames(definition.states) : [declared(name)]
      for (const each of names) if (registry.clear(each)) publishState(each)
    },
    has: (name, element) => registry.has(declared(name), kindOf[element.kind], element.key),
  }

  const positionsApi: GraphPositions = {
    get: (key) => {
      const record = model.node(key)
      return record ? { x: positions.x(record.index), y: positions.y(record.index) } : undefined
    },
    set: (entries, positionOptions = {}) => {
      const indices: number[] = []
      const to: number[] = []
      const moved = new Map<Key, Point>()
      for (const [key, point] of entries) {
        const record = model.node(key)
        if (!record) continue
        indices.push(record.index)
        to.push(point.x, point.y)
        moved.set(key, { x: point.x, y: point.y })
      }
      movePositions(indices, to, positionOptions.duration ?? 0)
      if (moved.size > 0) emitter.emit('positionchange', { origin: 'api', positions: moved })
    },
  }

  return {
    store: readonlyStore,
    view,
    selection,
    states,
    positions: positionsApi,
    element,
    pick: (point) => pickAt(point),
    neighbors: (key) => model.neighbors(key),
    edgesOf: (key) => model.edgesOf(key),
    endpoints: (key) => model.endpoints(key),
    on: (name, handler) => emitter.on(name, handler),
    update(next) {
      if (next.ariaLabel !== undefined) element.setAttribute('aria-label', next.ariaLabel)
      if (next.onSelectionChange !== undefined) onSelectionChange = next.onSelectionChange
      if (controlled && next.selection !== undefined && registry.set('selected', next.selection)) {
        publishSelection()
      }
      if (next.definition && next.definition !== definition) {
        definition = next.definition
        model.setMarks(definition.marks)
        scene.setDefinition(definition)
        applyLayers()
        if (registry.define(freeStateNames(definition.states))) patch({ states: freeStates() })
        applyStyles()
        updateCursor()
        request(true)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      if (frameRequest !== 0) cancelAnimationFrame(frameRequest)
      clearTimeout(laterRequest)
      resizeObserver.disconnect()
      stopTheme()
      for (const [name, listener] of listeners) {
        canvas.removeEventListener(name, listener as EventListener)
      }
      emitter.clear()
      model.destroy()
      renderer.destroy()
      themeResolver.destroy()
      element.remove()
    },
  }
}

export function mountGraph<S extends string = string>(
  container: HTMLElement,
  options: MountGraphOptions<S>,
): GraphInstance<S> {
  return createGraphHost(container, options, createWebglRenderer)
}
