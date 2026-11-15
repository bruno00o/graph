import type { GraphModel } from '../core/graph-model'
import type { Hierarchy } from '../core/hierarchy'
import { type AnyIssue, describeIssues, IssueSet } from '../core/issues'
import type { LayerFilter } from '../core/mark-layers'
import type { Projection } from '../core/projection'
import type { Scene } from '../core/scene'
import type { HideFilter, StateBuffers } from '../core/state-buffers'
import type { SupportIndex } from '../core/support'
import type { TimeFilter } from '../core/time-range'
import {
  edgeHalfHidden,
  edgeShown,
  filtered,
  nodeShown,
  type Sight,
  shapeShown,
} from '../core/visibility'
import { dev } from '../dev'
import type { Key } from '../types'
import { countAlive } from './element-keys'
import type { ElementKeys, Emitter } from './events'
import type { GraphCount } from './graph-instance'

interface CountKey {
  readonly scene: number
  readonly zoom: number
  readonly time: TimeFilter | null
  readonly layers: LayerFilter | null
  readonly hide: HideFilter | null
  readonly masks: number
  readonly shapes: number
}

function sameCountKey(a: CountKey, b: CountKey): boolean {
  return (
    a.scene === b.scene &&
    a.zoom === b.zoom &&
    a.time === b.time &&
    a.layers === b.layers &&
    a.hide === b.hide &&
    a.masks === b.masks &&
    a.shapes === b.shapes
  )
}

export interface ReadSource {
  readonly model: GraphModel
  readonly projection: Projection
  readonly hierarchy: Hierarchy
  readonly support: SupportIndex
  readonly scene: Scene
  readonly buffers: StateBuffers
  readonly emitter: Emitter
}

export function forEachEdgeKey(
  projection: Projection,
  keys: readonly (Key | undefined)[],
  index: number,
  seen: Sight,
  visit: (key: Key) => void,
): void {
  const members = projection.keysAt(index)
  if (!members) {
    const key = keys[index]
    if (key !== undefined) visit(key)
    return
  }
  if (seen.hide !== null && projection.halvedAt(index)) {
    if (!edgeHalfHidden(index, 'target', seen))
      for (const key of projection.keysAt(index, 'target') ?? []) visit(key)
    if (!edgeHalfHidden(index, 'source', seen))
      for (const key of projection.keysAt(index, 'source') ?? []) visit(key)
    return
  }
  for (const key of members) visit(key)
}

export class DataReads {
  readonly #issues = new IssueSet()
  #issuesAt = 0
  #countKey: CountKey | null = null
  #lastCount: GraphCount | null = null
  #shownKey: CountKey | null = null
  #drawnShapes: { readonly version: number; readonly set: Uint8Array } | null = null
  #lastShown: ElementKeys | null = null
  #counted = -1
  #alive = { nodes: 0, edges: 0 }
  readonly #source: ReadSource

  constructor(source: ReadSource) {
    this.#source = source
  }

  get issues(): readonly AnyIssue[] {
    return this.#issues.list
  }

  refreshIssues(): void {
    const { model, hierarchy, support, scene } = this.#source
    const version =
      model.issueVersion + hierarchy.issueVersion + support.issueVersion + scene.shapes.issueVersion
    if (version === this.#issuesAt) return
    this.#issuesAt = version
    const found: AnyIssue[] = []
    model.collectIssues(found)
    hierarchy.collectIssues(found)
    support.collectIssues(found)
    scene.shapes.collectIssues(found)
    const added = this.#issues.refresh(found)
    if (!added) return
    if (dev && added.length > 0) console.warn(describeIssues(added))
    this.#source.emitter.emit('issueschange', { issues: this.#issues.list })
  }

  #keyOf(seen: Sight, sceneVersion: number): CountKey {
    const { scene, buffers } = this.#source
    const nodes = scene.nodes
    const edges = scene.edges
    const shapes = scene.shapes
    return {
      scene: sceneVersion,
      zoom: nodes.zoom.count > 0 || edges.zoom.count > 0 || shapes.zoom.count > 0 ? seen.zoom : 0,
      time: seen.time,
      layers: seen.layers,
      hide: seen.hide,
      masks: seen.hide
        ? buffers.nodeMaskVersion + buffers.edgeMaskVersion + buffers.shapeMaskVersion
        : 0,
      shapes: shapes.styleVersion,
    }
  }

  shown(seen: Sight, sceneVersion: number): ElementKeys {
    const key = this.#keyOf(seen, sceneVersion)
    const last = this.#lastShown
    if (last && this.#shownKey && sameCountKey(this.#shownKey, key)) return last
    const { scene, projection } = this.#source
    const { nodes, edges, shapes } = scene
    const allNodes = !filtered(nodes, seen)
    const nodeKeys: Key[] = []
    for (let index = 0; index < nodes.capacity; index++) {
      if (nodes.alive[index] !== 1 || !(allNodes || nodeShown(nodes, index, seen))) continue
      const nodeKey = nodes.keys[index]
      if (nodeKey !== undefined) nodeKeys.push(nodeKey)
    }
    const allEdges = allNodes && !filtered(edges, seen)
    const edgeKeys: Key[] = []
    const visit = (edgeKey: Key) => {
      edgeKeys.push(edgeKey)
    }
    const merged = projection.active
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1 || !(allEdges || edgeShown(nodes, edges, index, seen))) continue
      if (merged) forEachEdgeKey(projection, edges.keys, index, seen, visit)
      else {
        const edgeKey = edges.keys[index]
        if (edgeKey !== undefined) edgeKeys.push(edgeKey)
      }
    }
    const result: ElementKeys = shapes.marked
      ? Object.freeze({
          nodes: Object.freeze(nodeKeys),
          edges: Object.freeze(edgeKeys),
          shapes: Object.freeze(this.#shownShapeKeys(seen)),
        })
      : Object.freeze({ nodes: Object.freeze(nodeKeys), edges: Object.freeze(edgeKeys) })
    this.#shownKey = key
    this.#lastShown = result
    return result
  }

  isShown(kind: 'node' | 'edge' | 'shape', key: Key, seen: Sight): boolean {
    const { model, scene, projection } = this.#source
    if (kind === 'node') {
      const index = model.node(key)?.index ?? -1
      return index >= 0 && scene.nodes.alive[index] === 1 && nodeShown(scene.nodes, index, seen)
    }
    if (kind === 'shape') {
      const index = model.shape(key)?.index ?? -1
      return index >= 0 && this.#shapeDrawn(index) && shapeShown(scene.shapes, index, seen)
    }
    const index = projection.edgeIndexOf(key)
    if (index < 0 || scene.edges.alive[index] !== 1) return false
    if (!edgeShown(scene.nodes, scene.edges, index, seen)) return false
    if (seen.hide === null || !projection.halvedAt(index)) return true
    const forward = projection.keysAt(index, 'target') ?? []
    return !edgeHalfHidden(index, forward.includes(key) ? 'target' : 'source', seen)
  }

  #shapeDrawn(index: number): boolean {
    const shapes = this.#source.scene.shapes
    if (this.#drawnShapes?.version !== this.#source.scene.shapes.version) {
      const set = new Uint8Array(shapes.capacity)
      for (const at of shapes.drawOrder()) set[at] = 1
      this.#drawnShapes = { version: shapes.version, set }
    }
    return this.#drawnShapes.set[index] === 1
  }

  #shownShapeKeys(seen: Sight): Key[] {
    const shapes = this.#source.scene.shapes
    const all = !filtered(shapes, seen) && shapes.pinCount === 0
    const keys: Key[] = []
    for (const index of shapes.drawOrder()) {
      if (!all && !shapeShown(shapes, index, seen)) continue
      const shapeKey = shapes.keys[index]
      if (shapeKey !== undefined) keys.push(shapeKey)
    }
    return keys
  }

  count(seen: Sight, sceneVersion: number): GraphCount {
    const { model, scene } = this.#source
    const nodes = scene.nodes
    const edges = scene.edges
    const shapes = scene.shapes
    const key = this.#keyOf(seen, sceneVersion)
    const last = this.#lastCount
    if (last && this.#countKey && sameCountKey(this.#countKey, key)) return last
    const allNodes = !filtered(nodes, seen)
    let shownNodes = 0
    for (let index = 0; index < nodes.capacity; index++) {
      if (nodes.alive[index] === 1 && (allNodes || nodeShown(nodes, index, seen))) shownNodes++
    }
    const allEdges = allNodes && !filtered(edges, seen)
    let shownEdges = 0
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] === 1 && (allEdges || edgeShown(nodes, edges, index, seen))) {
        shownEdges++
      }
    }
    this.#countKey = key
    const count: GraphCount = shapes.marked
      ? Object.freeze({
          nodes: model.nodeCount,
          edges: model.edgeCount,
          pending: model.pendingCount,
          shapes: model.shapeCount - shapes.pendingCount,
          pendingShapes: shapes.pendingCount,
          shown: Object.freeze({
            nodes: shownNodes,
            edges: shownEdges,
            shapes: this.#shownShapes(seen),
          }),
        })
      : Object.freeze({
          nodes: model.nodeCount,
          edges: model.edgeCount,
          pending: model.pendingCount,
          shown: Object.freeze({ nodes: shownNodes, edges: shownEdges }),
        })
    this.#lastCount = count
    return count
  }

  #shownShapes(seen: Sight): number {
    const shapes = this.#source.scene.shapes
    const order = shapes.drawOrder()
    if (!filtered(shapes, seen) && shapes.pinCount === 0) return order.length
    let shown = 0
    for (const index of order) if (shapeShown(shapes, index, seen)) shown++
    return shown
  }

  alive(sceneVersion: number): { readonly nodes: number; readonly edges: number } {
    if (this.#counted !== sceneVersion) {
      const scene = this.#source.scene
      this.#counted = sceneVersion
      this.#alive = {
        nodes: countAlive(scene.nodes.alive, scene.nodes.capacity),
        edges: countAlive(scene.edges.alive, scene.edges.capacity),
      }
    }
    return this.#alive
  }
}
