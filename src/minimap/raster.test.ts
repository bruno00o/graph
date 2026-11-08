import { describe, expect, it } from 'vitest'
import { MinimapPainter } from './painter'
import type { MinimapPaint } from './protocol'
import {
  fitBox,
  graphBounds,
  packColor,
  packPalette,
  type RasterEdges,
  type RasterNodes,
  type RasterPaint,
  type RasterScene,
  radiusCap,
  raster,
} from './raster'

const red = packColor(255, 0, 0, 255)
const blue = packColor(0, 0, 255, 255)
const green = packColor(0, 255, 0, 255)

function nodeColumns(count: number, shape = 0): RasterNodes {
  return {
    capacity: count,
    alive: new Uint8Array(count).fill(1),
    shape: new Uint8Array(count).fill(shape),
    size: new Float32Array(count).fill(10),
    width: new Float32Array(count),
    fill: new Uint32Array(count),
    stroke: new Uint32Array(count),
    strokeWidth: new Float32Array(count),
    opacity: new Float32Array(count).fill(1),
    screenUnits: new Uint8Array(count),
    container: new Uint8Array(count),
  }
}

function sceneOf(points: readonly (readonly [number, number])[], extra: Partial<RasterScene> = {}) {
  const scene: RasterScene = {
    nodes: nodeColumns(points.length),
    edges: null,
    xy: new Float32Array(points.flat()),
    containers: null,
    colors: new Uint32Array([red, blue]),
    masks: null,
    ...extra,
  }
  return scene
}

const paint: RasterPaint = {
  edgeAlpha: 1,
  minRadius: 1,
  maxRadius: 4,
  selectedRadius: 3,
  nodeColor: null,
  selectedColor: green,
}

function at(pixels: Uint32Array, width: number, x: number, y: number): number {
  return pixels[Math.round(y) * width + Math.round(x)] ?? 0
}

describe('minimap raster', () => {
  it('packs colors as little endian RGBA words', () => {
    expect(packColor(1, 2, 3, 4)).toBe(0x04030201)
    const palette = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128])
    const colors = packPalette(palette, 2, new Uint32Array(0))
    expect(colors[0]).toBe(red)
    expect(colors[1]).toBe(packColor(0, 0, 255, 128))
  })

  it('bounds the nodes with their radius and leaves containers to their boxes', () => {
    const scene = sceneOf([
      [0, 0],
      [100, 50],
    ])
    expect(graphBounds(scene)).toEqual({ minX: -5, minY: -5, maxX: 105, maxY: 55, count: 2 })
    expect(graphBounds(sceneOf([]))).toBeNull()
    const grouped = sceneOf(
      [
        [0, 0],
        [500, 0],
      ],
      {
        containers: {
          boxes: new Float32Array([0, 0, 0, 0, 40, 30, 4, 0]),
          order: new Uint32Array([1]),
          count: 1,
        },
      },
    )
    grouped.nodes.shape[1] = 3
    expect(graphBounds(grouped)).toEqual({ minX: -5, minY: -30, maxX: 540, maxY: 30, count: 1 })
  })

  it('fits the box in the target and keeps the aspect ratio', () => {
    const fit = fitBox({ minX: 0, minY: 0, maxX: 200, maxY: 100, count: 2 }, 120, 120, 10)
    expect(fit).toEqual({ minX: 0, minY: 0, scale: 0.5, offsetX: 10, offsetY: 35 })
  })

  it('shrinks the radius cap as nodes get more numerous', () => {
    expect(radiusCap(10, 200, 150, 1)).toBeGreaterThan(radiusCap(10_000, 200, 150, 1))
    expect(radiusCap(10_000_000, 200, 150, 1)).toBe(1)
  })

  it('draws nodes in their colors, edges below them and the selection above', () => {
    const width = 100
    const height = 100
    const pixels = new Uint32Array(width * height)
    const nodes = nodeColumns(3)
    nodes.fill[1] = 1
    const edges: RasterEdges = {
      capacity: 1,
      alive: new Uint8Array([1]),
      source: new Uint32Array([0]),
      target: new Uint32Array([1]),
      color: new Uint32Array([1]),
      opacity: new Float32Array([1]),
    }
    const scene = sceneOf(
      [
        [10, 50],
        [90, 50],
        [50, 90],
      ],
      { nodes, edges, masks: new Uint32Array([0, 0, 1]) },
    )
    raster({ pixels, width, height }, scene, paint, {
      minX: 0,
      minY: 0,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    })
    expect(at(pixels, width, 10, 50)).toBe(red)
    expect(at(pixels, width, 90, 50)).toBe(blue)
    expect(at(pixels, width, 50, 50)).toBe(blue)
    expect(at(pixels, width, 50, 90)).toBe(green)
    expect(at(pixels, width, 50, 20)).toBe(0)
  })

  it('draws one color for every node when asked', () => {
    const pixels = new Uint32Array(100 * 100)
    raster(
      { pixels, width: 100, height: 100 },
      sceneOf([[50, 50]]),
      { ...paint, nodeColor: green },
      {
        minX: 0,
        minY: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      },
    )
    expect(at(pixels, 100, 50, 50)).toBe(green)
  })

  it('keeps the columns between draws and returns the fit', () => {
    let images = 0
    let puts = 0
    const surface = { width: 0, height: 0 }
    const painter = new MinimapPainter(surface, {
      createImageData(width, height) {
        images++
        return { data: new Uint8ClampedArray(width * height * 4), width, height } as ImageData
      },
      putImageData() {
        puts++
      },
    })
    const scene = sceneOf([
      [0, 0],
      [100, 0],
    ])
    const sizes: MinimapPaint = {
      width: 120,
      height: 60,
      padding: 10,
      minRadius: 1,
      selectedRadius: 3,
      edgeAlpha: 0.5,
      nodeColor: null,
      selectedColor: null,
    }
    const fit = painter.draw({ type: 'draw', paint: sizes, ...scene })
    expect(surface).toEqual({ width: 120, height: 60 })
    expect(fit?.scale).toBeCloseTo(100 / 110)
    const again = painter.draw({ type: 'draw', paint: sizes })
    expect(again).toEqual(fit)
    expect(images).toBe(1)
    expect(puts).toBe(2)
  })
})
