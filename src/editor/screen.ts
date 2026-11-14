import { type GlobeCamera, globeScreen, globeWorld, type ScreenPoint } from '../core/globe'
import { readOutline } from '../shapes/read'
import type { Point, View } from '../types'
import { type Bounds, isGeo, type Outline, writeEditable } from './geometry'

export interface Screen {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly globe: GlobeCamera | null
}

export interface Rings {
  readonly rings: readonly Float64Array[]
  readonly closed: boolean
  readonly filled: boolean
}

export const vertexHandle = 0
export const middleHandle = 1
export const boxHandle = 2

export interface Handle {
  readonly kind: 0 | 1 | 2
  readonly x: number
  readonly y: number
  readonly part: number
  readonly index: number
}

const geoStep = 8
const circleSteps = 64
const cornerSteps = 6
const denseSpacing = 6
const handleLimit = 1000
const margin = 32

const cache = new WeakMap<Outline, Rings>()

export function project(screen: Screen, x: number, y: number, out: ScreenPoint): boolean {
  if (screen.globe) return globeScreen(screen.globe, x, y, out) >= 0
  const { view } = screen
  out.x = (x - view.x) * view.zoom + screen.width / 2
  out.y = (y - view.y) * view.zoom + screen.height / 2
  return true
}

export function worldAt(screen: Screen, point: Point): Point | null {
  if (screen.globe) return globeWorld(screen.globe, point.x, point.y)
  const { view } = screen
  return {
    x: (point.x - screen.width / 2) / view.zoom + view.x,
    y: (point.y - screen.height / 2) / view.zoom + view.y,
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function circleRing(x: number, y: number, radius: number, reverse: boolean): Float64Array {
  const ring = new Float64Array(circleSteps * 2)
  for (let step = 0; step < circleSteps; step++) {
    const angle = ((reverse ? -step : step) / circleSteps) * 2 * Math.PI
    ring[step * 2] = x + Math.cos(angle) * radius
    ring[step * 2 + 1] = y + Math.sin(angle) * radius
  }
  return ring
}

function rectangleRing(outline: Outline & { readonly kind: 'rectangle' }): Float64Array {
  const { x, y, width, height } = outline
  const given = (outline.source as { readonly cornerRadius?: unknown }).cornerRadius
  const corner =
    typeof given === 'number' && Number.isFinite(given)
      ? Math.max(0, Math.min(given, width / 2, height / 2))
      : 0
  if (corner === 0) return Float64Array.of(x, y, x + width, y, x + width, y + height, x, y + height)
  const ring: number[] = []
  const corners = [
    [x + width - corner, y + corner, -Math.PI / 2],
    [x + width - corner, y + height - corner, 0],
    [x + corner, y + height - corner, Math.PI / 2],
    [x + corner, y + corner, Math.PI],
  ] as const
  for (const [cx, cy, from] of corners) {
    for (let step = 0; step <= cornerSteps; step++) {
      const angle = from + (step / cornerSteps) * (Math.PI / 2)
      ring.push(cx + Math.cos(angle) * corner, cy + Math.sin(angle) * corner)
    }
  }
  return Float64Array.from(ring)
}

export function ringsOf(outline: Outline): Rings {
  const known = cache.get(outline)
  if (known) return known
  let rings: Rings
  if (outline.kind === 'path') {
    rings = {
      closed: outline.closed,
      filled:
        outline.form === 'rings' || outline.form === 'Polygon' || outline.form === 'MultiPolygon',
      rings: outline.parts.map((part) => {
        const ring = new Float64Array(part.points.length * 2)
        part.points.forEach((point, i) => {
          ring[i * 2] = point.x
          ring[i * 2 + 1] = point.y
        })
        return ring
      }),
    }
  } else if (outline.kind === 'rectangle') {
    rings = { closed: true, filled: true, rings: [rectangleRing(outline)] }
  } else if (isGeo(outline.center)) {
    const read = readOutline(writeEditable(outline))
    const list: Float64Array[] = []
    let start = 0
    for (const end of read?.rings ?? []) {
      list.push(read?.points.slice(start * 2, end * 2) ?? new Float64Array(0))
      start = end
    }
    rings = { closed: true, filled: true, rings: list }
  } else {
    const { x, y } = outline.center
    const list = [circleRing(x, y, outline.radius, false)]
    if (outline.inner > 0) list.push(circleRing(x, y, outline.inner, true))
    rings = { closed: true, filled: true, rings: list }
  }
  cache.set(outline, rings)
  return rings
}

export function tracePath(
  screen: Screen,
  rings: Rings,
  ox: number,
  oy: number,
  out: string[],
): void {
  const at = { x: 0, y: 0 }
  const globe = screen.globe !== null
  for (const ring of rings.rings) {
    const count = ring.length / 2
    if (count < 2) continue
    const segments = rings.closed ? count : count - 1
    let open = false
    let broken = false
    const visit = (x: number, y: number) => {
      if (project(screen, x + ox, y + oy, at)) {
        out.push(open ? 'L' : 'M', String(round(at.x)), String(round(at.y)))
        open = true
      } else {
        open = false
        broken = true
      }
    }
    visit(ring[0] ?? 0, ring[1] ?? 0)
    for (let segment = 0; segment < segments; segment++) {
      const ax = ring[segment * 2] ?? 0
      const ay = ring[segment * 2 + 1] ?? 0
      const next = (segment + 1) % count
      const bx = ring[next * 2] ?? 0
      const by = ring[next * 2 + 1] ?? 0
      const steps = globe ? Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / geoStep)) : 1
      for (let step = 1; step <= steps; step++) {
        const t = step / steps
        if (rings.closed && next === 0 && step === steps && !broken && open) out.push('Z')
        else visit(ax + (bx - ax) * t, ay + (by - ay) * t)
      }
    }
  }
}

export function boxCorners(bounds: Bounds): Point[] {
  const [minX, minY, maxX, maxY] = bounds
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  return [
    { x: minX, y: minY },
    { x: midX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: midY },
    { x: maxX, y: maxY },
    { x: midX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: midY },
  ]
}

export function boxHandles(screen: Screen, bounds: Bounds, into: Handle[], path: string[]): void {
  const corners = boxCorners(bounds)
  const at = { x: 0, y: 0 }
  corners.forEach((corner, index) => {
    if (project(screen, corner.x, corner.y, at)) {
      into.push({ kind: boxHandle, x: at.x, y: at.y, part: -1, index })
    }
  })
  const [minX, minY, maxX, maxY] = bounds
  const ring = Float64Array.of(minX, minY, maxX, minY, maxX, maxY, minX, maxY)
  tracePath(screen, { closed: true, filled: false, rings: [ring] }, 0, 0, path)
}

function inView(screen: Screen, x: number, y: number): boolean {
  return x > -margin && y > -margin && x < screen.width + margin && y < screen.height + margin
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

export function vertexHandles(
  screen: Screen,
  outline: Outline,
  ox: number,
  oy: number,
  pointer: Point | null,
  reach: number,
  into: Handle[],
): void {
  if (outline.kind !== 'path') return
  const at = { x: 0, y: 0 }
  const vertices: Handle[] = []
  const middles: Handle[] = []
  let length = 0
  let count = 0
  let nearest: Handle | null = null
  let nearestDistance = reach
  let segment: Handle | null = null
  let segmentBest = reach
  outline.parts.forEach((part, partIndex) => {
    const points = part.points
    const total = points.length
    const segments = outline.closed ? total : total - 1
    const xs = new Float64Array(total)
    const ys = new Float64Array(total)
    const shown = new Uint8Array(total)
    points.forEach((point, index) => {
      if (!project(screen, point.x + ox, point.y + oy, at)) return
      xs[index] = at.x
      ys[index] = at.y
      shown[index] = 1
      count++
      if (inView(screen, at.x, at.y)) {
        vertices.push({ kind: vertexHandle, x: at.x, y: at.y, part: partIndex, index })
      }
      if (pointer) {
        const distance = Math.hypot(pointer.x - at.x, pointer.y - at.y)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearest = { kind: vertexHandle, x: at.x, y: at.y, part: partIndex, index }
        }
      }
    })
    for (let index = 0; index < segments; index++) {
      const next = (index + 1) % total
      if (shown[index] !== 1 || shown[next] !== 1) continue
      const ax = xs[index] ?? 0
      const ay = ys[index] ?? 0
      const bx = xs[next] ?? 0
      const by = ys[next] ?? 0
      const span = Math.hypot(bx - ax, by - ay)
      length += span
      const middle: Handle = {
        kind: middleHandle,
        x: (ax + bx) / 2,
        y: (ay + by) / 2,
        part: partIndex,
        index,
      }
      if (span > reach * 3 && inView(screen, middle.x, middle.y)) middles.push(middle)
      if (pointer) {
        const distance = segmentDistance(pointer.x, pointer.y, ax, ay, bx, by)
        if (distance < segmentBest) {
          segmentBest = distance
          segment = middle
        }
      }
    }
  })
  const sparse = count > 0 && length / count > denseSpacing && vertices.length <= handleLimit
  if (sparse) {
    into.push(...vertices)
    if (middles.length <= handleLimit) into.push(...middles)
    return
  }
  if (nearest) into.push(nearest)
  if (segment) into.push(segment)
}

export function hitHandle(handles: readonly Handle[], point: Point, reach: number): Handle | null {
  let best: Handle | null = null
  let bestDistance = reach
  for (const handle of handles) {
    const distance = Math.hypot(point.x - handle.x, point.y - handle.y)
    const better =
      distance < bestDistance ||
      (distance === bestDistance && best?.kind === middleHandle && handle.kind !== middleHandle)
    if (better) {
      best = handle
      bestDistance = distance
    }
  }
  return best
}

export function insideRings(rings: Rings, x: number, y: number, tolerance: number): boolean {
  let inside = false
  for (const ring of rings.rings) {
    const count = ring.length / 2
    const segments = rings.closed ? count : count - 1
    for (let index = 0; index < segments; index++) {
      const next = (index + 1) % count
      const ax = ring[index * 2] ?? 0
      const ay = ring[index * 2 + 1] ?? 0
      const bx = ring[next * 2] ?? 0
      const by = ring[next * 2 + 1] ?? 0
      if (segmentDistance(x, y, ax, ay, bx, by) <= tolerance) return true
      if (rings.filled && ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
        inside = !inside
      }
    }
  }
  return inside
}

export function screenTolerance(screen: Screen, pixels: number): number {
  const zoom = screen.globe ? screen.globe.scale : screen.view.zoom
  return pixels / Math.max(zoom, 1e-9)
}
