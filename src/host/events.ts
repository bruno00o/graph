import type { AggregateEdge, Key, Point, View } from '../types'

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

export interface ElementKeys {
  readonly nodes: readonly Key[]
  readonly edges: readonly Key[]
}

export interface ElementKeysInput {
  readonly nodes?: Iterable<Key>
  readonly edges?: Iterable<Key>
}

export interface GraphPointerEvent {
  readonly target: GraphTarget | null
  readonly point: Point
  readonly world: Point
  readonly originalEvent: MouseEvent
}

export interface GraphTargetEvent {
  readonly target: GraphTarget
  readonly originalEvent: MouseEvent
}

export interface GraphDragEvent {
  readonly target: GraphTarget & { readonly kind: 'node' }
  readonly keys: readonly Key[]
  readonly point: Point
  readonly world: Point
  readonly originalEvent: PointerEvent
}

export interface GraphFocusEvent {
  readonly target: GraphTarget | null
}

export interface GraphLayoutEvent {
  readonly name: string
}

export interface GraphLayoutEndEvent extends GraphLayoutEvent {
  readonly completed: boolean
}

/** Payload of `foldchange` and of the controlled `onFoldChange` callback. */
export interface GraphFoldEvent {
  /** Keys of the folded groups. */
  readonly folded: readonly Key[]
}

export type PositionOrigin = 'drag' | 'api' | 'layout'

export interface GraphPositionEvent {
  readonly origin: PositionOrigin
  readonly positions: ReadonlyMap<Key, Point>
}

export interface GraphEvents {
  readonly click: GraphPointerEvent
  readonly doubleclick: GraphPointerEvent
  readonly contextmenu: GraphPointerEvent
  readonly pointerenter: GraphTargetEvent
  readonly pointerleave: GraphTargetEvent
  readonly dragstart: GraphDragEvent
  readonly drag: GraphDragEvent
  readonly dragend: GraphDragEvent
  readonly positionchange: GraphPositionEvent
  readonly selectionchange: ElementKeys
  readonly focuschange: GraphFocusEvent
  readonly foldchange: GraphFoldEvent
  readonly viewchange: { readonly view: View }
  readonly layoutstart: GraphLayoutEvent
  readonly layoutend: GraphLayoutEndEvent
}

export type GraphEventName = keyof GraphEvents

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
