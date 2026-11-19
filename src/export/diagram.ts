import { containerShape, type EdgeColumns, type NodeColumns, noColor } from '../core/columns'
import { paperOnFill } from '../core/contrast'
import { loopCurve, loopMinimum, loopReach } from '../core/edge-curve'
import type { EdgePaths } from '../core/edge-paths'
import { arcPolyline, arcStations } from '../core/geo-arc'
import { nodeLabelSize } from '../core/label-width'
import type { LayerFilter } from '../core/mark-layers'
import {
  diamondReach,
  isBox,
  loopShift,
  minimumNodeRadius,
  type NodeBox,
  nodeBox,
  nodeUnit,
  squareReach,
} from '../core/node-shape'
import type { Positions } from '../core/positions'
import type { Layer } from '../core/scene'
import type { StateBuffers } from '../core/state-buffers'
import type { TimeFilter } from '../core/time-range'
import { edgeOpacity, nodeOpacity, type Sight } from '../core/visibility'
import type { ResolvedTheme, Rgba } from '../dom/theme'
import type { ContainerFrame } from '../host/renderer'
import type { Key } from '../types'
import { edgeLabelSize } from '../webgl/shaders'
import { edgeLine, edgeLook, type Look, nodeLook } from './look'

export interface DiagramColor {
  readonly hex: string
  readonly alpha: number
}

export interface DiagramText {
  readonly text: string
  readonly size: number
  readonly bold: boolean
  readonly color: DiagramColor
  readonly font: string
  readonly background: DiagramColor | null
  readonly opacity: number
}

export type DiagramPlacement = 'bottom' | 'top' | 'right' | 'left' | 'center'

export type DiagramShape = 'ellipse' | 'rectangle' | 'diamond'

export interface DiagramImage {
  readonly src: string
  readonly side: number
}

export interface DiagramNode {
  readonly kind: 'node'
  readonly id: string
  readonly key: Key
  readonly parent: DiagramNode | null
  readonly container: boolean
  readonly shape: DiagramShape
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly corner: number
  readonly fill: DiagramColor | null
  readonly stroke: DiagramColor | null
  readonly strokeWidth: number
  readonly opacity: number
  readonly image: DiagramImage | null
  readonly label: DiagramText | null
  readonly placement: DiagramPlacement
}

export interface DiagramPoint {
  readonly x: number
  readonly y: number
}

export type DiagramDash = 'solid' | 'dashed' | 'dotted'

export interface DiagramEdge {
  readonly kind: 'edge'
  readonly id: string
  readonly key: Key
  readonly source: DiagramNode
  readonly target: DiagramNode
  readonly color: DiagramColor | null
  readonly width: number
  readonly dash: DiagramDash
  readonly opacity: number
  readonly startArrow: boolean
  readonly endArrow: boolean
  readonly points: readonly DiagramPoint[]
  readonly smooth: boolean
  readonly label: DiagramText | null
  readonly sourceLabel: DiagramText | null
  readonly targetLabel: DiagramText | null
}

export type DiagramCell = DiagramNode | DiagramEdge

export interface Diagram {
  readonly width: number
  readonly height: number
  readonly title: string | null
  readonly background: DiagramColor | null
  readonly cells: readonly DiagramCell[]
}

export type DiagramStates = 'all' | 'custom' | 'none'

export interface DiagramSource {
  readonly nodes: NodeColumns
  readonly edges: EdgeColumns
  readonly layers: readonly Layer[]
  readonly positions: Positions
  readonly states: StateBuffers
  readonly containers: ContainerFrame | null
  readonly parents: Int32Array | null
  readonly bundles: EdgePaths | null
  readonly palette: Uint8Array
  readonly theme: ResolvedTheme
  readonly window: TimeFilter | null
  readonly layerFilter: LayerFilter | null
  readonly title: string | null
  readonly background: Rgba
  readonly imageUrl: (src: string) => string
}

export interface DiagramFrame {
  readonly region: 'view' | 'graph'
  readonly zoom: number
  readonly padding: number
  readonly view: { readonly x: number; readonly y: number }
  readonly width: number
  readonly height: number
}

const builtInBits = 0b111
const shapeNames: readonly DiagramShape[] = ['ellipse', 'rectangle', 'diamond']
const placements: readonly DiagramPlacement[] = ['bottom', 'top', 'right', 'left', 'center']
const charWidth = 0.6
const lineHeight = 1.25
const straightness = 1e-6

function excluded(states: DiagramStates): number {
  return states === 'all' ? 0 : states === 'none' ? 0xffffffff : builtInBits
}

function colorOf(rgba: Rgba): DiagramColor | null {
  if (rgba[3] <= 0) return null
  const hex = `#${((1 << 24) | (rgba[0] << 16) | (rgba[1] << 8) | rgba[2]).toString(16).slice(1)}`
  return { hex, alpha: rgba[3] / 255 }
}

function fontStack(font: string): string {
  return font
    .split(',')
    .map((family) => family.trim().replace(/^["']|["']$/g, ''))
    .filter((family) => family !== '')
    .join(',')
}

function encodeKey(key: Key): string {
  let result = ''
  for (const char of String(key)) {
    const code = char.codePointAt(0) ?? 0
    const plain = char !== '%' && code >= 0x20 && code !== 0x7f && code !== 0xfffe
    result +=
      plain && code !== 0xffff && !(code >= 0xd800 && code <= 0xdfff)
        ? char
        : `%${code.toString(16).toUpperCase().padStart(2, '0')};`
  }
  return result
}

function cellId(prefix: string, key: Key): string {
  return `${prefix}${typeof key === 'number' ? '#' : ':'}${encodeKey(key)}`
}

function textBounds(
  text: DiagramText,
  placement: DiagramPlacement,
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
): readonly [number, number, number, number] {
  const lines = text.text.split('\n')
  let longest = 0
  for (const line of lines) longest = Math.max(longest, line.length)
  const width = longest * text.size * charWidth
  const height = lines.length * text.size * lineHeight
  if (placement === 'bottom') {
    return [x - width / 2, y + halfHeight, x + width / 2, y + halfHeight + height]
  }
  if (placement === 'top') {
    return [x - width / 2, y - halfHeight - height, x + width / 2, y - halfHeight]
  }
  if (placement === 'right') {
    return [x + halfWidth, y - height / 2, x + halfWidth + width, y + height / 2]
  }
  if (placement === 'left') {
    return [x - halfWidth - width, y - height / 2, x - halfWidth, y + height / 2]
  }
  return [x - width / 2, y - height / 2, x + width / 2, y + height / 2]
}

function withoutStraights(points: DiagramPoint[], from: DiagramPoint, to: DiagramPoint) {
  const kept: DiagramPoint[] = []
  let previous = from
  for (let at = 0; at < points.length; at++) {
    const point = points[at] as DiagramPoint
    const next = points[at + 1] ?? to
    const ax = point.x - previous.x
    const ay = point.y - previous.y
    const bx = next.x - point.x
    const by = next.y - point.y
    const scale = Math.hypot(ax, ay) * Math.hypot(bx, by)
    if (scale === 0 || Math.abs(ax * by - ay * bx) <= straightness * scale) {
      if (ax * bx + ay * by >= 0 || scale === 0) continue
    }
    kept.push(point)
    previous = point
  }
  return kept
}

export function readDiagram(
  source: DiagramSource,
  frame: DiagramFrame,
  states: DiagramStates,
): Diagram {
  const { nodes, edges, positions, palette, theme } = source
  const zoom = frame.zoom
  const exclude = excluded(states)
  const sight: Sight = {
    zoom,
    time: source.window,
    layers: source.layerFilter,
    hide: source.states.hide,
  }
  const shrink = Math.min(1, zoom)
  const boxes = source.containers?.boxes ?? null
  const scratch: NodeBox = { halfWidth: 0, halfHeight: 0, corner: 0 }
  const font = fontStack(theme.font)
  const ink = colorOf(theme.labelInk) ?? { hex: '#000000', alpha: 1 }
  const paper = colorOf(theme.labelPaper) ?? { hex: '#ffffff', alpha: 1 }
  const colors = new Map<number, DiagramColor | null>()
  const color = (id: number): DiagramColor | null => {
    if (id === noColor || id * 4 + 3 >= palette.length) return null
    let found = colors.get(id)
    if (found === undefined) {
      const at = id * 4
      found = colorOf([
        palette[at] ?? 0,
        palette[at + 1] ?? 0,
        palette[at + 2] ?? 0,
        palette[at + 3] ?? 0,
      ])
      colors.set(id, found)
    }
    return found
  }
  const rgba = (id: number): Rgba => {
    const at = id * 4
    return id === noColor
      ? [0, 0, 0, 0]
      : [palette[at] ?? 0, palette[at + 1] ?? 0, palette[at + 2] ?? 0, palette[at + 3] ?? 0]
  }
  const ids = new Set<string>()
  const unique = (id: string): string => {
    let found = id
    for (let copy = 2; ids.has(found); copy++) found = `${id}~${copy}`
    ids.add(found)
    return found
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const reach = (left: number, top: number, right: number, bottom: number) => {
    minX = Math.min(minX, left)
    minY = Math.min(minY, top)
    maxX = Math.max(maxX, right)
    maxY = Math.max(maxY, bottom)
  }
  const viewLeft = frame.view.x * zoom - frame.width / 2
  const viewTop = frame.view.y * zoom - frame.height / 2
  const inView = (left: number, top: number, right: number, bottom: number) =>
    frame.region === 'graph' ||
    (right >= viewLeft &&
      left <= viewLeft + frame.width &&
      bottom >= viewTop &&
      top <= viewTop + frame.height)

  const text = (
    value: string | null,
    size: number,
    weight: number,
    fontName: string | null,
    shade: DiagramColor,
    background: number,
    opacity: number,
  ): DiagramText | null =>
    value
      ? {
          text: value,
          size,
          bold: weight >= 600,
          color: shade,
          font: fontName ? fontStack(fontName) : font,
          background: color(background),
          opacity,
        }
      : null

  const drawn = new Map<number, DiagramNode>()
  const nodeCells: DiagramNode[] = []
  const nodeAt = (index: number, parent: DiagramNode | null): DiagramNode | null => {
    if (nodes.alive[index] !== 1) return null
    const fade = nodeOpacity(nodes, index, sight)
    if (fade <= 0) return null
    const container = nodes.shape[index] === containerShape
    const x = positions.x(index) * zoom
    const y = positions.y(index) * zoom
    const unit = nodeUnit(nodes, index, zoom)
    let halfWidth: number
    let halfHeight: number
    let corner = 0
    let diameter: number
    let shape: DiagramShape = 'rectangle'
    if (container) {
      if (!boxes) return null
      halfWidth = Math.max((boxes[index * 4] ?? 0) * zoom, minimumNodeRadius)
      halfHeight = Math.max((boxes[index * 4 + 1] ?? 0) * zoom, minimumNodeRadius)
      corner = Math.min((boxes[index * 4 + 2] ?? 0) * zoom, halfWidth, halfHeight)
      if (Math.abs(halfWidth - halfHeight) < 0.01 && corner >= halfWidth - 0.01) {
        shape = 'ellipse'
        corner = 0
      }
      diameter = Math.min(halfWidth, halfHeight) * 2
    } else if (isBox(nodes, index)) {
      const box = nodeBox(nodes, index, unit, scratch)
      halfWidth = box.halfWidth
      halfHeight = box.halfHeight
      corner = box.corner
      diameter = halfHeight * 2
    } else {
      const radius = Math.max(((nodes.size[index] ?? 0) * unit) / 2, minimumNodeRadius)
      const code = nodes.shape[index] ?? 0
      shape = shapeNames[code] ?? 'ellipse'
      const half = radius * (code === 1 ? squareReach : code === 2 ? diamondReach : 1)
      halfWidth = half
      halfHeight = half
      diameter = radius * 2
    }
    if (!inView(x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight)) return null
    const look = nodeLook(nodes, source.states, index, exclude)
    const opacity = Math.max(0, Math.min(1, look.opacity * fade))
    const inner = Math.min(Math.max(look.strokeWidth, 0), diameter / 4)
    const outer = Math.max(look.outlineWidth, 0)
    const outlined = inner <= 0 && outer > 0 && color(look.outline) !== null
    const placement = placements[nodes.labelPlacement[index] ?? 0] ?? 'bottom'
    const fill = color(look.fill)
    const labelColor =
      look.labelColor !== noColor
        ? color(look.labelColor)
        : (nodes.labelColor[index] ?? noColor) !== noColor
          ? color(nodes.labelColor[index] ?? noColor)
          : placement === 'center' &&
              !container &&
              paperOnFill(rgba(look.fill), theme.labelInk, theme.labelPaper)
            ? paper
            : ink
    const main = nodes.label[index] ?? null
    const secondary = nodes.secondary[index] ?? null
    const joined = main && secondary ? `${main}\n${secondary}` : (main ?? secondary)
    const size = (nodes.labelSize[index] || nodeLabelSize) * (unit === 1 ? 1 : shrink)
    const label = text(
      joined,
      size,
      nodes.labelWeight[index] || 500,
      nodes.labelFont[index] ?? null,
      labelColor ?? ink,
      nodes.labelBackground[index] ?? noColor,
      opacity,
    )
    const src = container ? null : (nodes.image[index] ?? null)
    const key = nodes.keys[index] ?? index
    const node: DiagramNode = {
      kind: 'node',
      id: unique(cellId('n', key)),
      key,
      parent,
      container,
      shape,
      x,
      y,
      width: halfWidth * 2,
      height: halfHeight * 2,
      corner,
      fill,
      stroke: outlined ? color(look.outline) : inner > 0 ? color(look.stroke) : null,
      strokeWidth: outlined ? outer : inner,
      opacity,
      image: src
        ? {
            src: source.imageUrl(src),
            side: diameter * Math.max(nodes.imageScale[index] ?? 1, 0.001),
          }
        : null,
      label,
      placement,
    }
    const ring = outlined ? outer : 0
    reach(x - halfWidth - ring, y - halfHeight - ring, x + halfWidth + ring, y + halfHeight + ring)
    if (label) reach(...textBounds(label, placement, x, y, halfWidth + ring, halfHeight + ring))
    return node
  }

  const parents = source.parents
  const parentOf = (index: number): DiagramNode | null => {
    if (!parents) return null
    for (let at = parents[index] ?? -1; at >= 0; at = parents[at] ?? -1) {
      const found = drawn.get(at)
      if (found?.container) return found
    }
    return null
  }

  const containers = source.containers
  if (containers) {
    for (let slot = 0; slot < containers.count; slot++) {
      const index = containers.order[slot] ?? 0
      if (nodes.shape[index] !== containerShape) continue
      const node = nodeAt(index, parentOf(index))
      if (!node) continue
      drawn.set(index, node)
      nodeCells.push(node)
    }
  }

  const edgePaint = (line: ReturnType<typeof edgeLine>): [number, number, number] => {
    if (line.split < 0 || (line.color === line.farColor && line.width === line.farWidth)) {
      return [line.color, line.width, line.dash]
    }
    return line.split < 0.5
      ? [line.farColor, line.farWidth, line.farDash]
      : [line.color, line.width, line.dash]
  }

  const paths = source.bundles
  const polyline = new Float64Array(Math.max(paths ? paths.longest : 0, arcStations, 2) * 2 + 4)
  const edgeAt = (index: number): DiagramEdge | null => {
    if (edges.alive[index] !== 1) return null
    const fade = edgeOpacity(nodes, edges, index, sight)
    if (fade <= 0) return null
    const from = edges.source[index] ?? 0
    const to = edges.target[index] ?? 0
    const sourceNode = drawn.get(from)
    const targetNode = drawn.get(to)
    if (!sourceNode || !targetNode) return null
    const buffers = source.states
    const mask = buffers.edgeMask[index] ?? 0
    const look: Look = edgeLook(edges, buffers, index, zoom, mask, exclude)
    const line = edgeLine(edges, buffers, index, zoom, mask, exclude)
    const [stroke, width, dash] = edgePaint(line)
    const arrow = edges.arrow[index] ?? 0
    const loop = from === to
    const bend = edges.bend[index] ?? 0
    const ax = sourceNode.x
    const ay = sourceNode.y
    const dx = targetNode.x
    const dy = targetNode.y
    let points: DiagramPoint[] = []
    let smooth = false
    const count = paths && !loop ? paths.count(index) : 0
    if (paths && count > 1) {
      paths.polyline(index, edges, positions, paths.mix, polyline)
      for (let k = 1; k < count - 1; k++) {
        points.push({ x: (polyline[k * 2] ?? 0) * zoom, y: (polyline[k * 2 + 1] ?? 0) * zoom })
      }
      smooth = !paths.measured && !paths.isFixed(index)
      if (!smooth) points = withoutStraights(points, sourceNode, targetNode)
    } else if (loop) {
      const radius = nodeBox(nodes, from, nodeUnit(nodes, from, zoom), scratch).halfHeight
      const curve = loopCurve(
        ax + loopShift(nodes, from, zoom),
        ay,
        loopReach(radius, bend, loopMinimum),
      )
      points = [
        { x: curve.ax + (curve.bx - curve.ax) * 0.75, y: curve.ay + (curve.by - curve.ay) * 0.75 },
        { x: curve.dx + (curve.cx - curve.dx) * 0.75, y: curve.dy + (curve.cy - curve.dy) * 0.75 },
      ]
      smooth = true
    } else if (edges.geodesic[index] === 1) {
      const stations = arcPolyline(
        positions.x(from),
        positions.y(from),
        positions.x(to),
        positions.y(to),
        bend,
        true,
        polyline,
      )
      for (let k = 1; k < stations - 1; k++) {
        points.push({ x: (polyline[k * 2] ?? 0) * zoom, y: (polyline[k * 2 + 1] ?? 0) * zoom })
      }
      smooth = true
    } else if (bend !== 0) {
      const length = Math.hypot(dx - ax, dy - ay)
      if (length > 0) {
        const offset = 2 * bend * length
        points = [
          {
            x: (ax + dx) / 2 - ((dy - ay) / length) * offset,
            y: (ay + dy) / 2 + ((dx - ax) / length) * offset,
          },
        ]
        smooth = true
      }
    }
    for (const point of points) reach(point.x, point.y, point.x, point.y)
    const opacity = Math.max(0, Math.min(1, look.opacity * fade))
    const labelShade = (own: number) =>
      look.labelColor !== noColor
        ? (color(look.labelColor) ?? ink)
        : own !== noColor
          ? (color(own) ?? ink)
          : ink
    const edgeSize = (size: number) => (size || edgeLabelSize) * shrink
    const ends = edges.ends
    const endLabel = (id: number) =>
      ends
        ? text(
            ends.label[id] ?? null,
            edgeSize(ends.labelSize[id] ?? 0),
            ends.labelWeight[id] || 500,
            ends.labelFont[id] ?? null,
            labelShade(ends.labelColor[id] ?? noColor),
            ends.labelBackground[id] ?? noColor,
            opacity,
          )
        : null
    const key = edges.keys[index] ?? index
    return {
      kind: 'edge',
      id: unique(cellId('e', key)),
      key,
      source: sourceNode,
      target: targetNode,
      color: color(stroke),
      width,
      dash: dash === 1 ? 'dashed' : dash === 2 ? 'dotted' : 'solid',
      opacity,
      startArrow: (arrow & 1) !== 0,
      endArrow: (arrow & 2) !== 0,
      points,
      smooth,
      label: text(
        edges.label[index] ?? null,
        edgeSize(edges.labelSize[index] ?? 0),
        edges.labelWeight[index] || 500,
        edges.labelFont[index] ?? null,
        labelShade(edges.labelColor[index] ?? noColor),
        edges.labelBackground[index] ?? noColor,
        opacity,
      ),
      sourceLabel: endLabel(index * 2),
      targetLabel: endLabel(index * 2 + 1),
    }
  }

  const drawOrder = nodes.order.used ? nodes.order.list.subarray(0, nodes.order.length) : null
  const cells: DiagramCell[] = []
  const layered: (readonly [Layer, DiagramNode[]])[] = []
  for (const layer of source.layers) {
    if (layer.kind !== 'nodes') continue
    const list: DiagramNode[] = []
    const visit = (index: number) => {
      if (nodes.slot[index] !== layer.slot || nodes.shape[index] === containerShape) return
      const node = nodeAt(index, parentOf(index))
      if (!node) return
      drawn.set(index, node)
      list.push(node)
    }
    if (drawOrder) for (const index of drawOrder) visit(index)
    else for (let index = 0; index < nodes.capacity; index++) visit(index)
    layered.push([layer, list])
  }
  cells.push(...nodeCells)
  let next = 0
  for (const layer of source.layers) {
    if (layer.kind === 'nodes') {
      cells.push(...(layered[next++]?.[1] ?? []))
      continue
    }
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.slot[index] !== layer.slot) continue
      const edge = edgeAt(index)
      if (edge) cells.push(edge)
    }
  }

  let left: number
  let top: number
  let width: number
  let height: number
  if (frame.region === 'view' || maxX < minX) {
    left = viewLeft
    top = viewTop
    width = frame.width
    height = frame.height
  } else {
    left = minX - frame.padding
    top = minY - frame.padding
    width = maxX - minX + frame.padding * 2
    height = maxY - minY + frame.padding * 2
  }
  return {
    width,
    height,
    title: source.title,
    background: colorOf(source.background),
    cells: shift(cells, left, top),
  }
}

export function centered(diagram: Diagram, width: number, height: number): Diagram {
  return {
    ...diagram,
    width,
    height,
    cells: shift(diagram.cells, (diagram.width - width) / 2, (diagram.height - height) / 2),
  }
}

function shift(cells: readonly DiagramCell[], left: number, top: number): DiagramCell[] {
  const moved = new Map<DiagramNode, DiagramNode>()
  const nodeOf = (node: DiagramNode): DiagramNode => {
    let found = moved.get(node)
    if (!found) {
      found = {
        ...node,
        x: node.x - left,
        y: node.y - top,
        parent: node.parent ? nodeOf(node.parent) : null,
      }
      moved.set(node, found)
    }
    return found
  }
  return cells.map((cell) =>
    cell.kind === 'node'
      ? nodeOf(cell)
      : {
          ...cell,
          source: nodeOf(cell.source),
          target: nodeOf(cell.target),
          points: cell.points.map((point) => ({ x: point.x - left, y: point.y - top })),
        },
  )
}
