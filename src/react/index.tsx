import {
  type CSSProperties,
  createContext,
  type JSX,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { shallowEqual } from '../core/shallow-equal'
import type { AnchorOptions } from '../host/anchors'
import type {
  ElementKeysInput,
  GraphEventHandler,
  GraphEventName,
  GraphEvents,
} from '../host/events'
import {
  type GraphInstance,
  type GraphState,
  type GraphStore,
  mountGraph,
} from '../host/mount-graph'
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
import type { GraphDefinition, Key, LayerName, Mark, TimeWindowInput, View } from '../types'

/** Event props of `<Graph>`. The latest function passed is always called. `M` types the targets. */
export interface GraphEventProps<M extends Mark = Mark> {
  /** Receives `click`: a press released within 4 pixels, 10 for a touch. */
  readonly onClick?: GraphEventHandler<'click', M> | undefined
  /** Receives `doubleclick`. */
  readonly onDoubleClick?: GraphEventHandler<'doubleclick', M> | undefined
  /** Receives `contextmenu`: a secondary click. */
  readonly onContextMenu?: GraphEventHandler<'contextmenu', M> | undefined
  /**
   * Receives `pointermove`, at most once per frame. The graph listens only while this prop is
   * given.
   */
  readonly onPointerMove?: GraphEventHandler<'pointermove', M> | undefined
  /** Receives `pointerenter`: the pointer enters an element. */
  readonly onPointerEnter?: GraphEventHandler<'pointerenter', M> | undefined
  /** Receives `pointerleave`: the pointer leaves an element. */
  readonly onPointerLeave?: GraphEventHandler<'pointerleave', M> | undefined
  /** Receives `dragstart`: a node drag starts. */
  readonly onDragStart?: GraphEventHandler<'dragstart', M> | undefined
  /** Receives `drag`: dragged nodes move. */
  readonly onDrag?: GraphEventHandler<'drag', M> | undefined
  /** Receives `dragend`: a node drag ends. */
  readonly onDragEnd?: GraphEventHandler<'dragend', M> | undefined
  /** Receives `positionchange`: nodes moved by a drag, by code or by a layout run. */
  readonly onPositionChange?: GraphEventHandler<'positionchange', M> | undefined
  /** Receives `selectionchange`, or the selection requests when `selection` is given. */
  readonly onSelectionChange?: GraphEventHandler<'selectionchange', M> | undefined
  /** Receives `focuschange`: the keyboard focus moved. */
  readonly onFocusChange?: GraphEventHandler<'focuschange', M> | undefined
  /** Receives `foldchange`, or the fold requests when `folded` is given. */
  readonly onFoldChange?: GraphEventHandler<'foldchange', M> | undefined
  /**
   * Receives `viewchange`, or the view requests when `view` is given. Requests are rendered
   * synchronously, so a state update in the handler draws in the same frame.
   */
  readonly onViewChange?: GraphEventHandler<'viewchange', M> | undefined
  /** Receives `timechange`, or the window requests when `time` is given. */
  readonly onTimeChange?: GraphEventHandler<'timechange', M> | undefined
  /** Receives `layerchange`, or the layer requests when `hiddenLayers` is given. */
  readonly onLayerChange?: GraphEventHandler<'layerchange', M> | undefined
  /** Receives `zoomhint`: a wheel event went to the page in `'page'` wheel mode. */
  readonly onZoomHint?: GraphEventHandler<'zoomhint', M> | undefined
  /** Receives `lenschange`: the lens shows, moves, changes or hides. */
  readonly onLensChange?: GraphEventHandler<'lenschange', M> | undefined
  /** Receives `layoutstart`: a layout run starts. */
  readonly onLayoutStart?: GraphEventHandler<'layoutstart', M> | undefined
  /** Receives `layoutend`: a layout run ends or stops. */
  readonly onLayoutEnd?: GraphEventHandler<'layoutend', M> | undefined
}

const eventProps: Readonly<Record<GraphEventName, keyof GraphEventProps>> = {
  click: 'onClick',
  doubleclick: 'onDoubleClick',
  contextmenu: 'onContextMenu',
  pointermove: 'onPointerMove',
  pointerenter: 'onPointerEnter',
  pointerleave: 'onPointerLeave',
  dragstart: 'onDragStart',
  drag: 'onDrag',
  dragend: 'onDragEnd',
  positionchange: 'onPositionChange',
  selectionchange: 'onSelectionChange',
  focuschange: 'onFocusChange',
  foldchange: 'onFoldChange',
  viewchange: 'onViewChange',
  timechange: 'onTimeChange',
  layerchange: 'onLayerChange',
  lenschange: 'onLensChange',
  zoomhint: 'onZoomHint',
  layoutstart: 'onLayoutStart',
  layoutend: 'onLayoutEnd',
}

/** Props of `<Graph>`. `S` and `M` come from the definition. */
export interface GraphProps<S extends string = string, M extends Mark = Mark>
  extends GraphEventProps<M> {
  /** What to draw: the result of `defineGraph`. Applied with `update` when it changes. */
  readonly definition: GraphDefinition<S, M>
  /** Accessible name of the graph element. Applied with `update` when it changes. */
  readonly ariaLabel: string
  /** View at mount, read once. Without it and without `view`, the first data is fitted. */
  readonly initialView?: View | undefined
  /**
   * Makes the view controlled when given at mount: `onViewChange` receives the requests of
   * gestures, keys, `view` calls and animation steps, and only this prop moves the view.
   */
  readonly view?: View | undefined
  /**
   * Makes the selection controlled when given at mount: `onSelectionChange` receives the requests,
   * and only this prop changes the selection.
   */
  readonly selection?: ElementKeysInput | undefined
  /** Groups folded at mount, read once. */
  readonly initialFolded?: Iterable<Key> | undefined
  /**
   * Makes folding controlled when given at mount: `onFoldChange` receives the requests, and only
   * this prop changes the folded groups.
   */
  readonly folded?: Iterable<Key> | undefined
  /** Time window at mount, read once, or `null` for none. */
  readonly initialTime?: TimeWindowInput | null | undefined
  /**
   * Makes the time window controlled when given at mount, `null` for none: `onTimeChange`
   * receives the requests of `time.set` and timelines, and only this prop moves the window.
   * Requests are rendered synchronously, so playback draws in the same frame.
   */
  readonly time?: TimeWindowInput | null | undefined
  /** Layers hidden at mount, by name, read once. */
  readonly initialHiddenLayers?: Iterable<LayerName<M>> | undefined
  /**
   * Makes the hidden layers controlled when given at mount: `onLayerChange` receives the
   * requests, and only this prop hides or shows layers.
   */
  readonly hiddenLayers?: Iterable<LayerName<M>> | undefined
  /** Class of the wrapping `div`. */
  readonly className?: string | undefined
  /** Style of the wrapping `div`, merged with `position: relative`. */
  readonly style?: CSSProperties | undefined
  /**
   * Receives the graph instance. Its type comes from the definition: a ref typed as a plain
   * `GraphInstance` works too.
   */
  readonly ref?:
    | Ref<GraphInstance<NoInfer<S>, NoInfer<M>> | null>
    | RefObject<GraphInstance | null>
    | undefined
  /** Overlays drawn above the canvas, rendered once the graph is mounted. */
  readonly children?: ReactNode | undefined
}

const GraphContext = createContext<GraphInstance | null>(null)

const fill: CSSProperties = { position: 'absolute', inset: 0 }

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

function useLatest<T>(value: T): { readonly current: T } {
  const latest = useRef(value)
  useLayoutEffect(() => {
    latest.current = value
  })
  return latest
}

/**
 * Mounts a graph in a `div` positioned relative, and renders its children above the canvas. The
 * graph mounts once and is destroyed on unmount.
 */
export function Graph<S extends string = string, M extends Mark = Mark>(
  props: GraphProps<S, M>,
): JSX.Element {
  const {
    definition,
    ariaLabel,
    selection,
    folded,
    view,
    time,
    hiddenLayers,
    className,
    style,
    ref,
    children,
  } = props
  const host = useRef<HTMLDivElement>(null)
  const [graph, setGraph] = useState<GraphInstance<S, M> | null>(null)
  const latest = useLatest(props)

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const initial = latest.current
    const instance = mountGraph(element, {
      definition: initial.definition,
      ariaLabel: initial.ariaLabel,
      initialView: initial.initialView,
      view: initial.view,
      onViewChange: (next) => flushSync(() => latest.current.onViewChange?.(next)),
      selection: initial.selection,
      onSelectionChange: (next) => latest.current.onSelectionChange?.(next),
      initialFolded: initial.initialFolded,
      folded: initial.folded,
      onFoldChange: (next) => latest.current.onFoldChange?.(next),
      initialTime: initial.initialTime,
      time: initial.time,
      onTimeChange: (next) => flushSync(() => latest.current.onTimeChange?.(next)),
      initialHiddenLayers: initial.initialHiddenLayers,
      hiddenLayers: initial.hiddenLayers,
      onLayerChange: (next) => latest.current.onLayerChange?.(next),
    })
    setGraph(instance)
    return () => {
      instance.destroy()
      setGraph(null)
    }
  }, [latest])

  useLayoutEffect(() => {
    graph?.update({ definition, ariaLabel, selection, folded, view, time, hiddenLayers })
  }, [graph, definition, ariaLabel, selection, folded, view, time, hiddenLayers])

  useEffect(() => {
    if (!graph) return
    const names = (Object.keys(eventProps) as GraphEventName[]).filter(
      (name) => name !== 'pointermove',
    )
    const stops = names.map((name) =>
      graph.on(name, (event) => {
        if (name === 'selectionchange' && latest.current.selection !== undefined) return
        if (name === 'foldchange' && latest.current.folded !== undefined) return
        if (name === 'viewchange' && latest.current.view !== undefined) return
        if (name === 'timechange' && latest.current.time !== undefined) return
        if (name === 'layerchange' && latest.current.hiddenLayers !== undefined) return
        const handler = latest.current[eventProps[name]] as ((event: unknown) => void) | undefined
        handler?.(event)
      }),
    )
    return () => {
      for (const stop of stops) stop()
    }
  }, [graph, latest])

  const moving = props.onPointerMove !== undefined
  useEffect(() => {
    if (!graph || !moving) return
    return graph.on('pointermove', (event) => latest.current.onPointerMove?.(event))
  }, [graph, latest, moving])

  useImperativeHandle<GraphInstance<S, M> | null, GraphInstance<S, M> | null>(ref, () => graph, [
    graph,
  ])

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <div ref={host} style={fill} />
      {graph ? <GraphContext value={graph}>{children}</GraphContext> : null}
    </div>
  )
}

/**
 * Instance of the enclosing `<Graph>`. Throws outside it. Pass the state names and the marks of its
 * definition as type arguments to type the instance.
 */
export function useGraph<S extends string = string, M extends Mark = Mark>(): GraphInstance<S, M> {
  const graph = useContext(GraphContext)
  if (!graph) throw new Error('useGraph: call it inside <Graph>')
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
 * Props of `Minimap`: the options of `createMinimap`. A prop that goes away returns to its
 * default.
 */
export interface MinimapProps extends MinimapOptions {}

/**
 * Draws a minimap of the enclosing `<Graph>`, in a corner of the graph, or where the component
 * stands when `corner` is `null`.
 */
export function Minimap(props: MinimapProps): ReactNode {
  const options = pick(minimapKeys, props)
  const graph = useGraph()
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

function useLegendInstance<S extends string, M extends Mark>(
  options: LegendOptions<S>,
): LegendInstance<S, M> | null {
  const graph = useGraph<S, M>()
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
 * Reads a legend of the enclosing `<Graph>` and renders again when it changes, for a legend drawn
 * by the application. Pass the state names and the marks as type arguments to type the looks.
 */
export function useLegend<S extends string = string, M extends Mark = Mark>(
  options: LegendOptions<S> = {},
): UseLegendResult<S, M> {
  const legend = useLegendInstance<S, M>(options)
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
 * Props of `Legend`: the options of `createLegend` and of `mountLegend`. A prop that goes away
 * returns to its default.
 */
export interface LegendProps<S extends string = string, M extends Mark = Mark>
  extends LegendOptions<S>,
    LegendViewOptions<M> {}

/** Renders the default legend of the enclosing `<Graph>` where the component stands. */
export function Legend<S extends string = string, M extends Mark = Mark>(
  props: LegendProps<S, M>,
): ReactNode {
  const { highlight, hidden } = props
  const view = pick<LegendViewOptions<M>>(legendViewKeys, props)
  const legend = useLegendInstance<S, M>({ highlight: highlight ?? null, hidden: hidden ?? null })
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

function useTimelineInstance(props: TimelineOptions): TimelineInstance | null {
  const options = pick(timelineKeys, props)
  const graph = useGraph()
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
 * Reads a timeline of the enclosing `<Graph>` and renders again when it changes, for a timeline
 * drawn by the application.
 */
export function useTimeline(options: TimelineOptions = {}): UseTimelineResult {
  const timeline = useTimelineInstance(options)
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
 * Props of `Timeline`: the options of `createTimeline` and of `mountTimeline`. A prop that goes
 * away returns to its default.
 */
export interface TimelineProps extends TimelineOptions, TimelineViewOptions {}

/** Renders the default timeline of the enclosing `<Graph>` where the component stands. */
export function Timeline(props: TimelineProps): ReactNode {
  const view = pick<TimelineViewOptions>(timelineViewKeys, props)
  const timeline = useTimelineInstance(props)
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
export type { GraphInstance, GraphState, GraphStore }
