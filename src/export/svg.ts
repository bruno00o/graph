import { gridDotScale, gridLevels } from '../core/background-grid'
import { containerShape, type EdgeColumns, type NodeColumns, noColor } from '../core/columns'
import { type Cubic, loopCurve, loopMinimum, loopReach, parallelCurve } from '../core/edge-curve'
import { type EdgePaths, maxPathPoints } from '../core/edge-paths'
import { outlineStride } from '../core/hull-geometry'
import type { HullShape } from '../core/hull-layer'
import type { Positions } from '../core/positions'
import type { Layer } from '../core/scene'
import type { StateBuffers } from '../core/state-buffers'
import { edgeOpacity, nodeOpacity, type Sight } from '../core/visibility'
import type { ResolvedTheme, Rgba } from '../dom/theme'
import type { ContainerFrame, GridInput, LabelMode } from '../host/renderer'
import { atlasFontSize } from '../webgl/glyph-atlas'
import {
  type EdgeAnchor,
  lineHeight,
  type PlacedLabel,
  type TextMeasure,
} from '../webgl/label-layer'
import {
  badgeFont,
  badgeLimit,
  badgeMin,
  badgeRing,
  badgeTextMin,
  edgeLabelGap,
  labelGap,
  plateRadius,
} from '../webgl/shaders'
import { type ExportFrame, screenExtent, screenRadius } from './frame'
import { placementDirections, selectLabels } from './labels'
import { edgeLook, type Look, nodeLook } from './look'

export interface SvgScene {
  readonly nodes: NodeColumns
  readonly edges: EdgeColumns
  readonly layers: readonly Layer[]
  readonly positions: Positions
  readonly states: StateBuffers
  readonly grid?: GridInput | null
  readonly hulls?: readonly HullShape[]
  readonly containers?: ContainerFrame | null
  readonly bundles?: EdgePaths | null
  readonly palette: Uint8Array
  readonly theme: ResolvedTheme
  readonly frame: ExportFrame
  readonly background: Rgba
  readonly labels: LabelMode
  readonly measure: TextMeasure
  readonly images: ReadonlyMap<string, SvgImage>
  readonly title: string | null
  readonly time?: number
}

export interface SvgImage {
  readonly href: string
  readonly aspect: number
}

interface Paint {
  readonly hex: string
  readonly alpha: number
}

interface QueuedLabel {
  readonly index: number
  readonly label: PlacedLabel
  readonly anchor: EdgeAnchor | null
}

const haloWidth = 6
const haloBands = [6, 4, 2] as const
const haloLevels = [5 / 6, 3 / 6, 1 / 6] as const
const haloStroke = 2 * 1.6
const diamondReach = 1.2
const squareReach = 0.86
const badgeReach = [Math.SQRT1_2, squareReach, 0.6] as const
const anchors = ['middle', 'start', 'end'] as const
const transparent: Paint = { hex: '#000000', alpha: 0 }
const markup = /[&<>"']/g
const entities: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}
let documents = 0

function allowed(code: number): boolean {
  return code >= 32 ? code !== 0xfffe && code !== 0xffff : code === 9 || code === 10 || code === 13
}

function stripInvalid(text: string): string {
  let clean = true
  for (let at = 0; at < text.length && clean; at++) clean = allowed(text.charCodeAt(at))
  if (clean) return text
  let result = ''
  for (let at = 0; at < text.length; at++) {
    if (allowed(text.charCodeAt(at))) result += text[at]
  }
  return result
}

export function escapeXml(text: string): string {
  return stripInvalid(text).replace(markup, (char) => entities[char] ?? char)
}

function dashOffset(start: number, shift: number, period: number): number {
  if (shift === 0) return start
  const value = start - shift
  return value - Math.floor(value / period) * period
}

function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function fine(value: number): string {
  return String(Math.round(value * 10000) / 10000)
}

function hexOf(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

function mixRgba(from: Rgba, to: Rgba, amount: number): Rgba {
  const channel = (at: 0 | 1 | 2 | 3) => Math.round(from[at] + (to[at] - from[at]) * amount)
  return [channel(0), channel(1), channel(2), channel(3)]
}

export function paintOf(color: Rgba): Paint {
  return { hex: hexOf(color[0], color[1], color[2]), alpha: color[3] / 255 }
}

function paintAttribute(name: 'fill' | 'stroke', paint: Paint): string {
  return paint.alpha >= 0.999
    ? ` ${name}="${paint.hex}"`
    : ` ${name}="${paint.hex}" ${name}-opacity="${fine(paint.alpha)}"`
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

function bandAlphas(alpha: number): readonly number[] {
  const result: number[] = []
  let below = 1
  for (const level of haloLevels) {
    const target = alpha * (1 - smoothstep(level))
    const layer = below <= 0 ? 0 : Math.max(0, 1 - (1 - target) / below)
    result.push(layer)
    below *= 1 - layer
  }
  return result
}

function cubicPoint(curve: Cubic, t: number): readonly [number, number] {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [
    a * curve.ax + b * curve.bx + c * curve.cx + d * curve.dx,
    a * curve.ay + b * curve.by + c * curve.cy + d * curve.dy,
  ]
}

function cubicTangent(curve: Cubic, t: number): readonly [number, number] {
  const u = 1 - t
  return [
    3 * u * u * (curve.bx - curve.ax) +
      6 * u * t * (curve.cx - curve.bx) +
      3 * t * t * (curve.dx - curve.cx),
    3 * u * u * (curve.by - curve.ay) +
      6 * u * t * (curve.cy - curve.by) +
      3 * t * t * (curve.dy - curve.cy),
  ]
}

function crossing(
  curve: Cubic,
  x: number,
  y: number,
  radius: number,
  low: number,
  high: number,
  rising: boolean,
): number {
  let lo = low
  let hi = high
  for (let step = 0; step < 14; step++) {
    const mid = (lo + hi) / 2
    const [px, py] = cubicPoint(curve, mid)
    const inside = Math.hypot(px - x, py - y) < radius
    if (inside === rising) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function arcLength(curve: Cubic, from: number, to: number): number {
  let total = 0
  let [px, py] = cubicPoint(curve, from)
  for (let step = 1; step <= 8; step++) {
    const [nx, ny] = cubicPoint(curve, from + ((to - from) * step) / 8)
    total += Math.hypot(nx - px, ny - py)
    px = nx
    py = ny
  }
  return total
}

function subCurve(curve: Cubic, from: number, to: number): string {
  const [ax, ay] = cubicPoint(curve, from)
  const [dx, dy] = cubicPoint(curve, to)
  const [sx, sy] = cubicTangent(curve, from)
  const [ex, ey] = cubicTangent(curve, to)
  const k = (to - from) / 3
  return `M${num(ax)} ${num(ay)}C${num(ax + sx * k)} ${num(ay + sy * k)} ${num(dx - ex * k)} ${num(dy - ey * k)} ${num(dx)} ${num(dy)}`
}

function head(
  tipX: number,
  tipY: number,
  baseX: number,
  baseY: number,
  nx: number,
  ny: number,
  half: number,
): string {
  return `M${num(tipX)} ${num(tipY)}L${num(baseX + nx * half)} ${num(baseY + ny * half)}L${num(baseX - nx * half)} ${num(baseY - ny * half)}Z`
}

interface EdgeShape {
  readonly body: string | null
  readonly heads: readonly string[]
  readonly whole: string
  readonly startHead: number
}

export function writeSvg(scene: SvgScene): string {
  const { nodes, edges, positions, states, frame, theme, measure } = scene
  const { view, width, height } = frame
  const zoom = view.zoom
  const offsetX = width / 2 - view.x * zoom
  const offsetY = height / 2 - view.y * zoom
  const sight: Sight = { zoom, time: frame.window ?? null }
  const nodeFade = (index: number) => nodeOpacity(nodes, index, sight)
  const edgeFade = (index: number) => edgeOpacity(nodes, edges, index, sight)
  const faded = (look: Look, fade: number): Look =>
    fade === 1 ? look : { ...look, opacity: look.opacity * fade }
  const nodeLookAt = (index: number) => faded(nodeLook(nodes, states, index), nodeFade(index))
  const edgeLookAt = (index: number) => faded(edgeLook(edges, states, index), edgeFade(index))
  const prefix = `graph${++documents}-`
  const body: string[] = []
  const defs: string[] = []
  const paints: Paint[] = []
  const imageIds = new Map<string, string>()
  const clipIds = new Map<string, string>()
  const tintIds = new Map<number, string>()
  const ink = paintOf(theme.labelInk)
  const muted = paintOf(theme.labelMuted)
  const labelHalo = paintOf(theme.labelHalo)
  const halo = paintOf(theme.halo)
  const halos = bandAlphas(halo.alpha)
  const margin = 64

  const sx = (index: number) => positions.x(index) * zoom + offsetX
  const sy = (index: number) => positions.y(index) * zoom + offsetY
  const radius = (index: number) => screenRadius(nodes, index, zoom)
  const boxes = scene.containers?.boxes ?? null
  const isContainer = (index: number) => nodes.shape[index] === containerShape
  const outside = (left: number, top: number, right: number, bottom: number) =>
    right < -margin || left > width + margin || bottom < -margin || top > height + margin

  function paletteRgba(id: number): Rgba {
    if (id === noColor || id * 4 + 3 >= scene.palette.length) return [0, 0, 0, 0]
    const at = id * 4
    return [
      scene.palette[at] ?? 0,
      scene.palette[at + 1] ?? 0,
      scene.palette[at + 2] ?? 0,
      scene.palette[at + 3] ?? 0,
    ]
  }

  function paint(id: number): Paint {
    if (id === noColor || id * 4 + 3 >= scene.palette.length) return transparent
    let cached = paints[id]
    if (!cached) {
      const at = id * 4
      cached = paintOf([
        scene.palette[at] ?? 0,
        scene.palette[at + 1] ?? 0,
        scene.palette[at + 2] ?? 0,
        scene.palette[at + 3] ?? 0,
      ])
      paints[id] = cached
    }
    return cached
  }

  function shapeTag(shape: number, x: number, y: number, r: number, offset: number): string {
    if (shape === 1) {
      const half = r * squareReach + offset
      const round = offset > 0 ? ` rx="${num(offset)}"` : ''
      return `<rect x="${num(x - half)}" y="${num(y - half)}" width="${num(half * 2)}" height="${num(half * 2)}"${round}`
    }
    if (shape === 2) {
      const reach = r * diamondReach + offset * Math.SQRT2
      return `<path d="M${num(x)} ${num(y - reach)}L${num(x + reach)} ${num(y)}L${num(x)} ${num(y + reach)}L${num(x - reach)} ${num(y)}Z"`
    }
    return `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r + offset)}"`
  }

  function boxTag(
    x: number,
    y: number,
    halfWidth: number,
    halfHeight: number,
    corner: number,
    offset: number,
  ): string {
    const width = halfWidth + offset
    const height = halfHeight + offset
    const round = Math.min(Math.max(corner + offset, 0), width, height)
    if (Math.abs(width - height) < 0.01 && round >= width - 0.01) {
      return `<circle cx="${num(x)}" cy="${num(y)}" r="${num(width)}"`
    }
    const rounded = round > 0 ? ` rx="${num(round)}"` : ''
    return `<rect x="${num(x - width)}" y="${num(y - height)}" width="${num(width * 2)}" height="${num(height * 2)}"${rounded}`
  }

  function imageId(src: string, image: SvgImage): string {
    let id = imageIds.get(src)
    if (!id) {
      id = `${prefix}i${imageIds.size}`
      imageIds.set(src, id)
      const aspect = image.aspect > 0 && Number.isFinite(image.aspect) ? image.aspect : 1
      const width = Math.max(1, aspect)
      const height = Math.max(1, 1 / aspect)
      defs.push(
        `<symbol id="${id}" viewBox="0 0 1 1"><image x="${fine((1 - width) / 2)}" y="${fine((1 - height) / 2)}" width="${fine(width)}" height="${fine(height)}" preserveAspectRatio="none" href="${escapeXml(image.href)}"/></symbol>`,
      )
    }
    return id
  }

  function clipId(shape: number, scale: number): string {
    const key = `${shape}:${scale}`
    let id = clipIds.get(key)
    if (!id) {
      id = `${prefix}c${clipIds.size}`
      clipIds.set(key, id)
      const unit = 0.5 / scale
      const inner =
        shape === 1
          ? `<rect x="${fine(0.5 - unit * squareReach)}" y="${fine(0.5 - unit * squareReach)}" width="${fine(unit * squareReach * 2)}" height="${fine(unit * squareReach * 2)}"/>`
          : shape === 2
            ? `<path d="M0.5 ${fine(0.5 - unit * diamondReach)}L${fine(0.5 + unit * diamondReach)} 0.5L0.5 ${fine(0.5 + unit * diamondReach)}L${fine(0.5 - unit * diamondReach)} 0.5Z"/>`
            : `<circle cx="0.5" cy="0.5" r="${fine(unit)}"/>`
      defs.push(`<clipPath id="${id}">${inner}</clipPath>`)
    }
    return id
  }

  function tintId(color: number): string {
    let id = tintIds.get(color)
    if (!id) {
      id = `${prefix}t${tintIds.size}`
      tintIds.set(color, id)
      const tint = paint(color)
      const opacity = tint.alpha < 0.999 ? ` flood-opacity="${fine(tint.alpha)}"` : ''
      defs.push(
        `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feFlood flood-color="${tint.hex}"${opacity}/><feComposite in2="SourceGraphic" operator="in"/></filter>`,
      )
    }
    return id
  }

  function open(opacity: number): string {
    return opacity < 0.999 ? `<g opacity="${fine(Math.max(0, opacity))}">` : '<g>'
  }

  function drawShape(look: Look, tag: (offset: number) => string, r: number, image: string): void {
    const outlineWidth = Math.max(look.outlineWidth, 0)
    const parts: string[] = [open(look.opacity)]
    if (look.halo) {
      haloBands.forEach((band, at) => {
        const alpha = halos[at] ?? 0
        if (alpha <= 0) return
        parts.push(
          `${tag(outlineWidth + band / 2)} fill="none"${paintAttribute('stroke', { hex: halo.hex, alpha })} stroke-width="${num(band)}"/>`,
        )
      })
    }
    if (outlineWidth > 0) {
      parts.push(
        `${tag(outlineWidth / 2)} fill="none"${paintAttribute('stroke', paint(look.outline))} stroke-width="${num(outlineWidth)}"/>`,
      )
    }
    parts.push(`${tag(0)}${paintAttribute('fill', paint(look.fill))}/>`)
    if (image) parts.push(image)
    const strokeWidth = Math.min(look.strokeWidth, r * 0.5)
    if (strokeWidth > 0) {
      parts.push(
        `${tag(-strokeWidth / 2)} fill="none"${paintAttribute('stroke', paint(look.stroke))} stroke-width="${num(strokeWidth)}"/>`,
      )
    }
    parts.push('</g>')
    body.push(parts.join(''))
  }

  function drawNode(index: number): void {
    const x = sx(index)
    const y = sy(index)
    const r = radius(index)
    const look = nodeLookAt(index)
    const outlineWidth = Math.max(look.outlineWidth, 0)
    const haloReach = look.halo ? haloWidth : 0
    const extent = r * diamondReach + outlineWidth * Math.SQRT2 + haloReach
    if (outside(x - extent, y - extent, x + extent, y + extent)) return
    const shape = nodes.shape[index] ?? 0
    const src = nodes.image[index]
    const image = src ? scene.images.get(src) : undefined
    let picture = ''
    if (src && image) {
      const scale = Math.max(nodes.imageScale[index] ?? 1, 0.001)
      const side = r * 2 * scale
      const color = nodes.imageColor[index] ?? noColor
      const tint = color === noColor ? '' : ` filter="url(#${tintId(color)})"`
      picture = `<use href="#${imageId(src, image)}" width="1" height="1" transform="translate(${num(x - side / 2)} ${num(y - side / 2)}) scale(${fine(side)})" clip-path="url(#${clipId(shape, scale)})"${tint}/>`
    }
    drawShape(look, (offset) => shapeTag(shape, x, y, r, offset), r, picture)
  }

  function drawContainer(index: number, frame: Float32Array): void {
    const x = sx(index)
    const y = sy(index)
    const halfWidth = Math.max((frame[index * 4] ?? 0) * zoom, 1.25)
    const halfHeight = Math.max((frame[index * 4 + 1] ?? 0) * zoom, 1.25)
    const r = Math.min(halfWidth, halfHeight)
    const corner = Math.min((frame[index * 4 + 2] ?? 0) * zoom, r)
    const look = nodeLookAt(index)
    const reach = Math.max(look.outlineWidth, 0) + (look.halo ? haloWidth : 0)
    if (
      outside(
        x - halfWidth - reach,
        y - halfHeight - reach,
        x + halfWidth + reach,
        y + halfHeight + reach,
      )
    ) {
      return
    }
    drawShape(look, (offset) => boxTag(x, y, halfWidth, halfHeight, corner, offset), r, '')
  }

  function straightShape(index: number, width: number): EdgeShape | null {
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
    const ax = sx(source)
    const ay = sy(source)
    const dx = sx(target)
    const dy = sy(target)
    const length = Math.hypot(dx - ax, dy - ay)
    const ux = length > 0 ? (dx - ax) / length : 1
    const uy = length > 0 ? (dy - ay) / length : 0
    const start = radius(source)
    const end = length - radius(target)
    const visible = end - start
    if (visible <= 0.5) return null
    const arrow = edges.arrow[index] ?? 0
    const arrowLength = arrow !== 0 && visible > width * 8 ? Math.max(width * 4, 6) : 0
    const arrowHalf = Math.max(width * 1.6, 3)
    const startHead = arrow & 1 ? arrowLength : 0
    const endHead = arrow & 2 ? arrowLength : 0
    const at = (along: number) => [ax + ux * along, ay + uy * along] as const
    const heads: string[] = []
    if (startHead > 0) {
      const [tx, ty] = at(start)
      const [bx, by] = at(start + startHead)
      heads.push(head(tx, ty, bx, by, -uy, ux, arrowHalf))
    }
    if (endHead > 0) {
      const [tx, ty] = at(end)
      const [bx, by] = at(end - endHead)
      heads.push(head(tx, ty, bx, by, -uy, ux, arrowHalf))
    }
    const from = start + startHead
    const to = end - endHead
    const [fx, fy] = at(from)
    const [tx, ty] = at(to)
    const [sx0, sy0] = at(start)
    const [ex, ey] = at(end)
    return {
      body: to > from ? `M${num(fx)} ${num(fy)}L${num(tx)} ${num(ty)}` : null,
      heads,
      whole: `M${num(sx0)} ${num(sy0)}L${num(ex)} ${num(ey)}`,
      startHead,
    }
  }

  function curvedShape(index: number, width: number): EdgeShape | null {
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
    const ax = sx(source)
    const ay = sy(source)
    const dx = sx(target)
    const dy = sy(target)
    const sourceRadius = radius(source)
    const targetRadius = radius(target)
    const bend = edges.bend[index] ?? 0
    const curve =
      source === target
        ? loopCurve(ax, ay, loopReach(sourceRadius, bend, loopMinimum))
        : parallelCurve(ax, ay, dx, dy, bend)
    const t0 = crossing(curve, ax, ay, sourceRadius, 0, 0.5, true)
    const t1 = crossing(curve, dx, dy, targetRadius, 0.5, 1, false)
    const visible = arcLength(curve, t0, t1)
    if (visible <= 0.5) return null
    const arrow = edges.arrow[index] ?? 0
    const arrowLength = arrow !== 0 && visible > width * 8 ? Math.max(width * 4, 6) : 0
    const arrowHalf = Math.max(width * 1.6, 3)
    const startHead = arrow & 1 ? arrowLength : 0
    const endHead = arrow & 2 ? arrowLength : 0
    const [fx, fy] = cubicPoint(curve, t0)
    const [lx, ly] = cubicPoint(curve, t1)
    const ta = startHead > 0 ? crossing(curve, fx, fy, startHead, t0, t1, true) : t0
    const tb = endHead > 0 ? crossing(curve, lx, ly, endHead, t0, t1, false) : t1
    const heads: string[] = []
    const base = (t: number, tipX: number, tipY: number) => {
      const [bx, by] = cubicPoint(curve, t)
      const [vx, vy] = cubicTangent(curve, t)
      const length = Math.hypot(vx, vy)
      const nx = length > 0 ? -vy / length : 0
      const ny = length > 0 ? vx / length : 1
      heads.push(head(tipX, tipY, bx, by, nx, ny, arrowHalf))
    }
    if (startHead > 0) base(ta, fx, fy)
    if (endHead > 0) base(tb, lx, ly)
    return {
      body: tb > ta ? subCurve(curve, ta, tb) : null,
      heads,
      whole: subCurve(curve, t0, t1),
      startHead,
    }
  }

  const line = new Float64Array(maxPathPoints * 2)
  const lengths = new Float64Array(maxPathPoints)

  function bundledShape(paths: EdgePaths, index: number, width: number): EdgeShape | null {
    const count = paths.polyline(index, edges, positions, paths.mix, line)
    for (let k = 0; k < count; k++) {
      line[k * 2] = (line[k * 2] ?? 0) * zoom + offsetX
      line[k * 2 + 1] = (line[k * 2 + 1] ?? 0) * zoom + offsetY
      lengths[k] =
        k === 0
          ? 0
          : (lengths[k - 1] ?? 0) +
            Math.hypot(
              (line[k * 2] ?? 0) - (line[k * 2 - 2] ?? 0),
              (line[k * 2 + 1] ?? 0) - (line[k * 2 - 1] ?? 0),
            )
    }
    const total = lengths[count - 1] ?? 0
    const start = radius(edges.source[index] ?? 0)
    const end = total - radius(edges.target[index] ?? 0)
    const visible = end - start
    if (visible <= 0.5) return null
    const arrow = edges.arrow[index] ?? 0
    const arrowLength = arrow !== 0 && visible > width * 8 ? Math.max(width * 4, 6) : 0
    const arrowHalf = Math.max(width * 1.6, 3)
    const startHead = arrow & 1 ? arrowLength : 0
    const endHead = arrow & 2 ? arrowLength : 0
    const at = (along: number): [number, number, number, number] => {
      let k = 0
      while (k < count - 2 && (lengths[k + 1] ?? 0) < along) k++
      const from = lengths[k] ?? 0
      const span = (lengths[k + 1] ?? from) - from
      const t = span > 0 ? (along - from) / span : 0
      const ax = line[k * 2] ?? 0
      const ay = line[k * 2 + 1] ?? 0
      const dx = (line[k * 2 + 2] ?? ax) - ax
      const dy = (line[k * 2 + 3] ?? ay) - ay
      const size = Math.hypot(dx, dy)
      return [ax + dx * t, ay + dy * t, size > 0 ? -dy / size : 0, size > 0 ? dx / size : 1]
    }
    const piece = (from: number, to: number): string => {
      const [fx, fy] = at(from)
      let d = `M${num(fx)} ${num(fy)}`
      for (let k = 1; k < count - 1; k++) {
        const along = lengths[k] ?? 0
        if (along > from && along < to)
          d += `L${num(line[k * 2] ?? 0)} ${num(line[k * 2 + 1] ?? 0)}`
      }
      const [tx, ty] = at(to)
      return `${d}L${num(tx)} ${num(ty)}`
    }
    const heads: string[] = []
    if (startHead > 0) {
      const [tx, ty] = at(start)
      const [bx, by, nx, ny] = at(start + startHead)
      heads.push(head(tx, ty, bx, by, nx, ny, arrowHalf))
    }
    if (endHead > 0) {
      const [tx, ty] = at(end)
      const [bx, by, nx, ny] = at(end - endHead)
      heads.push(head(tx, ty, bx, by, nx, ny, arrowHalf))
    }
    const from = start + startHead
    const to = end - endHead
    return {
      body: to > from ? piece(from, to) : null,
      heads,
      whole: piece(start, end),
      startHead,
    }
  }

  function drawEdge(index: number): void {
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
    const loop = source === target
    const bend = edges.bend[index] ?? 0
    const look = edgeLookAt(index)
    const width = Math.max(look.strokeWidth, 0.5)
    const ax = sx(source)
    const ay = sy(source)
    const dx = sx(target)
    const dy = sy(target)
    const paths = scene.bundles
    const bundled = paths !== undefined && paths !== null && paths.count(index) > 1
    const spread =
      (loop
        ? loopReach(radius(source), bend, loopMinimum) * 1.5
        : Math.abs(bend) * Math.hypot(dx - ax, dy - ay) * 2) +
      (bundled ? (paths.reach[index] ?? 0) * zoom : 0)
    const pad = spread + width * 2 + haloWidth + 8
    if (
      outside(
        Math.min(ax, dx) - pad,
        Math.min(ay, dy) - pad,
        Math.max(ax, dx) + pad,
        Math.max(ay, dy) + pad,
      )
    )
      return
    const shape = bundled
      ? bundledShape(paths, index, width)
      : loop || bend !== 0
        ? curvedShape(index, width)
        : straightShape(index, width)
    if (!shape) return
    const color = paint(look.stroke)
    const parts: string[] = [open(look.opacity)]
    if (look.halo) {
      haloBands.forEach((band, at) => {
        const alpha = halos[at] ?? 0
        if (alpha <= 0) return
        parts.push(
          `<path d="${shape.whole}" fill="none"${paintAttribute('stroke', { hex: halo.hex, alpha })} stroke-width="${num(width + band * 2)}"/>`,
        )
      })
    }
    if (shape.body) {
      const dash = edges.dash[index] || (look.flow !== 0 ? 1 : 0)
      const shift = look.flow * (scene.time ?? 0)
      let style = ` stroke-width="${num(width)}"`
      if (dash === 1) {
        const period = Math.max(width * 5, 8)
        const offset = num(dashOffset(shape.startHead, shift, period))
        style += ` stroke-dasharray="${num(period * 0.6)} ${num(period * 0.4)}" stroke-dashoffset="${offset}"`
      } else if (dash === 2) {
        const period = Math.max(width * 2.5, 4)
        const dot = Math.max(width * 0.6, 1)
        const offset = num(dashOffset(shape.startHead - period / 2, shift, period))
        style = ` stroke-width="${num(dot * 2)}" stroke-linecap="round" stroke-dasharray="0 ${num(period)}" stroke-dashoffset="${offset}"`
      }
      parts.push(`<path d="${shape.body}" fill="none"${paintAttribute('stroke', color)}${style}/>`)
    }
    for (const tip of shape.heads) parts.push(`<path d="${tip}"${paintAttribute('fill', color)}/>`)
    parts.push('</g>')
    body.push(parts.join(''))
  }

  const pass = (index: number) =>
    (scene.bundles?.count(index) ?? 0) > 1
      ? 2
      : edges.source[index] === edges.target[index] || (edges.bend[index] ?? 0) !== 0
        ? 1
        : 0
  const nodeRaised = (index: number) => ((states.nodeMask[index] ?? 0) & states.nodeRaise) !== 0
  const edgeRaised = (index: number) => ((states.edgeMask[index] ?? 0) & states.edgeRaise) !== 0

  function drawBadges(indices: Iterable<number>): void {
    const pills: string[] = []
    const texts: string[] = []
    for (const index of indices) {
      const badges = nodes.badges[index]
      if (!badges || nodes.alive[index] !== 1 || nodeFade(index) === 0) continue
      const size = nodes.size[index] ?? 0
      const diameter = nodes.screenUnits[index] === 1 ? size : size * zoom
      const height = Math.min(diameter * 0.55, badgeLimit)
      if (height < badgeMin) continue
      const x = sx(index)
      const y = sy(index)
      const r = radius(index)
      if (outside(x - r - 40, y - r - 20, x + r + 40, y + r + 20)) continue
      const look: Look = nodeLookAt(index)
      const opacity = look.opacity < 0.999 ? ` opacity="${fine(Math.max(0, look.opacity))}"` : ''
      const reach = (badgeReach[nodes.shape[index] ?? 0] ?? Math.SQRT1_2) * r
      const font = height * badgeFont
      for (const badge of badges) {
        const cx = x + (badge.corner & 1 ? 1 : -1) * reach
        const cy = y + (badge.corner & 2 ? 1 : -1) * reach
        const text = badge.text && height >= badgeTextMin ? badge.text : null
        const textWidth = text ? measure.line(text, 500).width : 0
        const pill = text
          ? Math.max(height, (textWidth * font) / atlasFontSize + height * 0.6)
          : height
        const ring = badgeRing / 2
        pills.push(
          `<rect x="${num(cx - pill / 2 - ring)}" y="${num(cy - height / 2 - ring)}" width="${num(pill + badgeRing)}" height="${num(height + badgeRing)}" rx="${num(height / 2 + ring)}"${paintAttribute('fill', paint(badge.fill))}${paintAttribute('stroke', paint(badge.ring))} stroke-width="${num(badgeRing)}"${opacity}/>`,
        )
        if (text) {
          texts.push(
            `<text transform="translate(${num(cx)} ${num(cy + font * 0.35)}) scale(${fine(font / atlasFontSize)})" text-anchor="middle" font-size="${atlasFontSize}" font-weight="500"${paintAttribute('fill', paint(badge.color))}${opacity}>${escapeXml(text)}</text>`,
          )
        }
      }
    }
    body.push(...pills, ...texts)
  }

  function textLine(
    x: number,
    y: number,
    align: number,
    factor: number,
    weight: number,
    font: string | null,
    color: Paint,
    haloed: boolean,
    text: string,
  ): string {
    const anchor = anchors[align === 1 ? 1 : align === -1 ? 2 : 0]
    const family = font ? ` font-family="${escapeXml(font)}"` : ''
    const outline = haloed
      ? `${paintAttribute('stroke', labelHalo)} stroke-width="${num(factor * haloStroke)}" stroke-linejoin="round" paint-order="stroke"`
      : ''
    const anchorAttribute = anchor === 'start' ? '' : ` text-anchor="${anchor}"`
    const weightAttribute = weight === 400 ? '' : ` font-weight="${weight}"`
    return `<text x="${num(x)}" y="${num(y)}"${anchorAttribute} font-size="${num(atlasFontSize * factor)}"${weightAttribute}${family}${paintAttribute('fill', color)}${outline}>${escapeXml(text)}</text>`
  }

  function labelParts(
    label: PlacedLabel,
    ox: number,
    oy: number,
    lift: number,
    pixels: number,
    look: Look,
    weight: number,
    font: string | null,
  ): string {
    const scale = pixels / atlasFontSize
    const parts: string[] = [
      `<g transform="translate(${num(ox)} ${num(oy - lift)}) scale(${fine(scale)})">`,
    ]
    const plate = label.plate
    if (plate) {
      const round = Math.min(atlasFontSize * plateRadius, plate.hx, plate.hy)
      parts.push(
        `<rect x="${num(plate.cx - plate.hx)}" y="${num(plate.cy - plate.hy)}" width="${num(plate.hx * 2)}" height="${num(plate.hy * 2)}" rx="${num(round)}"${paintAttribute('fill', paint(label.background))}/>`,
      )
    }
    let top = label.top
    for (const line of label.block.lines) {
      const primary = line.kind === 0
      const color = primary
        ? look.labelColor !== noColor
          ? paint(look.labelColor)
          : label.color !== noColor
            ? paint(label.color)
            : ink
        : muted
      parts.push(
        textLine(
          label.shift,
          top + atlasFontSize * line.factor,
          label.align,
          line.factor,
          primary ? weight : 400,
          font,
          color,
          !plate,
          line.text,
        ),
      )
      top += lineHeight * atlasFontSize * line.factor
    }
    parts.push('</g>')
    return parts.join('')
  }

  function drawNodeLabel(index: number, label: PlacedLabel): void {
    const look = nodeLookAt(index)
    const pixels = label.size * (nodes.screenUnits[index] === 1 ? 1 : Math.min(1, zoom))
    const [dx, dy] = placementDirections[label.placement] ?? [0, 1]
    const edge = screenExtent(nodes, boxes, index, zoom, dx !== 0 ? 0 : 1)
    const reach = label.placement === 4 ? 0 : edge + Math.max(look.outlineWidth, 0) + labelGap
    const parts = labelParts(
      label,
      sx(index) + dx * reach,
      sy(index) + dy * reach,
      0,
      pixels,
      look,
      nodes.labelWeight[index] || 500,
      nodes.labelFont[index] ?? null,
    )
    body.push(`${open(look.opacity)}${parts}</g>`)
  }

  function drawEdgeLabel(index: number, label: PlacedLabel, anchor: EdgeAnchor): void {
    const look = edgeLookAt(index)
    const pixels = label.size * Math.min(1, zoom)
    const lift = label.plate ? 0 : Math.max(look.strokeWidth, 0.5) * 0.5 + edgeLabelGap
    const angle = (Math.atan2(anchor.ay, anchor.ax) * 180) / Math.PI
    const parts = labelParts(
      label,
      0,
      0,
      lift,
      pixels,
      look,
      edges.labelWeight[index] || 500,
      edges.labelFont[index] ?? null,
    )
    const opacity = look.opacity < 0.999 ? ` opacity="${fine(Math.max(0, look.opacity))}"` : ''
    const rotation = Math.abs(angle) > 1e-6 ? ` rotate(${fine(angle)})` : ''
    body.push(
      `<g transform="translate(${num(anchor.x)} ${num(anchor.y)})${rotation}"${opacity}>${parts}</g>`,
    )
  }

  const queued = {
    nodes: [[], []] as QueuedLabel[][],
    edges: [[], []] as QueuedLabel[][],
  }
  selectLabels({ ...scene, boxes }, scene.frame, scene.labels, measure, {
    node: (index, label) => {
      queued.nodes[label.highlight ? 1 : 0]?.push({ index, label, anchor: null })
    },
    edge: (index, label, anchor) => {
      queued.edges[label.highlight ? 1 : 0]?.push({ index, label, anchor: { ...anchor } })
    },
  })

  function drawLabels(pass: 0 | 1): void {
    for (const { index, label, anchor } of queued.edges[pass] ?? []) {
      if (anchor) drawEdgeLabel(index, label, anchor)
    }
    for (const { index, label } of queued.nodes[pass] ?? []) drawNodeLabel(index, label)
  }

  function drawGrid(grid: GridInput): void {
    const minor = paint(grid.color)
    const minorRgba = paletteRgba(grid.color)
    const majorRgba = paletteRgba(grid.majorColor)
    const dots = grid.pattern === 'dots'
    const dotScale = gridDotScale(view, grid.adaptive)
    for (const level of gridLevels(grid.spacing, view, frame, grid.adaptive)) {
      if (level.weight <= 0) continue
      const strength = Math.min(1, Math.max(0, level.weight - 1))
      const tone =
        level.weight <= 1
          ? { hex: minor.hex, alpha: minor.alpha * level.weight }
          : paintOf(mixRgba(minorRgba, majorRgba, strength))
      if (tone.alpha <= 0) continue
      const id = `${prefix}g${defs.length}`
      const pitch = level.pitch
      const shape = dots
        ? `<circle cx="${fine(pitch / 2)}" cy="${fine(pitch / 2)}" r="${fine((0.8 + 0.5 * strength) * dotScale)}"/>`
        : `<path d="M0 0H${fine(pitch)}V1H0ZM0 1H1V${fine(pitch)}H0Z"/>`
      const shift = dots ? pitch / 2 : 0.5
      defs.push(
        `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${fine(level.offsetX - shift)}" y="${fine(level.offsetY - shift)}" width="${fine(pitch)}" height="${fine(pitch)}"><g${paintAttribute('fill', tone)}>${shape}</g></pattern>`,
      )
      body.push(`<rect width="${num(width)}" height="${num(height)}" fill="url(#${id})"/>`)
    }
  }

  function hullPath(shape: HullShape): string {
    const { data, length } = shape.outline
    const reach = shape.padding / zoom
    let path = ''
    for (let k = 0; k < length; k++) {
      const at = k * outlineStride
      const extent = (data[at + 4] ?? 0) + reach
      const x = ((data[at] ?? 0) + (data[at + 2] ?? 0) * extent) * zoom + offsetX
      const y = ((data[at + 1] ?? 0) + (data[at + 3] ?? 0) * extent) * zoom + offsetY
      path += `${k === 0 ? 'M' : 'L'}${num(x)} ${num(y)}`
    }
    return `${path}Z`
  }

  function drawHulls(shapes: readonly HullShape[]): void {
    const paths = shapes.map((shape) => (shape.outline.length > 0 ? hullPath(shape) : ''))
    shapes.forEach((shape, at) => {
      const fill = paint(shape.fill)
      if (paths[at] && fill.alpha > 0) {
        body.push(`<path d="${paths[at]}"${paintAttribute('fill', fill)}/>`)
      }
    })
    shapes.forEach((shape, at) => {
      const stroke = paint(shape.stroke)
      if (paths[at] && shape.strokeWidth > 0 && stroke.alpha > 0) {
        body.push(
          `<path d="${paths[at]}" fill="none"${paintAttribute('stroke', stroke)} stroke-width="${num(shape.strokeWidth)}" stroke-linejoin="round"/>`,
        )
      }
    })
  }

  if (scene.grid) drawGrid(scene.grid)
  const containers = scene.containers
  if (containers) {
    for (let slot = 0; slot < containers.count; slot++) {
      const index = containers.order[slot] ?? 0
      if (nodes.alive[index] !== 1 || !isContainer(index) || nodeFade(index) === 0) continue
      drawContainer(index, containers.boxes)
    }
  }
  if (scene.hulls) drawHulls(scene.hulls)
  for (const layer of scene.layers) {
    if (layer.kind === 'edges') {
      for (const kind of [0, 1, 2]) {
        for (let index = 0; index < edges.capacity; index++) {
          if (edges.alive[index] !== 1 || edges.slot[index] !== layer.slot) continue
          if (edgeFade(index) === 0) continue
          if (edgeRaised(index) || pass(index) !== kind) continue
          drawEdge(index)
        }
      }
    } else {
      for (let index = 0; index < nodes.capacity; index++) {
        if (nodes.alive[index] !== 1 || nodes.slot[index] !== layer.slot) continue
        if (nodeFade(index) === 0) continue
        if (!nodeRaised(index) && !isContainer(index)) drawNode(index)
      }
    }
  }
  const plain: number[] = []
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.badges[index] && !nodeRaised(index)) plain.push(index)
  }
  drawBadges(plain)
  drawLabels(0)
  for (const kind of [0, 1, 2]) {
    for (const index of states.highlightedEdges) {
      if (edges.alive[index] === 1 && pass(index) === kind && edgeFade(index) > 0) drawEdge(index)
    }
  }
  for (const index of states.highlightedNodes) {
    if (nodes.alive[index] === 1 && !isContainer(index) && nodeFade(index) > 0) drawNode(index)
  }
  drawBadges(states.highlightedNodes)
  drawLabels(1)

  const size = `width="${num(width)}" height="${num(height)}"`
  const background =
    scene.background[3] > 0
      ? `<rect ${size}${paintAttribute('fill', paintOf(scene.background))}/>`
      : ''
  const title = scene.title ? `<title>${escapeXml(scene.title)}</title>` : ''
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${num(width)} ${num(height)}" font-family="${escapeXml(theme.font)}" xml:space="preserve">`,
    title,
    defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '',
    background,
    body.join(''),
    '</svg>',
  ].join('')
}
