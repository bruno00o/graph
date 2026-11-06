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
import type { GraphDefinition, Key, Mark, View } from '../types'

/** Event props of `<Graph>`. The latest function passed is always called. `M` types the targets. */
export interface GraphEventProps<M extends Mark = Mark> {
  /** Receives `click`: a press released within 4 pixels, 10 for a touch. */
  readonly onClick?: GraphEventHandler<'click', M>
  /** Receives `doubleclick`. */
  readonly onDoubleClick?: GraphEventHandler<'doubleclick', M>
  /** Receives `contextmenu`: a secondary click. */
  readonly onContextMenu?: GraphEventHandler<'contextmenu', M>
  /** Receives `pointerenter`: the pointer enters an element. */
  readonly onPointerEnter?: GraphEventHandler<'pointerenter', M>
  /** Receives `pointerleave`: the pointer leaves an element. */
  readonly onPointerLeave?: GraphEventHandler<'pointerleave', M>
  /** Receives `dragstart`: a node drag starts. */
  readonly onDragStart?: GraphEventHandler<'dragstart', M>
  /** Receives `drag`: dragged nodes move. */
  readonly onDrag?: GraphEventHandler<'drag', M>
  /** Receives `dragend`: a node drag ends. */
  readonly onDragEnd?: GraphEventHandler<'dragend', M>
  /** Receives `positionchange`: nodes moved by a drag, by code or by a layout run. */
  readonly onPositionChange?: GraphEventHandler<'positionchange', M>
  /** Receives `selectionchange`, or the selection requests when `selection` is given. */
  readonly onSelectionChange?: GraphEventHandler<'selectionchange', M>
  /** Receives `focuschange`: the keyboard focus moved. */
  readonly onFocusChange?: GraphEventHandler<'focuschange', M>
  /** Receives `foldchange`, or the fold requests when `folded` is given. */
  readonly onFoldChange?: GraphEventHandler<'foldchange', M>
  /**
   * Receives `viewchange`, or the view requests when `view` is given. Requests are rendered
   * synchronously, so a state update in the handler draws in the same frame.
   */
  readonly onViewChange?: GraphEventHandler<'viewchange', M>
  /** Receives `zoomhint`: a wheel event went to the page in `'page'` wheel mode. */
  readonly onZoomHint?: GraphEventHandler<'zoomhint', M>
  /** Receives `layoutstart`: a layout run starts. */
  readonly onLayoutStart?: GraphEventHandler<'layoutstart', M>
  /** Receives `layoutend`: a layout run ends or stops. */
  readonly onLayoutEnd?: GraphEventHandler<'layoutend', M>
}

const eventProps: Readonly<Record<GraphEventName, keyof GraphEventProps>> = {
  click: 'onClick',
  doubleclick: 'onDoubleClick',
  contextmenu: 'onContextMenu',
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
  readonly initialView?: View
  /**
   * Makes the view controlled when given at mount: `onViewChange` receives the requests of
   * gestures, keys, `view` calls and animation steps, and only this prop moves the view.
   */
  readonly view?: View
  /**
   * Makes the selection controlled when given at mount: `onSelectionChange` receives the requests,
   * and only this prop changes the selection.
   */
  readonly selection?: ElementKeysInput
  /** Groups folded at mount, read once. */
  readonly initialFolded?: Iterable<Key>
  /**
   * Makes folding controlled when given at mount: `onFoldChange` receives the requests, and only
   * this prop changes the folded groups.
   */
  readonly folded?: Iterable<Key>
  /** Class of the wrapping `div`. */
  readonly className?: string
  /** Style of the wrapping `div`, merged with `position: relative`. */
  readonly style?: CSSProperties
  /**
   * Receives the graph instance. Its type comes from the definition: a ref typed as a plain
   * `GraphInstance` works too.
   */
  readonly ref?: Ref<GraphInstance<NoInfer<S>, NoInfer<M>> | null> | RefObject<GraphInstance | null>
  /** Overlays drawn above the canvas, rendered once the graph is mounted. */
  readonly children?: ReactNode
}

const GraphContext = createContext<GraphInstance | null>(null)

const fill: CSSProperties = { position: 'absolute', inset: 0 }

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
  const { definition, ariaLabel, selection, folded, view, className, style, ref, children } = props
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
      ...(initial.initialView ? { initialView: initial.initialView } : {}),
      ...(initial.view !== undefined
        ? {
            view: initial.view,
            onViewChange: (next) => flushSync(() => latest.current.onViewChange?.(next)),
          }
        : {}),
      ...(initial.selection !== undefined
        ? {
            selection: initial.selection,
            onSelectionChange: (next) => latest.current.onSelectionChange?.(next),
          }
        : {}),
      ...(initial.initialFolded !== undefined ? { initialFolded: initial.initialFolded } : {}),
      ...(initial.folded !== undefined
        ? {
            folded: initial.folded,
            onFoldChange: (next) => latest.current.onFoldChange?.(next),
          }
        : {}),
    })
    setGraph(instance)
    return () => {
      instance.destroy()
      setGraph(null)
    }
  }, [latest])

  useLayoutEffect(() => {
    graph?.update({
      definition,
      ariaLabel,
      ...(selection !== undefined ? { selection } : {}),
      ...(folded !== undefined ? { folded } : {}),
      ...(view !== undefined ? { view } : {}),
    })
  }, [graph, definition, ariaLabel, selection, folded, view])

  useEffect(() => {
    if (!graph) return
    const stops = (Object.keys(eventProps) as GraphEventName[]).map((name) =>
      graph.on(name, (event) => {
        if (name === 'selectionchange' && latest.current.selection !== undefined) return
        if (name === 'foldchange' && latest.current.folded !== undefined) return
        if (name === 'viewchange' && latest.current.view !== undefined) return
        const handler = latest.current[eventProps[name]] as ((event: unknown) => void) | undefined
        handler?.(event)
      }),
    )
    return () => {
      for (const stop of stops) stop()
    }
  }, [graph, latest])

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
  readonly compare?: (a: T, b: T) => boolean
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

/** Props of `Anchor`: where to pin the children, as in `graph.anchors.set`. */
export interface AnchorProps<S extends string = string> extends AnchorOptions<S> {
  /** Content pinned to the target. */
  readonly children?: ReactNode
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

export type { AnchorAlign, AnchorOptions, AnchorSide } from '../host/anchors'
export type { GraphInstance, GraphState, GraphStore }
