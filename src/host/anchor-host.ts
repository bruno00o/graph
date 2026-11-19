import { containerShape } from '../core/columns'
import type { EdgePaths } from '../core/edge-paths'
import { type GlobeCamera, globeScale, globeScreen } from '../core/globe'
import type { GraphModel } from '../core/graph-model'
import type { ContainerSource } from '../core/hull-layer'
import { halfWidthOf, isBox, nodeUnit } from '../core/node-shape'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import { isBuiltInState } from '../core/state-names'
import { edgeShown, nodeShown, type Sight } from '../core/visibility'
import type { GraphDefinition, Key, Point, View } from '../types'
import { type EdgeAnchor, edgeAnchor } from '../webgl/label-layer'
import { type AnchorBox, AnchorLayer, type GraphAnchors } from './anchors'
import { stateNodes } from './decorations'
import type { GraphState } from './graph-instance'
import type { StateRegistry } from './state-registry'

export interface AnchorContext {
  readonly element: HTMLElement
  readonly canvas: () => HTMLCanvasElement
  readonly model: GraphModel
  readonly scene: Scene
  readonly positions: Positions
  readonly registry: StateRegistry
  readonly state: () => GraphState
  readonly sight: () => Sight
  readonly request: () => void
  readonly definition: () => GraphDefinition
  readonly containers: () => ContainerSource | null
  readonly edgeIndex: (key: Key) => number
  readonly paths?: EdgePaths
  readonly sphere?: () => GlobeCamera | null
}

export interface AnchorHost {
  readonly anchors: GraphAnchors
  place(): void
  destroy(): void
}

export function createAnchorHost(context: AnchorContext): AnchorHost {
  const { model, scene, positions, registry } = context
  const screenPoint = { x: 0, y: 0 }
  const edgePoint: EdgeAnchor = { x: 0, y: 0, ax: 0, ay: 0, room: 0 }

  function view(): View {
    return context.state().view
  }

  const layer = new AnchorLayer(
    context.element,
    context.canvas,
    {
      size: () => context.state(),
      nodeBox(key: Key, box: AnchorBox): boolean {
        const record = model.node(key)
        const nodes = scene.nodes
        if (!record || nodes.alive[record.index] !== 1) return false
        const index = record.index
        if (!nodeShown(nodes, index, context.sight())) return false
        const globe = context.sphere?.() ?? null
        const x0 = positions.x(index)
        const y0 = positions.y(index)
        let x: number
        let y: number
        let zoom: number
        if (globe) {
          if (globeScreen(globe, x0, y0, screenPoint) < 0) return false
          x = screenPoint.x
          y = screenPoint.y
          zoom = globeScale(globe, y0)
        } else {
          const { width, height } = context.state()
          const current = view()
          x = (x0 - current.x) * current.zoom + width / 2
          y = (y0 - current.y) * current.zoom + height / 2
          zoom = current.zoom
        }
        const boxes = nodes.shape[index] === containerShape ? context.containers()?.boxes : null
        const size = nodes.size[index] ?? 0
        const outline = nodes.outlineWidth[index] ?? 0
        const radius = (nodes.screenUnits[index] === 1 ? size / 2 : (size / 2) * zoom) + outline
        const halfWidth = boxes
          ? (boxes[index * 4] ?? 0) * zoom
          : isBox(nodes, index)
            ? halfWidthOf(nodes, index) * nodeUnit(nodes, index, zoom) + outline
            : radius
        const halfHeight = boxes ? (boxes[index * 4 + 1] ?? 0) * zoom : radius
        box.x0 = x - halfWidth
        box.x1 = x + halfWidth
        box.y0 = y - halfHeight
        box.y1 = y + halfHeight
        box.scale = zoom
        return true
      },
      edgePoint(key: Key, box: AnchorBox): boolean {
        const index = context.edgeIndex(key)
        if (index < 0 || scene.edges.alive[index] !== 1) return false
        if (!edgeShown(scene.nodes, scene.edges, index, context.sight())) return false
        const { width, height } = context.state()
        const frame = {
          nodes: scene.nodes,
          edges: scene.edges,
          positions,
          view: view(),
          width,
          height,
          paths: context.paths ?? null,
          globe: context.sphere?.() ?? null,
        }
        if (!edgeAnchor(frame, index, edgePoint)) return false
        box.x0 = box.x1 = edgePoint.x
        box.y0 = box.y1 = edgePoint.y
        box.scale = frame.globe
          ? globeScale(
              frame.globe,
              (positions.y(scene.edges.source[index] ?? 0) +
                positions.y(scene.edges.target[index] ?? 0)) /
                2,
            )
          : frame.view.zoom
        return true
      },
      worldPoint(point: Point, box: AnchorBox): boolean {
        const globe = context.sphere?.() ?? null
        if (globe) {
          if (globeScreen(globe, point.x, point.y, screenPoint) < 0) return false
          box.x0 = box.x1 = screenPoint.x
          box.y0 = box.y1 = screenPoint.y
          box.scale = globeScale(globe, point.y)
          return true
        }
        const { width, height } = context.state()
        const current = view()
        box.x0 = box.x1 = (point.x - current.x) * current.zoom + width / 2
        box.y0 = box.y1 = (point.y - current.y) * current.zoom + height / 2
        box.scale = current.zoom
        return true
      },
      stateNodes: (name) => stateNodes(context.state(), name),
      inState: (name, kind, key) => registry.has(name, kind, key),
      checkState(name: string): void {
        if (isBuiltInState(name) || Object.hasOwn(context.definition().states, name)) return
        throw new Error(`graph: unknown state "${name}"`)
      },
    },
    context.request,
  )

  return {
    anchors: {
      set: (element, options) => layer.set(element, options),
      remove: (element) => layer.remove(element),
    },
    place() {
      layer.update()
    },
    destroy() {
      layer.destroy()
    },
  }
}
