import type { LayerFilter } from '../core/mark-layers'
import type { Scene } from '../core/scene'
import type { StateKind } from '../core/state-buffers'
import { requestMemory, sameList } from './element-keys'
import type { Emitter, GraphLayerEvent } from './events'
import type { GraphLayers, GraphState } from './graph-instance'
import { isolated } from './isolate'
import { PendingRequests } from './requests'

export type LayerListener = ((event: GraphLayerEvent) => void) | undefined

export interface LayerSource {
  readonly controlled: boolean
  readonly scene: Scene
  readonly emitter: Emitter
  patch(next: Partial<GraphState>): void
  reorder(): void
  dropHidden(): void
  request(): void
}

export class LayerControl {
  hidden: readonly string[]
  filter: LayerFilter | null = null
  readonly #asks = new PendingRequests<readonly string[]>(sameList, requestMemory)
  readonly #positions = { nodes: new Map<number, number>(), edges: new Map<number, number>() }
  #shape = ''
  #listener: LayerListener
  readonly #source: LayerSource

  constructor(source: LayerSource, hidden: Iterable<string>, listener: LayerListener) {
    this.#source = source
    this.hidden = [...new Set<string>(hidden)]
    this.#listener = isolated(listener)
  }

  listen(listener: LayerListener): void {
    this.#listener = isolated(listener)
  }

  order(names: Iterable<string>): string[] {
    const wanted = new Set(names)
    const known = this.#source.scene.markLayers.names
    return [
      ...known.filter((name) => wanted.has(name)),
      ...[...wanted].filter((name) => !known.includes(name)),
    ]
  }

  refresh(): void {
    const next = this.#source.scene.markLayers.filter(new Set(this.hidden))
    if (next === this.filter) return
    this.filter = next
    this.#source.dropHidden()
    this.#source.request()
  }

  apply(next: Iterable<string>): void {
    const list = this.order(next)
    if (sameList(list, this.hidden)) return
    this.hidden = list
    this.refresh()
    this.#source.patch({ hiddenLayers: list })
    this.#source.emitter.emit('layerchange', { hidden: list })
    this.#source.request()
  }

  answer(next: Iterable<string>): void {
    const hidden = this.order(next)
    this.#asks.answer(hidden)
    this.apply(hidden)
  }

  base(): readonly string[] {
    return this.#asks.base(this.hidden)
  }

  ask(next: Iterable<string>): void {
    const list = this.order(next)
    if (!this.#source.controlled) {
      this.apply(list)
      return
    }
    if (sameList(list, this.base())) return
    this.#asks.send(list)
    this.#listener?.({ hidden: list })
  }

  position(kind: StateKind, index: number): number {
    const scene = this.#source.scene
    const slot = (kind === 'nodes' ? scene.nodes.slot[index] : scene.edges.slot[index]) ?? 0
    return this.#positions[kind].get(slot) ?? 0
  }

  arrange(): void {
    const scene = this.#source.scene
    const shape = scene.layers.map((layer) => `${layer.kind}${layer.slot}`).join()
    if (shape === this.#shape) return
    this.#shape = shape
    const positions = this.#positions
    positions.nodes.clear()
    positions.edges.clear()
    scene.layers.forEach((layer, position) => {
      positions[layer.kind].set(layer.slot, position)
    })
    this.#source.reorder()
  }

  api(): GraphLayers {
    const scene = this.#source.scene
    return {
      names: () => scene.markLayers.names,
      hidden: () => this.hidden,
      isHidden: (name) => this.hidden.includes(name),
      hide: (list) => this.ask([...this.base(), ...(list ?? scene.markLayers.names)]),
      show: (list) => {
        const base = this.base()
        const shown = new Set<string>(list ?? [...scene.markLayers.names, ...base])
        this.ask(base.filter((name) => !shown.has(name)))
      },
      toggle: (name) => {
        const base = this.base()
        this.ask(base.includes(name) ? base.filter((each) => each !== name) : [...base, name])
      },
      set: (list) => this.ask(list),
    }
  }
}
