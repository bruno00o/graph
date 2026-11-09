import {
  type Bounds,
  constrainView,
  easeInOut,
  fitBounds,
  interpolateView,
  type PanLimits,
  resolvePadding,
} from '../core/view'
import type { GraphDefinition, Key, View } from '../types'
import { requestMemory } from './element-keys'
import type { Emitter, ViewOrigin } from './events'
import { progress } from './frame-cost'
import type { FitOptions, GraphState } from './graph-instance'
import { reducedMotion } from './reduced-motion'

export type ViewCause = 'user' | 'api' | 'userFit' | 'apiFit' | 'limit'

export interface ViewAnimation {
  readonly from: View
  readonly to: View
  readonly start: number
  readonly duration: number
  readonly cause: ViewCause
}

export interface ViewRequest {
  readonly view: View
  readonly cause: ViewCause
}

export interface FitKeys {
  readonly nodes: readonly Key[]
  readonly edges: readonly Key[]
}

export interface FitRequest {
  readonly keys: FitKeys | null
  readonly options: FitOptions
  readonly automatic?: boolean
}

export interface PendingBounds {
  readonly box: Bounds
  readonly options: FitOptions
}

interface LimitBox {
  readonly scene: number
  readonly positions: number
  readonly box: Bounds | null
}

export interface ViewSource {
  readonly controlled: boolean
  readonly given: boolean
  readonly emitter: Emitter
  state(): GraphState
  patch(next: Partial<GraphState>): void
  definition(): GraphDefinition
  request(): void
  frameCost(): number
  deliver(sent: ViewRequest): void
  published(): void
  measure(keys: FitKeys | null): Bounds | null
  limitBounds(): Bounds | null
  sceneVersion(): number
  positionsVersion(): number
}

export function sameView(a: View, b: View): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom
}

export function originOf(cause: ViewCause): ViewOrigin {
  return cause === 'user' || cause === 'userFit' ? 'user' : 'api'
}

export function fitRequest(options: FitOptions): FitRequest {
  if (options.nodes === undefined && options.edges === undefined) return { keys: null, options }
  return { keys: { nodes: [...(options.nodes ?? [])], edges: [...(options.edges ?? [])] }, options }
}

export class ViewControl {
  readonly wholeFit: FitRequest = { keys: null, options: {} }
  animation: ViewAnimation | null = null
  pendingFit: FitRequest | null
  pendingBounds: PendingBounds | null = null
  frameTarget: FitRequest
  framing: boolean
  moved: boolean
  #fitAnimation: ViewAnimation | null = null
  #framedOnce = false
  #outgoing: ViewRequest | null = null
  #sent: ViewRequest[] = []
  #limitBox: LimitBox | null = null
  readonly #source: ViewSource

  constructor(source: ViewSource) {
    this.#source = source
    const firstFit = source.definition().view.autoFit
    this.pendingFit =
      source.given || firstFit === 'never' ? null : { ...this.wholeFit, automatic: true }
    this.frameTarget = this.wholeFit
    this.framing = !source.given && firstFit !== 'never'
    this.moved = source.given
  }

  viewport(): { width: number; height: number } {
    const { width, height } = this.#source.state()
    return { width, height }
  }

  sized(): boolean {
    const size = this.viewport()
    return size.width > 0 && size.height > 0
  }

  #panLimits(): PanLimits | null {
    const source = this.#source
    const area = source.definition().view.bounds
    if (!area) return null
    if (!('margin' in area)) return { box: area, margin: 0 }
    const limitBox = this.#limitBox
    const scene = source.sceneVersion()
    const positions = source.positionsVersion()
    if (limitBox?.scene !== scene || limitBox.positions !== positions) {
      this.#limitBox = { scene, positions, box: source.limitBounds() }
    }
    const box = this.#limitBox?.box ?? null
    return box ? { box, margin: area.margin } : null
  }

  constrain(view: View): View {
    return constrainView(view, this.viewport(), this.#source.definition().view, this.#panLimits())
  }

  publish(view: View, cause: ViewCause): void {
    if (!this.#framedOnce && cause === 'user') this.skipFirstFit()
    if (this.#framedOnce && (cause === 'user' || cause === 'api')) this.moved = true
    this.#source.patch({ view })
    this.#source.emitter.emit('viewchange', { view, origin: originOf(cause) })
    this.#source.published()
  }

  base(): View {
    return (
      this.#outgoing?.view ?? this.#sent[this.#sent.length - 1]?.view ?? this.#source.state().view
    )
  }

  propose(view: View, cause: ViewCause): void {
    if (!this.#source.controlled) {
      this.publish(view, cause)
      return
    }
    this.#outgoing = { view, cause }
    this.#source.request()
  }

  commit(view: View, cause: ViewCause): boolean {
    const next = this.constrain(view)
    if (sameView(next, this.base())) return false
    this.propose(next, cause)
    this.#source.request()
    return true
  }

  send(): void {
    const sent = this.#outgoing
    if (!sent) return
    this.#outgoing = null
    this.#sent.push(sent)
    if (this.#sent.length > requestMemory) this.#sent.shift()
    this.#source.deliver(sent)
  }

  apply(view: View): void {
    const state = this.#source.state()
    const sent = this.#sent
    const answered = sent.findIndex((each) => sameView(each.view, view))
    if (answered < 0 && sameView(view, state.view)) return
    const cause = sent[answered < 0 ? sent.length - 1 : answered]?.cause ?? 'api'
    if (answered >= 0) this.#sent = sent.slice(answered + 1)
    else {
      this.#sent = []
      this.#outgoing = null
    }
    if (sameView(view, this.#source.state().view)) return
    this.publish(view, cause)
    this.#source.request()
  }

  followed(): ViewCause {
    const cause = this.#sent[this.#sent.length - 1]?.cause ?? 'user'
    this.#sent = []
    return cause
  }

  reconstrain(): void {
    const current = this.base()
    if (this.constrain(current) !== current) this.commit(current, 'limit')
  }

  animateTo(target: View, duration: number | undefined, cause: ViewCause): void {
    const ms = reducedMotion() ? 0 : (duration ?? 0)
    if (ms <= 0) {
      this.animation = null
      this.commit(target, cause)
      return
    }
    const to = this.constrain(target)
    this.animation = { from: this.base(), to, start: performance.now(), duration: ms, cause }
    this.#source.request()
  }

  frameBox(box: Bounds, fitOptions: FitOptions): View {
    const { minZoom, maxZoom, padding } = this.#source.definition().view
    const cap = Math.max(minZoom, Math.min(maxZoom, fitOptions.maxZoom ?? maxZoom))
    const sides = resolvePadding(fitOptions.padding, padding)
    return fitBounds(box, this.viewport(), sides, { minZoom, maxZoom: cap })
  }

  fitView(fit: FitRequest): View | null {
    const box = this.sized() ? this.#source.measure(fit.keys) : null
    return box ? this.frameBox(box, fit.options) : null
  }

  skipFirstFit(): void {
    this.moved = true
    this.framing = false
    if (this.pendingFit?.automatic) this.pendingFit = null
  }

  framedNow(): void {
    this.#framedOnce = true
    this.moved = false
  }

  settleFit(fit: FitRequest, cause: ViewCause = 'apiFit'): boolean {
    const target = this.fitView(fit)
    if (!target) return fit.keys !== null && this.sized()
    const animation = this.animation
    const retarget = animation !== null && animation === this.#fitAnimation && !fit.options.duration
    if (retarget && animation && this.stillFraming()) {
      this.animation = { ...animation, to: this.constrain(target) }
      this.#source.request()
    } else {
      this.animateTo(target, fit.options.duration, cause)
    }
    this.#fitAnimation = this.animation
    this.framedNow()
    return true
  }

  stillFraming(): boolean {
    const mode = this.#source.definition().view.autoFit
    if (mode === 'layouts') return !this.moved
    if (this.framing && (this.moved || mode === 'never')) this.framing = false
    return this.framing
  }

  framingFit(): FitRequest {
    const { padding, maxZoom } = this.frameTarget.options
    return { keys: this.frameTarget.keys, options: { padding, maxZoom }, automatic: true }
  }

  frameLayout(): void {
    if (this.stillFraming()) this.pendingFit = this.framingFit()
  }

  fit(fit: FitRequest): void {
    if (this.#source.definition().view.autoFit === 'layouts' || this.stillFraming()) {
      this.frameTarget = fit
    }
    this.pendingFit = this.settleFit(fit) ? null : fit
  }

  settle(): void {
    const pendingBounds = this.pendingBounds
    if (pendingBounds && this.sized()) {
      this.animateTo(this.frameBox(pendingBounds.box, pendingBounds.options), 0, 'apiFit')
      this.pendingBounds = null
      this.framedNow()
    }
    const pendingFit = this.pendingFit
    if (pendingFit && this.settleFit(pendingFit)) this.pendingFit = null
  }

  step(now: number): void {
    const animation = this.animation
    if (!animation) return
    const t = progress(now, animation.start, animation.duration, this.#source.frameCost())
    const view = this.constrain(interpolateView(animation.from, animation.to, easeInOut(t)))
    if (t >= 1) this.animation = null
    this.propose(view, animation.cause)
  }
}
