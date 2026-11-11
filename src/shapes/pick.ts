import { noColor } from '../core/columns'
import {
  isDrawn,
  type ShapeGeometryData,
  type ShapePicker,
  type ShapePickQuery,
  shapeKinds,
  shapePicks,
} from '../core/shape-engine'
import type { ShapeStore } from '../core/shape-store'
import type { Point } from '../types'

const largeCells = 64
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
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t))
}

function nearRings(geometry: ShapeGeometryData, x: number, y: number, reach: number): boolean {
  const { points, rings, closed } = geometry
  let from = 0
  for (const to of rings) {
    const last = closed ? to : to - 1
    for (let i = from; i < last; i++) {
      const j = i + 1 < to ? i + 1 : from
      const ax = points[i * 2] ?? 0
      const ay = points[i * 2 + 1] ?? 0
      const bx = points[j * 2] ?? 0
      const by = points[j * 2 + 1] ?? 0
      if (segmentDistance(x, y, ax, ay, bx, by) <= reach) return true
    }
    if (
      to - from === 1 &&
      Math.hypot(x - (points[from * 2] ?? 0), y - (points[from * 2 + 1] ?? 0)) <= reach
    ) {
      return true
    }
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

export function createShapePicker(store: ShapeStore): ShapePicker {
  let version = -1
  let styleVersion = -1
  let side = 0
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  let cellWidth = 1
  let cellHeight = 1
  let starts = new Uint32Array(0)
  let entries = new Uint32Array(0)
  let large = new Uint32Array(0)
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

  function build(): void {
    version = store.version
    styleVersion = store.styleVersion
    const order = store.drawOrder()
    rank = new Uint32Array(store.capacity)
    stamps = new Uint32Array(store.capacity)
    stamp = 0
    widest = 0
    const picked: number[] = []
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
      picked.push(index)
      widest = Math.max(widest, (store.strokeWidth[index] ?? 0) / 2)
      minX = Math.min(minX, geometry.minX)
      minY = Math.min(minY, geometry.minY)
      maxX = Math.max(maxX, geometry.maxX)
      maxY = Math.max(maxY, geometry.maxY)
    })
    side = picked.length === 0 ? 0 : Math.min(1024, Math.ceil(Math.sqrt(picked.length)))
    cellWidth = Math.max((maxX - minX) / Math.max(side, 1), 1e-9)
    cellHeight = Math.max((maxY - minY) / Math.max(side, 1), 1e-9)
    const counts = new Uint32Array(side * side + 1)
    const wide: number[] = []
    const spans = new Int32Array(picked.length * 4)
    picked.forEach((index, at) => {
      const geometry = store.geometry[index] as ShapeGeometryData
      const c0 = column(geometry.minX)
      const c1 = column(geometry.maxX)
      const r0 = row(geometry.minY)
      const r1 = row(geometry.maxY)
      if ((c1 - c0 + 1) * (r1 - r0 + 1) > largeCells) {
        wide.push(index)
        spans[at * 4] = -1
        return
      }
      spans.set([c0, c1, r0, r1], at * 4)
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++)
          counts[r * side + c + 1] = (counts[r * side + c + 1] ?? 0) + 1
      }
    })
    for (let cell = 1; cell < counts.length; cell++) {
      counts[cell] = (counts[cell] ?? 0) + (counts[cell - 1] ?? 0)
    }
    starts = counts
    entries = new Uint32Array(counts[counts.length - 1] ?? 0)
    const fill = counts.slice(0, Math.max(0, counts.length - 1))
    picked.forEach((index, at) => {
      const c0 = spans[at * 4] ?? -1
      if (c0 < 0) return
      const c1 = spans[at * 4 + 1] ?? 0
      const r0 = spans[at * 4 + 2] ?? 0
      const r1 = spans[at * 4 + 3] ?? 0
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = r * side + c
          const at = fill[cell] ?? 0
          entries[at] = index
          fill[cell] = at + 1
        }
      }
    })
    large = Uint32Array.from(wide)
  }

  function column(x: number): number {
    return Math.min(side - 1, Math.max(0, Math.floor((x - minX) / cellWidth)))
  }

  function row(y: number): number {
    return Math.min(side - 1, Math.max(0, Math.floor((y - minY) / cellHeight)))
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

  return {
    pick(query) {
      fresh()
      if (side === 0) return -1
      stamp = stamp >= 0xfffffffe ? 1 : stamp + 1
      if (stamp === 1) stamps.fill(0)
      let best = -1
      let bestOrder = -1
      const consider = (index: number) => {
        if (stamps[index] === stamp) return
        stamps[index] = stamp
        const order = (query.raised(index) ? 2 ** 31 : 0) + (rank[index] ?? 0)
        if (order <= bestOrder || !hits(index, query)) return
        best = index
        bestOrder = order
      }
      for (const index of large) consider(index)
      const reach = (widest + query.tolerance) / query.scale
      const { x, y } = query
      if (x + reach >= minX && y + reach >= minY && x - reach <= maxX && y - reach <= maxY) {
        const c0 = column(x - reach)
        const c1 = column(x + reach)
        const r0 = row(y - reach)
        const r1 = row(y + reach)
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const cell = r * side + c
            const end = starts[cell + 1] ?? 0
            for (let at = starts[cell] ?? 0; at < end; at++) consider(entries[at] ?? 0)
          }
        }
      }
      return best
    },

    inside(polygon, shown) {
      fresh()
      const found: number[] = []
      if (side === 0 || polygon.length < 3) return found
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
        if (geometry.minX < x0 || geometry.maxX > x1 || geometry.minY < y0 || geometry.maxY > y1) {
          continue
        }
        if (!shown(index)) continue
        const within = (x: number, y: number) => insidePolygon(polygon, x, y)
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
