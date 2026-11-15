import {
  type CSSProperties,
  type JSX,
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import type { ElementKeysInput, GraphEventHandler, GraphEventName } from '../host/events'
import { type GraphInstance, type MountGraphOptions, mountGraph } from '../host/mount-graph'
import type {
  GraphDefinition,
  Key,
  KeyList,
  LayerName,
  Mark,
  Point,
  TimeWindowInput,
  View,
} from '../types'
import { GraphContext, useLatest } from './context'

/** Event props of `<Graph>`. The latest function passed is always called. `M` types the targets. */
export interface GraphEventProps<M extends Mark = Mark> {
  /** Receives `click`: a press released within 4 pixels, 10 for a touch. */
  readonly onClick?: GraphEventHandler<'click', M> | undefined
  /** Receives `doubleclick`. */
  readonly onDoubleClick?: GraphEventHandler<'doubleclick', M> | undefined
  /**
   * Receives `contextmenu`: a secondary click. The menu of the browser still opens unless the
   * handler calls `originalEvent.preventDefault()`.
   */
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
  /** Receives `surfacechange`: the graph moved to another surface. */
  readonly onSurfaceChange?: GraphEventHandler<'surfacechange', M> | undefined
  /** Receives `timechange`, or the window requests when `time` is given. */
  readonly onTimeChange?: GraphEventHandler<'timechange', M> | undefined
  /** Receives `layerchange`, or the layer requests when `hiddenLayers` is given. */
  readonly onLayerChange?: GraphEventHandler<'layerchange', M> | undefined
  /** Receives `zoomhint`: a wheel event went to the page in `'page'` wheel mode. */
  readonly onZoomHint?: GraphEventHandler<'zoomhint', M> | undefined
  /** Receives `lenschange`: the lens shows, moves, changes or hides. */
  readonly onLensChange?: GraphEventHandler<'lenschange', M> | undefined
  /** Receives `issueschange`: problems appeared in the data or went away. */
  readonly onIssuesChange?: GraphEventHandler<'issueschange', M> | undefined
  /** Receives `layoutstart`: a layout run starts. */
  readonly onLayoutStart?: GraphEventHandler<'layoutstart', M> | undefined
  /** Receives `layoutend`: a layout run ends or stops. */
  readonly onLayoutEnd?: GraphEventHandler<'layoutend', M> | undefined
  /** Receives `loadingchange`: the live sources start or finish loading, or one fails. */
  readonly onLoadingChange?: GraphEventHandler<'loadingchange', M> | undefined
}

export const eventProps: Readonly<Record<GraphEventName, keyof GraphEventProps>> = {
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
  surfacechange: 'onSurfaceChange',
  timechange: 'onTimeChange',
  layerchange: 'onLayerChange',
  lenschange: 'onLensChange',
  issueschange: 'onIssuesChange',
  zoomhint: 'onZoomHint',
  layoutstart: 'onLayoutStart',
  layoutend: 'onLayoutEnd',
  loadingchange: 'onLoadingChange',
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
  /**
   * Groups folded at mount, read once, or a function that decides, once for each group, whether
   * it folds when it first has a child, before it is drawn. The function of the latest render is
   * called.
   */
  readonly initialFolded?: MountGraphOptions<S, M>['initialFolded']
  /**
   * Makes folding controlled when given at mount: `onFoldChange` receives the requests, and only
   * this prop changes the folded groups.
   */
  readonly folded?: KeyList | undefined
  /**
   * Positions at mount, read once, by key, in world units: what `positions.snapshot` returns. The
   * nodes it places count as laid out: no layout run for them, no `positionchange`.
   */
  readonly initialPositions?: Iterable<readonly [Key, Point]> | undefined
  /** Time window at mount, read once, or `null` for none. */
  readonly initialTime?: TimeWindowInput | null | undefined
  /**
   * Makes the time window controlled when given at mount, `null` for none: `onTimeChange`
   * receives the requests of `time.set` and timelines, and only this prop moves the window.
   * Requests reach `onTimeChange` in a microtask and are rendered at once, so playback draws in
   * the same frame.
   */
  readonly time?: TimeWindowInput | null | undefined
  /** Layers hidden at mount, by name, read once. */
  readonly initialHiddenLayers?: KeyList<LayerName<M>> | undefined
  /**
   * Makes the hidden layers controlled when given at mount: `onLayerChange` receives the
   * requests, and only this prop hides or shows layers.
   */
  readonly hiddenLayers?: KeyList<LayerName<M>> | undefined
  /**
   * Class of the wrapping `div`. It may position the wrapper, such as `absolute inset-0`: the
   * wrapper is made `relative` only when nothing else positions it.
   */
  readonly className?: string | undefined
  /**
   * Style of the wrapping `div`. A `position` given here is kept: the wrapper is made `relative`
   * only when neither the style nor a stylesheet positions it.
   */
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

const fill: CSSProperties = { position: 'absolute', inset: 0 }

type BoundProps<S extends string, M extends Mark> = Omit<
  GraphProps<S, M>,
  'initialView' | 'className' | 'style' | 'children'
>

type SharedOptions<S extends string, M extends Mark> = Omit<
  MountGraphOptions<S, M>,
  'initialView' | 'view' | 'onViewChange' | 'signal' | 'surface'
>

function foldedAtMount<S extends string, M extends Mark>(
  initial: MountGraphOptions<S, M>['initialFolded'],
  latest: { readonly current: BoundProps<S, M> },
): MountGraphOptions<S, M>['initialFolded'] {
  if (typeof initial !== 'function') return initial
  return (group) => {
    const current = latest.current.initialFolded
    return (typeof current === 'function' ? current : initial)(group)
  }
}

export function sharedOptions<S extends string, M extends Mark>(latest: {
  readonly current: BoundProps<S, M>
}): SharedOptions<S, M> {
  const initial = latest.current
  return {
    definition: initial.definition,
    ariaLabel: initial.ariaLabel,
    selection: initial.selection,
    onSelectionChange: (next) => latest.current.onSelectionChange?.(next),
    initialFolded: foldedAtMount(initial.initialFolded, latest),
    initialPositions: initial.initialPositions,
    folded: initial.folded,
    onFoldChange: (next) => latest.current.onFoldChange?.(next),
    initialTime: initial.initialTime,
    time: initial.time,
    onTimeChange: (next) =>
      queueMicrotask(() => flushSync(() => latest.current.onTimeChange?.(next))),
    initialHiddenLayers: initial.initialHiddenLayers,
    hiddenLayers: initial.hiddenLayers,
    onLayerChange: (next) => latest.current.onLayerChange?.(next),
  }
}

export function useGraphBinding<S extends string, M extends Mark>(
  graph: GraphInstance<S, M> | null,
  props: BoundProps<S, M>,
  latest: { readonly current: BoundProps<S, M> },
): void {
  const { definition, ariaLabel, selection, folded, view, time, hiddenLayers, ref } = props

  useLayoutEffect(() => {
    graph?.update({ ariaLabel })
  }, [graph, ariaLabel])
  useLayoutEffect(() => {
    graph?.update({ selection })
  }, [graph, selection])
  useLayoutEffect(() => {
    graph?.update({ folded })
  }, [graph, folded])
  useLayoutEffect(() => {
    graph?.update({ view })
  }, [graph, view])
  useLayoutEffect(() => {
    graph?.update({ time })
  }, [graph, time])
  useLayoutEffect(() => {
    graph?.update({ hiddenLayers })
  }, [graph, hiddenLayers])
  useLayoutEffect(() => {
    graph?.update({ definition })
  }, [graph, definition])

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
}

/**
 * Mounts a graph in a `div` and renders its children above the canvas. The `div` takes the
 * position given by its class or style, and is positioned relative when it has none. It needs a
 * height from the page. The graph mounts once and is destroyed on unmount.
 */
export function Graph<S extends string = string, M extends Mark = Mark>(
  props: GraphProps<S, M>,
): JSX.Element {
  const { className, style, children } = props
  const wrapper = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [graph, setGraph] = useState<GraphInstance<S, M> | null>(null)
  const latest = useLatest(props)
  const given = style?.position
  const forced = useRef(false)
  const placed = useRef<string | null>(null)

  useLayoutEffect(() => {
    const element = wrapper.current
    const key = `${className ?? ''}|${given ?? ''}`
    if (!element || placed.current === key) return
    placed.current = key
    if (forced.current && given === undefined) element.style.position = ''
    forced.current = false
    if (given !== undefined) return
    const position = getComputedStyle(element).position
    if (position !== 'static' && position !== '') return
    element.style.position = 'relative'
    forced.current = true
  })

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const initial = latest.current
    const instance = mountGraph(element, {
      ...sharedOptions(latest),
      initialView: initial.initialView,
      view: initial.view,
      onViewChange: (next) => flushSync(() => latest.current.onViewChange?.(next)),
    })
    setGraph(instance)
    return () => {
      instance.destroy()
      setGraph(null)
    }
  }, [latest])

  useGraphBinding(graph, props, latest)

  return (
    <div ref={wrapper} className={className} style={style}>
      <div ref={host} style={fill} />
      {graph ? <GraphContext value={graph}>{children}</GraphContext> : null}
    </div>
  )
}
