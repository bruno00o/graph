import type { GraphChanges, GraphModel } from '../core/graph-model'
import { checkLists, type StringCheck, stringCheck } from '../core/key-list'
import type { Positions } from '../core/positions'
import type { Projection } from '../core/projection'
import type { Scene } from '../core/scene'
import { shallowEqual } from '../core/shallow-equal'
import type { Bounds } from '../core/view'
import type { GraphDefinition, Key, Layout, LayoutGraph, LayoutRun, Point } from '../types'
import type { BundleHost } from './bundles'
import { countAlive } from './element-keys'
import type { Emitter } from './events'
import type {
  GraphLayout,
  GraphState,
  LayoutComputeOptions,
  LayoutOthers,
  LayoutRunOptions,
  SurfaceCapabilities,
} from './graph-instance'
import { checkDuration, checkFit } from './inputs'
import { layoutGraph } from './layout-graph'
import { positionEvent } from './position-event'
import type { PositionMotion } from './position-motion'
import { clearRoom } from './room'
import type { SpreadHost } from './spread'
import { type FitKeys, type FitRequest, fitRequest, type ViewControl } from './view-control'

export interface LayoutSettings {
  readonly fit: FitRequest | null
  readonly duration: number
  readonly alone: boolean
}

const others: readonly LayoutOthers[] = ['anchors', 'ignored']

function checkOthers(options: { readonly others?: LayoutOthers | undefined }): boolean {
  const value = options.others
  if (value === undefined) return false
  if (!others.includes(value)) {
    throw new TypeError(`graph: others must be 'anchors' or 'ignored', not ${String(value)}`)
  }
  return value === 'ignored'
}

export interface LayoutSession extends LayoutSettings {
  readonly layout: Layout
  readonly movable: Uint8Array
  readonly auto: boolean
  readonly resolve: (completed: boolean) => void
  readonly scope: ((index: number) => boolean) | null
  run: LayoutRun | null
  progressed: boolean
  animation: number
  fitted: boolean
}

export interface LayoutSource {
  surface(): SurfaceCapabilities
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
  waiting(): boolean
}

export function sameLayout(a: Layout | null, b: Layout | null): boolean {
  if (a === b) return true
  return a !== null && b !== null && a.name === b.name && shallowEqual(a.options, b.options)
}

export class LayoutHost {
  session: LayoutSession | null = null
  #laidOut = false
  #relayout = false
  #waited = false
  #restoring = false
  readonly #late = new Set<number>()
  readonly #source: LayoutSource
  readonly #check: StringCheck = stringCheck()
  readonly #computing = new Set<(reason: unknown) => void>()

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
    const restored = this.#source.positions.restored
    let anyRestored = false
    const added = [
      ...changes.nodes.added.filter((ref) => {
        if (restored[ref.index] === 1) {
          anyRestored = true
          this.#late.delete(ref.index)
          return false
        }
        return projection.nodeShown(ref.index)
      }),
      ...revealed.map((index) => ({ index })),
    ]
    if (anyRestored && !this.#laidOut) {
      this.#laidOut = true
      this.#restoring = true
    }
    if (this.#relayout || !this.#laidOut) {
      if (!this.#relayout && added.length === 0 && !this.#waited) return
      if (this.#source.waiting()) {
        this.#waited = true
        for (const { index } of added) this.#late.add(index)
        return
      }
      this.#runAll(layout)
      return
    }
    if (this.#restoring && (added.length > 0 || this.#late.size > 0)) {
      if (this.#source.waiting()) {
        this.#waited = true
        for (const { index } of added) this.#late.add(index)
        return
      }
      this.#restoring = false
      this.#waited = false
      for (const index of this.#late) added.push({ index })
      this.#late.clear()
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
      const within = current.scope
      const scope = within ? (index: number) => within(index) || fresh.has(index) : null
      if (!this.#launch(current.layout, movable, current, scope))
        this.#settle(current.layout, current, current.resolve)
      return
    }
    void this.begin(layout, (index) => fresh.has(index), true, this.#autoSettings())
  }

  release(): void {
    const layout = this.#source.definition().layout
    if (!this.#waited || !layout || this.#source.destroyed()) return
    if (this.#relayout || !this.#laidOut) {
      this.#runAll(layout)
      return
    }
    this.#restoring = false
    this.#waited = false
    const late = new Set(this.#late)
    this.#late.clear()
    if (late.size === 0) return
    if (layout.incremental === false) {
      void this.begin(layout, () => true, true, this.#autoSettings())
      return
    }
    void this.begin(layout, (index) => late.has(index), true, this.#autoSettings())
  }

  #runAll(layout: Layout): void {
    this.#waited = false
    this.#restoring = false
    this.#late.clear()
    this.#relayout = false
    this.#laidOut = true
    void this.begin(layout, () => true, true, this.#autoSettings())
  }

  #autoSettings(): LayoutSettings {
    return { fit: null, duration: this.#source.definition().transitions.layout, alone: false }
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
      if (moved.size > 0)
        emitter.emit('positionchange', positionEvent('layout', moved, this.#source.surface().onMap))
    }
    if (completed) {
      views.frameLayout()
      views.framing = false
    }
    if (completed && current.fit && !current.fitted) views.pendingFit = current.fit
    emitter.emit('layoutend', { name: current.layout.name, completed })
    this.#source.request()
  }

  #graph(
    movable: (index: number) => boolean,
    scope: ((index: number) => boolean) | null,
  ): LayoutGraph {
    const { scene, model, projection, spread, motion } = this.#source
    const dragged = this.#dragged()
    return layoutGraph(
      scene.nodes,
      scene.edges,
      motion.settled(),
      this.#source.state().view.zoom,
      (index) => movable(index) && !dragged?.has(index) && !spread.owns(index),
      (key) => model.node(key)?.datum,
      projection.active
        ? { indices: projection.containers, hierarchy: projection.hierarchy }
        : undefined,
      scope ?? undefined,
    )
  }

  #launch(
    layout: Layout,
    movable: (index: number) => boolean,
    previous: LayoutSettings & Pick<LayoutSession, 'auto' | 'resolve'>,
    scope: ((index: number) => boolean) | null = previous.alone ? movable : null,
  ): boolean {
    if (this.#source.destroyed()) return false
    const { scene, motion, views } = this.#source
    const graph = this.#graph(movable, scope)
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
      alone: previous.alone,
      scope,
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

  #keyed(keys: LayoutRunOptions['keys']): ((index: number) => boolean) | null {
    if (!keys) return null
    const indices = new Set<number>()
    for (const key of keys) {
      const record = this.#source.model.node(key)
      if (record) indices.add(record.index)
    }
    return (index) => indices.has(index)
  }

  #compute(layout: Layout | undefined, options: LayoutComputeOptions): Promise<Map<Key, Point>> {
    const signal = options.signal
    if (signal?.aborted) return Promise.reject(signal.reason)
    if (!this.#source.surface().layouts)
      return Promise.reject(new Error('graph: layouts do not run on a map'))
    const chosen = layout ?? this.#source.definition().layout
    if (!chosen) return Promise.reject(new Error('graph: no layout to compute'))
    let alone: boolean
    try {
      alone = checkOthers(options)
    } catch (error) {
      return Promise.reject(error)
    }
    this.#check(options.keys, 'layout.compute({ keys })')
    this.#source.prepare()
    const keyed = this.#keyed(options.keys) ?? (() => true)
    const graph = this.#graph(keyed, alone ? keyed : null)
    if (!graph.movable.includes(1)) return Promise.resolve(new Map())
    return new Promise<Map<Key, Point>>((resolve, reject) => {
      let run: LayoutRun | null = null
      let done = false
      const finish = (): boolean => {
        if (done) return false
        done = true
        this.#computing.delete(fail)
        signal?.removeEventListener('abort', abort)
        return true
      }
      const fail = (reason: unknown) => {
        if (!finish()) return
        run?.stop()
        reject(reason)
      }
      const abort = () => fail(signal?.reason)
      this.#computing.add(fail)
      signal?.addEventListener('abort', abort, { once: true })
      try {
        run = chosen.start(graph, {
          progress: () => {},
          end: (xy) => {
            if (finish()) resolve(positionsOf(graph, xy))
          },
        })
        if (done) run.stop()
      } catch (error) {
        fail(error)
      }
    })
  }

  api(): GraphLayout {
    return {
      compute: (layout, computeOptions = {}) => this.#compute(layout, computeOptions),
      run: (layout, runOptions = {}) => {
        if (!this.#source.surface().layouts)
          return Promise.reject(new Error('graph: layouts do not run on a map'))
        const definition = this.#source.definition()
        const chosen = layout ?? definition.layout
        if (!chosen) return Promise.reject(new Error('graph: no layout to run'))
        let alone: boolean
        try {
          checkDuration(runOptions)
          if (runOptions.fit && runOptions.fit !== true) checkFit(runOptions.fit)
          alone = checkOthers(runOptions)
        } catch (error) {
          return Promise.reject(error)
        }
        this.#check(runOptions.keys, 'layout.run({ keys })')
        if (runOptions.fit && runOptions.fit !== true) {
          checkLists(this.#check, runOptions.fit, 'layout.run({ fit: { $ } })')
        }
        this.#source.prepare()
        const fit = runOptions.fit === true ? {} : runOptions.fit || null
        const settings: LayoutSettings = {
          fit: fit && fitRequest(fit),
          duration: Math.max(
            0,
            runOptions.duration ?? this.#source.definition().transitions.layout,
          ),
          alone,
        }
        return this.begin(chosen, this.#keyed(runOptions.keys) ?? (() => true), false, settings)
      },
      stop: () => this.stop(),
    }
  }

  destroy(reason?: unknown): void {
    const current = this.session
    this.session = null
    current?.run?.stop()
    current?.resolve(false)
    for (const fail of [...this.#computing]) fail(reason)
  }
}

function positionsOf(graph: LayoutGraph, xy: Float32Array): Map<Key, Point> {
  const positions = new Map<Key, Point>()
  const limit = Math.min(graph.capacity, xy.length / 2)
  for (let index = 0; index < limit; index++) {
    const key = graph.keys[index]
    if (graph.movable[index] !== 1 || key === undefined) continue
    positions.set(key, { x: xy[index * 2] ?? 0, y: xy[index * 2 + 1] ?? 0 })
  }
  return positions
}
