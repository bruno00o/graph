import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { shallowEqual } from '../core/shallow-equal'
import type { AnchorOptions } from '../host/anchors'
import type { GraphEventName, GraphEvents } from '../host/events'
import type { GraphInstance, GraphState, GraphStore } from '../host/mount-graph'
import {
  createLegend,
  type Legend as LegendInstance,
  type LegendOptions,
  type LegendState,
  type LegendView,
  type LegendViewOptions,
  mountLegend,
} from '../legend/index'
import {
  createMinimap,
  type Minimap as MinimapInstance,
  type MinimapOptions,
} from '../minimap/index'
import {
  createTimeline,
  mountTimeline,
  type Timeline as TimelineInstance,
  type TimelineOptions,
  type TimelineState,
  type TimelineView,
  type TimelineViewOptions,
} from '../timeline/index'
import type { Mark } from '../types'
import { GraphContext, useGraphOf, useLatest } from './context'

type Known<T> = Readonly<Record<keyof T, true>>

function pick<T extends object>(keys: Known<T>, props: T): T {
  const options: Record<string, unknown> = {}
  for (const key of Object.keys(keys)) options[key] = (props as Record<string, unknown>)[key]
  return options as T
}

const minimapKeys: Known<MinimapOptions> = {
  corner: true,
  width: true,
  height: true,
  margin: true,
  padding: true,
  maxEdges: true,
  nodeSize: true,
  nodeColor: true,
  selectionColor: true,
  background: true,
  mask: true,
  viewColor: true,
  pan: true,
  zoom: true,
}

const legendViewKeys: Known<LegendViewOptions> = {
  titles: true,
  sections: true,
  format: true,
  lookText: true,
  markTitle: true,
  layerText: true,
  toggle: true,
  ariaLabel: true,
}

const timelineKeys: Known<TimelineOptions> = {
  bins: true,
  ticks: true,
  speed: true,
  mode: true,
  loop: true,
  extent: true,
}

const timelineViewKeys: Known<TimelineViewOptions> = {
  labels: true,
  ariaLabel: true,
  format: true,
  height: true,
  wheel: true,
  snap: true,
}

/**
 * Instance of the enclosing `<Graph>` or `<MapGraph>`. Throws outside them. Pass the state names
 * and the marks of its definition as type arguments to type the instance.
 */
export function useGraph<S extends string = string, M extends Mark = Mark>(): GraphInstance<S, M> {
  const graph = useContext(GraphContext)
  if (!graph) throw new Error('useGraph: call it inside <Graph> or <MapGraph>')
  return graph as unknown as GraphInstance<S, M>
}

interface Selected<T, S extends string, M extends Mark> {
  readonly state: GraphState<S, M>
  readonly selector: (state: GraphState<S, M>) => T
  readonly value: T
}

/** Options of `useGraphState`. */
export interface UseGraphStateOptions<T> {
  /**
   * Tells whether two slices are equal. Pass `shallow` from `@tanstack/store` for selectors that
   * build objects or arrays.
   * @default Object.is
   */
  readonly compare?: ((a: T, b: T) => boolean) | undefined
}

/**
 * Subscribes to the state of the enclosing graph and returns the selected slice. The component
 * renders again only when the slice changes. Annotate the parameter of the selector as
 * `GraphState<S, M>` to type the targets.
 */
export function useGraphState<T, S extends string = string, M extends Mark = Mark>(
  selector: (state: GraphState<S, M>) => T,
  options: UseGraphStateOptions<T> = {},
): T {
  const compare = options.compare ?? Object.is
  const graph = useGraph<S, M>()
  const cache = useRef<Selected<T, S, M> | null>(null)
  const subscribe = useCallback(
    (notify: () => void) => {
      const subscription = graph.store.subscribe(() => notify())
      return () => subscription.unsubscribe()
    },
    [graph],
  )
  const snapshot = (): T => {
    const state = graph.store.get()
    const cached = cache.current
    if (cached && cached.state === state && cached.selector === selector) return cached.value
    const value = selector(state)
    const kept = cached && compare(cached.value, value) ? cached.value : value
    cache.current = { state, selector, value: kept }
    return kept
  }
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * Subscribes to an event of the enclosing graph while the component is mounted. The latest handler
 * is always called, without subscribing again. Annotate its parameter with the payload type, such
 * as `GraphPointerEvent<M>`, to type the targets.
 */
export function useGraphEvent<K extends GraphEventName, E extends GraphEvents[K] = GraphEvents[K]>(
  name: K,
  handler: (event: E) => void,
): void {
  const graph = useGraph()
  const latest = useLatest(handler)
  useEffect(
    () => graph.on(name, (event: GraphEvents[K]) => latest.current(event as E)),
    [graph, name, latest],
  )
}

/** Props of `Anchor`: where to pin the children, as in `graph.anchors.set`, and the children. */
export type AnchorProps<S extends string = string> = AnchorOptions<S> & {
  /** Content pinned to the target. */
  readonly children?: ReactNode | undefined
}

/**
 * Pins its children to a node, a set of nodes, a state, an edge or a world point. Use it inside
 * `<Graph>`: the children follow the view and the nodes without rendering again.
 */
export function Anchor<S extends string = string>(props: AnchorProps<S>): ReactNode {
  const { children, ...options } = props
  const graph = useGraph()
  const [element] = useState(() => document.createElement('div'))
  useLayoutEffect(() => () => graph.anchors.remove(element), [graph, element])
  useLayoutEffect(() => {
    graph.anchors.set(element, options as AnchorOptions)
  })
  return createPortal(children, element)
}

/**
 * Props of `Minimap`: the options of `createMinimap`, and the graph. A prop that goes away returns
 * to its default.
 */
export interface MinimapProps extends MinimapOptions {
  /** Graph to follow. Defaults to the graph of the enclosing `<Graph>`. */
  readonly graph?: GraphInstance | undefined
}

/**
 * Draws a minimap of a graph, in a corner of the graph, or where the component stands when
 * `corner` is `null`. Without `graph`, it follows the enclosing `<Graph>`.
 */
export function Minimap(props: MinimapProps): ReactNode {
  const options = pick<MinimapOptions>(minimapKeys, props)
  const graph = useGraphOf(props.graph, 'Minimap')
  const slot = useRef<HTMLDivElement>(null)
  const minimap = useRef<MinimapInstance | null>(null)
  const applied = useRef<MinimapOptions>(options)
  const latest = useLatest(options)
  useLayoutEffect(() => {
    const created = createMinimap(graph, latest.current)
    applied.current = latest.current
    minimap.current = created
    return () => {
      created.destroy()
      minimap.current = null
    }
  }, [graph, latest])
  useLayoutEffect(() => {
    const current = minimap.current
    if (!current) return
    if (!shallowEqual(applied.current, options)) {
      applied.current = options
      current.update(options)
    }
    const host = slot.current
    if (props.corner === null && host && current.element.parentElement !== host) {
      host.append(current.element)
    }
  })
  return props.corner === null ? <div ref={slot} /> : null
}

/** What `useLegend` returns. `M` types the looks. */
export interface UseLegendResult<S extends string = string, M extends Mark = Mark> {
  /** State of the legend, empty until the first layout effect. */
  readonly state: LegendState<M>
  /** The legend, to hover or switch items, or `null` until the first layout effect. */
  readonly legend: LegendInstance<S, M> | null
}

const emptyLegend: LegendState = {
  color: null,
  size: null,
  width: null,
  marks: [],
  looks: [],
  layers: [],
  hovered: null,
  off: [],
}

/** Options of `useLegend`: the options of `createLegend`, and the graph. */
export interface UseLegendOptions<S extends string = string, M extends Mark = Mark>
  extends LegendOptions<S> {
  /**
   * Graph to read, which types the looks. Defaults to the graph of the enclosing `<Graph>` or
   * `<MapGraph>`.
   */
  readonly graph?: GraphInstance<S, M> | undefined
}

function useLegendInstance<S extends string, M extends Mark>(
  given: GraphInstance<S, M> | undefined,
  options: LegendOptions<S>,
  caller: string,
): LegendInstance<S, M> | null {
  const graph = useGraphOf(given, caller)
  const [legend, setLegend] = useState<LegendInstance<S, M> | null>(null)
  const latest = useLatest(options)
  useLayoutEffect(() => {
    const created = createLegend(graph, latest.current)
    setLegend(created)
    return () => {
      created.destroy()
      setLegend(null)
    }
  }, [graph, latest])
  const highlight = options.highlight ?? null
  const hidden = options.hidden ?? null
  useLayoutEffect(() => {
    legend?.update({ highlight, hidden })
  }, [legend, highlight, hidden])
  return legend
}

/**
 * Reads a legend of a graph and renders again when it changes, for a legend drawn by the
 * application. Without `graph`, it reads the enclosing `<Graph>` or `<MapGraph>`: pass the state
 * names and the marks as type arguments to type the looks.
 */
export function useLegend<S extends string = string, M extends Mark = Mark>(
  options: UseLegendOptions<S, M> = {},
): UseLegendResult<S, M> {
  const { graph, highlight, hidden } = options
  const legend = useLegendInstance<S, M>(graph, { highlight, hidden }, 'useLegend')
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!legend) return () => {}
      const subscription = legend.store.subscribe(() => notify())
      return () => subscription.unsubscribe()
    },
    [legend],
  )
  const snapshot = (): LegendState<M> => legend?.store.state ?? (emptyLegend as LegendState<M>)
  const state = useSyncExternalStore(subscribe, snapshot, snapshot)
  return { state, legend }
}

/**
 * Props of `Legend`: the options of `createLegend` and of `mountLegend`, and the graph. A prop that
 * goes away returns to its default.
 */
export interface LegendProps<S extends string = string, M extends Mark = Mark>
  extends UseLegendOptions<S, M>,
    LegendViewOptions<M> {}

/**
 * Renders the default legend of a graph where the component stands. Without `graph`, it reads the
 * enclosing `<Graph>` or `<MapGraph>`.
 */
export function Legend<S extends string = string, M extends Mark = Mark>(
  props: LegendProps<S, M>,
): ReactNode {
  const { highlight, hidden } = props
  const view = pick<LegendViewOptions<M>>(legendViewKeys, props)
  const legend = useLegendInstance<S, M>(
    props.graph,
    { highlight: highlight ?? null, hidden: hidden ?? null },
    'Legend',
  )
  const slot = useRef<HTMLDivElement>(null)
  const mounted = useRef<{ readonly view: LegendView<M>; options: object } | null>(null)
  const latest = useLatest(view)
  useLayoutEffect(() => {
    if (!legend || !slot.current) return
    const created = mountLegend(legend, latest.current)
    mounted.current = { view: created, options: latest.current }
    slot.current.append(created.element)
    return () => {
      created.destroy()
      mounted.current = null
    }
  }, [legend, latest])
  useLayoutEffect(() => {
    const current = mounted.current
    if (!current || shallowEqual(current.options, view)) return
    current.options = view
    current.view.update(view)
  })
  return <div ref={slot} />
}

/** What `useTimeline` returns. */
export interface UseTimelineResult {
  /** State of the timeline, empty until the first layout effect. */
  readonly state: TimelineState
  /** The timeline, to brush, step or play, or `null` until the first layout effect. */
  readonly timeline: TimelineInstance | null
}

const emptyTimeline: TimelineState = {
  extent: null,
  range: null,
  bins: [],
  unit: 'day',
  step: 1,
  ticks: [],
  window: null,
  playing: false,
  speed: 0,
  mode: 'slide',
  loop: false,
}

/** Options of `useTimeline`: the options of `createTimeline`, and the graph. */
export interface UseTimelineOptions extends TimelineOptions {
  /** Graph to follow. Defaults to the graph of the enclosing `<Graph>` or `<MapGraph>`. */
  readonly graph?: GraphInstance | undefined
}

function useTimelineInstance(props: UseTimelineOptions, caller: string): TimelineInstance | null {
  const options = pick<TimelineOptions>(timelineKeys, props)
  const graph = useGraphOf(props.graph, caller)
  const [timeline, setTimeline] = useState<TimelineInstance | null>(null)
  const latest = useLatest(options)
  const applied = useRef(options)
  useLayoutEffect(() => {
    const created = createTimeline(graph, latest.current)
    applied.current = latest.current
    setTimeline(created)
    return () => {
      created.destroy()
      setTimeline(null)
    }
  }, [graph, latest])
  useLayoutEffect(() => {
    if (!timeline || shallowEqual(applied.current, options)) return
    applied.current = options
    timeline.update(options)
  })
  return timeline
}

/**
 * Reads a timeline of a graph and renders again when it changes, for a timeline drawn by the
 * application. Without `graph`, it follows the enclosing `<Graph>` or `<MapGraph>`.
 */
export function useTimeline(options: UseTimelineOptions = {}): UseTimelineResult {
  const timeline = useTimelineInstance(options, 'useTimeline')
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!timeline) return () => {}
      const subscription = timeline.store.subscribe(() => notify())
      return () => subscription.unsubscribe()
    },
    [timeline],
  )
  const snapshot = (): TimelineState => timeline?.store.state ?? emptyTimeline
  const state = useSyncExternalStore(subscribe, snapshot, snapshot)
  return { state, timeline }
}

/**
 * Props of `Timeline`: the options of `createTimeline` and of `mountTimeline`, and the graph. A
 * prop that goes away returns to its default.
 */
export interface TimelineProps extends UseTimelineOptions, TimelineViewOptions {}

/**
 * Renders the default timeline of a graph where the component stands. Without `graph`, it follows
 * the enclosing `<Graph>` or `<MapGraph>`.
 */
export function Timeline(props: TimelineProps): ReactNode {
  const view = pick<TimelineViewOptions>(timelineViewKeys, props)
  const timeline = useTimelineInstance(props, 'Timeline')
  const slot = useRef<HTMLDivElement>(null)
  const mounted = useRef<{ readonly view: TimelineView; options: object } | null>(null)
  const latest = useLatest(view)
  useLayoutEffect(() => {
    if (!timeline || !slot.current) return
    const created = mountTimeline(timeline, latest.current)
    mounted.current = { view: created, options: latest.current }
    slot.current.append(created.element)
    return () => {
      created.destroy()
      mounted.current = null
    }
  }, [timeline, latest])
  useLayoutEffect(() => {
    const current = mounted.current
    if (!current || shallowEqual(current.options, view)) return
    current.options = view
    current.view.update(view)
  })
  return <div ref={slot} />
}

export type {
  AnchorAlign,
  AnchorEdgeTarget,
  AnchorNodesTarget,
  AnchorNodeTarget,
  AnchorOptions,
  AnchorPlacement,
  AnchorPointTarget,
  AnchorSide,
  AnchorStateTarget,
  AnchorTarget,
} from '../host/anchors'
export { Graph, type GraphEventProps, type GraphProps } from './graph'
export type { GraphInstance, GraphState, GraphStore }
