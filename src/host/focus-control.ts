import type { GraphModel } from '../core/graph-model'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import { nearestNode, nodeToward } from '../core/spatial'
import { toScreen } from '../core/view'
import type { Sight } from '../core/visibility'
import type { GraphDefinition, Key, Point } from '../types'
import type { HostCamera } from './camera'
import { kindOf, sameTarget } from './element-keys'
import type { Emitter, GraphTarget } from './events'
import type { GraphState } from './graph-instance'
import type { StateRegistry } from './state-registry'
import type { ViewCause, ViewControl } from './view-control'

export const keyDuration = 200
const followMargin = 48
const focusOutline = '2px solid var(--graph-focus-ring,#c93700)'

export interface FocusSource {
  readonly element: HTMLElement
  readonly announcer: HTMLElement
  readonly model: GraphModel
  readonly scene: Scene
  readonly positions: Positions
  readonly registry: StateRegistry
  readonly views: ViewControl
  readonly camera: HostCamera
  readonly emitter: Emitter
  state(): GraphState
  patch(next: Partial<GraphState>): void
  definition(): GraphDefinition
  sight(): Sight
  target(kind: 'node' | 'edge', key: Key): GraphTarget | null
  prepare(): void
  request(): void
  destroyed(): boolean
}

export class FocusControl {
  remembered: GraphTarget | null = null
  #ring = 'none'
  readonly #source: FocusSource

  constructor(source: FocusSource) {
    this.#source = source
  }

  #nodePoint(key: Key): Point | null {
    const { model, positions } = this.#source
    const record = model.node(key)
    return record ? { x: positions.x(record.index), y: positions.y(record.index) } : null
  }

  point(focus: GraphTarget): Point | null {
    if (focus.kind === 'node') return this.#nodePoint(focus.key)
    const ends = this.#source.model.endpoints(focus.key)
    const a = ends ? this.#nodePoint(ends.source) : null
    const b = ends ? this.#nodePoint(ends.target) : null
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null
  }

  lensPoint(): Point {
    const { state, views } = this.#source
    const focused = state().focused
    const point = focused ? this.point(focused) : null
    const size = views.viewport()
    return point ? toScreen(state().view, size, point) : { x: size.width / 2, y: size.height / 2 }
  }

  #labelOf(focus: GraphTarget): string {
    const { model, scene } = this.#source
    const record = focus.kind === 'node' ? model.node(focus.key) : model.edge(focus.key)
    const labels = focus.kind === 'node' ? scene.nodes.label : scene.edges.label
    return (record && labels[record.index]) || String(focus.key)
  }

  #announce(text: string): void {
    const announcer = this.#source.announcer
    announcer.textContent = announcer.textContent === text ? `${text} ` : text
  }

  #reveal(focus: GraphTarget, cause: ViewCause): void {
    const { views, camera } = this.#source
    if (cause === 'user' && !this.#source.definition().interaction.pan) return
    const point = this.point(focus)
    if (!point) return
    const view = views.base()
    const size = views.viewport()
    const screen = camera.sphere() ? camera.screenAt(point) : toScreen(view, size, point)
    const inside =
      screen.x >= followMargin &&
      screen.x <= size.width - followMargin &&
      screen.y >= followMargin &&
      screen.y <= size.height - followMargin
    if (!inside) views.animateTo({ ...view, x: point.x, y: point.y }, keyDuration, cause)
  }

  set(next: GraphTarget | null, follow: ViewCause | null = null): void {
    const source = this.#source
    if (sameTarget(source.state().focused, next)) return
    source.registry.set('focused', next ? { [kindOf[next.kind]]: [next.key] } : {})
    source.patch({ focused: next })
    if (source.destroyed()) return
    if (next) {
      this.setRing('none')
      this.#announce(this.#labelOf(next))
      if (follow) this.#reveal(next, follow)
    }
    source.emitter.emit('focuschange', { target: next })
    source.request()
  }

  move(direction: Point): void {
    const { model, scene, positions, registry, state } = this.#source
    const current = state().focused
    const from = current?.kind === 'node' ? (model.node(current.key)?.index ?? -1) : -1
    const seen = this.#source.sight()
    let index = from >= 0 ? nodeToward(from, direction, scene.nodes, positions, seen) : -1
    if (from < 0) {
      const selected = registry.members('selected').nodes
      const last = selected[selected.length - 1]
      const center = state().view
      index =
        last !== undefined
          ? (model.node(last)?.index ?? -1)
          : nearestNode((current && this.point(current)) ?? center, scene.nodes, positions, seen)
    }
    const key = index >= 0 ? scene.nodes.keys[index] : undefined
    const next = key !== undefined ? this.#source.target('node', key) : null
    if (next) this.set(next, 'user')
  }

  #focusVisible(): boolean {
    try {
      return this.#source.element.matches(':focus-visible')
    } catch {
      return true
    }
  }

  readonly onFocus = (): void => {
    if (!this.#source.definition().interaction.keyboard || !this.#focusVisible()) return
    this.#source.prepare()
    const remembered = this.remembered
    const restored = remembered ? this.#source.target(remembered.kind, remembered.key) : null
    this.remembered = null
    if (restored) this.set(restored, 'user')
    else if (!this.#source.state().focused) this.setRing(focusOutline)
  }

  setRing(outline: string): void {
    if (this.#ring === outline) return
    this.#ring = outline
    this.#source.element.style.outline = outline
  }

  readonly onBlur = (): void => {
    this.setRing('none')
    const current = this.#source.state().focused
    if (!current) return
    this.remembered = current
    this.set(null)
  }

  applyKeyboard(): void {
    const element = this.#source.element
    if (this.#source.definition().interaction.keyboard) {
      element.tabIndex = 0
      element.setAttribute('role', 'application')
      return
    }
    element.removeAttribute('tabindex')
    element.setAttribute('role', 'img')
    this.setRing('none')
    this.set(null)
  }
}
