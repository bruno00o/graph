import type {
  AggregateEdge,
  EdgeMark,
  Key,
  Mark,
  MarkName,
  NodeMark,
  Point,
  TimeWindow,
  View,
} from '../types'
import type { GraphLensState } from './lens'

/** A node, with `datum`, the item it comes from, of type `T`, and `mark`, the name of its mark. */
export interface NodeTarget<T = unknown, N extends MarkName = MarkName> {
  /** Always `'node'`. */
  readonly kind: 'node'
  /** Key of the node. */
  readonly key: Key
  /** The item the node comes from, as given to `nodes()`. */
  readonly datum: T
  /** `name` of the mark of the node, or `undefined` for a mark without one. */
  readonly mark: N
}

/** An edge, with `datum`, the item it comes from, of type `T`, and `mark`, the name of its mark. */
export interface EdgeTarget<T = unknown, N extends MarkName = MarkName> {
  /** Always `'edge'`. */
  readonly kind: 'edge'
  /** Key of the edge. */
  readonly key: Key
  /** The item the edge comes from, as given to `edges()`. */
  readonly datum: T
  /** `name` of the mark of the edge, or `undefined` for a mark without one. */
  readonly mark: N
  /**
   * Set when the edge stands for several edges between folded groups; `key` and `datum` are then
   * those of its first edge.
   */
  readonly aggregate?: AggregateEdge<T>
}

/**
 * A node or an edge of the marks `M`. Narrow on `kind`, then on `mark` to get the item type of one
 * mark in `datum`. Without `M`, `datum` is `unknown`.
 */
export type GraphTarget<M extends Mark = Mark> =
  M extends NodeMark<infer T, infer N>
    ? NodeTarget<T, N>
    : M extends EdgeMark<infer T, infer N>
      ? EdgeTarget<T, N>
      : NodeTarget | EdgeTarget

/** Keys of nodes and of edges. */
export interface ElementKeys {
  /** Node keys. */
  readonly nodes: readonly Key[]
  /** Edge keys. */
  readonly edges: readonly Key[]
}

/** Keys of nodes and of edges, from any iterable. A missing list counts as empty. */
export interface ElementKeysInput {
  /** Node keys. */
  readonly nodes?: Iterable<Key>
  /** Edge keys. */
  readonly edges?: Iterable<Key>
}

/** Payload of `click`, `doubleclick` and `contextmenu`. `M` is the union of the marks. */
export interface GraphPointerEvent<M extends Mark = Mark> {
  /** Element under the pointer, or `null` for the background. */
  readonly target: GraphTarget<M> | null
  /** Pointer position in screen pixels, relative to the graph element. */
  readonly point: Point
  /** Pointer position in world units. */
  readonly world: Point
  /** The DOM event. */
  readonly originalEvent: MouseEvent
}

/** Payload of `pointerenter` and `pointerleave`. `M` is the union of the marks. */
export interface GraphTargetEvent<M extends Mark = Mark> {
  /** Element the pointer entered or left. */
  readonly target: GraphTarget<M>
  /** The DOM event. */
  readonly originalEvent: MouseEvent
}

/** Payload of `dragstart`, `drag` and `dragend`. `M` is the union of the marks. */
export interface GraphDragEvent<M extends Mark = Mark> {
  /** Node under the pointer. */
  readonly target: Extract<GraphTarget<M>, { readonly kind: 'node' }>
  /**
   * Every node the drag moves: the whole selection when the dragged node is selected, and the nodes
   * inside a dragged group.
   */
  readonly keys: readonly Key[]
  /** Pointer position in screen pixels, relative to the graph element. */
  readonly point: Point
  /** Pointer position in world units. */
  readonly world: Point
  /** The DOM event. */
  readonly originalEvent: PointerEvent
}

/** Payload of `focuschange`. `M` is the union of the marks. */
export interface GraphFocusEvent<M extends Mark = Mark> {
  /** Element that has the keyboard focus, or `null`. */
  readonly target: GraphTarget<M> | null
}

/** Payload of `layoutstart`. */
export interface GraphLayoutEvent {
  /** Name of the layout, such as `'force'`. */
  readonly name: string
}

/** Payload of `layoutend`. */
export interface GraphLayoutEndEvent extends GraphLayoutEvent {
  /** `false` when the run was stopped or replaced before its end. */
  readonly completed: boolean
}

/** Payload of `foldchange` and of the controlled `onFoldChange` callback. */
export interface GraphFoldEvent {
  /** Keys of the folded groups. */
  readonly folded: readonly Key[]
}

/** Payload of `viewchange` and of the controlled `onViewChange` callback. */
export interface GraphViewEvent {
  /** The view. */
  readonly view: View
}

/** Payload of `timechange` and of the controlled `onTimeChange` callback. */
export interface GraphTimeEvent {
  /** The time window, or `null` when every element shows. */
  readonly window: TimeWindow | null
}

/** Payload of `lenschange`. */
export interface GraphLensEvent {
  /** The lens, or `null` when it hides. */
  readonly lens: GraphLensState | null
}

/** Key that makes the wheel zoom: `'Meta'` (Cmd) on Apple systems, `'Control'` elsewhere. */
export type ZoomKey = 'Meta' | 'Control'

/** Payload of `zoomhint`. */
export interface GraphZoomHintEvent {
  /** Key to hold while scrolling to zoom, for the hint the application shows. */
  readonly key: ZoomKey
  /** The DOM event, left to the page. */
  readonly originalEvent: WheelEvent
}

/** What moved the nodes: a drag, `positions.set`, or the end of a layout run. */
export type PositionOrigin = 'drag' | 'api' | 'layout'

/** Payload of `positionchange`. Moves that come from your data do not emit it. */
export interface GraphPositionEvent {
  /** What moved the nodes. */
  readonly origin: PositionOrigin
  /** Target position of each moved node, in world units. */
  readonly positions: ReadonlyMap<Key, Point>
}

/** Every event of the graph, by name, with its payload. `M` is the union of the marks. */
export interface GraphEvents<M extends Mark = Mark> {
  /**
   * A press released within 4 pixels of where it started, 10 for a touch, before the default
   * selection runs.
   */
  readonly click: GraphPointerEvent<M>
  /**
   * A double click. On a group it then folds or unfolds it, unless a handler calls
   * `originalEvent.preventDefault()`.
   */
  readonly doubleclick: GraphPointerEvent<M>
  /** A secondary click. */
  readonly contextmenu: GraphPointerEvent<M>
  /** The pointer enters an element. */
  readonly pointerenter: GraphTargetEvent<M>
  /** The pointer leaves an element. */
  readonly pointerleave: GraphTargetEvent<M>
  /** A node drag starts, once the pointer has moved 4 pixels. */
  readonly dragstart: GraphDragEvent<M>
  /** Dragged nodes move. */
  readonly drag: GraphDragEvent<M>
  /** A node drag ends. */
  readonly dragend: GraphDragEvent<M>
  /** Nodes moved by a drag, by `positions.set` or by a layout run that ended. */
  readonly positionchange: GraphPositionEvent
  /** The selection changed, from the user or from code. */
  readonly selectionchange: ElementKeys
  /** The keyboard focus moved to another element, or left. */
  readonly focuschange: GraphFocusEvent<M>
  /** Groups were folded or unfolded, from the user or from code. */
  readonly foldchange: GraphFoldEvent
  /** The view changed. In controlled mode, only when `update({ view })` moves it. */
  readonly viewchange: GraphViewEvent
  /** The time window changed. In controlled mode, only when `update({ time })` moves it. */
  readonly timechange: GraphTimeEvent
  /** The lens shows, moves, changes size or magnification, or hides. */
  readonly lenschange: GraphLensEvent
  /**
   * A wheel event without Cmd or Ctrl went to the page, in `'page'` wheel mode with zoom on: the
   * application can show how to zoom. Fires for every such event.
   */
  readonly zoomhint: GraphZoomHintEvent
  /** A layout run starts. Nodes that join a run do not start another. */
  readonly layoutstart: GraphLayoutEvent
  /** A layout run ends, is stopped or is replaced. */
  readonly layoutend: GraphLayoutEndEvent
}

/** Name of a graph event. */
export type GraphEventName = keyof GraphEvents

/** Function that receives the payload of event `K`. `M` is the union of the marks. */
export type GraphEventHandler<K extends GraphEventName, M extends Mark = Mark> = (
  event: GraphEvents<M>[K],
) => void

export class Emitter {
  readonly #handlers = new Map<GraphEventName, Set<(event: never) => void>>()

  on<K extends GraphEventName>(name: K, handler: GraphEventHandler<K>): () => void {
    let set = this.#handlers.get(name)
    if (!set) {
      set = new Set()
      this.#handlers.set(name, set)
    }
    const entry = handler as (event: never) => void
    set.add(entry)
    return () => {
      set.delete(entry)
    }
  }

  has(name: GraphEventName): boolean {
    return (this.#handlers.get(name)?.size ?? 0) > 0
  }

  emit<K extends GraphEventName>(name: K, event: GraphEvents[K]): void {
    const set = this.#handlers.get(name)
    if (!set) return
    for (const handler of [...set]) (handler as GraphEventHandler<K>)(event)
  }

  clear(): void {
    this.#handlers.clear()
  }
}
