import { containerShape, noColor } from '../core/columns'
import { globeScreen } from '../core/globe'
import { builtInStates, freeStateNames } from '../core/state-names'
import { edgeShown, nodeShown, type Sight, shapeShown } from '../core/visibility'
import { selectLabels } from '../export/labels'
import { edgeLook, nodeLook } from '../export/look'
import { widthMeasure } from '../export/width-measure'
import { type GraphSnapshot, takeSnapshot } from '../host/export-source'
import type { GraphCore } from '../host/graph-instance'
import type { GraphInternals } from '../host/internals'
import type { Key } from '../types'
import type { LabelRefusal, PlacedLabel } from '../webgl/label-layer'
import { readKey, rounded } from './keys'
import type {
  AgentEdge,
  AgentElementKind,
  AgentLabelHidden,
  AgentNode,
  AgentShape,
  GraphAgentOptions,
} from './types'

const labelLimit = 4000
const nodeCull = 1.25

export type Describe = NonNullable<GraphAgentOptions['describe']>

export interface Labels {
  readonly nodes: Map<number, string>
  readonly edges: Map<number, string>
  readonly nodeRefused: Map<number, LabelRefusal>
  readonly edgeRefused: Map<number, LabelRefusal>
}

export class Frame {
  readonly shot: GraphSnapshot
  readonly sight: Sight
  readonly zoom: number
  readonly width: number
  readonly height: number
  readonly names: readonly string[]
  readonly onScreen: Uint8Array
  readonly edgesOn: Uint8Array
  readonly nodes: number[] = []
  readonly edges: number[] = []
  readonly #point = { x: 0, y: 0 }
  #labels: Labels | null = null

  constructor(graph: GraphCore, internals: GraphInternals) {
    const shot = takeSnapshot(graph)
    this.shot = shot
    this.zoom = shot.view.zoom
    this.width = shot.width
    this.height = shot.height
    this.sight = {
      zoom: shot.view.zoom,
      time: shot.window,
      layers: shot.layers,
      hide: shot.states.hide,
    }
    this.names = [...builtInStates, ...freeStateNames(internals.definition().states)]
    const { nodes, edges } = shot.scene
    this.onScreen = new Uint8Array(nodes.capacity)
    this.edgesOn = new Uint8Array(edges.capacity)
    const boxes = shot.containers?.boxes ?? null
    const point = this.#point
    for (let index = 0; index < nodes.capacity; index++) {
      if (nodes.alive[index] !== 1 || !nodeShown(nodes, index, this.sight)) continue
      if (!this.screen(index, point)) continue
      const box = boxes !== null && nodes.shape[index] === containerShape
      const rx = box ? (boxes[index * 4] ?? 0) * this.zoom : this.diameter(index) / 2
      const ry = box ? (boxes[index * 4 + 1] ?? 0) * this.zoom : rx
      if (point.x + rx < 0 || point.x - rx > this.width) continue
      if (point.y + ry < 0 || point.y - ry > this.height) continue
      this.onScreen[index] = 1
      this.nodes.push(index)
    }
    const end = { x: 0, y: 0 }
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1) continue
      const source = edges.source[index] ?? 0
      const target = edges.target[index] ?? 0
      if (this.onScreen[source] !== 1 && this.onScreen[target] !== 1) {
        if (!this.screen(source, point) || !this.screen(target, end)) continue
        if (Math.max(point.x, end.x) < 0 || Math.min(point.x, end.x) > this.width) continue
        if (Math.max(point.y, end.y) < 0 || Math.min(point.y, end.y) > this.height) continue
      }
      if (!edgeShown(nodes, edges, index, this.sight)) continue
      this.edgesOn[index] = 1
      this.edges.push(index)
    }
  }

  screen(index: number, out: { x: number; y: number }): boolean {
    const { positions, view, globe } = this.shot
    if (globe && globe.mix > 0)
      return globeScreen(globe, positions.x(index), positions.y(index), out) >= 0
    out.x = (positions.x(index) - view.x) * this.zoom + this.width / 2
    out.y = (positions.y(index) - view.y) * this.zoom + this.height / 2
    return true
  }

  diameter(index: number): number {
    const nodes = this.shot.scene.nodes
    const size = nodes.size[index] ?? 0
    return Math.max(nodes.screenUnits[index] === 1 ? size : size * this.zoom, nodeCull * 2)
  }

  shown(kind: AgentElementKind, index: number): boolean {
    const { nodes, edges, shapes } = this.shot.scene
    if (kind === 'node') return nodes.alive[index] === 1 && nodeShown(nodes, index, this.sight)
    if (kind === 'edge') {
      return edges.alive[index] === 1 && edgeShown(nodes, edges, index, this.sight)
    }
    return shapes.alive[index] === 1 && shapeShown(shapes, index, this.sight)
  }

  labels(): Labels {
    if (this.#labels) return this.#labels
    const { shot } = this
    const { scene, positions, states, view, width, height } = shot
    const labels: Labels = {
      nodes: new Map(),
      edges: new Map(),
      nodeRefused: new Map(),
      edgeRefused: new Map(),
    }
    const text = (label: PlacedLabel) => label.block.lines.map((line) => line.text).join('\n')
    selectLabels(
      {
        nodes: scene.nodes,
        edges: scene.edges,
        positions,
        states,
        boxes: shot.containers?.boxes ?? null,
        bundles: shot.bundles,
        shapes: scene.shapes,
        hulls: shot.hulls.shapes ?? null,
      },
      { view, width, height, window: shot.window, layers: shot.layers, hide: states.hide },
      'visible',
      widthMeasure(scene.textWidth),
      {
        node: (index, label) => {
          labels.nodes.set(index, text(label))
        },
        edge: (index, label) => {
          if (label.end === 0) labels.edges.set(index, text(label))
        },
        refuse: (kind, index, reason) => {
          const refused = kind === 'node' ? labels.nodeRefused : labels.edgeRefused
          if (!refused.has(index)) refused.set(index, reason)
        },
      },
    )
    this.#labels = labels
    return labels
  }

  stateNames(mask: number): string[] {
    const out: string[] = []
    for (let bit = 0; bit < this.names.length; bit++) {
      if ((mask >>> bit) & 1) out.push(this.names[bit] ?? `#${bit}`)
    }
    return out
  }

  hex(id: number | undefined): string | null {
    if (id === undefined || id === noColor) return null
    const palette = this.shot.palette
    const at = id * 4
    const part = (value: number | undefined) => (value ?? 0).toString(16).padStart(2, '0')
    const alpha = palette[at + 3] ?? 255
    const rgb = `#${part(palette[at])}${part(palette[at + 1])}${part(palette[at + 2])}`
    return alpha === 255 ? rgb : `${rgb}${part(alpha)}`
  }
}

function hiddenReason(
  refused: Map<number, LabelRefusal>,
  index: number,
  drawn: number,
): AgentLabelHidden {
  return refused.get(index) ?? (drawn >= labelLimit ? 'limit' : 'too-small')
}

export interface ElementReader {
  readonly graph: GraphCore
  readonly internals: GraphInternals
  readonly describe: Describe | null
  readonly folded: ReadonlySet<Key>
}

function described(
  reader: ElementReader,
  kind: AgentElementKind,
  index: number,
  key: Key,
): Readonly<Record<string, unknown>> | undefined {
  if (!reader.describe) return undefined
  const datum = reader.internals.datum(
    kind === 'node' ? 'nodes' : kind === 'edge' ? 'edges' : 'shapes',
    index,
  )
  try {
    return reader.describe(datum, key, kind) ?? undefined
  } catch (error) {
    return { describeError: error instanceof Error ? error.message : String(error) }
  }
}

export function degrees(frame: Frame, indices: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>()
  if (indices.length === 0) return counts
  const { nodes, edges } = frame.shot.scene
  const wanted = new Uint8Array(nodes.capacity)
  for (const index of indices) {
    wanted[index] = 1
    counts.set(index, 0)
  }
  for (let index = 0; index < edges.capacity; index++) {
    if (edges.alive[index] !== 1) continue
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
    if (wanted[source] !== 1 && wanted[target] !== 1) continue
    if (!edgeShown(nodes, edges, index, frame.sight)) continue
    if (wanted[source] === 1) counts.set(source, (counts.get(source) ?? 0) + 1)
    if (target !== source && wanted[target] === 1) {
      counts.set(target, (counts.get(target) ?? 0) + 1)
    }
  }
  return counts
}

export function nodeElement(
  reader: ElementReader,
  frame: Frame,
  index: number,
  degree: number,
  labels: Labels | null,
): AgentNode {
  const { nodes } = frame.shot.scene
  const states = frame.shot.states
  const key = nodes.keys[index] as Key
  const label = nodes.label[index] || undefined
  const drawn = labels?.nodes.get(index)
  const look = nodeLook(nodes, states, index)
  const base = nodes.opacity[index] ?? 1
  const point = { x: 0, y: 0 }
  const shown = frame.shown('node', index)
  const onScreen = frame.onScreen[index] === 1
  const visible = shown && frame.screen(index, point)
  const parent = reader.graph.groups.parent(key)
  const container = nodes.shape[index] === containerShape
  const isFolded = reader.folded.has(key)
  const data = described(reader, 'node', index, key)
  return {
    kind: 'node',
    key: readKey(key),
    ...(label !== undefined ? { label } : {}),
    ...(label !== undefined && labels && onScreen ? { labelShown: drawn !== undefined } : {}),
    ...(drawn !== undefined && drawn !== label ? { labelDrawn: drawn } : {}),
    ...(label !== undefined && labels && onScreen && drawn === undefined
      ? { labelHidden: hiddenReason(labels.nodeRefused, index, labels.nodes.size) }
      : {}),
    ...(visible && onScreen ? { screen: [rounded(point.x), rounded(point.y)] as const } : {}),
    size: rounded(frame.diameter(index)),
    look: {
      fill: frame.hex(look.fill),
      stroke: look.strokeWidth > 0 ? frame.hex(look.stroke) : null,
      opacity: rounded(look.opacity, 2),
      ...(look.opacity < base - 1e-6 ? { dimmed: true as const } : {}),
    },
    states: frame.stateNames(states.nodeMask[index] ?? 0),
    ...(parent !== undefined ? { group: readKey(parent) } : {}),
    ...(container ? { container: true as const } : {}),
    ...(isFolded && !container ? { folded: true as const } : {}),
    degree,
    ...(!onScreen && shown ? { onScreen: false as const } : {}),
    ...(!shown ? { shown: false as const } : {}),
    ...(data !== undefined ? { data } : {}),
  }
}

export function edgeElement(
  reader: ElementReader,
  frame: Frame,
  index: number,
  labels: Labels | null,
): AgentEdge {
  const { nodes, edges } = frame.shot.scene
  const states = frame.shot.states
  const key = edges.keys[index] as Key
  const label = edges.label[index] || undefined
  const drawn = labels?.edges.get(index)
  const look = edgeLook(edges, states, index, frame.zoom)
  const base = edges.opacity[index] ?? 1
  const members = reader.internals.edgeMembers(index)
  const shown = frame.shown('edge', index)
  const onScreen = frame.edgesOn[index] === 1
  const data = described(reader, 'edge', index, key)
  return {
    kind: 'edge',
    key: readKey(key),
    from: readKey(nodes.keys[edges.source[index] ?? 0]),
    to: readKey(nodes.keys[edges.target[index] ?? 0]),
    ...(label !== undefined ? { label } : {}),
    ...(label !== undefined && labels && onScreen ? { labelShown: drawn !== undefined } : {}),
    ...(drawn !== undefined && drawn !== label ? { labelDrawn: drawn } : {}),
    ...(label !== undefined && labels && onScreen && drawn === undefined
      ? {
          labelHidden: hiddenReason(
            labels.edgeRefused,
            index,
            labels.nodes.size + labels.edges.size,
          ),
        }
      : {}),
    look: {
      color: frame.hex(look.stroke),
      width: rounded(Math.max(look.strokeWidth, 0.5), 2),
      opacity: rounded(look.opacity, 2),
      ...(look.opacity < base - 1e-6 ? { dimmed: true as const } : {}),
    },
    states: frame.stateNames(states.edgeMask[index] ?? 0),
    ...(members && members.length > 1 ? { merged: members.length } : {}),
    ...(!onScreen && shown ? { onScreen: false as const } : {}),
    ...(!shown ? { shown: false as const } : {}),
    ...(data !== undefined ? { data } : {}),
  }
}

export function shapeElement(reader: ElementReader, frame: Frame, index: number): AgentShape {
  const { shapes } = frame.shot.scene
  const key = shapes.keys[index] as Key
  const label = shapes.labels?.text[index] || undefined
  const data = described(reader, 'shape', index, key)
  return {
    kind: 'shape',
    key: readKey(key),
    ...(label !== undefined ? { label } : {}),
    states: frame.stateNames(frame.shot.states.shapeMask[index] ?? 0),
    ...(!frame.shown('shape', index) ? { shown: false as const } : {}),
    ...(data !== undefined ? { data } : {}),
  }
}
