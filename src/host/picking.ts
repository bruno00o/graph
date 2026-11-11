import type { EdgePaths } from '../core/edge-paths'
import { globeScale, globeWorld } from '../core/globe'
import type { Endpoints, GraphModel } from '../core/graph-model'
import type { LayerFilter } from '../core/mark-layers'
import { PickIndex, type PickSource } from '../core/pick-index'
import type { Positions } from '../core/positions'
import type { Projection } from '../core/projection'
import type { Scene } from '../core/scene'
import type { ShapePicker } from '../core/shape-engine'
import type { StateBuffers, StateKind } from '../core/state-buffers'
import type { TimeFilter } from '../core/time-range'
import { toWorld } from '../core/view'
import { nodeShown, type Sight, shapeShown } from '../core/visibility'
import type { Key, Point } from '../types'
import type { HostCamera } from './camera'
import type { ContainerBoxes } from './containers'
import type { GraphTarget } from './events'

const pickTolerance = 4
const movingPickInterval = 150
const pickCostShare = 10
const highlightOrder = 2 ** 40
const layerOrder = 2 ** 26

export interface PickerSource {
  readonly scene: Scene
  readonly model: GraphModel
  readonly positions: Positions
  readonly buffers: StateBuffers
  readonly projection: Projection
  readonly containers: ContainerBoxes
  readonly paths: EdgePaths
  readonly camera: HostCamera
  layerPosition(kind: StateKind, index: number): number
  viewport(): { width: number; height: number }
  timeFilter(): TimeFilter | null
  layerFilter(): LayerFilter | null
  syncContainers(): void
  sceneVersion(): number
  dragging(): boolean
  moving(): boolean
}

export class HostPicker {
  readonly #index = new PickIndex()
  readonly #pickSource: PickSource
  #scene = -1
  #positions = -1
  #paths = 0
  #at = Number.NEGATIVE_INFINITY
  #cost = 0
  #shapes: ShapePicker | null = null
  readonly #source: PickerSource

  constructor(source: PickerSource) {
    this.#source = source
    const buffers = source.buffers
    this.#pickSource = {
      nodes: source.scene.nodes,
      edges: source.scene.edges,
      positions: source.positions,
      order: (kind, index, end) => {
        const mask =
          kind === 'nodes'
            ? (buffers.nodeMask[index] ?? 0)
            : end
              ? buffers.halfMask(index, end)
              : (buffers.edgeMask[index] ?? 0)
        const raised = (mask & buffers.raised(kind)) !== 0
        return (
          (raised ? highlightOrder : 0) + source.layerPosition(kind, index) * layerOrder + index
        )
      },
      paths: source.paths,
    }
  }

  #later(): boolean {
    const source = this.#source
    if (!source.moving()) return false
    if (this.#scene !== source.sceneVersion() || this.#paths !== source.paths.version) return false
    return performance.now() - this.#at < Math.max(movingPickInterval, this.#cost * pickCostShare)
  }

  pick(point: Point, hover = false): GraphTarget | null {
    const source = this.#source
    const { scene, positions, paths, projection, camera } = source
    source.syncContainers()
    const current = !source.dragging() && !(hover && this.#later())
    const started = performance.now()
    if (current && this.#paths !== paths.version) {
      this.#index.build(this.#pickSource)
      this.#paths = paths.version
      this.#scene = source.sceneVersion()
      this.#positions = positions.version
      this.#at = performance.now()
      this.#cost = this.#at - started
    } else if (
      current &&
      (this.#scene !== source.sceneVersion() || this.#positions !== positions.version)
    ) {
      this.#index.refresh(this.#pickSource)
      this.#scene = source.sceneVersion()
      this.#positions = positions.version
      this.#at = performance.now()
      this.#cost = this.#at - started
    }
    const globe = camera.sphere()
    const lensView = camera.viewAt(point)
    const world = globe
      ? globeWorld(globe, point.x, point.y)
      : toWorld(lensView, source.viewport(), point)
    if (!world) return null
    const seen: Sight = {
      zoom: lensView.zoom,
      time: source.timeFilter(),
      layers: source.layerFilter(),
      hide: source.buffers.hide,
    }
    const surfaceOf = globe ? { scale: globeScale(globe, world.y), visible: camera.facing } : null
    const hit = this.#index.pick(this.#pickSource, world.x, world.y, seen, pickTolerance, surfaceOf)
    if (!hit) {
      const shown = (index: number) => nodeShown(scene.nodes, index, seen)
      const index = projection.active
        ? source.containers.pick(world.x, world.y, positions, shown)
        : -1
      const key = index >= 0 ? scene.nodes.keys[index] : undefined
      if (key !== undefined) return this.target('node', key)
      return globe ? null : this.#pickShape(world, lensView.zoom, seen)
    }
    if (hit.kind === 'node') {
      const key = scene.nodes.keys[hit.index]
      return key === undefined ? null : this.target('node', key)
    }
    const aggregate = projection.aggregateAt(hit.index)
    const direction =
      aggregate && hit.end && projection.halvedAt(hit.index)
        ? hit.end === 'target'
          ? 'forward'
          : 'backward'
        : null
    const key = direction ? aggregate?.[direction].keys[0] : scene.edges.keys[hit.index]
    if (key === undefined) return null
    const found = this.target('edge', key)
    if (!found || found.kind === 'node') return found
    return {
      ...found,
      ...(hit.end ? { end: hit.end } : {}),
      ...(aggregate ? { aggregate } : {}),
      ...(direction ? { direction } : {}),
    }
  }

  #shapePicker(): ShapePicker | null {
    const shapes = this.#source.scene.shapes
    if (!shapes.any || !shapes.shown || !shapes.engine) return null
    this.#shapes ??= shapes.engine.picker(shapes)
    return this.#shapes
  }

  #pickShape(world: Point, scale: number, seen: Sight): GraphTarget | null {
    const picker = this.#shapePicker()
    if (!picker) return null
    const { scene, buffers } = this.#source
    const shapes = scene.shapes
    const index = picker.pick({
      x: world.x,
      y: world.y,
      scale,
      tolerance: pickTolerance,
      shown: (at) => shapeShown(shapes, at, seen),
      raised: (at) => ((buffers.shapeMask[at] ?? 0) & buffers.shapeRaise) !== 0,
    })
    const key = index >= 0 ? shapes.keys[index] : undefined
    return key === undefined ? null : this.target('shape', key)
  }

  shapesInside(polygon: readonly Point[], seen: Sight): Key[] {
    const picker = this.#shapePicker()
    if (!picker) return []
    const shapes = this.#source.scene.shapes
    const keys: Key[] = []
    for (const index of picker.inside(polygon, (at) => shapeShown(shapes, at, seen))) {
      const key = shapes.keys[index]
      if (key !== undefined) keys.push(key)
    }
    return keys
  }

  drawnEnds(key: Key): Endpoints | undefined {
    const { scene, model, projection } = this.#source
    const index = projection.edgeIndexOf(key)
    if (index >= 0 && scene.edges.alive[index] === 1) {
      const source = scene.nodes.keys[scene.edges.source[index] ?? -1]
      const target = scene.nodes.keys[scene.edges.target[index] ?? -1]
      if (source !== undefined && target !== undefined) return { source, target }
    }
    return model.endpoints(key)
  }

  target(kind: GraphTarget['kind'], key: Key): GraphTarget | null {
    const model = this.#source.model
    if (kind === 'node') {
      const record = model.node(key)
      return record ? { kind, key, datum: record.datum, mark: record.mark.name } : null
    }
    if (kind === 'shape') {
      const record = model.shape(key)
      return record ? { kind, key, datum: record.datum, mark: record.mark.name } : null
    }
    const record = model.edge(key)
    const endpoints = record ? this.drawnEnds(key) : undefined
    return record && endpoints
      ? { kind, key, datum: record.datum, mark: record.mark.name, endpoints }
      : null
  }
}
