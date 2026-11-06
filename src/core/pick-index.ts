import type { EdgeColumns, NodeColumns } from './columns'
import {
  type Cubic,
  distanceToCubic,
  loopCurve,
  loopMinimum,
  loopReach,
  parallelCurve,
  sampleCubic,
} from './edge-curve'
import type { Positions } from './positions'

export type PickHit =
  | { readonly kind: 'node'; readonly index: number }
  | { readonly kind: 'edge'; readonly index: number }

export interface PickSource {
  readonly nodes: NodeColumns
  readonly edges: EdgeColumns
  readonly positions: Positions
  readonly order: (kind: 'nodes' | 'edges', index: number) => number
}

interface Grid {
  readonly cell: number
  readonly minX: number
  readonly minY: number
  readonly cols: number
  readonly rows: number
  readonly offsets: Uint32Array
  readonly items: Uint32Array
}

const minimumPickRadius = 2
const pickSegments = 16
const indexSegments = 8

function createGrid(
  frame: Omit<Grid, 'offsets' | 'items'>,
  count: number,
  visit: (index: number, emit: (cell: number) => void) => void,
): Grid {
  const cells = frame.cols * frame.rows
  const offsets = new Uint32Array(cells + 1)
  for (let index = 0; index < count; index++) {
    visit(index, (cell) => {
      offsets[cell + 1] = (offsets[cell + 1] ?? 0) + 1
    })
  }
  for (let cell = 0; cell < cells; cell++) {
    offsets[cell + 1] = (offsets[cell + 1] ?? 0) + (offsets[cell] ?? 0)
  }
  const cursor = offsets.slice(0, cells)
  const items = new Uint32Array(offsets[cells] ?? 0)
  for (let index = 0; index < count; index++) {
    visit(index, (cell) => {
      const at = cursor[cell] ?? 0
      items[at] = index
      cursor[cell] = at + 1
    })
  }
  return { ...frame, offsets, items }
}

function traverse(
  grid: Omit<Grid, 'offsets' | 'items'>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  emit: (cell: number) => void,
): void {
  const x0 = (ax - grid.minX) / grid.cell
  const y0 = (ay - grid.minY) / grid.cell
  const x1 = (bx - grid.minX) / grid.cell
  const y1 = (by - grid.minY) / grid.cell
  let col = Math.floor(x0)
  let row = Math.floor(y0)
  const lastCol = Math.floor(x1)
  const lastRow = Math.floor(y1)
  const stepX = Math.sign(x1 - x0)
  const stepY = Math.sign(y1 - y0)
  const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / (x1 - x0))
  const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / (y1 - y0))
  let maxX = stepX > 0 ? (col + 1 - x0) * deltaX : stepX < 0 ? (x0 - col) * deltaX : deltaX
  let maxY = stepY > 0 ? (row + 1 - y0) * deltaY : stepY < 0 ? (y0 - row) * deltaY : deltaY
  const limit = Math.abs(lastCol - col) + Math.abs(lastRow - row)
  for (let step = 0; step <= limit; step++) {
    if (col >= 0 && row >= 0 && col < grid.cols && row < grid.rows) emit(row * grid.cols + col)
    if (col === lastCol && row === lastRow) return
    if (maxX < maxY) {
      maxX += deltaX
      col += stepX
    } else {
      maxY += deltaY
      row += stepY
    }
  }
}

export class PickIndex {
  #nodes: Grid | null = null
  #edges: Grid | null = null
  #maxWorldRadius = 0
  #maxScreenRadius = 0
  #maxEdgeHalfWidth = 0
  #loops: number[] = []

  build(source: PickSource): void {
    const { nodes, edges, positions } = source
    let count = 0
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    this.#maxWorldRadius = 0
    this.#maxScreenRadius = 0
    for (let index = 0; index < nodes.capacity; index++) {
      if (nodes.alive[index] !== 1) continue
      const x = positions.x(index)
      const y = positions.y(index)
      const radius = (nodes.size[index] ?? 0) / 2
      if (nodes.screenUnits[index] === 1) {
        this.#maxScreenRadius = Math.max(this.#maxScreenRadius, radius)
      } else {
        this.#maxWorldRadius = Math.max(this.#maxWorldRadius, radius)
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      count++
    }
    if (count === 0) {
      this.#nodes = null
      this.#edges = null
      this.#loops = []
      return
    }
    this.#loops = []
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1) continue
      if (edges.source[index] === edges.target[index]) {
        this.#loops.push(index)
        continue
      }
      if ((edges.bend[index] ?? 0) === 0) continue
      const points = sampleCubic(this.#parallel(source, index), indexSegments)
      for (let at = 0; at < points.length; at += 2) {
        minX = Math.min(minX, points[at] ?? minX)
        maxX = Math.max(maxX, points[at] ?? maxX)
        minY = Math.min(minY, points[at + 1] ?? minY)
        maxY = Math.max(maxY, points[at + 1] ?? maxY)
      }
    }
    const spanX = Math.max(maxX - minX, 1)
    const spanY = Math.max(maxY - minY, 1)
    let cell = Math.max(this.#maxWorldRadius * 2, Math.sqrt((spanX * spanY) / count) * 2, 1e-3)
    const budget = count * 4 + 1024
    const cells = (spanX / cell + 1) * (spanY / cell + 1)
    if (cells > budget) cell *= Math.sqrt(cells / budget)
    const frame = {
      cell,
      minX,
      minY,
      cols: Math.floor(spanX / cell) + 1,
      rows: Math.floor(spanY / cell) + 1,
    }
    this.#nodes = createGrid(frame, nodes.capacity, (index, emit) => {
      if (nodes.alive[index] !== 1) return
      const col = Math.floor((positions.x(index) - minX) / cell)
      const row = Math.floor((positions.y(index) - minY) / cell)
      emit(row * frame.cols + col)
    })
    this.#maxEdgeHalfWidth = 0
    this.#edges = createGrid(frame, edges.capacity, (index, emit) => {
      if (edges.alive[index] !== 1) return
      this.#maxEdgeHalfWidth = Math.max(this.#maxEdgeHalfWidth, (edges.width[index] ?? 0) / 2)
      const from = edges.source[index] ?? 0
      const to = edges.target[index] ?? 0
      if (from === to) return
      if ((edges.bend[index] ?? 0) === 0) {
        traverse(
          frame,
          positions.x(from),
          positions.y(from),
          positions.x(to),
          positions.y(to),
          emit,
        )
        return
      }
      const points = sampleCubic(this.#parallel(source, index), indexSegments)
      for (let at = 0; at + 3 < points.length; at += 2) {
        traverse(
          frame,
          points[at] ?? 0,
          points[at + 1] ?? 0,
          points[at + 2] ?? 0,
          points[at + 3] ?? 0,
          emit,
        )
      }
    })
  }

  pick(source: PickSource, x: number, y: number, zoom: number, tolerance: number): PickHit | null {
    const node = this.#pickNode(source, x, y, zoom)
    if (node >= 0) return { kind: 'node', index: node }
    const edge = this.#pickEdge(source, x, y, zoom, tolerance)
    return edge >= 0 ? { kind: 'edge', index: edge } : null
  }

  #cells(grid: Grid, x: number, y: number, reach: number, visit: (item: number) => void): void {
    const c0 = Math.max(0, Math.floor((x - reach - grid.minX) / grid.cell))
    const c1 = Math.min(grid.cols - 1, Math.floor((x + reach - grid.minX) / grid.cell))
    const r0 = Math.max(0, Math.floor((y - reach - grid.minY) / grid.cell))
    const r1 = Math.min(grid.rows - 1, Math.floor((y + reach - grid.minY) / grid.cell))
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const cell = row * grid.cols + col
        const end = grid.offsets[cell + 1] ?? 0
        for (let at = grid.offsets[cell] ?? 0; at < end; at++) visit(grid.items[at] ?? 0)
      }
    }
  }

  #parallel(source: PickSource, index: number): Cubic {
    const { edges, positions } = source
    const from = edges.source[index] ?? 0
    const to = edges.target[index] ?? 0
    return parallelCurve(
      positions.x(from),
      positions.y(from),
      positions.x(to),
      positions.y(to),
      edges.bend[index] ?? 0,
    )
  }

  #loop(source: PickSource, index: number, zoom: number): Cubic {
    const node = source.edges.source[index] ?? 0
    const size = (source.nodes.size[node] ?? 0) / 2
    const radius = Math.max(source.nodes.screenUnits[node] === 1 ? size : size * zoom, 1.25)
    const reach = loopReach(radius, source.edges.bend[index] ?? 0, loopMinimum) / zoom
    return loopCurve(source.positions.x(node), source.positions.y(node), reach)
  }

  #radius(source: PickSource, index: number, zoom: number): number {
    const size = (source.nodes.size[index] ?? 0) / 2
    const radius = source.nodes.screenUnits[index] === 1 ? size / zoom : size
    return Math.max(radius, minimumPickRadius / zoom)
  }

  #pickNode(source: PickSource, x: number, y: number, zoom: number): number {
    const grid = this.#nodes
    if (!grid) return -1
    const reach = Math.max(this.#maxWorldRadius, (this.#maxScreenRadius + minimumPickRadius) / zoom)
    let best = -1
    let bestOrder = Number.NEGATIVE_INFINITY
    this.#cells(grid, x, y, reach, (index) => {
      if (source.nodes.alive[index] !== 1) return
      const distance = Math.hypot(x - source.positions.x(index), y - source.positions.y(index))
      if (distance > this.#radius(source, index, zoom)) return
      const order = source.order('nodes', index)
      if (order > bestOrder) {
        best = index
        bestOrder = order
      }
    })
    return best
  }

  #pickEdge(source: PickSource, x: number, y: number, zoom: number, tolerance: number): number {
    const grid = this.#edges
    if (!grid) return -1
    const { edges, positions } = source
    const reach = (this.#maxEdgeHalfWidth + tolerance) / zoom
    let best = -1
    let bestDistance = Number.POSITIVE_INFINITY
    let bestOrder = Number.NEGATIVE_INFINITY
    const consider = (index: number, distance: number) => {
      if (distance > ((edges.width[index] ?? 0) / 2 + tolerance) / zoom) return
      const order = source.order('edges', index)
      if (distance < bestDistance || (distance === bestDistance && order > bestOrder)) {
        best = index
        bestDistance = distance
        bestOrder = order
      }
    }
    const seen = new Set<number>()
    this.#cells(grid, x, y, reach, (index) => {
      if (edges.alive[index] !== 1) return
      const s = edges.source[index] ?? 0
      const t = edges.target[index] ?? 0
      if ((edges.bend[index] ?? 0) !== 0) {
        if (seen.has(index)) return
        seen.add(index)
        consider(index, distanceToCubic(this.#parallel(source, index), x, y, pickSegments))
        return
      }
      const ax = positions.x(s)
      const ay = positions.y(s)
      const dx = positions.x(t) - ax
      const dy = positions.y(t) - ay
      const length = Math.hypot(dx, dy)
      if (length === 0) return
      const along = ((x - ax) * dx + (y - ay) * dy) / length
      if (along < this.#radius(source, s, zoom) || along > length - this.#radius(source, t, zoom)) {
        return
      }
      consider(index, Math.abs((x - ax) * dy - (y - ay) * dx) / length)
    })
    for (const index of this.#loops) {
      if (edges.alive[index] !== 1) continue
      consider(index, distanceToCubic(this.#loop(source, index, zoom), x, y, pickSegments))
    }
    return best
  }
}
