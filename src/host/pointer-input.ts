import { containerShape } from '../core/columns'
import { globeWorld } from '../core/globe'
import type { GraphModel } from '../core/graph-model'
import type { Hierarchy } from '../core/hierarchy'
import { nodesInside } from '../core/lasso'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import { edgePush, panBy, toWorld, wheelFactor, wheelPixels, zoomAround } from '../core/view'
import type { Sight } from '../core/visibility'
import { listenPinch, type PinchGesture } from '../dom/gestures'
import type { GraphDefinition, Key, Point } from '../types'
import type { HostCamera } from './camera'
import { keysOf, sameEnd, sameTarget } from './element-keys'
import type { Emitter, GraphTarget, ZoomKey } from './events'
import type { FocusControl } from './focus-control'
import type { FoldControl } from './folding'
import type { GraphState, HostSurface } from './graph-instance'
import type { LayoutHost } from './layout-session'
import { lensContains } from './lens'
import type { LensControl } from './lens-control'
import type { HostPicker } from './picking'
import type { PositionMotion } from './position-motion'
import type { SelectionControl } from './selection-control'
import type { SpreadHost } from './spread'
import type { StateRegistry } from './state-registry'
import type { ViewControl } from './view-control'

const svgNamespace = 'http://www.w3.org/2000/svg'
const lassoStep = 3
const clickSlop = 4
const touchSlop = 10
const autoPanZone = 40
const autoPanSpeed = 900
const autoPanFirstStep = 16
const autoPanLongestStep = 50
const lassoStyle =
  'fill:color-mix(in srgb,var(--graph-accent,#c93700) 10%,transparent);stroke:var(--graph-accent,#c93700);stroke-width:1.5;stroke-dasharray:4 3;stroke-linejoin:round'

interface NodeDrag {
  readonly target: GraphTarget & { readonly kind: 'node' }
  readonly index: number
  indices: readonly number[]
  keys: readonly Key[]
  offsets: Float32Array
  readonly carried: ReadonlySet<number>
  readonly inLens: boolean
  started: boolean
}

interface Gesture {
  readonly id: number
  readonly touch: boolean
  readonly start: Point
  readonly target: GraphTarget | null
  drag: NodeDrag | null
  readonly lasso: Point[] | null
  readonly lens: Point | null
  last: Point
  event: PointerEvent
  moved: boolean
  stopped: boolean
}

interface Pinch {
  readonly points: Map<number, Point>
  center: Point
  distance: number
}

interface PointerMove {
  readonly event: PointerEvent
  readonly point: Point
  readonly target: GraphTarget | null | undefined
}

export interface PointerSource {
  readonly canvas: HTMLCanvasElement
  readonly element: HTMLElement
  readonly surface: HostSurface | null
  readonly model: GraphModel
  readonly scene: Scene
  readonly hierarchy: Hierarchy
  readonly positions: Positions
  readonly registry: StateRegistry
  readonly spread: SpreadHost
  readonly motion: PositionMotion
  readonly views: ViewControl
  readonly camera: HostCamera
  readonly lens: LensControl
  readonly focus: FocusControl
  readonly selection: SelectionControl
  readonly folds: FoldControl
  readonly picker: HostPicker
  readonly layouts: LayoutHost
  readonly emitter: Emitter
  state(): GraphState
  patch(next: Partial<GraphState>): void
  definition(): GraphDefinition
  sight(): Sight
  request(): void
  destroyed(): boolean
}

interface PinchWatch {
  readonly active: boolean
  stop(): void
}

function pinchShape(points: ReadonlyMap<number, Point>): { center: Point; distance: number } {
  const [a, b] = [...points.values()]
  if (!a || !b) return { center: a ?? { x: 0, y: 0 }, distance: 0 }
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.hypot(a.x - b.x, a.y - b.y),
  }
}

function zoomKey(): ZoomKey {
  const agent = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = agent.userAgentData?.platform || agent.platform || ''
  return /mac|iphone|ipad|ipod/i.test(platform) ? 'Meta' : 'Control'
}

function stopGesture(current: Gesture): void {
  current.stopped = true
  current.moved = true
}

export class PointerInput {
  #gesture: Gesture | null = null
  #pinch: Pinch | null = null
  #autoPanning = false
  #autoPanTime = -1
  #pendingMove: PointerMove | null = null
  #moveRequest = 0
  #lassoLayer: SVGSVGElement | null = null
  #pinchGestures: PinchWatch | null = null
  readonly #source: PointerSource

  constructor(source: PointerSource) {
    this.#source = source
  }

  watchPinch(): void {
    this.#pinchGestures = listenPinch(this.#source.canvas, {
      start: () => this.#onPinchStart(),
      change: (change) => this.#onPinchChange(change),
    })
  }

  get autoPanning(): boolean {
    return this.#autoPanning
  }

  dragging(): readonly number[] | undefined {
    return this.#gesture?.drag?.indices
  }

  hasDrag(): boolean {
    return Boolean(this.#gesture?.drag)
  }

  redrawLasso(): void {
    const lasso = this.#gesture?.lasso
    if (lasso) this.#drawLasso(lasso)
  }

  #local(event: MouseEvent): Point {
    const rect = this.#source.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  #pointerEvent(event: MouseEvent, hit: GraphTarget | null) {
    const point = this.#local(event)
    return {
      target: hit,
      point,
      world: this.#source.camera.worldAt(point),
      originalEvent: event,
    }
  }

  hover(next: GraphTarget | null, event: MouseEvent | null): void {
    const source = this.#source
    const current = source.state().hovered
    const same = sameTarget(current, next)
    if (same && sameEnd(current, next)) return
    if (!same) source.registry.set('hovered', next ? keysOf(next) : {})
    source.patch({ hovered: next })
    if (current && event)
      source.emitter.emit('pointerleave', { target: current, originalEvent: event })
    if (next && event) source.emitter.emit('pointerenter', { target: next, originalEvent: event })
    if (source.destroyed()) return
    this.updateCursor()
    source.request()
  }

  updateCursor(): void {
    const source = this.#source
    const gesture = this.#gesture
    const canvas = source.canvas
    const interaction = source.definition().interaction
    const interactive = interaction.select !== false || interaction.drag
    if (gesture?.lasso) canvas.style.cursor = 'crosshair'
    else if (gesture?.moved) canvas.style.cursor = 'grabbing'
    else if (source.state().hovered && interactive) canvas.style.cursor = 'pointer'
    else canvas.style.cursor = ''
    source.surface?.hover(source.state().hovered !== null)
  }

  #drawLasso(points: readonly Point[] | null): void {
    if (!points) {
      this.#lassoLayer?.remove()
      this.#lassoLayer = null
      return
    }
    let layer = this.#lassoLayer
    if (!layer) {
      layer = document.createElementNS(svgNamespace, 'svg')
      layer.setAttribute('aria-hidden', 'true')
      layer.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible'
      const path = document.createElementNS(svgNamespace, 'path')
      path.style.cssText = lassoStyle
      layer.append(path)
      this.#source.element.append(layer)
      this.#lassoLayer = layer
    }
    const camera = this.#source.camera
    const path = points.map((point) => {
      const screen = camera.screenAt(point)
      return `${screen.x} ${screen.y}`
    })
    layer.firstElementChild?.setAttribute('d', `M${path.join('L')}Z`)
  }

  #selectInside(polygon: readonly Point[]): void {
    const { model, scene, positions, registry, camera, selection, picker } = this.#source
    const sight = this.#source.sight()
    const inside = nodesInside(polygon, scene.nodes, positions, sight).filter(
      (key) =>
        !registry.has('selected', 'nodes', key) &&
        camera.facing(model.node(key)?.index ?? -1) &&
        scene.nodes.shape[model.node(key)?.index ?? -1] !== containerShape,
    )
    const shapes = registry.shaped
      ? picker
          .shapesInside(polygon, sight)
          .filter((key) => !registry.has('selected', 'shapes', key))
      : []
    if (inside.length === 0 && shapes.length === 0) return
    const current = selection.base()
    selection.ask({
      ...current,
      nodes: [...current.nodes, ...inside],
      ...(registry.shaped ? { shapes: [...(current.shapes ?? []), ...shapes] } : {}),
    })
  }

  cancelLasso(): boolean {
    const gesture = this.#gesture
    if (!gesture?.lasso) return false
    const canvas = this.#source.canvas
    if (canvas.hasPointerCapture?.(gesture.id)) canvas.releasePointerCapture(gesture.id)
    this.#gesture = null
    this.#autoPanning = false
    this.#source.surface?.claim(false)
    this.#drawLasso(null)
    this.updateCursor()
    return true
  }

  #startDrag(hit: GraphTarget, point: Point): NodeDrag | null {
    if (hit.kind !== 'node' || !this.#source.definition().interaction.drag) return null
    const { model, scene, hierarchy, positions, registry, motion, camera, lens } = this.#source
    const group = registry.has('selected', 'nodes', hit.key)
      ? registry.members('selected').nodes
      : [hit.key]
    const shown = lens.shown
    const inLens = shown !== null && shown.follow === null && lensContains(shown, point)
    const world = camera.worldAt(point)
    const keys: Key[] = []
    const indices: number[] = []
    const taken = new Set<number>()
    const carried = new Set<number>()
    const carry = (index: number) => {
      carried.add(index)
      take(index)
    }
    const take = (index: number) => {
      const key = scene.nodes.keys[index]
      if (taken.has(index) || key === undefined || scene.nodes.alive[index] !== 1) return
      taken.add(index)
      if (scene.nodes.shape[index] === containerShape) {
        hierarchy.forEachDescendant(index, carry)
        return
      }
      keys.push(key)
      indices.push(index)
    }
    for (const key of group) {
      const record = model.node(key)
      if (record) take(record.index)
    }
    const offsets = new Float32Array(indices.length * 2)
    indices.forEach((index, i) => {
      motion.free(index)
      offsets[i * 2] = positions.x(index) - world.x
      offsets[i * 2 + 1] = positions.y(index) - world.y
    })
    const index = model.node(hit.key)?.index ?? -1
    return {
      target: { ...hit, kind: 'node' },
      index,
      indices,
      keys,
      offsets,
      carried,
      inLens,
      started: false,
    }
  }

  #dragEvent(drag: NodeDrag, event: PointerEvent) {
    const point = this.#local(event)
    return {
      target: drag.target,
      keys: drag.keys,
      point,
      world: this.#source.camera.worldAt(point, this.#source.camera.dragView(drag.inLens)),
      originalEvent: event,
    }
  }

  readonly onPointerDown = (event: PointerEvent): void => {
    const source = this.#source
    if (this.#pinch) return
    const gesture = this.#gesture
    if (gesture) {
      if (gesture.touch && event.pointerType === 'touch' && event.pointerId !== gesture.id) {
        this.#beginPinch(gesture, event)
      }
      return
    }
    if (event.button !== 0) return
    source.views.animation = null
    source.focus.remembered = null
    source.focus.set(null)
    if (source.destroyed()) return
    const point = this.#local(event)
    source.lens.track(point)
    const hit = source.picker.pick(point)
    const drag = hit ? this.#startDrag(hit, point) : null
    const { lasso, select } = source.definition().interaction
    const solid = hit !== null && hit.kind !== 'shape'
    const lassoing = !solid && event.shiftKey && lasso && select === 'multiple'
    const shown = source.lens.shown
    const moveLens = !solid && !lassoing && shown?.follow === null && lensContains(shown, point)
    this.#gesture = {
      id: event.pointerId,
      touch: event.pointerType === 'touch',
      start: point,
      last: point,
      event,
      target: hit,
      drag,
      lasso: lassoing ? [source.camera.worldAt(point, source.state().view)] : null,
      lens: moveLens && shown ? shown.at : null,
      moved: false,
      stopped: false,
    }
    source.canvas.setPointerCapture?.(event.pointerId)
    if (drag || lassoing) source.surface?.claim(true)
    if (lassoing) this.updateCursor()
  }

  #beginPinch(current: Gesture, event: PointerEvent): void {
    const source = this.#source
    this.#gesture = null
    source.surface?.claim(false)
    this.#autoPanning = false
    source.views.animation = null
    if (current.drag?.started)
      source.emitter.emit('dragend', this.#dragEvent(current.drag, current.event))
    if (source.destroyed()) return
    if (current.lasso) this.#drawLasso(null)
    const points = new Map([
      [current.id, current.last],
      [event.pointerId, this.#local(event)],
    ])
    this.#pinch = { points, ...pinchShape(points) }
    source.canvas.setPointerCapture?.(event.pointerId)
    this.updateCursor()
  }

  #movePinch(current: Pinch): void {
    const source = this.#source
    if (source.surface) return
    const { center, distance } = pinchShape(current.points)
    const definition = source.definition()
    const { zoom, pan } = definition.interaction
    const views = source.views
    const size = views.viewport()
    let view = views.base()
    if (zoom && current.distance > 0 && distance > 0) {
      view = zoomAround(view, size, current.center, distance / current.distance, definition.view)
    }
    if (pan) view = panBy(view, center.x - current.center.x, center.y - current.center.y)
    current.center = center
    current.distance = distance
    views.commit(view, 'user')
  }

  #endPinch(current: Pinch, event: PointerEvent): void {
    const canvas = this.#source.canvas
    current.points.delete(event.pointerId)
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    this.#pinch = null
    const [rest] = current.points
    if (rest) {
      const [id, point] = rest
      this.#gesture = {
        id,
        touch: true,
        start: point,
        last: point,
        event,
        target: null,
        drag: null,
        lasso: null,
        lens: null,
        moved: true,
        stopped: false,
      }
    }
    this.updateCursor()
  }

  #moveDrag(drag: NodeDrag, point: Point, event: PointerEvent): void {
    const { spread, positions, camera, emitter, views } = this.#source
    if (!drag.started) {
      drag.started = true
      emitter.emit('dragstart', this.#dragEvent(drag, event))
      if (this.#source.destroyed()) return
      for (const index of drag.indices) if (!drag.carried.has(index)) spread.detach(index)
      spread.settle(performance.now())
    }
    const globe = camera.sphere()
    const world = globe
      ? globeWorld(globe, point.x, point.y)
      : toWorld(camera.dragView(drag.inLens), views.viewport(), point)
    if (!world) return
    drag.indices.forEach((index, i) => {
      const x = world.x + (drag.offsets[i * 2] ?? 0)
      const y = world.y + (drag.offsets[i * 2 + 1] ?? 0)
      spread.carry(index, x - positions.x(index), y - positions.y(index))
      positions.set(index, x, y)
    })
    this.#source.layouts.pin(drag.indices)
    emitter.emit('drag', this.#dragEvent(drag, event))
    if (this.#source.destroyed()) return
    if (emitter.has('positionchange')) {
      const moved = new Map<Key, Point>()
      drag.keys.forEach((key, i) => {
        const index = drag.indices[i] ?? 0
        moved.set(key, { x: positions.x(index), y: positions.y(index) })
      })
      emitter.emit('positionchange', { origin: 'drag', positions: moved })
    }
    this.#source.request()
  }

  #extendLasso(current: Gesture, lasso: Point[], point: Point): void {
    const camera = this.#source.camera
    const end = lasso[lasso.length - 1]
    const last = end ? camera.screenAt(end) : current.start
    if (current.moved && Math.hypot(point.x - last.x, point.y - last.y) >= lassoStep) {
      lasso.push(camera.worldAt(point))
      this.#drawLasso(lasso)
    }
  }

  #autoPanVelocity(): Point | null {
    const current = this.#gesture
    const { autoPan, pan } = this.#source.definition().interaction
    if (!current || !autoPan || !pan) return null
    if (!current.drag?.started && !(current.lasso && current.moved)) return null
    const { width, height } = this.#source.views.viewport()
    const x = edgePush(current.last.x, width, autoPanZone)
    const y = edgePush(current.last.y, height, autoPanZone)
    if (x === 0 && y === 0) return null
    const speed = autoPanSpeed * autoPan.speed
    return { x: x * speed, y: y * speed }
  }

  #followEdge(): void {
    if (this.#autoPanning || !this.#autoPanVelocity()) return
    this.#autoPanning = true
    this.#autoPanTime = -1
    this.#source.request()
  }

  stepAutoPan(now: number): void {
    const velocity = this.#autoPanVelocity()
    const current = this.#gesture
    if (!velocity || !current) {
      this.#autoPanning = false
      return
    }
    const elapsed =
      this.#autoPanTime < 0
        ? autoPanFirstStep
        : Math.min(autoPanLongestStep, Math.max(0, now - this.#autoPanTime))
    this.#autoPanTime = now
    const views = this.#source.views
    const panned = views.commit(
      panBy(views.base(), (-velocity.x * elapsed) / 1000, (-velocity.y * elapsed) / 1000),
      'user',
    )
    if (!panned) {
      if (elapsed > 0) this.#autoPanning = false
      return
    }
    if (current.drag) this.#moveDrag(current.drag, current.last, current.event)
    else if (current.lasso) this.#extendLasso(current, current.lasso, current.last)
  }

  #queueMove(event: PointerEvent, point: Point, hit: GraphTarget | null | undefined): void {
    if (!this.#source.emitter.has('pointermove')) return
    this.#pendingMove = { event, point, target: hit }
    if (this.#moveRequest === 0) this.#moveRequest = requestAnimationFrame(this.#emitMove)
  }

  readonly #emitMove = (): void => {
    this.#moveRequest = 0
    const move = this.#pendingMove
    this.#pendingMove = null
    if (!move || this.#source.destroyed()) return
    const { event, point } = move
    const hit = move.target === undefined ? this.#source.picker.pick(point, true) : move.target
    this.#source.emitter.emit('pointermove', {
      target: hit,
      point,
      world: this.#source.camera.worldAt(point),
      originalEvent: event,
    })
  }

  readonly onPointerMove = (event: PointerEvent): void => {
    const source = this.#source
    const pinch = this.#pinch
    if (pinch) {
      if (!pinch.points.has(event.pointerId)) return
      pinch.points.set(event.pointerId, this.#local(event))
      this.#movePinch(pinch)
      return
    }
    const point = this.#local(event)
    const gesture = this.#gesture
    if (!gesture || gesture.id === event.pointerId) source.lens.track(point)
    if (!gesture) {
      const hit = source.picker.pick(point, true)
      this.hover(hit, event)
      if (source.destroyed()) return
      this.#queueMove(event, point, hit)
      return
    }
    if (gesture.id !== event.pointerId) return
    gesture.event = event
    this.#queueMove(event, point, gesture.drag?.started ? gesture.drag.target : undefined)
    const slop = gesture.touch ? touchSlop : clickSlop
    if (!gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > slop) {
      gesture.moved = true
      this.updateCursor()
    }
    const { lasso, drag } = gesture
    if (gesture.lens && !source.lens.wanted) stopGesture(gesture)
    if (gesture.stopped) {
      gesture.last = point
      return
    }
    if (gesture.lens && source.lens.wanted) {
      const from = gesture.lens
      source.lens.place({
        x: from.x + point.x - gesture.start.x,
        y: from.y + point.y - gesture.start.y,
      })
      gesture.last = point
      return
    }
    if (lasso) {
      this.#extendLasso(gesture, lasso, point)
      gesture.last = point
      this.#followEdge()
      return
    }
    if (drag) {
      gesture.last = point
      if (!gesture.moved) return
      this.#moveDrag(drag, point, event)
      this.#followEdge()
      return
    }
    if (source.definition().interaction.pan && !source.surface) {
      const views = source.views
      views.commit(panBy(views.base(), point.x - gesture.last.x, point.y - gesture.last.y), 'user')
    }
    gesture.last = point
  }

  dropLostDrag(removed: readonly { readonly index: number }[]): void {
    const current = this.#gesture
    const drag = current?.drag
    if (!current || !drag || removed.length === 0) return
    const gone = new Set<number>()
    for (const { index } of removed) gone.add(index)
    if (gone.has(drag.index)) {
      current.drag = null
      stopGesture(current)
      if (drag.started) this.#source.emitter.emit('dragend', this.#dragEvent(drag, current.event))
      return
    }
    if (!drag.indices.some((index) => gone.has(index))) return
    const indices: number[] = []
    const keys: Key[] = []
    const offsets: number[] = []
    drag.indices.forEach((index, i) => {
      const key = drag.keys[i]
      if (gone.has(index) || key === undefined) return
      indices.push(index)
      keys.push(key)
      offsets.push(drag.offsets[i * 2] ?? 0, drag.offsets[i * 2 + 1] ?? 0)
    })
    drag.indices = indices
    drag.keys = keys
    drag.offsets = new Float32Array(offsets)
  }

  #endGesture(event: PointerEvent, cancelled: boolean): void {
    const source = this.#source
    const pinch = this.#pinch
    if (pinch?.points.has(event.pointerId)) {
      this.#endPinch(pinch, event)
      return
    }
    const ended = this.#gesture
    if (!ended || ended.id !== event.pointerId) return
    this.#gesture = null
    this.#autoPanning = false
    source.surface?.claim(false)
    const canvas = source.canvas
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (ended.drag?.started) source.emitter.emit('dragend', this.#dragEvent(ended.drag, event))
    if (source.destroyed()) return
    if (ended.lasso) {
      this.#drawLasso(null)
      if (!cancelled && ended.moved) this.#selectInside(ended.lasso)
      if (source.destroyed()) return
    }
    if (!cancelled && !ended.moved) {
      source.emitter.emit('click', this.#pointerEvent(event, ended.target))
      if (source.destroyed()) return
      source.selection.select(ended.target, event.shiftKey || event.metaKey || event.ctrlKey)
      if (source.destroyed()) return
    }
    if (!cancelled && !ended.touch) this.hover(source.picker.pick(this.#local(event)), event)
    if (source.destroyed()) return
    this.updateCursor()
  }

  readonly onPointerUp = (event: PointerEvent): void => {
    this.#endGesture(event, false)
  }

  readonly onPointerCancel = (event: PointerEvent): void => {
    this.#endGesture(event, true)
  }

  readonly onPointerLeave = (event: PointerEvent): void => {
    if (this.#gesture || this.#pinch) return
    this.hover(null, event)
    if (this.#source.destroyed()) return
    this.#source.lens.leave()
  }

  readonly onDoubleClick = (event: MouseEvent): void => {
    const source = this.#source
    const hit = source.picker.pick(this.#local(event))
    source.emitter.emit('doubleclick', this.#pointerEvent(event, hit))
    if (source.destroyed() || event.defaultPrevented || !source.definition().interaction.fold)
      return
    if (hit?.kind === 'node' && source.folds.isGroup(hit.key)) source.folds.toggle(hit.key)
  }

  readonly onContextMenu = (event: MouseEvent): void => {
    const source = this.#source
    source.emitter.emit(
      'contextmenu',
      this.#pointerEvent(event, source.picker.pick(this.#local(event))),
    )
  }

  #pinchPoint(change: PinchGesture): Point {
    if (change.clientX !== null && change.clientY !== null) {
      const rect = this.#source.canvas.getBoundingClientRect()
      return { x: change.clientX - rect.left, y: change.clientY - rect.top }
    }
    const pointer = this.#source.lens.pointer
    if (pointer) return pointer
    const { width, height } = this.#source.views.viewport()
    return { x: width / 2, y: height / 2 }
  }

  #onPinchStart(): boolean {
    const source = this.#source
    if (source.surface || source.destroyed()) return false
    const lens = source.lens
    return Boolean(source.definition().interaction.zoom) || Boolean(lens.shown && lens.wanted)
  }

  #onPinchChange(change: PinchGesture): void {
    if (this.#pinch || this.#gesture?.touch) return
    const source = this.#source
    const definition = source.definition()
    const { zoom } = definition.interaction
    const at = this.#pinchPoint(change)
    const lens = source.lens
    const shown = lens.shown
    if (shown && lens.wanted && lensContains(shown, at)) {
      lens.magnify(change.factor ** (zoom ? zoom.speed : 1))
      return
    }
    if (!zoom) return
    const views = source.views
    views.animation = null
    const factor = change.factor ** zoom.speed
    views.commit(zoomAround(views.base(), views.viewport(), at, factor, definition.view), 'user')
  }

  readonly onWheel = (event: WheelEvent): void => {
    const source = this.#source
    if (source.surface) return
    if (event.ctrlKey && this.#pinchGestures?.active) {
      event.preventDefault()
      return
    }
    const definition = source.definition()
    const { zoom, pan, wheel } = definition.interaction
    const command = event.ctrlKey || event.metaKey
    const { width, height } = source.state()
    const views = source.views
    const view = views.base()
    const lens = source.lens
    const shown = lens.shown
    if (
      shown &&
      lens.wanted &&
      (command || wheel === 'zoom') &&
      lensContains(shown, this.#local(event))
    ) {
      event.preventDefault()
      const speed = zoom ? zoom.speed : 1
      lens.magnify(wheelFactor(event.deltaY, event.deltaMode, height, speed, event.ctrlKey))
      return
    }
    if (zoom && (command || wheel === 'zoom')) {
      event.preventDefault()
      views.animation = null
      const factor = wheelFactor(event.deltaY, event.deltaMode, height, zoom.speed, event.ctrlKey)
      views.commit(
        zoomAround(view, views.viewport(), this.#local(event), factor, definition.view),
        'user',
      )
      return
    }
    if (command) return
    if (wheel === 'pan' && pan) {
      event.preventDefault()
      views.animation = null
      let dx = wheelPixels(event.deltaX, event.deltaMode, width)
      let dy = wheelPixels(event.deltaY, event.deltaMode, height)
      if (event.shiftKey && dx === 0) [dx, dy] = [dy, 0]
      views.commit(panBy(view, -dx, -dy), 'user')
      return
    }
    if (wheel === 'page' && zoom) {
      source.emitter.emit('zoomhint', { key: zoomKey(), originalEvent: event })
    }
  }

  stopMoves(): void {
    if (this.#moveRequest !== 0) cancelAnimationFrame(this.#moveRequest)
    this.#pendingMove = null
  }

  stopPinch(): void {
    this.#pinchGestures?.stop()
  }
}
