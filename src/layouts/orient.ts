import type { Layout, LayoutGraph } from '../types'
import type { Structure } from './scopes'

type Turn = readonly [number, number, number, number]

interface Incidence {
  readonly start: Uint32Array
  readonly ends: Uint32Array
}

function incidenceOf(graph: LayoutGraph): Incidence {
  const start = new Uint32Array(graph.capacity + 1)
  const edges = graph.edges
  for (let at = 0; at < edges.length; at++) {
    const index = edges[at] ?? 0
    start[index + 1] = (start[index + 1] ?? 0) + 1
  }
  for (let index = 0; index < graph.capacity; index++) {
    start[index + 1] = (start[index + 1] ?? 0) + (start[index] ?? 0)
  }
  const fill = start.slice(0, graph.capacity)
  const ends = new Uint32Array(edges.length)
  for (let at = 0; at + 1 < edges.length; at += 2) {
    const u = edges[at] ?? 0
    const v = edges[at + 1] ?? 0
    ends[fill[u] ?? 0] = v
    fill[u] = (fill[u] ?? 0) + 1
    ends[fill[v] ?? 0] = u
    fill[v] = (fill[v] ?? 0) + 1
  }
  return { start, ends }
}

function sideways(layout: Layout | null): boolean {
  const direction = (layout?.options as { readonly direction?: unknown } | undefined)?.direction
  return direction === 'left' || direction === 'right'
}

function score(turn: Turn, xx: number, xy: number, yx: number, yy: number): number {
  return turn[0] * xx + turn[1] * yx + turn[2] * xy + turn[3] * yy
}

function choose(
  turns: 'free' | 'flip',
  layout: Layout | null,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
): Turn | null {
  const candidates: Turn[] = []
  if (turns === 'flip') {
    candidates.push(sideways(layout) ? [1, 0, 0, -1] : [-1, 0, 0, 1])
  } else {
    const rotation = Math.atan2(xy - yx, xx + yy)
    const c = Math.cos(rotation)
    const s = Math.sin(rotation)
    candidates.push([c, -s, s, c])
    const mirror = Math.atan2(xy + yx, xx - yy)
    const mc = Math.cos(mirror)
    const ms = Math.sin(mirror)
    candidates.push([mc, ms, ms, -mc])
  }
  const still = xx + yy
  let best: Turn | null = null
  let top = still + 1e-9 * (Math.abs(xx) + Math.abs(xy) + Math.abs(yx) + Math.abs(yy))
  for (const turn of candidates) {
    const value = score(turn, xx, xy, yx, yy)
    if (value > top) {
      top = value
      best = turn
    }
  }
  return best
}

export function orientBlocks(structure: Structure, xy: Float32Array): void {
  const { graph, tree, moves, members, above, home, scopes } = structure
  const layoutOf = (slot: number): Layout | null => {
    const scope = scopes[slot]
    return scope?.layout ?? scope?.own ?? null
  }
  const turnsOf = (slot: number) => layoutOf(slot)?.turns ?? 'none'
  let incidence: Incidence | null = null
  const stamp = new Uint32Array(graph.capacity)
  let mark = 0
  for (let slot = 0; slot < tree.count; slot++) {
    if (moves[slot] !== 1) continue
    const turns = turnsOf(slot)
    if (turns !== 'free' && turns !== 'flip') continue
    const inside = members[slot] ?? []
    if (inside.length < 2) continue
    incidence ??= incidenceOf(graph)
    mark++
    let cx = 0
    let cy = 0
    for (const index of inside) {
      stamp[index] = mark
      cx += xy[index * 2] ?? 0
      cy += xy[index * 2 + 1] ?? 0
    }
    cx /= inside.length
    cy /= inside.length
    let sxx = 0
    let sxy = 0
    let syx = 0
    let syy = 0
    let links = 0
    for (const index of inside) {
      const ax = (xy[index * 2] ?? 0) - cx
      const ay = (xy[index * 2 + 1] ?? 0) - cy
      const end = incidence.start[index + 1] ?? 0
      for (let at: number = incidence.start[index] ?? 0; at < end; at++) {
        const other = incidence.ends[at] ?? 0
        if (stamp[other] === mark) continue
        const bx = (xy[other * 2] ?? 0) - cx
        const by = (xy[other * 2 + 1] ?? 0) - cy
        sxx += ax * bx
        sxy += ax * by
        syx += ay * bx
        syy += ay * by
        links++
      }
    }
    if (links === 0) continue
    const turn = choose(turns, layoutOf(slot), sxx, sxy, syx, syy)
    if (!turn) continue
    const nestedOf = new Int32Array(inside.length).fill(-1)
    const sums = new Map<number, [number, number, number]>()
    inside.forEach((index, at) => {
      let nested = -1
      for (let scope = home[index] ?? -1; scope >= 0 && scope !== slot; ) {
        if (turnsOf(scope) !== 'free') nested = scope
        scope = above[scope] ?? -1
      }
      nestedOf[at] = nested
      if (nested < 0) return
      const sum = sums.get(nested) ?? [0, 0, 0]
      sum[0] += xy[index * 2] ?? 0
      sum[1] += xy[index * 2 + 1] ?? 0
      sum[2]++
      sums.set(nested, sum)
    })
    const shifts = new Map<number, readonly [number, number]>()
    for (const [nested, [x, y, count]] of sums) {
      const ax = x / count - cx
      const ay = y / count - cy
      shifts.set(nested, [turn[0] * ax + turn[1] * ay - ax, turn[2] * ax + turn[3] * ay - ay])
    }
    inside.forEach((index, at) => {
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      const shift = shifts.get(nestedOf[at] ?? -1)
      if (shift) {
        xy[index * 2] = x + shift[0]
        xy[index * 2 + 1] = y + shift[1]
        return
      }
      const ax = x - cx
      const ay = y - cy
      xy[index * 2] = cx + turn[0] * ax + turn[1] * ay
      xy[index * 2 + 1] = cy + turn[2] * ax + turn[3] * ay
    })
  }
}
