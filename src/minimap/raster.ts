import { boxShape, containerShape } from '../core/columns'

export interface RasterNodes {
  readonly capacity: number
  readonly alive: Uint8Array
  readonly shape: Uint8Array
  readonly size: Float32Array
  readonly width: Float32Array
  readonly fill: Uint32Array
  readonly stroke: Uint32Array
  readonly strokeWidth: Float32Array
  readonly opacity: Float32Array
  readonly screenUnits: Uint8Array
  readonly container: Uint8Array
}

export interface RasterEdges {
  readonly capacity: number
  readonly alive: Uint8Array
  readonly source: Uint32Array
  readonly target: Uint32Array
  readonly color: Uint32Array
  readonly opacity: Float32Array
}

export interface RasterContainers {
  readonly boxes: Float32Array
  readonly order: Uint32Array
  readonly count: number
}

export interface RasterScene {
  readonly nodes: RasterNodes
  readonly edges: RasterEdges | null
  readonly xy: Float32Array
  readonly containers: RasterContainers | null
  readonly colors: Uint32Array
  readonly masks: Uint32Array | null
}

export interface RasterPaint {
  readonly edgeAlpha: number
  readonly minRadius: number
  readonly maxRadius: number
  readonly selectedRadius: number
  readonly nodeColor: number | null
  readonly selectedColor: number | null
}

export interface RasterFit {
  readonly minX: number
  readonly minY: number
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
}

export interface RasterTarget {
  readonly pixels: Uint32Array
  readonly width: number
  readonly height: number
}

export interface RasterBox {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
  readonly count: number
}

const circleContainer = 2
const squareReach = 0.86
const diamondReach = 1.2
const shapeSquare = 1
const shapeDiamond = 2
const blockRadius = 2
const inkBudget = 2

export function radiusCap(count: number, width: number, height: number, minRadius: number): number {
  if (count === 0) return Number.POSITIVE_INFINITY
  return Math.max(minRadius, Math.sqrt((inkBudget * width * height) / (Math.PI * count)))
}

export function packColor(r: number, g: number, b: number, a: number): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
}

export function packPalette(palette: Uint8Array, count: number, target: Uint32Array): Uint32Array {
  const colors = target.length >= count ? target : new Uint32Array(Math.max(count, 64))
  for (let id = 0; id < count; id++) {
    const at = id * 4
    colors[id] = packColor(
      palette[at] ?? 0,
      palette[at + 1] ?? 0,
      palette[at + 2] ?? 0,
      palette[at + 3] ?? 0,
    )
  }
  return colors
}

export function graphBounds(scene: RasterScene): RasterBox | null {
  const { nodes, xy, containers } = scene
  const { alive, shape, size, screenUnits } = nodes
  const widths = nodes.width
  const capacity = nodes.capacity
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let reach = 0
  let grouped = false
  let count = 0
  for (let index = 0; index < capacity; index++) {
    if (alive[index] === 0) continue
    if (shape[index] === containerShape) {
      grouped = true
      continue
    }
    count++
    const x = xy[index * 2] ?? 0
    const y = xy[index * 2 + 1] ?? 0
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (screenUnits[index] !== 1) {
      const radius =
        Math.max(size[index] ?? 0, shape[index] === boxShape ? (widths[index] ?? 0) : 0) * 0.5
      if (radius > reach) reach = radius
    }
  }
  if (maxX >= minX) {
    minX -= reach
    minY -= reach
    maxX += reach
    maxY += reach
  }
  const boxes = containers?.boxes
  if (grouped && boxes && containers) {
    for (let slot = 0; slot < containers.count; slot++) {
      const index = containers.order[slot] ?? 0
      if (alive[index] === 0) continue
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      const halfWidth = boxes[index * 4] ?? 0
      const halfHeight = boxes[index * 4 + 1] ?? 0
      if (x - halfWidth < minX) minX = x - halfWidth
      if (y - halfHeight < minY) minY = y - halfHeight
      if (x + halfWidth > maxX) maxX = x + halfWidth
      if (y + halfHeight > maxY) maxY = y + halfHeight
    }
  }
  return maxX < minX ? null : { minX, minY, maxX, maxY, count }
}

export function fitBox(
  box: RasterBox,
  width: number,
  height: number,
  padding: number,
): RasterFit | null {
  const inset = Math.min(padding, Math.max(0, Math.min(width, height) / 2 - 1))
  const innerWidth = width - inset * 2
  const innerHeight = height - inset * 2
  if (innerWidth <= 0 || innerHeight <= 0) return null
  const boxWidth = box.maxX - box.minX
  const boxHeight = box.maxY - box.minY
  const scale =
    boxWidth <= 0 && boxHeight <= 0
      ? 1
      : Math.min(
          boxWidth > 0 ? innerWidth / boxWidth : Number.POSITIVE_INFINITY,
          boxHeight > 0 ? innerHeight / boxHeight : Number.POSITIVE_INFINITY,
        )
  return {
    minX: box.minX,
    minY: box.minY,
    scale,
    offsetX: (width - boxWidth * scale) / 2,
    offsetY: (height - boxHeight * scale) / 2,
  }
}

function over(below: number, color: number, alpha: number): number {
  const sa = ((color >>> 24) / 255) * alpha
  if (sa >= 1) return color
  if (sa <= 0) return below
  const da = (below >>> 24) / 255
  if (da === 0) return ((color & 0xffffff) | (Math.round(sa * 255) << 24)) >>> 0
  const out = sa + da * (1 - sa)
  const keep = (da * (1 - sa)) / out
  const take = sa / out
  const r = (color & 255) * take + (below & 255) * keep
  const g = ((color >>> 8) & 255) * take + ((below >>> 8) & 255) * keep
  const b = ((color >>> 16) & 255) * take + ((below >>> 16) & 255) * keep
  return packColor(Math.round(r), Math.round(g), Math.round(b), Math.round(out * 255))
}

class Canvas {
  readonly pixels: Uint32Array
  readonly width: number
  readonly height: number

  constructor(target: RasterTarget) {
    this.pixels = target.pixels
    this.width = target.width
    this.height = target.height
  }

  span(y: number, from: number, to: number, color: number, alpha: number): void {
    if (y < 0 || y >= this.height) return
    const start = Math.max(from, 0)
    const end = Math.min(to, this.width)
    const pixels = this.pixels
    const row = y * this.width
    if (alpha >= 1 && color >>> 24 === 255) {
      for (let x = start; x < end; x++) pixels[row + x] = color
      return
    }
    for (let x = start; x < end; x++) pixels[row + x] = over(pixels[row + x] ?? 0, color, alpha)
  }

  block(cx: number, cy: number, radius: number, color: number, alpha: number): void {
    const side = radius < 0.75 ? 1 : Math.round(radius * 2)
    const left = Math.floor(cx - side / 2 + 0.5)
    const top = Math.floor(cy - side / 2 + 0.5)
    for (let y = top; y < top + side; y++) this.span(y, left, left + side, color, alpha)
  }

  disc(cx: number, cy: number, radius: number, color: number, alpha: number): void {
    const top = Math.max(0, Math.floor(cy - radius))
    const bottom = Math.min(this.height - 1, Math.ceil(cy + radius) - 1)
    const square = radius * radius
    for (let y = top; y <= bottom; y++) {
      const dy = y + 0.5 - cy
      const reach = square - dy * dy
      if (reach <= 0) continue
      const half = Math.sqrt(reach)
      this.span(y, Math.round(cx - half), Math.round(cx + half), color, alpha)
    }
  }

  diamond(cx: number, cy: number, radius: number, color: number, alpha: number): void {
    const top = Math.max(0, Math.floor(cy - radius))
    const bottom = Math.min(this.height - 1, Math.ceil(cy + radius) - 1)
    for (let y = top; y <= bottom; y++) {
      const half = radius - Math.abs(y + 0.5 - cy)
      if (half <= 0) continue
      this.span(y, Math.round(cx - half), Math.round(cx + half), color, alpha)
    }
  }

  rect(x0: number, y0: number, x1: number, y1: number, color: number, alpha: number): void {
    const top = Math.max(0, Math.round(y0))
    const bottom = Math.min(this.height, Math.round(y1))
    const left = Math.round(x0)
    const right = Math.round(x1)
    for (let y = top; y < bottom; y++) this.span(y, left, right, color, alpha)
  }

  frame(x0: number, y0: number, x1: number, y1: number, color: number): void {
    const left = Math.round(x0)
    const right = Math.max(left + 1, Math.round(x1))
    const top = Math.round(y0)
    const bottom = Math.max(top + 1, Math.round(y1))
    this.span(top, left, right, color, 1)
    this.span(bottom - 1, left, right, color, 1)
    for (let y = top + 1; y < bottom - 1; y++) {
      this.span(y, left, left + 1, color, 1)
      this.span(y, right - 1, right, color, 1)
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: number, alpha: number): void {
    const dx = x1 - x0
    const dy = y1 - y0
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)))
    const sx = steps === 0 ? 0 : dx / steps
    const sy = steps === 0 ? 0 : dy / steps
    const { pixels, width, height } = this
    let x = x0
    let y = y0
    for (let step = 0; step <= steps; step++) {
      const px = Math.floor(x)
      const py = Math.floor(y)
      if (px >= 0 && py >= 0 && px < width && py < height) {
        const at = py * width + px
        pixels[at] = over(pixels[at] ?? 0, color, alpha)
      }
      x += sx
      y += sy
    }
  }

  node(
    shape: number,
    x: number,
    y: number,
    radius: number,
    color: number,
    alpha: number,
    aspect = 1,
  ): void {
    if (shape === boxShape && radius * aspect > blockRadius) {
      const wide = radius * aspect
      this.rect(x - wide, y - radius, x + wide, y + radius, color, alpha)
    } else if (radius <= blockRadius) this.block(x, y, radius, color, alpha)
    else if (shape === shapeSquare) {
      const half = radius * squareReach
      this.rect(x - half, y - half, x + half, y + half, color, alpha)
    } else if (shape === shapeDiamond) this.diamond(x, y, radius * diamondReach, color, alpha)
    else this.disc(x, y, radius, color, alpha)
  }
}

function drawContainers(canvas: Canvas, scene: RasterScene, fit: RasterFit): void {
  const frame = scene.containers
  if (!frame) return
  const { nodes, xy, colors } = scene
  const { boxes, order } = frame
  for (let slot = 0; slot < frame.count; slot++) {
    const index = order[slot] ?? 0
    if (nodes.alive[index] !== 1) continue
    const cx = ((xy[index * 2] ?? 0) - fit.minX) * fit.scale + fit.offsetX
    const cy = ((xy[index * 2 + 1] ?? 0) - fit.minY) * fit.scale + fit.offsetY
    const halfWidth = (boxes[index * 4] ?? 0) * fit.scale
    const halfHeight = (boxes[index * 4 + 1] ?? 0) * fit.scale
    const fill = colors[nodes.fill[index] ?? 0] ?? 0
    const stroke = colors[nodes.stroke[index] ?? 0] ?? 0
    const lined = (nodes.strokeWidth[index] ?? 0) > 0
    if (nodes.container[index] === circleContainer) {
      if (lined) canvas.disc(cx, cy, halfWidth, stroke, 1)
      canvas.disc(cx, cy, lined ? Math.max(0, halfWidth - 1) : halfWidth, fill, 1)
      continue
    }
    canvas.rect(cx - halfWidth, cy - halfHeight, cx + halfWidth, cy + halfHeight, fill, 1)
    if (lined) {
      canvas.frame(cx - halfWidth, cy - halfHeight, cx + halfWidth, cy + halfHeight, stroke)
    }
  }
}

function drawEdges(canvas: Canvas, scene: RasterScene, paint: RasterPaint, fit: RasterFit): void {
  const { edges, xy, colors } = scene
  if (!edges) return
  const { alive, source, target, color, opacity } = edges
  const { minX, minY, scale, offsetX, offsetY } = fit
  const capacity = edges.capacity
  for (let index = 0; index < capacity; index++) {
    if (alive[index] !== 1) continue
    const from = source[index] ?? 0
    const to = target[index] ?? 0
    if (from === to) continue
    const x0 = ((xy[from * 2] ?? 0) - minX) * scale + offsetX
    const y0 = ((xy[from * 2 + 1] ?? 0) - minY) * scale + offsetY
    const x1 = ((xy[to * 2] ?? 0) - minX) * scale + offsetX
    const y1 = ((xy[to * 2 + 1] ?? 0) - minY) * scale + offsetY
    const alpha = (opacity[index] ?? 1) * paint.edgeAlpha
    canvas.line(x0, y0, x1, y1, colors[color[index] ?? 0] ?? 0, alpha)
  }
}

function drawNodes(canvas: Canvas, scene: RasterScene, paint: RasterPaint, fit: RasterFit): void {
  const { nodes, xy, colors, masks } = scene
  const { alive, shape, size, fill, opacity, screenUnits } = nodes
  const widths = nodes.width
  const aspectOf = (index: number): number =>
    shape[index] === boxShape ? (widths[index] ?? 0) / Math.max(size[index] ?? 0, 1e-6) : 1
  const { minX, minY, scale, offsetX, offsetY } = fit
  const { minRadius, maxRadius, nodeColor, selectedColor } = paint
  const { pixels, width, height } = canvas
  const capacity = nodes.capacity
  const marked = selectedColor !== null && masks !== null
  const half = scale / 2
  let selected = 0
  for (let index = 0; index < capacity; index++) {
    if (alive[index] !== 1) continue
    const kind = shape[index] ?? 0
    if (kind === containerShape) continue
    if (marked && ((masks[index] ?? 0) & 1) === 1) {
      selected++
      continue
    }
    const x = ((xy[index * 2] ?? 0) - minX) * scale + offsetX
    const y = ((xy[index * 2 + 1] ?? 0) - minY) * scale + offsetY
    const own = screenUnits[index] === 1 ? 0 : (size[index] ?? 0) * half
    const radius = own < minRadius ? minRadius : Math.min(own, maxRadius)
    const color = nodeColor ?? colors[fill[index] ?? 0] ?? 0
    const alpha = opacity[index] ?? 1
    const aspect = aspectOf(index)
    if (radius * aspect > blockRadius || alpha < 1 || color >>> 24 !== 255) {
      canvas.node(kind, x, y, radius, color, alpha, aspect)
      continue
    }
    const side = radius < 0.75 ? 1 : Math.round(radius * 2)
    const left = Math.floor(x - side / 2 + 0.5)
    const top = Math.floor(y - side / 2 + 0.5)
    const right = left + side
    const bottom = top + side
    if (left < 0 || top < 0 || right > width || bottom > height) {
      canvas.block(x, y, radius, color, 1)
      continue
    }
    for (let row = top; row < bottom; row++) {
      const start = row * width
      for (let column = left; column < right; column++) pixels[start + column] = color
    }
  }
  if (!marked || selected === 0) return
  for (let index = 0; index < capacity; index++) {
    if (alive[index] !== 1 || ((masks[index] ?? 0) & 1) !== 1) continue
    const kind = shape[index] ?? 0
    if (kind === containerShape) continue
    const x = ((xy[index * 2] ?? 0) - minX) * scale + offsetX
    const y = ((xy[index * 2 + 1] ?? 0) - minY) * scale + offsetY
    const own = screenUnits[index] === 1 ? 0 : (size[index] ?? 0) * half
    const radius = Math.max(paint.selectedRadius, Math.min(own, maxRadius))
    canvas.node(kind, x, y, radius, selectedColor, 1, aspectOf(index))
  }
}

export function raster(
  target: RasterTarget,
  scene: RasterScene,
  paint: RasterPaint,
  fit: RasterFit,
): void {
  const canvas = new Canvas(target)
  target.pixels.fill(0)
  drawContainers(canvas, scene, fit)
  drawEdges(canvas, scene, paint, fit)
  drawNodes(canvas, scene, paint, fit)
}
