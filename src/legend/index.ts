import { createStore, type ReadonlyStore } from '@tanstack/store'
import type { ElementRef, GraphChanges } from '../core/graph-model'
import { dev } from '../dev'
import type { ElementKeys } from '../host/events'
import { internalsOf } from '../host/internals'
import { isolateSubscribers } from '../host/isolate'
import type { GraphInstance } from '../host/mount-graph'
import type { FreeState, GraphDefinition, LayerName, Mark } from '../types'
import {
  type KeyScope,
  keysOf,
  type LegendCategory,
  type LegendColor,
  type LegendLook,
  type LegendScalesOf,
  type LegendSizes,
  layerPrefix,
  readLegend,
} from './read'

/** Options of `createLegend`. */
export interface LegendOptions<S extends string = string> {
  /**
   * Free state given to the nodes and edges of the item under the pointer or the keyboard, or
   * `null` for none. Declare it in `states` with the style of a highlight. Defaults to `null`.
   */
  readonly highlight?: FreeState<S> | null | undefined
  /**
   * Free state given to the nodes and edges of the items switched off, or `null` to leave them to
   * the application, which reads `off` in the state of the legend to filter its data. Defaults to
   * `null`.
   */
  readonly hidden?: FreeState<S> | null | undefined
}

/** A layer of the graph in its legend. Switching it off hides the layer in the graph. */
export interface LegendLayer<M extends Mark = Mark> {
  /** Identifies the item across updates: `l:` followed by the name. */
  readonly id: string
  /** Name of the layer. */
  readonly name: LayerName<M>
  /** Whether the layer is hidden. */
  readonly off: boolean
}

/** State of a legend: its sections, the item under the pointer and the items switched off. */
export interface LegendState<M extends Mark = Mark> {
  /** Legend of the `color` scale, or `null` when no element has a color value. */
  readonly color: LegendColor | null
  /** Legend of the `size` scale, or `null` when no node has a size value. */
  readonly size: LegendSizes | null
  /** Legend of the `width` scale, or `null` when no edge has a width value. */
  readonly width: LegendSizes | null
  /**
   * Legends of the scales of the marks that have scales of their own, in the order of the marks,
   * nodes first. `color`, `size` and `width` above only cover the marks without one.
   */
  readonly marks: readonly LegendScalesOf<M>[]
  /** Looks of the elements, by mark: shape and image of nodes, line pattern of edges. */
  readonly looks: readonly LegendLook<M>[]
  /** Layers of the graph, in the order of their first mark, hidden ones included. */
  readonly layers: readonly LegendLayer<M>[]
  /** Id of the item under the pointer or the keyboard, or `null`. */
  readonly hovered: string | null
  /** Ids of the items switched off, hidden layers included. */
  readonly off: readonly string[]
}

/** A legend made by `createLegend`, for the default renderer or for a renderer of its own. */
export interface Legend<S extends string = string, M extends Mark = Mark> {
  /** Store of the state. Subscribe to it to render the legend. */
  readonly store: ReadonlyStore<LegendState<M>>
  /** Puts an item under the pointer, or none with `null`, and highlights its elements. */
  hover(id: string | null): void
  /**
   * Switches an item off, or on again. Without `off`, flips it. A layer item hides or shows the
   * layer through `layers` of the graph.
   */
  toggle(id: string, off?: boolean): void
  /**
   * Switches an item on and every other item of its section off: the other categories of its
   * `color` scale, the other looks of the same kind of element, or the other layers. An unknown id
   * changes nothing.
   */
  only(id: string): void
  /** Switches every item on again, layers included. */
  reset(): void
  /** Keys of the nodes and edges an item stands for, among those the graph draws. */
  keys(id: string): ElementKeys
  /**
   * Changes the options: an option left out keeps its current value, an option set to `undefined`
   * returns to its default.
   */
  update(options?: LegendOptions<S>): void
  /** Stops following the graph and empties the states of the legend. */
  destroy(): void
}

const minInterval = 50
const costRatio = 10
const emptyState: LegendState = {
  color: null,
  size: null,
  width: null,
  marks: [],
  looks: [],
  layers: [],
  hovered: null,
  off: [],
}

function readLayers<M extends Mark>(
  names: readonly string[],
  hidden: readonly string[],
  previous: readonly LegendLayer<M>[],
): readonly LegendLayer<M>[] {
  const next = names.map((name) => {
    const off = hidden.includes(name)
    const before = previous.find((layer) => layer.name === name)
    return before && before.off === off
      ? before
      : { id: layerPrefix + name, name: name as LayerName<M>, off }
  })
  return next.length === previous.length && next.every((layer, at) => layer === previous[at])
    ? previous
    : next
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

/**
 * Reads a legend from the scales and the marks of a graph: categories or a ramp for `color`, a few
 * values for `size` and `width`, and the looks of each mark. It follows data and definition, and
 * can highlight or switch off the elements of an item through free states.
 */
export function createLegend<S extends string, M extends Mark>(
  graph: GraphInstance<S, M>,
  options: LegendOptions<S> = {},
): Legend<S, M> {
  const internals = internalsOf(graph, 'createLegend')
  const states = graph.states as unknown as {
    set(name: string, keys: ElementKeys): void
    add(name: string, keys: ElementKeys): void
    clear(name: string): void
  }
  let given: LegendOptions<S> = options
  let highlight: string | null = options.highlight ?? null
  let hidden: string | null = options.hidden ?? null
  const store = createStore<LegendState<M>>(emptyState as LegendState<M>)
  const readonlyStore: ReadonlyStore<LegendState<M>> = isolateSubscribers(
    createStore(() => store.state),
  )
  const off = new Set<string>()
  const layers = graph.layers as unknown as {
    names(): readonly string[]
    hidden(): readonly string[]
    hide(names: Iterable<string>): void
    show(names?: Iterable<string>): void
    set(hidden: Iterable<string>): void
  }
  const known = new Map<string, LegendCategory>()
  const scope: KeyScope = { members: (index) => internals.edgeMembers(index) }
  let crowded: ReadonlySet<number> = new Set()
  let readScene = -1
  let readDetail = -1
  let readDefinition: GraphDefinition | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastRead = Number.NEGATIVE_INFINITY
  let cooldown = minInterval
  let destroyed = false

  function read(): void {
    timer = undefined
    if (destroyed) return
    const start = performance.now()
    const stamp = internals.stamp()
    readScene = stamp.scene
    readDetail = stamp.detail
    readDefinition = internals.definition()
    const sight = internals.sight(hidden)
    const reading = readLegend(internals.scene, readDefinition.marks, off, known, sight)
    crowded = reading.crowded
    known.clear()
    for (const color of [reading.color, ...reading.marks.map((mark) => mark.color)]) {
      if (color?.type === 'categories') for (const item of color.items) known.set(item.id, item)
    }
    const previous = store.state
    const nextLayers = readLayers(layers.names(), layers.hidden(), previous.layers)
    const ids = offIds(nextLayers)
    store.setState(() => ({
      color: reading.color,
      size: reading.size,
      width: reading.width,
      marks: reading.marks as readonly LegendScalesOf<M>[],
      looks: reading.looks as readonly LegendLook<M>[],
      layers: nextLayers,
      hovered: previous.hovered,
      off: sameIds(previous.off, ids) ? previous.off : ids,
    }))
    lastRead = performance.now()
    cooldown = Math.max(minInterval, (lastRead - start) * costRatio)
  }

  function offIds(list: readonly LegendLayer<M>[]): string[] {
    return [...off, ...list.filter((layer) => layer.off).map((layer) => layer.id)]
  }

  function syncLayers(): void {
    if (destroyed) return
    const state = store.state
    const nextLayers = readLayers(layers.names(), layers.hidden(), state.layers)
    if (nextLayers === state.layers) return
    const ids = offIds(nextLayers)
    store.setState((current) => ({
      ...current,
      layers: nextLayers,
      off: sameIds(current.off, ids) ? current.off : ids,
    }))
  }

  function refresh(): void {
    read()
    quietly(() => {
      applyHidden()
      applyHighlight()
    })
  }

  function quietly(write: () => void): void {
    try {
      write()
    } catch (error) {
      if (dev) console.warn(error)
    }
  }

  function schedule(): void {
    if (timer !== undefined || destroyed) return
    timer = setTimeout(refresh, Math.max(0, lastRead + cooldown - performance.now()))
  }

  function applyHidden(): void {
    if (hidden !== null) states.set(hidden, keysOf(internals.scene, off, crowded, scope))
  }

  function applyHighlight(): void {
    if (highlight === null) return
    const hovered = store.state.hovered
    if (hovered === null) states.clear(highlight)
    else states.set(highlight, keysOf(internals.scene, new Set([hovered]), crowded, scope))
  }

  function hideArrivals(changes: GraphChanges): void {
    if (hidden === null || off.size === 0) return
    const { nodes, edges } = changes
    if (nodes.added.length + nodes.updated.length + edges.added.length + edges.updated.length === 0)
      return
    const indices = (refs: readonly (readonly ElementRef[])[]) =>
      refs.flatMap((list) => list.map((ref) => ref.index))
    const keys = keysOf(internals.scene, off, crowded, {
      members: scope.members,
      nodes: indices([nodes.added, nodes.updated]),
      edges: indices([edges.added, edges.updated]),
    })
    if (keys.nodes.length + keys.edges.length > 0) states.add(hidden, keys)
  }

  function switched(color: LegendColor | null): LegendColor | null {
    return color?.type === 'categories'
      ? {
          type: 'categories',
          items: color.items.map((item) =>
            item.off === off.has(item.id) ? item : { ...item, off: off.has(item.id) },
          ),
        }
      : color
  }

  function publishOff(): void {
    const ids = offIds(store.state.layers)
    store.setState((state) => ({
      ...state,
      off: ids,
      color: switched(state.color),
      marks: state.marks.map((mark) =>
        mark.color?.type === 'categories' ? { ...mark, color: switched(mark.color) } : mark,
      ),
      looks: state.looks.map((look) =>
        look.off === off.has(look.id) ? look : { ...look, off: off.has(look.id) },
      ),
    }))
    applyHidden()
  }

  const layerSubscription = graph.store.subscribe(syncLayers)
  let stopWatch: (() => void) | null = null

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    clearTimeout(timer)
    stopWatch?.()
    layerSubscription.unsubscribe()
    quietly(() => {
      if (highlight !== null) states.clear(highlight)
      if (hidden !== null) states.clear(hidden)
    })
  }

  stopWatch = internals.watch({
    changed(changes) {
      quietly(() => hideArrivals(changes))
    },
    frame() {
      const stamp = internals.stamp()
      if (
        stamp.scene !== readScene ||
        stamp.detail !== readDetail ||
        internals.definition() !== readDefinition
      ) {
        schedule()
      }
    },
    destroy: () => destroy(),
  })

  try {
    read()
    applyHidden()
    applyHighlight()
  } catch (error) {
    destroy()
    throw error
  }

  return {
    store: readonlyStore,
    hover(id) {
      if (destroyed || store.state.hovered === id) return
      store.setState((state) => ({ ...state, hovered: id }))
      applyHighlight()
    },
    toggle(id, value) {
      if (destroyed) return
      const layer = store.state.layers.find((each) => each.id === id)
      if (layer) {
        if ((value ?? !layer.off) === layer.off) return
        if (layer.off) layers.show([layer.name])
        else layers.hide([layer.name])
        return
      }
      const next = value ?? !off.has(id)
      if (next === off.has(id)) return
      if (next) off.add(id)
      else off.delete(id)
      publishOff()
    },
    only(id) {
      if (destroyed) return
      const state = store.state
      const layer = state.layers.find((each) => each.id === id)
      if (layer) {
        const others = state.layers.filter((each) => each !== layer).map((each) => each.name)
        layers.set(others)
        return
      }
      const categories = [state.color, ...state.marks.map((mark) => mark.color)]
        .map((color) => (color?.type === 'categories' ? color.items : []))
        .find((items) => items.some((item) => item.id === id))
      const look = state.looks.find((each) => each.id === id)
      const section = categories
        ? categories.map((item) => item.id)
        : look
          ? state.looks.filter((each) => each.kind === look.kind).map((each) => each.id)
          : []
      let changed = false
      for (const sibling of section) {
        const switched = sibling !== id
        if (switched === off.has(sibling)) continue
        changed = true
        if (switched) off.add(sibling)
        else off.delete(sibling)
      }
      if (changed) publishOff()
    },
    reset() {
      if (destroyed) return
      if (store.state.layers.some((layer) => layer.off)) layers.show()
      if (off.size === 0) return
      off.clear()
      publishOff()
    },
    keys(id) {
      return keysOf(internals.scene, new Set([id]), crowded, scope)
    },
    update(next = {}) {
      if (destroyed) return
      given = { ...given, ...next }
      const nextHighlight = given.highlight ?? null
      const nextHidden = given.hidden ?? null
      if (highlight !== null && highlight !== nextHighlight) states.clear(highlight)
      if (hidden !== null && hidden !== nextHidden) states.clear(hidden)
      const changed = highlight !== nextHighlight || hidden !== nextHidden
      highlight = nextHighlight
      hidden = nextHidden
      if (changed) {
        applyHidden()
        applyHighlight()
      }
    },
    destroy,
  }
}

export type {
  LegendCategories,
  LegendCategory,
  LegendColor,
  LegendEdgeLook,
  LegendItem,
  LegendLook,
  LegendMarkScales,
  LegendNodeLook,
  LegendRamp,
  LegendScalesOf,
  LegendSize,
  LegendSizes,
  LegendValue,
} from './read'
export { type LegendSection, type LegendView, type LegendViewOptions, mountLegend } from './view'
