import type { AggregateEdge, Key, Point, View } from '../types'

/** A node or an edge, with `datum`, the item it comes from in your data. Narrow on `kind`. */
export type GraphTarget =
  | { readonly kind: 'node'; readonly key: Key; readonly datum: unknown }
  | {
      readonly kind: 'edge'
      readonly key: Key
      readonly datum: unknown
      /**
       * Set when the edge stands for several edges between folded groups; `key` and `datum` are then
       * those of its first edge.
       */
      readonly aggregate?: AggregateEdge
    }

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

/** Payload of `click`, `doubleclick` and `contextmenu`. */
export interface GraphPointerEvent {
  /** Element under the pointer, or `null` for the background. */
  readonly target: GraphTarget | null
  /** Pointer position in screen pixels, relative to the graph element. */
  readonly point: Point
  /** Pointer position in world units. */
  readonly world: Point
  /** The DOM event. */
  readonly originalEvent: MouseEvent
}

/** Payload of `pointerenter` and `pointerleave`. */
export interface GraphTargetEvent {
  /** Element the pointer entered or left. */
  readonly target: GraphTarget
  /** The DOM event. */
  readonly originalEvent: MouseEvent
}

/** Payload of `dragstart`, `drag` and `dragend`. */
export interface GraphDragEvent {
  /** Node under the pointer. */
  readonly target: GraphTarget & { readonly kind: 'node' }
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

/** Payload of `focuschange`. */
export interface GraphFocusEvent {
  /** Element that has the keyboard focus, or `null`. */
  readonly target: GraphTarget | null
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

/** Every event of the graph, by name, with its payload. */
export interface GraphEvents {
  /**
   * A press released within 4 pixels of where it started, 10 for a touch, before the default
   * selection runs.
   */
  readonly click: GraphPointerEvent
  /**
   * A double click. On a group it then folds or unfolds it, unless a handler calls
   * `originalEvent.preventDefault()`.
   */
  readonly doubleclick: GraphPointerEvent
  /** A secondary click. */
  readonly contextmenu: GraphPointerEvent
  /** The pointer enters an element. */
  readonly pointerenter: GraphTargetEvent
  /** The pointer leaves an element. */
  readonly pointerleave: GraphTargetEvent
  /** A node drag starts, once the pointer has moved 4 pixels. */
  readonly dragstart: GraphDragEvent
  /** Dragged nodes move. */
  readonly drag: GraphDragEvent
  /** A node drag ends. */
  readonly dragend: GraphDragEvent
  /** Nodes moved by a drag, by `positions.set` or by a layout run that ended. */
  readonly positionchange: GraphPositionEvent
  /** The selection changed, from the user or from code. */
  readonly selectionchange: ElementKeys
  /** The keyboard focus moved to another element, or left. */
  readonly focuschange: GraphFocusEvent
  /** Groups were folded or unfolded, from the user or from code. */
  readonly foldchange: GraphFoldEvent
  /** The view changed. */
  readonly viewchange: { readonly view: View }
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

/** Function that receives the payload of event `K`. */
export type GraphEventHandler<K extends GraphEventName> = (event: GraphEvents[K]) => void

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
