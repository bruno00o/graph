import { noColor } from '../core/columns'
import {
  isDrawn,
  type PickPositions,
  type ShapeGeometryData,
  type ShapePicker,
  type ShapePickQuery,
  shapeKinds,
  shapePicks,
} from '../core/shape-engine'
import type { ShapeStore } from '../core/shape-store'
import type { Point } from '../types'

const maxCells = 16
const lassoSamples = 32

function insideRings(geometry: ShapeGeometryData, x: number, y: number): boolean {
  const { points, rings } = geometry
  let odd = false
  let from = 0
  for (const to of rings) {
    let j = to - 1
    for (let i = from; i < to; i++) {
      const xi = points[i * 2] ?? 0
      const yi = points[i * 2 + 1] ?? 0
      const xj = points[j * 2] ?? 0
      const yj = points[j * 2 + 1] ?? 0
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd
      j = i
    }
    from = to
  }
  return odd
}

function segmentDistance(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length)) : 0
  const ex = x - (ax + dx * t)
  const ey = y - (ay + dy * t)
  return ex * ex + ey * ey
}

function nearRings(geometry: ShapeGeometryData, x: number, y: number, reach: number): boolean {
  const { points, rings, closed } = geometry
  const squared = reach * reach
  let from = 0
  for (const to of rings) {
    const last = closed ? to : to - 1
    for (let i = from; i < last; i++) {
      const j = i + 1 < to ? i + 1 : from
      const ax = points[i * 2] ?? 0
      const ay = points[i * 2 + 1] ?? 0
      const bx = points[j * 2] ?? 0
      const by = points[j * 2 + 1] ?? 0
      if (segmentDistance(x, y, ax, ay, bx, by) <= squared) return true
    }
    const px = x - (points[from * 2] ?? 0)
    const py = y - (points[from * 2 + 1] ?? 0)
    if (to - from === 1 && px * px + py * py <= squared) return true
    from = to
  }
  return false
}

function roundDistance(geometry: ShapeGeometryData, x: number, y: number): number {
  const round = geometry.round
  if (!round) return Number.POSITIVE_INFINITY
  const qx = x - (round[0] ?? 0)
  const qy = y - (round[1] ?? 0)
  if (geometry.kind === shapeKinds.circle) {
    const size = Math.hypot(qx, qy)
    const outer = size - (round[2] ?? 0)
    const inner = round[3] ?? 0
    return inner > 0 ? Math.max(outer, inner - size) : outer
  }
  const hw = round[2] ?? 0
  const hh = round[3] ?? 0
  const r = Math.min(round[4] ?? 0, hw, hh)
  const kx = Math.abs(qx) - hw + r
  const ky = Math.abs(qy) - hh + r
  return Math.hypot(Math.max(kx, 0), Math.max(ky, 0)) + Math.min(Math.max(kx, ky), 0) - r
}

function roundOutline(
  geometry: ShapeGeometryData,
  visit: (x: number, y: number) => boolean,
): boolean {
  const round = geometry.round
  if (!round) return true
  const cx = round[0] ?? 0
  const cy = round[1] ?? 0
  if (geometry.kind === shapeKinds.circle) {
    const r = round[2] ?? 0
    for (let k = 0; k < lassoSamples; k++) {
      const angle = (k / lassoSamples) * Math.PI * 2
      if (!visit(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)) return false
    }
    return true
  }
  const hw = round[2] ?? 0
  const hh = round[3] ?? 0
  const r = Math.min(round[4] ?? 0, hw, hh)
  const corners = [
    [hw - r, hh - r, 0],
    [-(hw - r), hh - r, 0.25],
    [-(hw - r), -(hh - r), 0.5],
    [hw - r, -(hh - r), 0.75],
  ] as const
  const steps = r > 0 ? lassoSamples / 4 : 1
  for (const [ox, oy, turn] of corners) {
    for (let k = 0; k < steps; k++) {
      const angle = (turn + k / (steps * 4)) * Math.PI * 2
      if (!visit(cx + ox + Math.cos(angle) * r, cy + oy + Math.sin(angle) * r)) return false
    }
  }
  return true
}

function insidePolygon(polygon: readonly Point[], x: number, y: number): boolean {
  let odd = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (!a || !b) continue
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) odd = !odd
  }
  return odd
}

interface Level {
  readonly side: number
  readonly width: number
  readonly height: number
  readonly starts: Uint32Array
  readonly entries: Uint32Array
}

export function createShapePicker(store: ShapeStore, positions: PickPositions): ShapePicker {
  let pinned: number[] = []
  let pinnedBoxes = new Float64Array(0)
  let pinnedAt = -1
  let pinnedFor = -1
  let version = -1
  let styleVersion = -1
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  let levels: Level[] = []
  let rank = new Uint32Array(0)
  let stamps = new Uint32Array(0)
  let stamp = 0
  let widest = 0

  function strokes(index: number, mode: number): boolean {
    if (mode === shapePicks.stroke) return true
    return (store.strokeWidth[index] ?? 0) > 0 && (store.stroke[index] ?? noColor) !== noColor
  }

  function fills(index: number, geometry: ShapeGeometryData, mode: number): boolean {
    return (
      mode === shapePicks.painted &&
      geometry.kind !== shapeKinds.line &&
      (store.fill[index] ?? noColor) !== noColor
    )
  }

  function cellOf(value: number, origin: number, size: number, side: number): number {
    return Math.min(side - 1, Math.max(0, Math.floor((value - origin) / size)))
  }

  function build(): void {
    version = store.version
    styleVersion = store.styleVersion
    const order = store.drawOrder()
    rank = new Uint32Array(store.capacity)
    stamps = new Uint32Array(store.capacity)
    stamp = 0
    widest = 0
    const picked: number[] = []
    pinned = []
    pinnedFor = -1
    minX = Number.POSITIVE_INFINITY
    minY = Number.POSITIVE_INFINITY
    maxX = Number.NEGATIVE_INFINITY
    maxY = Number.NEGATIVE_INFINITY
    order.forEach((index, at) => {
      rank[index] = at + 1
      const mode = store.pick[index] ?? shapePicks.painted
      const geometry = store.geometry[index]
      if (mode === shapePicks.none || !isDrawn(geometry)) return
      if (!fills(index, geometry, mode) && !strokes(index, mode)) return
      widest = Math.max(widest, (store.strokeWidth[index] ?? 0) / 2)
      if (store.pinned(index)) {
        pinned.push(index)
        return
      }
      picked.push(index)
      minX = Math.min(minX, geometry.minX)
      minY = Math.min(minY, geometry.minY)
      maxX = Math.max(maxX, geometry.maxX)
      maxY = Math.max(maxY, geometry.maxY)
    })
    levels = []
    if (picked.length === 0) return
    const finest = Math.min(1024, Math.ceil(Math.sqrt(picked.length)))
    const width = Math.max((maxX - minX) / finest, 1e-9)
    const height = Math.max((maxY - minY) / finest, 1e-9)
    const depth = Math.max(1, Math.ceil(Math.log2(finest)) + 1)
    const levelOf = new Uint8Array(picked.length)
    const sizes = Array.from({ length: depth }, (_, level) => ({
      side: Math.max(1, Math.ceil(finest / 2 ** level)),
      width: width * 2 ** level,
      height: height * 2 ** level,
    }))
    picked.forEach((index, at) => {
      const geometry = store.geometry[index] as ShapeGeometryData
      let level = 0
      for (; level < depth - 1; level++) {
        const size = sizes[level] ?? { side: 1, width, height }
        const columns =
          cellOf(geometry.maxX, minX, size.width, size.side) -
          cellOf(geometry.minX, minX, size.width, size.side) +
          1
        const rows =
          cellOf(geometry.maxY, minY, size.height, size.side) -
          cellOf(geometry.minY, minY, size.height, size.side) +
          1
        if (columns * rows <= maxCells) break
      }
      levelOf[at] = level
    })
    levels = sizes.map((size, level) => {
      const counts = new Uint32Array(size.side * size.side + 1)
      const visit = (index: number, write: (cell: number) => void) => {
        const geometry = store.geometry[index] as ShapeGeometryData
        const c0 = cellOf(geometry.minX, minX, size.width, size.side)
        const c1 = cellOf(geometry.maxX, minX, size.width, size.side)
        const r0 = cellOf(geometry.minY, minY, size.height, size.side)
        const r1 = cellOf(geometry.maxY, minY, size.height, size.side)
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) write(r * size.side + c)
      }
      picked.forEach((index, at) => {
        if (levelOf[at] !== level) return
        visit(index, (cell) => {
          counts[cell + 1] = (counts[cell + 1] ?? 0) + 1
        })
      })
      for (let cell = 1; cell < counts.length; cell++) {
        counts[cell] = (counts[cell] ?? 0) + (counts[cell - 1] ?? 0)
      }
      const entries = new Uint32Array(counts[counts.length - 1] ?? 0)
      const next = counts.slice(0, counts.length - 1)
      if (entries.length > 0) {
        picked.forEach((index, at) => {
          if (levelOf[at] !== level) return
          visit(index, (cell) => {
            const slot = next[cell] ?? 0
            entries[slot] = index
            next[cell] = slot + 1
          })
        })
      }
      return { ...size, starts: counts, entries }
    })
  }

  function fresh(): void {
    if (store.version !== version || store.styleVersion !== styleVersion) build()
  }

  function hits(index: number, query: ShapePickQuery): boolean {
    const geometry = store.geometry[index]
    if (!isDrawn(geometry)) return false
    const mode = store.pick[index] ?? shapePicks.painted
    const stroked = strokes(index, mode)
    const reach = stroked
      ? ((store.strokeWidth[index] ?? 0) / 2 + query.tolerance) / query.scale
      : 0
    const { x, y } = query
    if (
      x < geometry.minX - reach ||
      x > geometry.maxX + reach ||
      y < geometry.minY - reach ||
      y > geometry.maxY + reach
    ) {
      return false
    }
    if (!query.shown(index)) return false
    const filled = fills(index, geometry, mode)
    if (geometry.round) {
      const distance = roundDistance(geometry, x, y)
      return (filled && distance <= 0) || (stroked && Math.abs(distance) <= reach)
    }
    if (filled && insideRings(geometry, x, y)) return true
    return stroked && nearRings(geometry, x, y, reach)
  }

  function placePinned(current: boolean): void {
    if (pinnedFor === version && (!current || pinnedAt === positions.version)) return
    pinnedFor = version
    pinnedAt = positions.version
    if (pinnedBoxes.length !== pinned.length * 4) pinnedBoxes = new Float64Array(pinned.length * 4)
    pinned.forEach((index, at) => {
      const geometry = store.geometry[index] as ShapeGeometryData
      const node = store.pinNode?.[index] ?? 0
      const x = positions.x(node)
      const y = positions.y(node)
      pinnedBoxes[at * 4] = geometry.minX + x
      pinnedBoxes[at * 4 + 1] = geometry.minY + y
      pinnedBoxes[at * 4 + 2] = geometry.maxX + x
      pinnedBoxes[at * 4 + 3] = geometry.maxY + y
    })
  }

  function pickPinned(query: ShapePickQuery, reach: number, found: number, order: number): number {
    placePinned(query.current)
    let best = found
    let bestOrder = order
    const { x, y } = query
    for (let at = 0; at < pinned.length; at++) {
      const box = at * 4
      if (x < (pinnedBoxes[box] ?? 0) - reach || x > (pinnedBoxes[box + 2] ?? 0) + reach) continue
      if (y < (pinnedBoxes[box + 1] ?? 0) - reach || y > (pinnedBoxes[box + 3] ?? 0) + reach)
        continue
      const index = pinned[at] ?? 0
      const rankOf = (query.raised(index) ? 2 ** 31 : 0) + (rank[index] ?? 0)
      if (rankOf <= bestOrder) continue
      const node = store.pinNode?.[index] ?? 0
      const local = { ...query, x: x - positions.x(node), y: y - positions.y(node) }
      if (!hits(index, local)) continue
      best = index
      bestOrder = rankOf
    }
    return best
  }

  return {
    pick(query) {
      fresh()
      const reach = (widest + query.tolerance) / query.scale
      const { x, y } = query
      const outside = x + reach < minX || y + reach < minY || x - reach > maxX || y - reach > maxY
      stamp = stamp >= 0xfffffffe ? 1 : stamp + 1
      if (stamp === 1) stamps.fill(0)
      let best = -1
      let bestOrder = -1
      for (const level of outside ? [] : levels) {
        if (level.entries.length === 0) continue
        const { side, width, height, starts, entries } = level
        const c0 = cellOf(x - reach, minX, width, side)
        const c1 = cellOf(x + reach, minX, width, side)
        const r0 = cellOf(y - reach, minY, height, side)
        const r1 = cellOf(y + reach, minY, height, side)
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const cell = r * side + c
            const begin = starts[cell] ?? 0
            for (let at = (starts[cell + 1] ?? 0) - 1; at >= begin; at--) {
              const index = entries[at] ?? 0
              if (stamps[index] === stamp) continue
              stamps[index] = stamp
              const order = (query.raised(index) ? 2 ** 31 : 0) + (rank[index] ?? 0)
              if (order <= bestOrder || !hits(index, query)) continue
              best = index
              bestOrder = order
            }
          }
        }
      }
      if (pinned.length === 0) return best
      const order = best >= 0 ? (query.raised(best) ? 2 ** 31 : 0) + (rank[best] ?? 0) : -1
      return pickPinned(query, reach, best, order)
    },

    inside(polygon, shown) {
      fresh()
      const found: number[] = []
      if ((levels.length === 0 && pinned.length === 0) || polygon.length < 3) return found
      let x0 = Number.POSITIVE_INFINITY
      let y0 = Number.POSITIVE_INFINITY
      let x1 = Number.NEGATIVE_INFINITY
      let y1 = Number.NEGATIVE_INFINITY
      for (const point of polygon) {
        x0 = Math.min(x0, point.x)
        y0 = Math.min(y0, point.y)
        x1 = Math.max(x1, point.x)
        y1 = Math.max(y1, point.y)
      }
      const order = store.drawOrder()
      for (const index of order) {
        const mode = store.pick[index] ?? shapePicks.painted
        const geometry = store.geometry[index]
        if (mode === shapePicks.none || !isDrawn(geometry)) continue
        const node = store.pinNode?.[index] ?? -1
        const ox = node >= 0 ? positions.x(node) : 0
        const oy = node >= 0 ? positions.y(node) : 0
        if (
          geometry.minX + ox < x0 ||
          geometry.maxX + ox > x1 ||
          geometry.minY + oy < y0 ||
          geometry.maxY + oy > y1
        ) {
          continue
        }
        if (!shown(index)) continue
        const within = (x: number, y: number) => insidePolygon(polygon, x + ox, y + oy)
        if (geometry.round) {
          if (roundOutline(geometry, within)) found.push(index)
          continue
        }
        const points = geometry.points
        let all = true
        for (let k = 0; all && k < points.length; k += 2) {
          all = within(points[k] ?? 0, points[k + 1] ?? 0)
        }
        if (all) found.push(index)
      }
      return found
    },
  }
}
