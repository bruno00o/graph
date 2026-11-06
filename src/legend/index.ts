import { createStore, type ReadonlyStore } from '@tanstack/store'
import type { ElementKeys } from '../host/events'
import { internalsOf } from '../host/internals'
import type { GraphInstance } from '../host/mount-graph'
import type { FreeState, GraphDefinition, Mark } from '../types'
import {
  keysOf,
  type LegendCategory,
  type LegendColor,
  type LegendLook,
  type LegendSizes,
  readLegend,
} from './read'

/** Options of `createLegend`. */
export interface LegendOptions<S extends string = string> {
  /**
   * Free state given to the nodes and edges of the item under the pointer or the keyboard, or
   * `null` for none. Declare it in `states` with the style of a highlight. Defaults to `null`.
   */
  readonly highlight?: FreeState<S> | null
  /**
   * Free state given to the nodes and edges of the items switched off, or `null` to leave them to
   * the application, which reads `off` in the state of the legend to filter its data. Defaults to
   * `null`.
   */
  readonly hidden?: FreeState<S> | null
}

/** State of a legend: its sections, the item under the pointer and the items switched off. */
export interface LegendState<M extends Mark = Mark> {
  /** Legend of the `color` scale, or `null` when no element has a color value. */
  readonly color: LegendColor | null
  /** Legend of the `size` scale, or `null` when no node has a size value. */
  readonly size: LegendSizes | null
  /** Legend of the `width` scale, or `null` when no edge has a width value. */
  readonly width: LegendSizes | null
  /** Looks of the elements, by mark: shape and image of nodes, line pattern of edges. */
  readonly looks: readonly LegendLook<M>[]
  /** Id of the item under the pointer or the keyboard, or `null`. */
  readonly hovered: string | null
  /** Ids of the items switched off. */
  readonly off: readonly string[]
}

/** A legend made by `createLegend`, for the default renderer or for a renderer of its own. */
export interface Legend<S extends string = string, M extends Mark = Mark> {
  /** Store of the state. Subscribe to it to render the legend. */
  readonly store: ReadonlyStore<LegendState<M>>
  /** Puts an item under the pointer, or none with `null`, and highlights its elements. */
  hover(id: string | null): void
  /** Switches an item off, or on again. Without `off`, flips it. */
  toggle(id: string, off?: boolean): void
  /** Switches every item on again. */
  reset(): void
  /** Keys of the nodes and edges an item stands for, among those the graph draws. */
  keys(id: string): ElementKeys
  /** Replaces the options. Options left out take their default value. */
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
  looks: [],
  hovered: null,
  off: [],
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
    clear(name: string): void
  }
  let highlight: string | null = options.highlight ?? null
  let hidden: string | null = options.hidden ?? null
  const store = createStore<LegendState<M>>(emptyState as LegendState<M>)
  const readonlyStore: ReadonlyStore<LegendState<M>> = createStore(() => store.state)
  const off = new Set<string>()
  const known = new Map<string, LegendCategory>()
  let crowded: ReadonlySet<number> = new Set()
  let readScene = -1
  let readDefinition: GraphDefinition | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastRead = Number.NEGATIVE_INFINITY
  let cooldown = minInterval
  let destroyed = false

  function read(): void {
    timer = undefined
    if (destroyed) return
    const start = performance.now()
    readScene = internals.stamp().scene
    readDefinition = internals.definition()
    const reading = readLegend(internals.scene, readDefinition.marks, off, known)
    crowded = reading.crowded
    known.clear()
    if (reading.color?.type === 'categories') {
      for (const item of reading.color.items) known.set(item.id, item)
    }
    const previous = store.state
    store.setState(() => ({
      color: reading.color,
      size: reading.size,
      width: reading.width,
      looks: reading.looks as readonly LegendLook<M>[],
      hovered: previous.hovered,
      off: sameIds(previous.off, [...off]) ? previous.off : [...off],
    }))
    applyHidden()
    applyHighlight()
    lastRead = performance.now()
    cooldown = Math.max(minInterval, (lastRead - start) * costRatio)
  }

  function schedule(): void {
    if (timer !== undefined || destroyed) return
    timer = setTimeout(read, Math.max(0, lastRead + cooldown - performance.now()))
  }

  function applyHidden(): void {
    if (hidden !== null) states.set(hidden, keysOf(internals.scene, off, crowded))
  }

  function applyHighlight(): void {
    if (highlight === null) return
    const hovered = store.state.hovered
    if (hovered === null) states.clear(highlight)
    else states.set(highlight, keysOf(internals.scene, new Set([hovered]), crowded))
  }

  function publishOff(): void {
    const ids = [...off]
    store.setState((state) => ({
      ...state,
      off: ids,
      color:
        state.color?.type === 'categories'
          ? {
              type: 'categories',
              items: state.color.items.map((item) =>
                item.off === off.has(item.id) ? item : { ...item, off: off.has(item.id) },
              ),
            }
          : state.color,
      looks: state.looks.map((look) =>
        look.off === off.has(look.id) ? look : { ...look, off: off.has(look.id) },
      ),
    }))
    applyHidden()
  }

  const stopWatch = internals.watch({
    frame() {
      if (internals.stamp().scene !== readScene || internals.definition() !== readDefinition) {
        schedule()
      }
    },
    destroy: () => destroy(),
  })

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    clearTimeout(timer)
    stopWatch()
    if (highlight !== null) states.clear(highlight)
    if (hidden !== null) states.clear(hidden)
  }

  read()

  return {
    store: readonlyStore,
    hover(id) {
      if (destroyed || store.state.hovered === id) return
      store.setState((state) => ({ ...state, hovered: id }))
      applyHighlight()
    },
    toggle(id, value) {
      if (destroyed) return
      const next = value ?? !off.has(id)
      if (next === off.has(id)) return
      if (next) off.add(id)
      else off.delete(id)
      publishOff()
    },
    reset() {
      if (destroyed || off.size === 0) return
      off.clear()
      publishOff()
    },
    keys(id) {
      return keysOf(internals.scene, new Set([id]), crowded)
    },
    update(next = {}) {
      if (destroyed) return
      const nextHighlight = next.highlight ?? null
      const nextHidden = next.hidden ?? null
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
  LegendNodeLook,
  LegendRamp,
  LegendSize,
  LegendSizes,
  LegendValue,
} from './read'
export { type LegendSection, type LegendView, type LegendViewOptions, mountLegend } from './view'
