import { type GridInput, gridInput } from '../core/background-grid'
import { containerShape } from '../core/columns'
import type { EdgePaths } from '../core/edge-paths'
import type { GraphModel } from '../core/graph-model'
import { type ContainerSource, HullLayer } from '../core/hull-layer'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import { isBuiltInState } from '../core/state-names'
import { detailStep, edgeShown } from '../core/zoom-range'
import type { GraphDefinition, Key, View } from '../types'
import { type EdgeAnchor, edgeAnchor } from '../webgl/label-layer'
import { type AnchorBox, AnchorLayer, type GraphAnchors } from './anchors'
import type { GraphState } from './mount-graph'
import type { StateRegistry } from './state-registry'

const hullBudget = 6
const noKeys: readonly Key[] = []

export interface DecorationContext {
  readonly element: HTMLElement
  readonly canvas: HTMLCanvasElement
  readonly model: GraphModel
  readonly scene: Scene
  readonly positions: Positions
  readonly registry: StateRegistry
  readonly state: () => GraphState
  readonly request: () => void
  readonly containers: () => ContainerSource | null
  readonly edgeIndex: (key: Key) => number
  readonly paths?: EdgePaths
}

export interface Decorations {
  readonly anchors: GraphAnchors
  readonly hulls: HullLayer
  grid: GridInput | null
  setDefinition(definition: GraphDefinition): void
  changed(): void
  prepare(): void
  settle(): void
  place(): void
  destroy(): void
}

export function createDecorations(context: DecorationContext): Decorations {
  const { model, scene, positions, registry } = context
  let definition: GraphDefinition | null = null
  const hulls = new HullLayer()
  const edgePoint: EdgeAnchor = { x: 0, y: 0, ax: 0, ay: 0, room: 0 }

  function source() {
    const zoom = view().zoom
    return {
      model,
      nodes: scene.nodes,
      zoom,
      detail: detailStep(scene.nodes, scene.edges, zoom),
      positions,
      palette: scene.palette,
      containers: context.containers(),
      stateNodes,
    }
  }

  function view(): View {
    return context.state().view
  }

  function stateNodes(name: string): readonly Key[] {
    const state = context.state()
    if (name === 'selected') return state.selection.nodes
    if (name === 'hovered' || name === 'focused') {
      const target = name === 'hovered' ? state.hovered : state.focused
      return target?.kind === 'node' ? [target.key] : noKeys
    }
    return (
      (state.states as Readonly<Record<string, { readonly nodes: readonly Key[] }>>)[name]?.nodes ??
      noKeys
    )
  }

  const layer = new AnchorLayer(
    context.element,
    context.canvas,
    {
      view,
      size: () => context.state(),
      nodeBox(key: Key, box: AnchorBox): boolean {
        const record = model.node(key)
        const nodes = scene.nodes
        if (!record || nodes.alive[record.index] !== 1) return false
        const index = record.index
        const { width, height } = context.state()
        const current = view()
        if (!nodes.zoom.shown(index, current.zoom)) return false
        const boxes = nodes.shape[index] === containerShape ? context.containers()?.boxes : null
        const size = nodes.size[index] ?? 0
        const radius =
          (nodes.screenUnits[index] === 1 ? size / 2 : (size / 2) * current.zoom) +
          (nodes.outlineWidth[index] ?? 0)
        const halfWidth = boxes ? (boxes[index * 4] ?? 0) * current.zoom : radius
        const halfHeight = boxes ? (boxes[index * 4 + 1] ?? 0) * current.zoom : radius
        const x = (positions.x(index) - current.x) * current.zoom + width / 2
        const y = (positions.y(index) - current.y) * current.zoom + height / 2
        box.x0 = x - halfWidth
        box.x1 = x + halfWidth
        box.y0 = y - halfHeight
        box.y1 = y + halfHeight
        return true
      },
      edgePoint(key: Key, box: AnchorBox): boolean {
        const index = context.edgeIndex(key)
        if (index < 0 || scene.edges.alive[index] !== 1) return false
        if (!edgeShown(scene.nodes, scene.edges, index, view().zoom)) return false
        const { width, height } = context.state()
        const frame = {
          nodes: scene.nodes,
          edges: scene.edges,
          positions,
          view: view(),
          width,
          height,
          paths: context.paths ?? null,
        }
        if (!edgeAnchor(frame, index, edgePoint)) return false
        box.x0 = box.x1 = edgePoint.x
        box.y0 = box.y1 = edgePoint.y
        return true
      },
      stateNodes,
      inState: (name, kind, key) => registry.has(name, kind, key),
      checkState(name: string): void {
        if (isBuiltInState(name) || (definition && Object.hasOwn(definition.states, name))) return
        throw new Error(`graph: unknown state "${name}"`)
      },
    },
    context.request,
  )

  const decorations: Decorations = {
    anchors: {
      set: (element, options) => layer.set(element, options),
      remove: (element) => layer.remove(element),
    },
    hulls,
    grid: null,
    setDefinition(next) {
      definition = next
      hulls.setHulls(next.hulls)
      decorations.grid = gridInput(next.background, scene.palette)
    },
    changed() {
      hulls.changed()
    },
    prepare() {
      if (hulls.empty && hulls.count === 0) return
      const start = performance.now()
      if (hulls.update(source(), start + hullBudget, () => performance.now())) context.request()
    },
    settle() {
      hulls.update(source(), Number.POSITIVE_INFINITY, () => 0)
    },
    place() {
      layer.update()
    },
    destroy() {
      layer.destroy()
    },
  }
  return decorations
}
