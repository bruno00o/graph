import type { GraphModel } from '../core/graph-model'
import type { Hierarchy } from '../core/hierarchy'
import { type AnyIssue, describeIssues, IssueSet } from '../core/issues'
import type { LayerFilter } from '../core/mark-layers'
import type { Scene } from '../core/scene'
import type { HideFilter, StateBuffers } from '../core/state-buffers'
import type { SupportIndex } from '../core/support'
import type { TimeFilter } from '../core/time-range'
import { edgeShown, filtered, nodeShown, type Sight } from '../core/visibility'
import { dev } from '../dev'
import { countAlive } from './element-keys'
import type { Emitter } from './events'
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
  readonly hierarchy: Hierarchy
  readonly support: SupportIndex
  readonly scene: Scene
  readonly buffers: StateBuffers
  readonly emitter: Emitter
}

export class DataReads {
  readonly #issues = new IssueSet()
  #issuesAt = 0
  #countKey: CountKey | null = null
  #lastCount: GraphCount | null = null
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

  count(seen: Sight, sceneVersion: number): GraphCount {
    const { model, scene, buffers } = this.#source
    const nodes = scene.nodes
    const edges = scene.edges
    const key: CountKey = {
      scene: sceneVersion,
      zoom: nodes.zoom.count > 0 || edges.zoom.count > 0 ? seen.zoom : 0,
      time: seen.time,
      layers: seen.layers,
      hide: seen.hide,
      masks: seen.hide ? buffers.nodeMaskVersion + buffers.edgeMaskVersion : 0,
      shapes: scene.shapes.version,
    }
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
    const shapes = scene.shapes
    const count: GraphCount = shapes.marked
      ? Object.freeze({
          nodes: model.nodeCount,
          edges: model.edgeCount,
          pending: model.pendingCount,
          shapes: model.shapeCount,
          shown: Object.freeze({
            nodes: shownNodes,
            edges: shownEdges,
            shapes: shapes.drawOrder().length,
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
