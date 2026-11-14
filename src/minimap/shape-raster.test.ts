import { describe, expect, it } from 'vitest'
import { noColor } from '../core/columns'
import { graphBounds, packColor, type RasterNodes, raster } from './raster'
import { drawShapes, fillAlpha, type RasterShapes, type ShapeCanvas } from './shape-raster'

const red = packColor(255, 0, 0, 255)
const blue = packColor(0, 0, 255, 255)

type Ring = readonly (readonly [number, number])[]

interface ShapeInput {
  readonly rings: readonly Ring[]
  readonly fill?: number
  readonly stroke?: number
  readonly closed?: boolean
  readonly node?: number
  readonly shown?: boolean
}

function shapesOf(list: readonly ShapeInput[]): RasterShapes {
  const points: number[] = []
  const ends: number[] = []
  const firstRing: number[] = []
  const boxes: number[] = []
  for (const shape of list) {
    firstRing.push(ends.length)
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const ring of shape.rings) {
      for (const [x, y] of ring) {
        points.push(x, y)
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      ends.push(points.length / 2)
    }
    boxes.push(minX, minY, maxX, maxY)
  }
  firstRing.push(ends.length)
  return {
    count: list.length,
    boxes: new Float32Array(boxes),
    node: Int32Array.from(list, (shape) => shape.node ?? -1),
    shown: Uint8Array.from(list, (shape) => (shape.shown === false ? 0 : 1)),
    fill: Uint32Array.from(list, (shape) => shape.fill ?? noColor),
    stroke: Uint32Array.from(list, (shape) => shape.stroke ?? noColor),
    opacity: new Float32Array(list.length).fill(1),
    firstRing: Uint32Array.from(firstRing),
    rings: Uint32Array.from(ends),
    closed: Uint8Array.from(list, (shape) => (shape.closed === false ? 0 : 1)),
    points: new Float32Array(points),
  }
}

class Grid implements ShapeCanvas {
  readonly width: number
  readonly height: number
  readonly cells: Uint8Array

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.cells = new Uint8Array(width * height)
  }

  span(y: number, from: number, to: number): void {
    for (let x = Math.max(0, from); x < Math.min(this.width, to); x++) {
      this.cells[y * this.width + x] = 1
    }
  }

  line(x0: number, y0: number, x1: number, y1: number): void {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))
    for (let step = 0; step <= steps; step++) {
      const t = steps === 0 ? 0 : step / steps
      const x = Math.floor(x0 + (x1 - x0) * t)
      const y = Math.floor(y0 + (y1 - y0) * t)
      if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.cells[y * this.width + x] = 2
    }
  }

  at(x: number, y: number): number {
    return this.cells[y * this.width + x] ?? 0
  }

  filled(): number {
    return this.cells.reduce((sum, cell) => sum + (cell === 1 ? 1 : 0), 0)
  }
}

const square = (x: number, y: number, side: number): Ring => [
  [x, y],
  [x + side, y],
  [x + side, y + side],
  [x, y + side],
]

const identity = { minX: 0, minY: 0, scale: 1, offsetX: 0, offsetY: 0 }
const colors = new Uint32Array([red, blue])
const noNodes = new Uint8Array(0)

describe('shapes in the minimap', () => {
  it('fills polygons by the even-odd rule, holes and parts included', () => {
    const grid = new Grid(40, 20)
    const shapes = shapesOf([
      { rings: [square(0, 0, 10), square(3, 3, 4)], fill: 0 },
      { rings: [square(20, 0, 4), square(30, 10, 5)], fill: 0 },
    ])
    drawShapes(grid, shapes, new Float32Array(0), noNodes, colors, identity)
    expect(grid.at(1, 1)).toBe(1)
    expect(grid.at(5, 5)).toBe(0)
    expect(grid.at(8, 8)).toBe(1)
    expect(grid.at(21, 1)).toBe(1)
    expect(grid.at(32, 12)).toBe(1)
    expect(grid.at(26, 6)).toBe(0)
    expect(grid.filled()).toBe(100 - 16 + 16 + 25)
  })

  it('outlines lines and unfilled shapes, and leaves out hidden ones', () => {
    const grid = new Grid(20, 20)
    const shapes = shapesOf([
      {
        rings: [
          [
            [0, 0],
            [10, 0],
          ],
        ],
        stroke: 1,
        closed: false,
      },
      { rings: [square(2, 5, 6)], stroke: 1 },
      { rings: [square(12, 12, 6)], fill: 0, shown: false },
    ])
    drawShapes(grid, shapes, new Float32Array(0), noNodes, colors, identity)
    expect(grid.at(5, 0)).toBe(2)
    expect(grid.at(2, 8)).toBe(2)
    expect(grid.at(5, 8)).toBe(0)
    expect(grid.at(14, 14)).toBe(0)
  })

  it('moves pinned shapes with their node and skips those of removed nodes', () => {
    const grid = new Grid(30, 30)
    const shapes = shapesOf([
      { rings: [square(-2, -2, 4)], fill: 0, node: 0 },
      { rings: [square(-2, -2, 4)], fill: 0, node: 1 },
    ])
    drawShapes(grid, shapes, new Float32Array([20, 20, 5, 5]), new Uint8Array([1, 0]), colors, {
      ...identity,
    })
    expect(grid.at(20, 20)).toBe(1)
    expect(grid.at(5, 5)).toBe(0)
  })

  it('marks a shape smaller than a pixel with one pixel', () => {
    const grid = new Grid(10, 10)
    const shapes = shapesOf([{ rings: [square(4.1, 4.1, 0.3)], fill: 0 }])
    drawShapes(grid, shapes, new Float32Array(0), noNodes, colors, identity)
    expect(grid.filled()).toBe(1)
  })

  it('frames the shapes with the nodes, hidden shapes included, and paints them pale', () => {
    const nodes: RasterNodes = {
      capacity: 1,
      alive: new Uint8Array([1]),
      shape: new Uint8Array(1),
      size: new Float32Array([2]),
      width: new Float32Array(1),
      fill: new Uint32Array([1]),
      stroke: new Uint32Array(1),
      strokeWidth: new Float32Array(1),
      opacity: new Float32Array([1]),
      screenUnits: new Uint8Array(1),
      container: new Uint8Array(1),
    }
    const scene = {
      nodes,
      edges: null,
      xy: new Float32Array([0, 0]),
      containers: null,
      colors,
      masks: null,
      shapes: shapesOf([
        { rings: [square(10, 10, 10)], fill: 0 },
        { rings: [square(-30, -30, 5)], fill: 0, shown: false },
      ]),
    }
    expect(graphBounds(scene)).toEqual({ minX: -30, minY: -30, maxX: 20, maxY: 20, count: 1 })
    const pixels = new Uint32Array(50 * 50)
    raster(
      { pixels, width: 50, height: 50 },
      scene,
      {
        edgeAlpha: 1,
        minRadius: 1,
        maxRadius: 4,
        selectedRadius: 3,
        nodeColor: null,
        selectedColor: null,
      },
      { minX: -30, minY: -30, scale: 1, offsetX: 0, offsetY: 0 },
    )
    const inside = pixels[45 * 50 + 45] ?? 0
    expect(inside & 0xff).toBe(255)
    expect(inside >>> 24).toBe(Math.round(fillAlpha * 255))
    expect(pixels[2 * 50 + 2]).toBe(0)
    expect(pixels[30 * 50 + 30]).toBe(blue)
  })
})
