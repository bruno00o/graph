import type { Hierarchy } from '../core/hierarchy'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import type { ResolvedDefinition } from '../resolved-definition'
import type { Key, LayoutFollower, LayoutGraph, Point } from '../types'
import type { Emitter } from './events'
import type { SurfaceCapabilities } from './graph-instance'
import { report } from './isolate'
import { layoutGraph } from './layout-graph'
import { positionEvent } from './position-event'
import type { PositionMotion } from './position-motion'
import type { SpreadHost } from './spread'

const stillSlice = 8
const longestStep = 100

export interface FollowSource {
  readonly scene: Scene
  readonly positions: Positions
  readonly hierarchy: Hierarchy
  readonly spread: SpreadHost
  readonly motion: PositionMotion
  readonly emitter: Emitter
  definition(): ResolvedDefinition
  surface(): SurfaceCapabilities
  still(): boolean
  running(): boolean
  zoom(): number
  datum(key: Key): unknown
  request(): void
}

export class DragFollow {
  readonly #source: FollowSource
  #follower: LayoutFollower | null = null
  #graph: LayoutGraph | null = null
  #held: ReadonlySet<number> = new Set()
  #released = false
  #still = false
  #calm = false
  #last = -1

  constructor(source: FollowSource) {
    this.#source = source
  }

  get active(): boolean {
    return this.#follower !== null
  }

  get settling(): boolean {
    return this.#follower !== null && this.#released
  }

  start(indices: readonly number[]): void {
    this.stop()
    const source = this.#source
    const definition = source.definition()
    const layout = definition.layout
    if (definition.interaction.drag !== 'elastic' || !layout?.follow) return
    if (source.running() || !source.surface().layouts || indices.length === 0) return
    const { scene, positions, hierarchy, spread, motion } = source
    const held = new Set(indices)
    const zoom = source.zoom()
    const graph = layoutGraph(
      scene.nodes,
      scene.edges,
      positions,
      zoom,
      (index) =>
        !held.has(index) &&
        (hierarchy.parent[index] ?? -1) < 0 &&
        !spread.owns(index) &&
        !motion.moving(index),
      (key) => source.datum(key),
    )
    let follower: LayoutFollower | null
    try {
      follower = layout.follow(graph, indices, 1 / zoom)
    } catch (error) {
      report(error)
      return
    }
    if (!follower) return
    this.#follower = follower
    this.#graph = graph
    this.#held = held
    this.#released = false
    this.#still = source.still()
    this.#calm = false
    this.#last = -1
  }

  hold(indices: readonly number[]): void {
    const follower = this.#follower
    if (!follower) return
    const positions = this.#source.positions
    try {
      for (const index of indices) {
        if (this.#held.has(index)) follower.hold(index, positions.x(index), positions.y(index))
      }
    } catch (error) {
      this.#fail(error)
      return
    }
    this.#source.request()
  }

  release(): void {
    const follower = this.#follower
    if (!follower || this.#released) return
    this.#released = true
    if (!this.#still) {
      try {
        follower.release()
      } catch (error) {
        this.#fail(error)
        return
      }
    }
    this.#source.request()
  }

  frame(now: number): boolean {
    const follower = this.#follower
    if (!follower) return false
    if (this.#source.running()) {
      this.stop()
      return false
    }
    if (this.#still) return this.#settleStill(follower)
    const time = this.#last < 0 ? 1000 / 60 : Math.min(longestStep, Math.max(0, now - this.#last))
    this.#last = now
    let moving: boolean
    try {
      moving = follower.step(time, performance.now() + 4)
    } catch (error) {
      this.#fail(error)
      return false
    }
    this.#write()
    if (moving) return true
    this.#last = -1
    if (this.#released) this.stop()
    return false
  }

  changed(structural: boolean, dragging: readonly number[] | undefined): void {
    if (!this.#follower || !structural) return
    const released = this.#released
    this.stop()
    if (!released && dragging) this.start(dragging)
  }

  stop(): void {
    const follower = this.#follower
    if (!follower) return
    this.#follower = null
    try {
      follower.stop()
    } catch (error) {
      report(error)
    }
    const graph = this.#graph
    this.#graph = null
    if (graph) this.#announce(follower, graph)
  }

  destroy(): void {
    const follower = this.#follower
    this.#follower = null
    this.#graph = null
    try {
      follower?.stop()
    } catch (error) {
      report(error)
    }
  }

  #settleStill(follower: LayoutFollower): boolean {
    if (!this.#released) return false
    const until = performance.now() + stillSlice
    try {
      if (!this.#calm) {
        if (follower.step(Number.POSITIVE_INFINITY, until)) return true
        this.#calm = true
        follower.release()
      }
      if (performance.now() >= until) return true
      if (follower.step(Number.POSITIVE_INFINITY, until)) return true
    } catch (error) {
      this.#fail(error)
      return false
    }
    this.#write()
    this.stop()
    return false
  }

  #write(): void {
    const follower = this.#follower
    const graph = this.#graph
    if (!follower || !graph) return
    const { positions, scene } = this.#source
    const { xy, keys } = graph
    for (const index of follower.moved) {
      if (this.#held.has(index) || scene.nodes.keys[index] !== keys[index]) continue
      const x = xy[index * 2] ?? Number.NaN
      const y = xy[index * 2 + 1] ?? Number.NaN
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      if (positions.holds(index, x, y)) continue
      positions.set(index, x, y)
    }
  }

  #fail(error: unknown): void {
    report(error)
    this.stop()
  }

  #announce(follower: LayoutFollower, graph: LayoutGraph): void {
    const { emitter, scene, positions } = this.#source
    if (!emitter.has('positionchange')) return
    const moved = new Map<Key, Point>()
    for (const index of follower.moved) {
      const key = graph.keys[index]
      if (key === undefined || this.#held.has(index)) continue
      if (scene.nodes.alive[index] !== 1 || scene.nodes.keys[index] !== key) continue
      moved.set(key, { x: positions.x(index), y: positions.y(index) })
    }
    if (moved.size === 0) return
    emitter.emit('positionchange', positionEvent('drag', moved, this.#source.surface()))
  }
}
