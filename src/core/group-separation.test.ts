import { describe, expect, it } from 'vitest'
import type { LayoutGroups } from '../types'
import { separateGroups } from './group-separation'
import { groupTree } from './group-tree'

interface Shape {
  readonly x: number
  readonly y: number
  readonly hw: number
  readonly hh: number
  readonly round: boolean
}

interface Case {
  readonly capacity: number
  readonly alive: Uint8Array
  readonly radius: Float32Array
  readonly xy: Float32Array
  readonly groups: LayoutGroups
}

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function nested(seed: number, leaves: number, circles = false): Case {
  const next = random(seed)
  const containers = [leaves, leaves + 1, leaves + 2, leaves + 3, leaves + 4, leaves + 5]
  const capacity = leaves + containers.length
  const parent = new Int32Array(capacity).fill(-1)
  parent[leaves + 2] = leaves
  parent[leaves + 3] = leaves
  parent[leaves + 4] = leaves + 3
  const alive = new Uint8Array(capacity)
  const radius = new Float32Array(capacity)
  const xy = new Float32Array(capacity * 2)
  for (let index = 0; index < leaves; index++) {
    alive[index] = 1
    radius[index] = 2 + next() * 8
    xy[index * 2] = next() * 200
    xy[index * 2 + 1] = next() * 200
    const pick = Math.floor(next() * (containers.length + 1))
    parent[index] = pick < containers.length ? (containers[pick] ?? -1) : -1
  }
  const padding = new Float32Array(capacity)
  const circle = new Uint8Array(capacity)
  for (const index of containers) {
    padding[index] = 4 + next() * 12
    circle[index] = circles && index % 2 === 0 ? 1 : 0
  }
  const order = Uint32Array.from([
    leaves,
    leaves + 1,
    leaves + 5,
    leaves + 2,
    leaves + 3,
    leaves + 4,
  ])
  return { capacity, alive, radius, xy, groups: { order, parent, padding, circle } }
}

function shapesOf(input: Case): Map<number, Shape> {
  const { groups, alive, radius, xy } = input
  const shapes = new Map<number, Shape>()
  for (const container of [...groups.order].reverse()) {
    const items: Shape[] = []
    for (let index = 0; index < input.capacity; index++) {
      if (groups.parent[index] !== container) continue
      const nested = shapes.get(index)
      if (nested) items.push(nested)
      else if (alive[index] === 1) {
        const r = radius[index] ?? 0
        items.push({ x: xy[index * 2] ?? 0, y: xy[index * 2 + 1] ?? 0, hw: r, hh: r, round: true })
      }
    }
    if (items.length === 0) continue
    const minX = Math.min(...items.map((item) => item.x - item.hw))
    const maxX = Math.max(...items.map((item) => item.x + item.hw))
    const minY = Math.min(...items.map((item) => item.y - item.hh))
    const maxY = Math.max(...items.map((item) => item.y + item.hh))
    const x = (minX + maxX) / 2
    const y = (minY + maxY) / 2
    const pad = groups.padding[container] ?? 0
    if (groups.circle[container] === 1) {
      const reach = Math.max(
        ...items.map(
          (item) =>
            Math.hypot(item.x - x, item.y - y) +
            (item.round ? item.hw : Math.hypot(item.hw, item.hh)),
        ),
      )
      shapes.set(container, { x, y, hw: reach + pad, hh: reach + pad, round: true })
    } else {
      shapes.set(container, {
        x,
        y,
        hw: (maxX - minX) / 2 + pad,
        hh: (maxY - minY) / 2 + pad,
        round: false,
      })
    }
  }
  return shapes
}

function gapOf(a: Shape, b: Shape): number {
  if (a.round && b.round) return Math.hypot(a.x - b.x, a.y - b.y) - a.hw - b.hw
  if (!a.round && !b.round) {
    return Math.max(Math.abs(a.x - b.x) - a.hw - b.hw, Math.abs(a.y - b.y) - a.hh - b.hh)
  }
  const square = a.round ? b : a
  const disc = a.round ? a : b
  const ex = disc.x - square.x
  const ey = disc.y - square.y
  if (Math.abs(ex) <= square.hw && Math.abs(ey) <= square.hh) {
    return -Math.min(square.hw - Math.abs(ex), square.hh - Math.abs(ey)) - disc.hw
  }
  const qx = ex - Math.max(-square.hw, Math.min(square.hw, ex))
  const qy = ey - Math.max(-square.hh, Math.min(square.hh, ey))
  return Math.hypot(qx, qy) - disc.hw
}

function smallestGap(input: Case, leaves: boolean): number {
  const shapes = shapesOf(input)
  const levels = new Map<number, Shape[]>()
  for (let index = 0; index < input.capacity; index++) {
    const shape =
      shapes.get(index) ??
      (input.alive[index] === 1
        ? {
            x: input.xy[index * 2] ?? 0,
            y: input.xy[index * 2 + 1] ?? 0,
            hw: input.radius[index] ?? 0,
            hh: input.radius[index] ?? 0,
            round: true,
          }
        : null)
    if (!shape) continue
    const level = input.groups.parent[index] ?? -1
    levels.set(level, [...(levels.get(level) ?? []), shape])
  }
  let smallest = Number.POSITIVE_INFINITY
  for (const items of levels.values()) {
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const first = items[a] as Shape
        const second = items[b] as Shape
        const bothLeaves = first.round && second.round && first.hw <= 10 && second.hw <= 10
        if (!leaves && bothLeaves) continue
        const gap = gapOf(first, second)
        smallest = Math.min(smallest, gap)
      }
    }
  }
  return smallest
}

describe('separateGroups', () => {
  it('keeps containers apart at every level, padding included', () => {
    for (const circles of [false, true]) {
      const input = nested(3, 120, circles)
      const tree = groupTree(input.capacity, input.alive, input.groups)
      if (!tree) throw new Error('no tree')
      const fixed = new Uint8Array(input.capacity)
      separateGroups(tree, input.alive, input.radius, fixed, input.xy, {
        spacing: 2,
        groupSpacing: 10,
        rounds: 256,
        nodes: 'all',
      })
      expect(smallestGap(input, false)).toBeGreaterThan(10 - 1e-3)
      expect(smallestGap(input, true)).toBeGreaterThan(-1e-3)
    }
  })
})
