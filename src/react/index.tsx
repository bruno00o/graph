import {
  type CSSProperties,
  createContext,
  type JSX,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
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
import type { GraphDefinition, View } from '../types'

export interface GraphEventProps {
  readonly onClick?: GraphEventHandler<'click'>
  readonly onDoubleClick?: GraphEventHandler<'doubleclick'>
  readonly onContextMenu?: GraphEventHandler<'contextmenu'>
  readonly onPointerEnter?: GraphEventHandler<'pointerenter'>
  readonly onPointerLeave?: GraphEventHandler<'pointerleave'>
  readonly onDragStart?: GraphEventHandler<'dragstart'>
  readonly onDrag?: GraphEventHandler<'drag'>
  readonly onDragEnd?: GraphEventHandler<'dragend'>
  readonly onPositionChange?: GraphEventHandler<'positionchange'>
  readonly onSelectionChange?: GraphEventHandler<'selectionchange'>
  readonly onFocusChange?: GraphEventHandler<'focuschange'>
  readonly onViewChange?: GraphEventHandler<'viewchange'>
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
  viewchange: 'onViewChange',
}

export interface GraphProps<S extends string = string> extends GraphEventProps {
  readonly definition: GraphDefinition<S>
  readonly ariaLabel: string
  readonly initialView?: View
  readonly selection?: ElementKeysInput
  readonly className?: string
  readonly style?: CSSProperties
  readonly ref?: Ref<GraphInstance<S> | null>
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

export function Graph<S extends string = string>(props: GraphProps<S>): JSX.Element {
  const { definition, ariaLabel, selection, className, style, ref, children } = props
  const host = useRef<HTMLDivElement>(null)
  const [graph, setGraph] = useState<GraphInstance<S> | null>(null)
  const latest = useLatest(props)

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const initial = latest.current
    const instance = mountGraph(element, {
      definition: initial.definition,
      ariaLabel: initial.ariaLabel,
      ...(initial.initialView ? { initialView: initial.initialView } : {}),
      ...(initial.selection !== undefined
        ? {
            selection: initial.selection,
            onSelectionChange: (next) => latest.current.onSelectionChange?.(next),
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
    graph?.update({ definition, ariaLabel, ...(selection !== undefined ? { selection } : {}) })
  }, [graph, definition, ariaLabel, selection])

  useEffect(() => {
    if (!graph) return
    const stops = (Object.keys(eventProps) as GraphEventName[]).map((name) =>
      graph.on(name, (event) => {
        if (name === 'selectionchange' && latest.current.selection !== undefined) return
        const handler = latest.current[eventProps[name]] as ((event: unknown) => void) | undefined
        handler?.(event)
      }),
    )
    return () => {
      for (const stop of stops) stop()
    }
  }, [graph, latest])

  useImperativeHandle<GraphInstance<S> | null, GraphInstance<S> | null>(ref, () => graph, [graph])

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <div ref={host} style={fill} />
      {graph ? <GraphContext value={graph}>{children}</GraphContext> : null}
    </div>
  )
}

export function useGraph(): GraphInstance {
  const graph = useContext(GraphContext)
  if (!graph) throw new Error('useGraph: call it inside <Graph>')
  return graph
}

interface Selected<T> {
  readonly state: GraphState
  readonly selector: (state: GraphState) => T
  readonly value: T
}

export interface UseGraphStateOptions<T> {
  readonly compare?: (a: T, b: T) => boolean
}

export function useGraphState<T>(
  selector: (state: GraphState) => T,
  options: UseGraphStateOptions<T> = {},
): T {
  const compare = options.compare ?? Object.is
  const graph = useGraph()
  const cache = useRef<Selected<T> | null>(null)
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

export function useGraphEvent<K extends GraphEventName>(
  name: K,
  handler: GraphEventHandler<K>,
): void {
  const graph = useGraph()
  const latest = useLatest(handler)
  useEffect(
    () => graph.on(name, (event: GraphEvents[K]) => latest.current(event)),
    [graph, name, latest],
  )
}

export type { GraphInstance, GraphState, GraphStore }
