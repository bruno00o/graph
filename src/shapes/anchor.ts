import { type ShapeGeometryData, shapeKinds } from '../core/shape-engine'
import type { Point } from '../types'

const workBudget = 4_000_000
const maxCells = 4096
const minCells = 64
const reach = Math.SQRT1_2

function lineMiddle(geometry: ShapeGeometryData): Point {
  const { points, rings, closed } = geometry
  let best = -1
  let x = points[0] ?? 0
  let y = points[1] ?? 0
  let from = 0
  for (const to of rings) {
    const last = closed ? to : to - 1
    for (let i = from; i < last; i++) {
      const j = i + 1 < to ? i + 1 : from
      const ax = points[i * 2] ?? 0
      const ay = points[i * 2 + 1] ?? 0
      const bx = points[j * 2] ?? 0
      const by = points[j * 2 + 1] ?? 0
      const length = (bx - ax) * (bx - ax) + (by - ay) * (by - ay)
      if (length <= best) continue
      best = length
      x = (ax + bx) / 2
      y = (ay + by) / 2
    }
    from = to
  }
  return { x, y }
}

export function signedDistance(geometry: ShapeGeometryData, x: number, y: number): number {
  const { points, rings } = geometry
  let inside = false
  let nearest = Number.POSITIVE_INFINITY
  let from = 0
  for (const to of rings) {
    let j = to - 1
    for (let i = from; i < to; i++) {
      const ax = points[i * 2] ?? 0
      const ay = points[i * 2 + 1] ?? 0
      const bx = points[j * 2] ?? 0
      const by = points[j * 2 + 1] ?? 0
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
      const dx = bx - ax
      const dy = by - ay
      const length = dx * dx + dy * dy
      const t = length > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length)) : 0
      const ex = x - (ax + dx * t)
      const ey = y - (ay + dy * t)
      nearest = Math.min(nearest, ex * ex + ey * ey)
      j = i
    }
    from = to
  }
  const distance = Math.sqrt(nearest)
  return inside ? distance : -distance
}

class CellHeap {
  readonly #cells: number[] = []

  get size(): number {
    return this.#cells.length / 4
  }

  top(): number {
    return this.#cells[3] ?? Number.NEGATIVE_INFINITY
  }

  push(x: number, y: number, side: number, bound: number): void {
    const cells = this.#cells
    let at = cells.length / 4
    cells.push(x, y, side, bound)
    while (at > 0) {
      const parent = (at - 1) >> 1
      if ((cells[parent * 4 + 3] ?? 0) >= bound) break
      this.#swap(at, parent)
      at = parent
    }
  }

  pop(out: number[]): void {
    const cells = this.#cells
    for (let k = 0; k < 4; k++) out[k] = cells[k] ?? 0
    const last = cells.length / 4 - 1
    this.#swap(0, last)
    cells.length = last * 4
    let at = 0
    for (;;) {
      const left = at * 2 + 1
      const right = left + 1
      let top = at
      if (left < last && (cells[left * 4 + 3] ?? 0) > (cells[top * 4 + 3] ?? 0)) top = left
      if (right < last && (cells[right * 4 + 3] ?? 0) > (cells[top * 4 + 3] ?? 0)) top = right
      if (top === at) break
      this.#swap(at, top)
      at = top
    }
  }

  #swap(a: number, b: number): void {
    const cells = this.#cells
    for (let k = 0; k < 4; k++) {
      const kept = cells[a * 4 + k] ?? 0
      cells[a * 4 + k] = cells[b * 4 + k] ?? 0
      cells[b * 4 + k] = kept
    }
  }
}

function centroid(geometry: ShapeGeometryData): Point | null {
  const { points, rings } = geometry
  let area = 0
  let cx = 0
  let cy = 0
  let from = 0
  for (const to of rings) {
    let j = to - 1
    for (let i = from; i < to; i++) {
      const ax = points[j * 2] ?? 0
      const ay = points[j * 2 + 1] ?? 0
      const bx = points[i * 2] ?? 0
      const by = points[i * 2 + 1] ?? 0
      const cross = ax * by - bx * ay
      area += cross
      cx += (ax + bx) * cross
      cy += (ay + by) * cross
      j = i
    }
    from = to
  }
  const x = cx / (3 * area)
  const y = cy / (3 * area)
  return area !== 0 && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

export function polygonCenter(geometry: ShapeGeometryData): Point {
  const { minX, minY, maxX, maxY } = geometry
  const width = maxX - minX
  const height = maxY - minY
  const middle = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  if (!(width > 0 && height > 0) || geometry.rings.length === 0) return middle
  const budget = Math.max(
    minCells,
    Math.min(maxCells, Math.floor(workBudget / Math.max(1, geometry.points.length / 2))),
  )
  const side = Math.max(
    Math.min(width, height),
    Math.sqrt((width * height * 4) / budget),
    (Math.max(width, height) * 4) / budget,
  )
  const precision = Math.max(Math.min(width, height) / 100, Math.max(width, height) * 1e-9)
  const heap = new CellHeap()
  let bestX = middle.x
  let bestY = middle.y
  let best = signedDistance(geometry, bestX, bestY)
  let evaluated = 1
  const visit = (x: number, y: number, size: number): void => {
    const distance = signedDistance(geometry, x, y)
    evaluated++
    if (distance > best) {
      best = distance
      bestX = x
      bestY = y
    }
    const bound = distance + size * reach
    if (bound > best + precision) heap.push(x, y, size, bound)
  }
  const mass = centroid(geometry)
  if (mass) visit(mass.x, mass.y, 0)
  const columns = Math.ceil(width / side)
  const rows = Math.ceil(height / side)
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      visit(minX + (column + 0.5) * side, minY + (row + 0.5) * side, side)
    }
  }
  const cell = [0, 0, 0, 0]
  while (heap.size > 0 && evaluated < budget && heap.top() - best > precision) {
    heap.pop(cell)
    const [x = 0, y = 0, size = 0] = cell
    const half = size / 2
    for (const [dx, dy] of quarters) visit(x + dx * half, y + dy * half, half)
  }
  return { x: bestX, y: bestY }
}

const quarters = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [0.5, 0.5],
] as const

export function shapeAnchor(geometry: ShapeGeometryData): Point {
  const round = geometry.round
  if (round) {
    const x = round[0] ?? 0
    const y = round[1] ?? 0
    const inner = geometry.kind === shapeKinds.circle ? (round[3] ?? 0) : 0
    return inner > 0 ? { x, y: y - ((round[2] ?? 0) + inner) / 2 } : { x, y }
  }
  if (geometry.kind === shapeKinds.line) return lineMiddle(geometry)
  return polygonCenter(geometry)
}
