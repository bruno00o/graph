import type { PositionMoves, PositionReader, Positions } from '../core/positions'
import { easeInOut } from '../core/view'
import type { GraphDefinition } from '../types'
import { progress } from './frame-cost'
import { reducedMotion } from './reduced-motion'
import type { SpreadHost } from './spread'

interface PositionAnimation {
  readonly id: number
  readonly indices: readonly number[]
  readonly from: Float32Array
  readonly to: Float32Array
  readonly start: number
  readonly duration: number
  readonly done: (() => void) | null
}

export interface MotionSource {
  readonly positions: Positions
  readonly spread: SpreadHost
  definition(): GraphDefinition
  dragging(): readonly number[] | undefined
  request(): void
  frameCost(): number
}

export class PositionMotion {
  #animations: PositionAnimation[] = []
  #owner = new Uint32Array(0)
  #serial = 0
  #goals = new Float64Array(0)
  #goalIndices: number[] = []
  readonly #source: MotionSource

  constructor(source: MotionSource) {
    this.#source = source
  }

  get active(): boolean {
    return this.#animations.length > 0
  }

  owned(index: number): number {
    return this.#owner[index] ?? 0
  }

  free(index: number): void {
    if (index < this.#owner.length) this.#owner[index] = 0
  }

  freeMovable(movable: Uint8Array, capacity: number): void {
    const owner = this.#owner
    for (let index = 0; index < Math.min(capacity, owner.length); index++) {
      if (movable[index] === 1) owner[index] = 0
    }
  }

  settled(): PositionReader {
    const positions = this.#source.positions
    const spread = this.#source.spread
    for (const index of this.#goalIndices) this.#goals.fill(Number.NaN, index * 2, index * 2 + 2)
    this.#goalIndices = []
    if (this.#animations.length === 0 && !spread.moving) return positions
    if (this.#goals.length < positions.capacity * 2) {
      this.#goals = new Float64Array(positions.capacity * 2).fill(Number.NaN)
    }
    const targets = this.#goals
    const goalIndices = this.#goalIndices
    spread.goals((index, x, y) => {
      targets[index * 2] = x
      targets[index * 2 + 1] = y
      goalIndices.push(index)
    })
    const owner = this.#owner
    for (const animation of this.#animations) {
      animation.indices.forEach((index, i) => {
        if (owner[index] !== animation.id) return
        targets[index * 2] = animation.to[i * 2] ?? Number.NaN
        targets[index * 2 + 1] = animation.to[i * 2 + 1] ?? Number.NaN
        goalIndices.push(index)
      })
    }
    const goal = (at: number, fallback: number) => {
      const value = targets[at] ?? Number.NaN
      return Number.isNaN(value) ? fallback : value
    }
    return {
      source: positions.source,
      x: (index) => goal(index * 2, positions.x(index)),
      y: (index) => goal(index * 2 + 1, positions.y(index)),
    }
  }

  cancel(id: number): void {
    const owner = this.#owner
    this.#animations = this.#animations.filter((animation) => {
      if (animation.id !== id) return true
      for (const index of animation.indices) {
        if (owner[index] === id) owner[index] = 0
      }
      return false
    })
  }

  move(
    indices: readonly number[],
    to: readonly number[],
    duration: number,
    done: (() => void) | null = null,
  ): number {
    const positions = this.#source.positions
    if (indices.length === 0) {
      done?.()
      return 0
    }
    const ms = reducedMotion() ? 0 : duration
    if (ms <= 0) {
      indices.forEach((index, i) => {
        if (index < this.#owner.length) this.#owner[index] = 0
        positions.set(index, to[i * 2] ?? 0, to[i * 2 + 1] ?? 0)
      })
      this.#source.request()
      done?.()
      return 0
    }
    if (positions.capacity > this.#owner.length) {
      const owner = new Uint32Array(positions.capacity)
      owner.set(this.#owner)
      this.#owner = owner
    }
    const owner = this.#owner
    const id = ++this.#serial
    const from = new Float32Array(indices.length * 2)
    indices.forEach((index, i) => {
      owner[index] = id
      from[i * 2] = positions.x(index)
      from[i * 2 + 1] = positions.y(index)
    })
    this.#animations.push({
      id,
      indices,
      from,
      to: Float32Array.from(to),
      start: performance.now(),
      duration: ms,
      done,
    })
    this.#source.request()
    return id
  }

  follow(moves: PositionMoves): void {
    const positions = this.#source.positions
    const spread = this.#source.spread
    for (const index of moves.held) {
      this.free(index)
      spread.attach(index)
      spread.moveBase(index, positions.source[index * 2] ?? 0, positions.source[index * 2 + 1] ?? 0)
    }
    if (moves.indices.length === 0) return
    const dragged = new Set(this.#source.dragging())
    const indices: number[] = []
    const to: number[] = []
    moves.indices.forEach((index, i) => {
      if (dragged.has(index)) return
      spread.attach(index)
      if (spread.moveBase(index, moves.to[i * 2] ?? 0, moves.to[i * 2 + 1] ?? 0)) return
      indices.push(index)
      to.push(moves.to[i * 2] ?? 0, moves.to[i * 2 + 1] ?? 0)
    })
    this.move(indices, to, this.#source.definition().transitions.positions)
  }

  step(now: number): void {
    const positions = this.#source.positions
    const owner = this.#owner
    const finished: (() => void)[] = []
    const cost = this.#source.frameCost()
    this.#animations = this.#animations.filter((animation) => {
      const t = Math.max(0, progress(now, animation.start, animation.duration, cost))
      const k = easeInOut(t)
      animation.indices.forEach((index, i) => {
        if (owner[index] !== animation.id) return
        const fromX = animation.from[i * 2] ?? 0
        const fromY = animation.from[i * 2 + 1] ?? 0
        const toX = animation.to[i * 2] ?? 0
        const toY = animation.to[i * 2 + 1] ?? 0
        positions.set(index, fromX + (toX - fromX) * k, fromY + (toY - fromY) * k)
      })
      if (t < 1) return true
      if (animation.done) finished.push(animation.done)
      return false
    })
    for (const done of finished) done()
  }
}
