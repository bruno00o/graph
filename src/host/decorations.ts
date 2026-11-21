import { type GridInput, gridInput } from '../core/background-grid'
import type { GraphModel } from '../core/graph-model'
import { type ContainerSource, HullLayer } from '../core/hull-layer'
import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import { detailStep, type Sight } from '../core/visibility'
import type { ResolvedDefinition } from '../resolved-definition'
import type { Key } from '../types'
import type { GraphState } from './graph-instance'

const hullBudget = 6
const noKeys: readonly Key[] = []

export interface DecorationContext {
  readonly model: GraphModel
  readonly scene: Scene
  readonly positions: Positions
  readonly state: () => GraphState
  readonly sight: () => Sight
  readonly request: () => void
  readonly containers: () => ContainerSource | null
}

export interface Decorations {
  readonly hulls: HullLayer
  grid: GridInput | null
  pending: boolean
  setDefinition(definition: ResolvedDefinition): void
  changed(): void
  prepare(): void
  settle(): void
  hullsFor(sight: Sight, positions: Positions, containers: ContainerSource | null): HullLayer
}

export function stateNodes(state: GraphState, name: string): readonly Key[] {
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

export function createDecorations(context: DecorationContext): Decorations {
  const { model, scene, positions } = context
  let definition: ResolvedDefinition | null = null
  const hulls = new HullLayer()

  function source() {
    const sight = context.sight()
    return {
      model,
      nodes: scene.nodes,
      sight,
      detail: detailStep(scene.nodes, scene.edges, sight),
      positions,
      palette: scene.palette,
      containers: context.containers(),
      stateNodes: (name: string) => stateNodes(context.state(), name),
    }
  }

  const decorations: Decorations = {
    hulls,
    grid: null,
    pending: false,
    setDefinition(next) {
      definition = next
      hulls.setHulls(next.hulls)
      decorations.grid = gridInput(next.background, scene.palette)
    },
    changed() {
      hulls.changed()
    },
    prepare() {
      decorations.pending = false
      if (hulls.empty && hulls.count === 0) return
      const start = performance.now()
      decorations.pending = hulls.update(source(), start + hullBudget, () => performance.now())
      if (decorations.pending) context.request()
    },
    settle() {
      hulls.update(source(), Number.POSITIVE_INFINITY, () => 0)
      decorations.pending = false
    },
    hullsFor(sight, at, containers) {
      const layer = new HullLayer()
      layer.setHulls(definition?.hulls ?? [])
      const detail = detailStep(scene.nodes, scene.edges, sight)
      const from = { ...source(), sight, detail, positions: at, containers }
      layer.update(from, Number.POSITIVE_INFINITY, () => 0)
      return layer
    },
  }
  return decorations
}
