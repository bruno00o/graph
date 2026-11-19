import type { GraphChanges, GraphModel } from '../core/graph-model'
import { checkLists, type StringCheck, stringCheck } from '../core/key-list'
import { type ArrangedPlaces, sameLayout, scopeEngine } from '../core/layout-scopes'
import type { Positions } from '../core/positions'
import type { Projection } from '../core/projection'
import type { Scene } from '../core/scene'
import type { Bounds } from '../core/view'
import { dev } from '../dev'
import type {
  GraphDefinition,
  Key,
  Layout,
  LayoutGraph,
  LayoutListener,
  LayoutRun,
  NodeOptions,
  Point,
} from '../types'
import type { BundleHost } from './bundles'
import { countAlive } from './element-keys'
import type { Emitter } from './events'
import { nothingRevealed, type Revealed } from './folding'
import type {
  GraphLayout,
  GraphState,
  LayoutComputeOptions,
  LayoutOthers,
  LayoutRunOptions,
  SurfaceCapabilities,
} from './graph-instance'
import { checkDuration, checkFit } from './inputs'
import { report } from './isolate'
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
  readonly replace: Layout | null
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
  readonly layout: Layout | null
  readonly name: string
  readonly partial: boolean
  readonly movable: Uint8Array
  readonly auto: boolean
  readonly resolve: (completed: boolean) => void
  readonly scope: ((index: number) => boolean) | null
  readonly scoped: boolean
  readonly rerun: ReadonlySet<number> | null
  readonly inner: readonly number[] | null
  run: LayoutRun | null
  carry: number
  carried: boolean
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
  containers(): void
  destroyed(): boolean
  waiting(): boolean
}

interface Launch {
  readonly name: string
  readonly movable: Uint8Array
  readonly partial: boolean
  readonly scoped?: boolean
  start(listener: LayoutListener): LayoutRun
}

let engineLoad: Promise<void> | null = null
let engineFailed = false

function loadEngine(): Promise<void> {
  engineLoad ??= import('../layouts/scopes').then(
    (module) => {
      module.enableScopes()
    },
    (error: unknown) => {
      engineFailed = true
      if (dev) {
        console.warn(
          'graph: the engine of container.layout did not load, groups are laid out as if they had no layout',
          error,
        )
      }
    },
  )
  return engineLoad
}

function declaresLayouts(definition: GraphDefinition): boolean {
  return definition.marks.some((mark) => {
    if (mark.type !== 'nodes') return false
    const options = (mark as { readonly options?: NodeOptions<unknown> }).options
    return options?.container?.layout !== undefined && options.container.layout !== null
  })
}

function firstName(scopes: ReadonlyMap<number, Layout> | null): string {
  for (const layout of scopes?.values() ?? []) return layout.name
  return ''
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
  #seed = false
  readonly #memory: object = {}
  #warnedMap = false
  #loading = false
  #known: Map<number, Layout | null> | null = null
  #counts: Map<number, number> | null = null
  readonly #growth = new Set<number>()
  readonly #lateRerun = new Set<number>()
  #arranged: ArrangedPlaces | null = null
  #layout: Layout | null | undefined
  #paused: Set<number> | null = null

  constructor(source: LayoutSource) {
    this.#source = source
    this.#layout = source.surface().layouts ? source.definition().layout : undefined
  }

  reshaped(): void {
    if (this.#source.definition().relayout && this.#laidOut) this.#relayout = true
  }

  replaced(previous: Layout | null): void {
    if (!this.#source.surface().layouts) return
    const layout = this.#source.definition().layout
    const before = this.#layout === undefined ? previous : this.#layout
    this.#layout = layout
    if (!sameLayout(before, layout)) {
      if (this.session?.auto) this.stop()
      this.#relayout = layout !== null || this.#scopes() !== null
    }
  }

  #found(): Map<number, Layout> | null {
    const { scene, projection } = this.#source
    const onMap = this.#source.surface().onMap
    const layouts = scene.nodes.containerLayouts
    if (layouts.size === 0) return null
    if (onMap) {
      if (dev && !this.#warnedMap) {
        this.#warnedMap = true
        console.warn('graph: container layouts do not run on a map')
      }
      return null
    }
    if (engineFailed) return null
    let found: Map<number, Layout> | null = null
    for (const index of projection.containers) {
      const layout = layouts.get(index)
      if (!layout) continue
      found ??= new Map()
      found.set(index, layout)
    }
    return found
  }

  #scopes(): Map<number, Layout> | null {
    return scopeEngine() ? this.#found() : null
  }

  places(): ArrangedPlaces | null {
    this.#arranged ??= scopeEngine()?.places() ?? null
    return this.#arranged
  }

  #load(): void {
    if (this.#loading) return
    this.#loading = true
    void loadEngine().then(() => {
      this.#loading = false
      if (this.#source.destroyed()) return
      this.release()
      this.#source.request()
    })
  }

  #held(): boolean {
    if (scopeEngine() || !this.#found()) return false
    this.#load()
    return true
  }

  #ready(): Promise<void> | null {
    return this.#held() ? (engineLoad ?? Promise.resolve()) : null
  }

  arranger(index: number): Layout | null {
    const { scene, projection } = this.#source
    const layouts = scene.nodes.containerLayouts
    if (layouts.size === 0 || engineFailed || !this.#source.surface().layouts) return null
    if (!projection.containers.has(index)) return null
    return layouts.get(index) ?? null
  }

  arranges(): boolean {
    return (
      this.#source.scene.nodes.containerLayouts.size > 0 &&
      !engineFailed &&
      this.#source.surface().layouts
    )
  }

  placedBy(index: number): boolean {
    const { scene, projection } = this.#source
    const onMap = this.#source.surface().onMap
    const layouts = scene.nodes.containerLayouts
    if (layouts.size === 0 || onMap || engineFailed) return false
    const hierarchy = projection.hierarchy
    for (let at = hierarchy.parent[index] ?? -1; at >= 0; at = hierarchy.parent[at] ?? -1) {
      if (layouts.has(at) && projection.containers.has(at)) return true
    }
    return false
  }

  #rerun(changes: GraphChanges, scopes: ReadonlyMap<number, Layout>): Set<number> | null {
    const { scene, projection } = this.#source
    let rerun: Set<number> | null = null
    const added = new Set<number>()
    for (const ref of changes.nodes.added) added.add(ref.index)
    const known = this.#known
    const next = new Map<number, Layout | null>()
    for (const index of projection.containers) {
      const layout = scene.nodes.containerLayouts.get(index) ?? null
      next.set(index, layout)
      if (!layout || added.has(index) || !this.#laidOut) continue
      const before = known ? known.get(index) : null
      if (before === undefined || sameLayout(before, layout)) continue
      rerun ??= new Set()
      rerun.add(index)
    }
    this.#known = next
    if (changes.nodes.added.length === 0 && changes.nodes.removed.length === 0) return rerun
    const hierarchy = projection.hierarchy
    const counts = new Map<number, number>()
    for (const [index, layout] of scopes) {
      if (layout.incremental !== false) continue
      let count = 0
      hierarchy.forEachDescendant(index, () => {
        count++
      })
      counts.set(index, count)
      const before = this.#counts?.get(index)
      if (before === undefined || count >= before) continue
      rerun ??= new Set()
      rerun.add(index)
    }
    this.#counts = counts
    return rerun
  }

  #dragged(): Set<number> | null {
    const dragging = this.#source.dragging()
    return dragging ? new Set(dragging) : null
  }

  makeRoom(moving: readonly number[], to: readonly number[], hold = false): void {
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
        (hold
          ? !keep.has(index) && motion.owned(index) === 0
          : keep.has(index) || motion.owned(index) === 0),
      (key) => model.node(key)?.datum,
      {
        indices: projection.containers,
        hierarchy: projection.hierarchy,
        measure: scene.textWidth,
      },
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

  follow(changes: GraphChanges, revealed: Revealed = nothingRevealed): void {
    if (this.#source.destroyed()) return
    const arranged = this.#arranged
    if (arranged && !arranged.empty) {
      for (const { index } of changes.nodes.removed) arranged.forget(index)
    }
    for (const index of revealed.growing) this.#growth.add(index)
    this.#follow(changes, revealed)
    if (!this.#waited) this.#growth.clear()
  }

  #follow(changes: GraphChanges, revealed: Revealed): void {
    if (!scopeEngine() && !engineFailed && this.#source.surface().layouts) {
      if (declaresLayouts(this.#source.definition())) this.#load()
    }
    const held = this.#held()
    const scopes = held ? null : this.#scopes()
    const layout = this.#source.definition().layout
    if (!layout && !scopes && !held) return
    let rerun = scopes ? this.#rerun(changes, scopes) : null
    if (revealed.whole.length > 0) rerun = new Set([...(rerun ?? []), ...revealed.whole])
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
      ...revealed.placed.map((index) => ({ index })),
      ...revealed.keyed.map((index) => ({ index })),
    ]
    if (anyRestored && !this.#laidOut) {
      this.#laidOut = true
      this.#restoring = true
    }
    if (held) {
      this.#waited = true
      for (const { index } of added) this.#late.add(index)
      for (const index of rerun ?? []) this.#lateRerun.add(index)
      return
    }
    if (this.#relayout || !this.#laidOut) {
      if (!this.#relayout && added.length === 0 && !rerun && !this.#waited) return
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
    if (added.length === 0 && !rerun) return
    if (!scopes && layout?.incremental === false) {
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
      const all =
        current.rerun || rerun ? new Set([...(current.rerun ?? []), ...(rerun ?? [])]) : null
      if (!this.#launch(current.layout, movable, current, scope, all))
        this.#settle(current.name, current, current.resolve)
      return
    }
    void this.begin(layout, (index) => fresh.has(index), true, this.#autoSettings(), rerun)
  }

  leave(): void {
    const current = this.session
    if (!current) return
    if (current.auto) {
      const paused = this.#paused ?? new Set<number>()
      current.movable.forEach((flag, index) => {
        if (flag === 1) paused.add(index)
      })
      this.#paused = paused
    }
    this.stop()
  }

  enter(arrived: readonly number[]): void {
    if (!this.#source.surface().layouts || this.#source.destroyed()) return
    const layout = this.#source.definition().layout
    const before = this.#layout
    this.#layout = layout
    if (before !== undefined && !sameLayout(before, layout)) this.#relayout = layout !== null
    const held = this.#held()
    const scopes = held ? null : this.#scopes()
    const paused = this.#paused
    this.#paused = null
    if (!layout && !scopes && !held) return
    if (held) {
      this.#waited = true
      for (const index of [...(paused ?? []), ...arrived]) this.#late.add(index)
      return
    }
    if (this.#relayout || !this.#laidOut) {
      if (this.#source.waiting()) {
        this.#waited = true
        return
      }
      this.#runAll(layout)
      return
    }
    const fresh = new Set(paused)
    for (const index of arrived) fresh.add(index)
    const alive = this.#source.scene.nodes.alive
    for (const index of fresh) if (alive[index] !== 1) fresh.delete(index)
    if (fresh.size === 0) return
    if (!scopes && layout?.incremental === false) {
      void this.begin(layout, () => true, true, this.#autoSettings())
      return
    }
    void this.begin(layout, (index) => fresh.has(index), true, this.#autoSettings())
  }

  release(): void {
    if (!this.#waited || this.#source.destroyed()) return
    if (this.#held()) return
    const layout = this.#source.definition().layout
    const scopes = this.#scopes()
    if (!layout && !scopes) return
    if (this.#relayout || !this.#laidOut) {
      this.#runAll(layout)
      return
    }
    this.#restoring = false
    this.#waited = false
    const late = new Set(this.#late)
    this.#late.clear()
    const rerun = this.#lateRerun.size > 0 ? new Set(this.#lateRerun) : null
    this.#lateRerun.clear()
    if (late.size === 0 && !rerun) return
    if (!scopes && layout?.incremental === false) {
      void this.begin(layout, () => true, true, this.#autoSettings())
      return
    }
    void this.begin(layout, (index) => late.has(index), true, this.#autoSettings(), rerun)
  }

  #runAll(layout: Layout | null): void {
    const first = !this.#laidOut
    this.#waited = false
    this.#restoring = false
    this.#late.clear()
    this.#lateRerun.clear()
    this.#relayout = false
    this.#laidOut = true
    this.#seed = first
    void this.begin(layout, () => true, true, this.#autoSettings())
    this.#seed = false
  }

  #autoSettings(): LayoutSettings {
    return {
      fit: null,
      duration: this.#source.definition().transitions.layout,
      alone: false,
      replace: null,
    }
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
    if (current.partial) this.makeRoom(indices, to, true)
  }

  #innerOf(movable: Uint8Array): readonly number[] | null {
    const inner: number[] = []
    const alive = this.#source.scene.nodes.alive
    for (let index = 0; index < movable.length; index++) {
      if (movable[index] === 1 && alive[index] === 1 && this.placedBy(index)) inner.push(index)
    }
    return inner.length > 0 ? inner : null
  }

  #carry(current: LayoutSession, xy: Float32Array): void {
    const inner = current.inner
    if (!inner) return
    const { scene, positions, spread, motion } = this.#source
    if (!current.carried) {
      current.carried = true
      const dragged = this.#dragged()
      const indices: number[] = []
      const to: number[] = []
      for (const index of inner) {
        if (scene.nodes.alive[index] !== 1 || dragged?.has(index) || spread.owns(index)) continue
        if (!Number.isNaN(positions.source[index * 2] ?? Number.NaN)) continue
        indices.push(index)
        to.push(xy[index * 2] ?? 0, xy[index * 2 + 1] ?? 0)
      }
      current.carry = motion.move(indices, to, current.duration)
      return
    }
    if (current.carry !== 0 && !motion.carry(current.carry, xy)) {
      motion.release(current.carry, inner)
      current.carry = 0
    }
  }

  #record(current: LayoutSession): void {
    const arranged = this.places()
    if (!arranged) return
    const { scene, positions, projection } = this.#source
    this.#source.containers()
    arranged.remember(
      current.movable,
      scene.nodes,
      projection.hierarchy,
      positions,
      this.#dragged(),
    )
  }

  #room(current: LayoutSession, xy: Float32Array): void {
    const { scene } = this.#source
    const indices: number[] = []
    const to: number[] = []
    const limit = Math.min(current.movable.length, xy.length / 2, scene.nodes.capacity)
    for (let index = 0; index < limit; index++) {
      if (current.movable[index] !== 1 || scene.nodes.alive[index] !== 1) continue
      indices.push(index)
      to.push(xy[index * 2] ?? 0, xy[index * 2 + 1] ?? 0)
    }
    this.makeRoom(indices, to, true)
  }

  #finish(current: LayoutSession, completed: boolean): void {
    if (this.session !== current) return
    const { scene, positions, emitter, views } = this.#source
    this.session = null
    if (current.animation !== 0) this.#source.motion.cancel(current.animation)
    if (completed && current.scoped) this.#record(current)
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
        emitter.emit('positionchange', positionEvent('layout', moved, this.#source.surface()))
    }
    if (completed) {
      views.frameLayout()
      views.framing = false
    }
    if (completed && current.fit && !current.fitted) views.pendingFit = current.fit
    emitter.emit('layoutend', { name: current.name, completed })
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
        ? {
            indices: projection.containers,
            hierarchy: projection.hierarchy,
            measure: scene.textWidth,
          }
        : undefined,
      scope ?? undefined,
    )
  }

  #prepare(
    layout: Layout | null,
    movable: (index: number) => boolean,
    scope: ((index: number) => boolean) | null,
    auto: boolean,
    replace: Layout | null,
    rerun: ReadonlySet<number> | null,
  ): Launch | null {
    const scopes = this.#scopes()
    if (scopes) return this.#plan(layout, movable, scope, scopes, auto, replace, rerun)
    if (!layout) return null
    const graph = this.#graph(movable, scope)
    if (!graph.movable.includes(1)) return null
    return {
      name: layout.name,
      movable: graph.movable,
      partial: false,
      start: (listener) => layout.start(graph, listener),
    }
  }

  #plan(
    layout: Layout | null,
    movable: (index: number) => boolean,
    scope: ((index: number) => boolean) | null,
    scopes: ReadonlyMap<number, Layout>,
    auto: boolean,
    replace: Layout | null,
    rerun: ReadonlySet<number> | null,
  ): Launch | null {
    const engine = scopeEngine()
    if (!engine) return null
    const graph = this.#graph(() => true, scope)
    const keyed = new Uint8Array(graph.capacity)
    for (let index = 0; index < graph.capacity; index++) keyed[index] = movable(index) ? 1 : 0
    const plan = engine.plan({
      graph,
      keyed,
      top: layout,
      layouts: scopes,
      replace,
      rerun,
      arrivals: auto,
      fresh: this.#seed,
      memory: this.#memory,
    })
    return plan && { ...plan, scoped: true }
  }

  #listener(current: LayoutSession): LayoutListener {
    const views = this.#source.views
    return {
      progress: (xy, progress) => {
        if (this.session !== current) return
        current.progressed = true
        this.#carry(current, xy)
        this.#place(current, xy)
        this.#source.patch({ layout: { running: true, progress } })
        views.frameLayout()
        this.#source.request()
      },
      end: (xy) => {
        if (this.session !== current) return
        if (current.progressed && current.inner && current.duration > 0) {
          this.#glide(current, xy)
        } else if (current.progressed || current.duration <= 0) {
          this.#place(current, xy)
          if (current.partial) this.#room(current, xy)
          this.#finish(current, true)
        } else {
          this.#glide(current, xy)
        }
      },
    }
  }

  #launch(
    layout: Layout | null,
    movable: (index: number) => boolean,
    previous: LayoutSettings & Pick<LayoutSession, 'auto' | 'resolve'>,
    scope: ((index: number) => boolean) | null = previous.alone ? movable : null,
    rerun: ReadonlySet<number> | null = null,
    early?: Launch | null,
  ): boolean {
    if (this.#source.destroyed()) return false
    const { scene, motion } = this.#source
    const launch =
      early !== undefined
        ? early
        : this.#prepare(layout, movable, scope, previous.auto, previous.replace, rerun)
    if (!launch) return false
    let moving = 0
    for (const flag of launch.movable) moving += flag
    if (moving * 2 > countAlive(scene.nodes.alive, scene.nodes.capacity)) {
      this.#source.bundles.fade()
    }
    const growth = this.#growth.size > 0 ? new Set(this.#growth) : undefined
    this.#growth.clear()
    motion.freeMovable(launch.movable, launch.movable.length, growth)
    const scoped = launch.scoped === true
    const current: LayoutSession = {
      layout,
      name: launch.name,
      partial: launch.partial,
      movable: launch.movable,
      auto: previous.auto,
      resolve: previous.resolve,
      fit: previous.fit,
      duration: previous.duration,
      alone: previous.alone,
      replace: previous.replace,
      scope,
      scoped,
      rerun,
      inner: scoped ? this.#innerOf(launch.movable) : null,
      run: null,
      carry: 0,
      carried: false,
      progressed: false,
      animation: 0,
      fitted: false,
    }
    this.session = current
    try {
      const run = launch.start(this.#listener(current))
      if (this.session === current) current.run = run
      else run.stop()
    } catch (error) {
      this.#finish(current, false)
      report(error)
    }
    return true
  }

  begin(
    layout: Layout | null,
    movable: (index: number) => boolean,
    auto: boolean,
    settings: LayoutSettings,
    rerun: ReadonlySet<number> | null = null,
  ): Promise<boolean> {
    this.stop()
    return new Promise<boolean>((resolve) => {
      const scopes = this.#scopes()
      const early = scopes
        ? this.#plan(
            layout,
            movable,
            settings.alone ? movable : null,
            scopes,
            auto,
            settings.replace,
            rerun,
          )
        : undefined
      const name = early?.name ?? layout?.name ?? firstName(scopes)
      this.#source.patch({ layout: { running: true, progress: 0 } })
      this.#source.emitter.emit('layoutstart', { name })
      if (this.#source.destroyed()) {
        resolve(false)
        return
      }
      if (!this.#launch(layout, movable, { ...settings, auto, resolve }, undefined, rerun, early)) {
        this.#settle(name, settings, resolve)
      }
    })
  }

  #settle(name: string, settings: LayoutSettings, resolve: (completed: boolean) => void): void {
    resolve(true)
    if (settings.fit) this.#source.views.pendingFit = settings.fit
    this.#source.patch({ layout: { running: false, progress: 1 } })
    this.#source.emitter.emit('layoutend', { name, completed: true })
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
    const ready = this.#ready()
    if (ready) {
      return new Promise<Map<Key, Point>>((resolve, reject) => {
        const fail = (reason: unknown) => {
          this.#computing.delete(fail)
          reject(reason)
        }
        this.#computing.add(fail)
        const proceed = () => {
          if (this.#computing.delete(fail)) this.#compute(layout, options).then(resolve, reject)
        }
        ready.then(proceed, fail)
      })
    }
    const chosen = layout ?? this.#source.definition().layout
    if (!chosen && !this.#scopes()) {
      return Promise.reject(new Error('graph: no layout to compute'))
    }
    let alone: boolean
    try {
      alone = checkOthers(options)
    } catch (error) {
      return Promise.reject(error)
    }
    this.#check(options.keys, 'layout.compute({ keys })')
    this.#source.prepare()
    const keyed = this.#keyed(options.keys) ?? (() => true)
    const launch = this.#prepare(chosen, keyed, alone ? keyed : null, false, layout ?? null, null)
    if (!launch) return Promise.resolve(new Map())
    const keys = this.#source.scene.nodes.keys.slice(0, launch.movable.length)
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
        run = launch.start({
          progress: () => {},
          end: (xy) => {
            if (finish()) resolve(positionsOf(keys, launch.movable, xy))
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
      run: (layout, runOptions = {}) => this.#run(layout, runOptions),
      stop: () => this.stop(),
    }
  }

  #run(layout: Layout | undefined, runOptions: LayoutRunOptions): Promise<boolean> {
    if (!this.#source.surface().layouts)
      return Promise.reject(new Error('graph: layouts do not run on a map'))
    const ready = this.#ready()
    if (ready)
      return ready.then(() => (this.#source.destroyed() ? false : this.#run(layout, runOptions)))
    const definition = this.#source.definition()
    const chosen = layout ?? definition.layout
    if (!chosen && !this.#scopes()) {
      return Promise.reject(new Error('graph: no layout to run'))
    }
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
      duration: Math.max(0, runOptions.duration ?? this.#source.definition().transitions.layout),
      alone,
      replace: layout ?? null,
    }
    return this.begin(chosen, this.#keyed(runOptions.keys) ?? (() => true), false, settings)
  }

  destroy(reason?: unknown): void {
    const current = this.session
    this.session = null
    current?.run?.stop()
    current?.resolve(false)
    for (const fail of [...this.#computing]) fail(reason)
  }
}

function positionsOf(
  keys: readonly (Key | undefined)[],
  movable: Uint8Array,
  xy: Float32Array,
): Map<Key, Point> {
  const positions = new Map<Key, Point>()
  const limit = Math.min(movable.length, xy.length / 2)
  for (let index = 0; index < limit; index++) {
    const key = keys[index]
    if (movable[index] !== 1 || key === undefined) continue
    positions.set(key, { x: xy[index * 2] ?? 0, y: xy[index * 2 + 1] ?? 0 })
  }
  return positions
}
