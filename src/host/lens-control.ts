import { dev } from '../dev'
import type { GraphDefinition, Point } from '../types'
import type { Emitter } from './events'
import type { GraphState } from './graph-instance'
import { finitePoint } from './inputs'
import {
  clampLensZoom,
  editableTarget,
  type GraphLensState,
  type LensInput,
  sameLens,
} from './lens'

export interface LensSource {
  readonly element: HTMLElement
  readonly onMap: boolean
  readonly emitter: Emitter
  definition(): GraphDefinition
  viewport(): { width: number; height: number }
  patch(next: Partial<GraphState>): void
  request(): void
  destroyed(): boolean
  focusAt(): Point
}

export class LensControl {
  shown: GraphLensState | null = null
  wanted: GraphLensState | null = null
  pointer: Point | null = null
  #keyLens = false
  #memory: { radius: number; zoom: number } | null = null
  #warned = false
  readonly #source: LensSource

  constructor(source: LensSource) {
    this.#source = source
  }

  update(): void {
    let next: GraphLensState | null = null
    const wanted = this.wanted
    if (wanted && !this.#source.onMap) {
      const { follow } = wanted
      const at =
        follow === 'pointer'
          ? this.pointer
          : follow === 'focus'
            ? this.#source.focusAt()
            : wanted.at
      if (at) next = { ...wanted, at }
    }
    if (next) this.#memory = { radius: next.radius, zoom: next.zoom }
    if (sameLens(this.shown, next)) return
    this.shown = next
    this.#source.patch({ lens: next })
    this.#source.emitter.emit('lenschange', { lens: next })
    this.#source.request()
  }

  set(input: LensInput | null): void {
    this.#keyLens = false
    const source = this.#source
    if (source.onMap && input && dev && !this.#warned) {
      this.#warned = true
      console.warn('graph: the lens does not work on a map')
    }
    if (!input) {
      this.wanted = null
      this.update()
      return
    }
    const options = source.definition().interaction.lens
    const size = source.viewport()
    const wanted = this.wanted
    const memory = this.#memory
    const place = input.at ?? wanted?.at ?? { x: size.width / 2, y: size.height / 2 }
    const radius = input.radius ?? wanted?.radius ?? memory?.radius ?? options.radius
    const zoom = input.zoom ?? wanted?.zoom ?? memory?.zoom ?? options.zoom
    if (!(radius > 0) || !Number.isFinite(radius)) {
      throw new RangeError('graph: lens radius must be a positive number')
    }
    if (!Number.isFinite(zoom)) throw new RangeError('graph: lens zoom must be a finite number')
    if (typeof place !== 'string' && !finitePoint(place)) {
      throw new RangeError('graph: lens at must be a point with a finite x and y')
    }
    this.wanted = {
      at:
        typeof place === 'string'
          ? (this.shown?.at ?? { x: size.width / 2, y: size.height / 2 })
          : place,
      radius,
      zoom: clampLensZoom(zoom),
      follow: typeof place === 'string' ? place : null,
    }
    this.update()
  }

  track(point: Point): void {
    this.pointer = point
    const wanted = this.wanted
    if (this.#keyLens && wanted?.follow === 'focus') this.wanted = { ...wanted, follow: 'pointer' }
    if (this.wanted?.follow === 'pointer') this.update()
  }

  leave(): void {
    this.pointer = null
    this.update()
  }

  place(at: Point): void {
    const wanted = this.wanted
    if (!wanted) return
    this.wanted = { ...wanted, at }
    this.update()
  }

  magnify(factor: number): void {
    const wanted = this.wanted
    if (!wanted) return
    this.wanted = { ...wanted, zoom: clampLensZoom(wanted.zoom * factor) }
    this.update()
  }

  #keyFor(event: KeyboardEvent): boolean {
    const source = this.#source
    const key = source.definition().interaction.lens.key
    if (key === null || event.key !== key || source.onMap || source.destroyed()) return false
    if (event.target !== source.element && editableTarget(event.target)) return false
    return this.pointer !== null || document.activeElement === source.element
  }

  readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || this.#keyLens || !this.#keyFor(event)) return
    const options = this.#source.definition().interaction.lens
    const memory = this.#memory
    this.#keyLens = true
    this.wanted = {
      at: this.pointer ?? this.#source.focusAt(),
      radius: memory?.radius ?? options.radius,
      zoom: memory?.zoom ?? options.zoom,
      follow: this.pointer ? 'pointer' : 'focus',
    }
    this.update()
  }

  readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!this.#keyLens || event.key !== this.#source.definition().interaction.lens.key) return
    event.preventDefault()
    this.#keyLens = false
    this.wanted = null
    this.update()
  }

  readonly onBlur = (): void => {
    if (!this.#keyLens) return
    this.#keyLens = false
    this.wanted = null
    this.update()
  }
}
