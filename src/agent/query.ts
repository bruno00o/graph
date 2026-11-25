import { containerShape } from '../core/columns'
import { readGroupKey } from '../core/group-index'
import type { GraphCore } from '../host/graph-instance'
import type { GraphInternals } from '../host/internals'
import type { Key, PathDirection } from '../types'
import { folded, writeKey } from './keys'
import {
  degrees,
  type ElementReader,
  edgeElement,
  type Frame,
  type Labels,
  nodeElement,
  shapeElement,
} from './read'
import type { AgentElement, AgentElementKind, AgentQueryOptions, AgentQueryResult } from './types'

const page = 50
const kinds = new Set(['node', 'edge', 'shape', 'group'])
const directions = new Set<PathDirection>(['both', 'forward', 'backward'])

class KindTexts {
  labels: (string | undefined)[] = []
  keys: (string | undefined)[] = []
}

export class TextCache {
  #stamp = -1
  #kinds: Record<AgentElementKind, KindTexts> = {
    node: new KindTexts(),
    edge: new KindTexts(),
    shape: new KindTexts(),
  }

  refresh(stamp: number): void {
    if (stamp === this.#stamp) return
    this.#stamp = stamp
    this.#kinds = { node: new KindTexts(), edge: new KindTexts(), shape: new KindTexts() }
  }

  rank(
    kind: AgentElementKind,
    index: number,
    label: string | null | undefined,
    key: Key | undefined,
    wanted: string,
  ): number {
    const texts = this.#kinds[kind]
    let text = texts.labels[index]
    if (text === undefined) {
      text = label ? folded(label) : ''
      texts.labels[index] = text
    }
    let name = texts.keys[index]
    if (name === undefined) {
      name = key === undefined ? '' : folded(String(key))
      texts.keys[index] = name
    }
    if (text.startsWith(wanted) || name.startsWith(wanted)) return 0
    if (text.includes(wanted) || name.includes(wanted)) return 1
    return -1
  }
}

interface Scope {
  node?(index: number, key: Key): boolean
  edge?(index: number, key: Key): boolean
  shape?(index: number, key: Key): boolean
}

function asSet(keys: readonly Key[] | undefined): Set<Key> {
  return new Set(keys ?? [])
}

function descendants(graph: GraphCore, root: Key): Set<Key> {
  const out = new Set<Key>()
  const queue: Key[] = [root]
  for (let at = 0; at < queue.length; at++) {
    for (const child of graph.groups.children(queue[at] as Key)) {
      if (out.has(child)) continue
      out.add(child)
      queue.push(child)
    }
  }
  return out
}

function withinScope(
  graph: GraphCore,
  internals: GraphInternals,
  frame: Frame,
  within: unknown,
): Scope | null {
  if (within === undefined) return null
  const { nodes, edges, shapes } = frame.shot.scene
  if (within === 'view') {
    return {
      node: (index) => frame.onScreen[index] === 1,
      edge: (index) => frame.edgesOn[index] === 1,
      shape: () => false,
    }
  }
  if (within === 'shown') {
    return {
      node: (index) => frame.shown('node', index),
      edge: (index) => frame.shown('edge', index),
      shape: (index) => frame.shown('shape', index),
    }
  }
  const state = graph.store.state
  const keysScope = (keys: {
    readonly nodes: readonly Key[]
    readonly edges: readonly Key[]
    readonly shapes?: readonly Key[] | undefined
  }): Scope => {
    const inNodes = asSet(keys.nodes)
    const inEdges = asSet(keys.edges)
    const inShapes = asSet(keys.shapes)
    return {
      node: (_, key) => inNodes.has(key),
      edge: (index, key) =>
        inEdges.has(key) ||
        (internals.edgeMembers(index)?.some((each) => inEdges.has(each)) ?? false),
      shape: (_, key) => inShapes.has(key),
    }
  }
  if (within === 'selection') return keysScope(state.selection)
  if (typeof within === 'string') {
    const members = (state.states as Readonly<Record<string, typeof state.selection>>)[within]
    if (members) return keysScope(members)
    const layers = frame.shot.scene.markLayers
    const layer = layers.names.indexOf(within)
    if (layer >= 0) {
      return {
        node: (index) => layers.nodeLayers[nodes.slot[index] ?? 0] === layer,
        edge: (index) => layers.edgeLayers[edges.slot[index] ?? 0] === layer,
        shape: (index) => layers.shapeLayers[shapes.slot[index] ?? 0] === layer,
      }
    }
  }
  const group = writeKey(graph, within)
  if (group !== null && internals.indexOf('nodes', group) >= 0) {
    const inside = descendants(graph, group)
    if (inside.size > 0) {
      return {
        node: (_, key) => inside.has(key),
        edge: (index) =>
          inside.has(nodes.keys[edges.source[index] ?? 0] as Key) &&
          inside.has(nodes.keys[edges.target[index] ?? 0] as Key),
        shape: () => false,
      }
    }
  }
  const names = [
    'view',
    'shown',
    'selection',
    ...Object.keys(state.states),
    ...frame.shot.scene.markLayers.names,
  ]
  throw new Error(
    `within ${JSON.stringify(within)} is neither ${names.map((name) => `"${name}"`).join(', ')}, nor the key of a group drawn with members`,
  )
}

function nearScope(graph: GraphCore, frame: Frame, request: AgentQueryOptions): Scope | null {
  if (request.near === undefined) return null
  const center = writeKey(graph, request.near)
  if (center === null) throw new Error(`near: cannot read the key ${JSON.stringify(request.near)}`)
  const depth = request.depth ?? 1
  if (!Number.isFinite(depth) || depth < 0)
    throw new RangeError('depth must be a number, 0 or more')
  const direction = request.direction ?? 'both'
  if (!directions.has(direction)) {
    throw new TypeError(
      `direction must be "both", "forward" or "backward", not "${String(direction)}"`,
    )
  }
  const options = { maxCost: depth, direction, visible: true }
  let reach = graph.paths.reach(center, options)
  if (reach.nodes.length === 0 && typeof center === 'string' && Number.isFinite(Number(center))) {
    reach = graph.paths.reach(Number(center), options)
  }
  if (reach.nodes.length === 0) {
    throw new Error(
      `near: unknown node ${JSON.stringify(request.near)}; call query with text first`,
    )
  }
  const around = new Set(reach.nodes)
  const { nodes, edges } = frame.shot.scene
  return {
    node: (_, key) => around.has(key),
    edge: (index) =>
      around.has(nodes.keys[edges.source[index] ?? 0] as Key) &&
      around.has(nodes.keys[edges.target[index] ?? 0] as Key),
    shape: () => false,
  }
}

function isGroup(frame: Frame, folded: ReadonlySet<Key>, index: number, key: Key): boolean {
  return (
    frame.shot.scene.nodes.shape[index] === containerShape ||
    folded.has(key) ||
    readGroupKey(key) !== null
  )
}

export function query(
  graph: GraphCore,
  internals: GraphInternals,
  reader: ElementReader,
  frame: Frame,
  texts: TextCache,
  request: AgentQueryOptions,
): AgentQueryResult {
  const kind = request.kind
  if (kind !== undefined && !kinds.has(kind)) {
    throw new TypeError(`kind must be "node", "edge", "shape" or "group", not "${String(kind)}"`)
  }
  const from = request.from ?? 0
  if (!Number.isInteger(from) || from < 0)
    throw new RangeError('from must be an integer, 0 or more')
  const within = withinScope(graph, internals, frame, request.within)
  const near = nearScope(graph, frame, request)
  const wanted = request.text ? folded(request.text) : null
  if (wanted !== null) texts.refresh(internals.stamp().scene)
  const first: [AgentElementKind, number][] = []
  const later: [AgentElementKind, number][] = []
  const { nodes, edges, shapes } = frame.shot.scene
  const consider = (
    type: AgentElementKind,
    index: number,
    key: Key | undefined,
    label: string | null | undefined,
  ) => {
    if (key === undefined) return
    if (type === 'node' && kind === 'group' && !isGroup(frame, reader.folded, index, key)) return
    if (within && !(within[type]?.(index, key) ?? false)) return
    if (near && !(near[type]?.(index, key) ?? false)) return
    if (wanted === null) {
      first.push([type, index])
      return
    }
    const rank = texts.rank(type, index, label, key, wanted)
    if (rank === 0) first.push([type, index])
    else if (rank === 1) later.push([type, index])
  }
  if (kind === undefined || kind === 'node' || kind === 'group') {
    for (let index = 0; index < nodes.capacity; index++) {
      if (nodes.alive[index] === 1) consider('node', index, nodes.keys[index], nodes.label[index])
    }
  }
  if (kind === undefined || kind === 'edge') {
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] === 1) consider('edge', index, edges.keys[index], edges.label[index])
    }
  }
  if (kind === undefined || kind === 'shape') {
    const text = shapes.labels?.text
    for (let index = 0; index < shapes.capacity; index++) {
      if (shapes.alive[index] === 1) consider('shape', index, shapes.keys[index], text?.[index])
    }
  }
  const total = first.length + later.length
  const chosen = [...first.slice(from, from + page)]
  if (chosen.length < page) {
    const start = Math.max(0, from - first.length)
    chosen.push(...later.slice(start, start + page - chosen.length))
  }
  const listed = chosen.filter(([type]) => type === 'node').map(([, index]) => index)
  const degree = degrees(frame, listed)
  const wantsLabels = chosen.some(([type, index]) =>
    type === 'node'
      ? frame.onScreen[index] === 1 && Boolean(nodes.label[index])
      : type === 'edge' && frame.edgesOn[index] === 1 && Boolean(edges.label[index]),
  )
  const labels: Labels | null = wantsLabels ? frame.labels() : null
  const items: AgentElement[] = chosen.map(([type, index]) =>
    type === 'node'
      ? nodeElement(reader, frame, index, degree.get(index) ?? 0, labels)
      : type === 'edge'
        ? edgeElement(reader, frame, index, labels)
        : shapeElement(reader, frame, index),
  )
  return { total, from, items, truncated: from + items.length < total }
}
