import type { GraphChanges, GraphModel } from '../core/graph-model'
import type { Positions } from '../core/positions'
import type { Projection } from '../core/projection'
import type { Scene } from '../core/scene'
import { shallowEqual } from '../core/shallow-equal'
import type { Bounds } from '../core/view'
import type { GraphDefinition, Key, Layout, LayoutRun, Point } from '../types'
import type { BundleHost } from './bundles'
import { countAlive } from './element-keys'
import type { Emitter } from './events'
import type { GraphLayout, GraphState } from './graph-instance'
import { checkDuration, checkFit } from './inputs'
import { layoutGraph } from './layout-graph'
import type { PositionMotion } from './position-motion'
import { clearRoom } from './room'
import type { SpreadHost } from './spread'
import { type FitKeys, type FitRequest, fitRequest, type ViewControl } from './view-control'

export interface LayoutSettings {
  readonly fit: FitRequest | null
  readonly duration: number
}

export interface LayoutSession extends LayoutSettings {
  readonly layout: Layout
  readonly movable: Uint8Array
  readonly auto: boolean
  readonly resolve: (completed: boolean) => void
  run: LayoutRun | null
  progressed: boolean
  animation: number
  fitted: boolean
}

export interface LayoutSource {
  readonly onMap: boolean
  readonly scene: Scene
  readonly model: GraphModel
  readonly positions: Positions
  readonly projection: Projection
  readonly spread: SpreadHost
  readonly motion: PositionMotion
  readonly views: ViewControl
  readonly bundles: BundleHost
  readonly emitter: Emitter
  state(): GraphState
  patch(next: Partial<GraphState>): void
  definition(): GraphDefinition
  dragging(): readonly number[] | undefined
  boundsAfter(
    indices: readonly number[],
    to: readonly number[],
    keys: FitKeys | null,
  ): Bounds | null
  prepare(): void
  request(): void
  destroyed(): boolean
}

export function sameLayout(a: Layout | null, b: Layout | null): boolean {
  if (a === b) return true
  return a !== null && b !== null && a.name === b.name && shallowEqual(a.options, b.options)
}

export class LayoutHost {
  session: LayoutSession | null = null
  #laidOut = false
  #relayout = false
  readonly #source: LayoutSource

  constructor(source: LayoutSource) {
    this.#source = source
  }

  reshaped(): void {
    if (this.#source.definition().relayout && this.#laidOut) this.#relayout = true
  }

  replaced(previous: Layout | null): void {
    const layout = this.#source.definition().layout
    if (!sameLayout(previous, layout)) {
      if (this.session?.auto) this.stop()
      this.#relayout = layout !== null
    }
  }

  #dragged(): Set<number> | null {
    const dragging = this.#source.dragging()
    return dragging ? new Set(dragging) : null
  }

  makeRoom(moving: readonly number[], to: readonly number[]): void {
    const { scene, model, projection, spread, motion } = this.#source
    const keep = new Set(moving)
    const dragged = this.#dragged()
    const graph = layoutGraph(
      scene.nodes,
      scene.edges,
      motion.settled(),
      this.#source.state().view.zoom,
      (index) =>
        !dragged?.has(index) &&
        !spread.owns(index) &&
        (keep.has(index) || motion.owned(index) === 0),
      (key) => model.node(key)?.datum,
      { indices: projection.containers, hierarchy: projection.hierarchy },
    )
    moving.forEach((index, at) => {
      graph.xy[index * 2] = to[at * 2] ?? 0
      graph.xy[index * 2 + 1] = to[at * 2 + 1] ?? 0
    })
    const xy = clearRoom(graph)
    if (!xy) return
    const indices: number[] = []
    const targets: number[] = []
    for (let index = 0; index < graph.capacity; index++) {
      if (graph.movable[index] !== 1) continue
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      if (x === graph.xy[index * 2] && y === graph.xy[index * 2 + 1]) continue
      indices.push(index)
      targets.push(x, y)
    }
    motion.move(indices, targets, this.#source.definition().transitions.layout)
  }

  follow(changes: GraphChanges, revealed: readonly number[]): void {
    const layout = this.#source.definition().layout
    if (!layout || this.#source.destroyed()) return
    const projection = this.#source.projection
    const added = [
      ...changes.nodes.added.filter((ref) => projection.nodeShown(ref.index)),
      ...revealed.map((index) => ({ index })),
    ]
    if (this.#relayout || !this.#laidOut) {
      if (!this.#relayout && added.length === 0) return
      this.#relayout = false
      this.#laidOut = true
      void this.begin(layout, () => true, true, this.#autoSettings())
      return
    }
    if (added.length === 0) return
    if (layout.incremental === false) {
      void this.begin(layout, () => true, true, this.#autoSettings())
      return
    }
    const fresh = new Set(added.map((ref) => ref.index))
    const current = this.session
    if (current) {
      current.run?.stop()
      this.session = null
      const movable = (index: number) => current.movable[index] === 1 || fresh.has(index)
      if (!this.#launch(current.layout, movable, current))
        this.#settle(current.layout, current, current.resolve)
      return
    }
    void this.begin(layout, (index) => fresh.has(index), true, this.#autoSettings())
  }

  #autoSettings(): LayoutSettings {
    return { fit: null, duration: this.#source.definition().transitions.layout }
  }

  #place(current: LayoutSession, xy: Float32Array): void {
    const { scene, positions, spread, motion } = this.#source
    const dragged = this.#dragged()
    const limit = Math.min(current.movable.length, xy.length / 2, scene.nodes.capacity)
    for (let index = 0; index < limit; index++) {
      if (current.movable[index] !== 1 || scene.nodes.alive[index] !== 1) continue
      if (dragged?.has(index) || motion.owned(index) !== 0 || spread.owns(index)) continue
      if (!Number.isNaN(positions.source[index * 2] ?? Number.NaN)) continue
      positions.set(index, xy[index * 2] ?? 0, xy[index * 2 + 1] ?? 0)
    }
  }

  #glide(current: LayoutSession, xy: Float32Array): void {
    const { scene, positions, spread, motion, views } = this.#source
    const dragged = this.#dragged()
    const indices: number[] = []
    const to: number[] = []
    const limit = Math.min(current.movable.length, xy.length / 2, scene.nodes.capacity)
    for (let index = 0; index < limit; index++) {
      if (current.movable[index] !== 1 || scene.nodes.alive[index] !== 1) continue
      if (dragged?.has(index) || spread.owns(index)) continue
      if (!Number.isNaN(positions.source[index * 2] ?? Number.NaN)) continue
      indices.push(index)
      to.push(xy[index * 2] ?? 0, xy[index * 2 + 1] ?? 0)
    }
    this.#source.patch({ layout: { running: true, progress: 1 } })
    const fit = current.fit ?? (views.stillFraming() ? views.framingFit() : null)
    views.framing = false
    if (fit) {
      const box = this.#source.boundsAfter(indices, to, fit.keys)
      if (box && views.sized()) {
        views.pendingFit = null
        const duration = fit.options.duration ?? current.duration
        views.animateTo(views.frameBox(box, fit.options), duration, 'apiFit')
        views.framedNow()
        current.fitted = true
      } else if (box) {
        views.pendingFit = null
        views.pendingBounds = { box, options: fit.options }
        current.fitted = true
      }
    }
    current.animation = motion.move(indices, to, current.duration, () =>
      this.#finish(current, true),
    )
  }

  #finish(current: LayoutSession, completed: boolean): void {
    if (this.session !== current) return
    const { scene, positions, emitter, views } = this.#source
    this.session = null
    if (current.animation !== 0) this.#source.motion.cancel(current.animation)
    current.resolve(completed)
    this.#source.patch({
      layout: {
        running: false,
        progress: completed ? 1 : this.#source.state().layout.progress,
      },
    })
    if (completed && emitter.has('positionchange')) {
      const moved = new Map<Key, Point>()
      const limit = Math.min(current.movable.length, scene.nodes.capacity)
      for (let index = 0; index < limit; index++) {
        const key = scene.nodes.keys[index]
        if (current.movable[index] !== 1 || scene.nodes.alive[index] !== 1 || key === undefined)
          continue
        moved.set(key, { x: positions.x(index), y: positions.y(index) })
      }
      if (moved.size > 0) emitter.emit('positionchange', { origin: 'layout', positions: moved })
    }
    if (completed) {
      views.frameLayout()
      views.framing = false
    }
    if (completed && current.fit && !current.fitted) views.pendingFit = current.fit
    emitter.emit('layoutend', { name: current.layout.name, completed })
    this.#source.request()
  }

  #launch(
    layout: Layout,
    movable: (index: number) => boolean,
    previous: LayoutSettings & Pick<LayoutSession, 'auto' | 'resolve'>,
  ): boolean {
    if (this.#source.destroyed()) return false
    const { scene, model, projection, spread, motion, views } = this.#source
    const dragged = this.#dragged()
    const graph = layoutGraph(
      scene.nodes,
      scene.edges,
      motion.settled(),
      this.#source.state().view.zoom,
      (index) => movable(index) && !dragged?.has(index) && !spread.owns(index),
      (key) => model.node(key)?.datum,
      projection.active
        ? { indices: projection.containers, hierarchy: projection.hierarchy }
        : undefined,
    )
    if (!graph.movable.includes(1)) return false
    let moving = 0
    for (const flag of graph.movable) moving += flag
    if (moving * 2 > countAlive(scene.nodes.alive, scene.nodes.capacity)) {
      this.#source.bundles.fade()
    }
    motion.freeMovable(graph.movable, graph.capacity)
    const current: LayoutSession = {
      layout,
      movable: graph.movable,
      auto: previous.auto,
      resolve: previous.resolve,
      fit: previous.fit,
      duration: previous.duration,
      run: null,
      progressed: false,
      animation: 0,
      fitted: false,
    }
    this.session = current
    try {
      const run = layout.start(graph, {
        progress: (xy, progress) => {
          if (this.session !== current) return
          current.progressed = true
          this.#place(current, xy)
          this.#source.patch({ layout: { running: true, progress } })
          views.frameLayout()
          this.#source.request()
        },
        end: (xy) => {
          if (this.session !== current) return
          if (current.progressed || current.duration <= 0) {
            this.#place(current, xy)
            this.#finish(current, true)
          } else {
            this.#glide(current, xy)
          }
        },
      })
      if (this.session === current) current.run = run
      else run.stop()
    } catch (error) {
      this.#finish(current, false)
      throw error
    }
    return true
  }

  begin(
    layout: Layout,
    movable: (index: number) => boolean,
    auto: boolean,
    settings: LayoutSettings,
  ): Promise<boolean> {
    this.stop()
    return new Promise<boolean>((resolve) => {
      this.#source.patch({ layout: { running: true, progress: 0 } })
      this.#source.emitter.emit('layoutstart', { name: layout.name })
      if (this.#source.destroyed()) {
        resolve(false)
        return
      }
      if (!this.#launch(layout, movable, { ...settings, auto, resolve })) {
        this.#settle(layout, settings, resolve)
      }
    })
  }

  #settle(layout: Layout, settings: LayoutSettings, resolve: (completed: boolean) => void): void {
    resolve(true)
    if (settings.fit) this.#source.views.pendingFit = settings.fit
    this.#source.patch({ layout: { running: false, progress: 1 } })
    this.#source.emitter.emit('layoutend', { name: layout.name, completed: true })
  }

  stop(): void {
    const current = this.session
    if (!current) return
    current.run?.stop()
    this.#finish(current, false)
  }

  pin(indices: readonly number[]): void {
    const run = this.session?.run
    if (!run) return
    const positions = this.#source.positions
    for (const index of indices) run.pin(index, positions.x(index), positions.y(index))
  }

  api(): GraphLayout {
    return {
      run: (layout, runOptions = {}) => {
        if (this.#source.onMap)
          return Promise.reject(new Error('graph: layouts do not run on a map'))
        const definition = this.#source.definition()
        const chosen = layout ?? definition.layout
        if (!chosen) return Promise.reject(new Error('graph: no layout to run'))
        try {
          checkDuration(runOptions)
          if (runOptions.fit && runOptions.fit !== true) checkFit(runOptions.fit)
        } catch (error) {
          return Promise.reject(error)
        }
        this.#source.prepare()
        const fit = runOptions.fit === true ? {} : runOptions.fit || null
        const settings: LayoutSettings = {
          fit: fit && fitRequest(fit),
          duration: Math.max(
            0,
            runOptions.duration ?? this.#source.definition().transitions.layout,
          ),
        }
        const keys = runOptions.keys
        if (!keys) return this.begin(chosen, () => true, false, settings)
        const indices = new Set<number>()
        for (const key of keys) {
          const record = this.#source.model.node(key)
          if (record) indices.add(record.index)
        }
        return this.begin(chosen, (index) => indices.has(index), false, settings)
      },
      stop: () => this.stop(),
    }
  }

  destroy(): void {
    const current = this.session
    this.session = null
    current?.run?.stop()
    current?.resolve(false)
  }
}
