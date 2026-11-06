import type { Key, Point, View } from '../types'

/**
 * Side of the target where an anchored element sits: `'top'`, `'right'`, `'bottom'`, `'left'`,
 * or `'center'` on the target.
 */
export type AnchorSide = 'top' | 'right' | 'bottom' | 'left' | 'center'

/**
 * Alignment of an anchored element along the side of its target: `'start'` lines up the left or
 * top edges, `'center'` centers it, `'end'` lines up the right or bottom edges.
 */
export type AnchorAlign = 'start' | 'center' | 'end'

/**
 * Options of `graph.anchors.set`: where an element is pinned and when it shows. Give one target:
 * `node`, `nodes`, `state`, `edge` or `point`. The element is hidden while its target is missing
 * or off screen.
 */
export interface AnchorOptions<S extends string = string> {
  /** Key of the node to follow. */
  readonly node?: Key
  /** Keys of nodes to follow together: the element is placed on their bounding box. */
  readonly nodes?: Iterable<Key>
  /** A state whose nodes are followed together, on their bounding box. */
  readonly state?: S
  /** Key of the edge to follow, at the anchor of its label. */
  readonly edge?: Key
  /** Point to follow, in world units. */
  readonly point?: Point
  /**
   * Side of the target where the element sits, 4 pixels away from the node edge and outline.
   * @default 'center'
   */
  readonly side?: AnchorSide
  /**
   * Alignment along the side.
   * @default 'center'
   */
  readonly align?: AnchorAlign
  /** Extra shift in screen pixels. */
  readonly offset?: Point
  /**
   * Shows the element only while its node, its edge, or one of its nodes is in this state, such
   * as `'selected'` or `'hovered'`. Applies to `node`, `nodes` and `edge`.
   */
  readonly when?: S
  /**
   * Scales the element with the zoom, as if it were drawn in the world at zoom 1.
   * @default false
   */
  readonly scale?: boolean
  /**
   * Lets the element take the pointer. Otherwise clicks and drags go through to the graph. The
   * wheel always zooms the graph, unless the element under the pointer can scroll.
   * @default false
   */
  readonly interactive?: boolean
}

/** HTML elements pinned to nodes, edges or points, moved with the view without a render. */
export interface GraphAnchors<S extends string = string> {
  /**
   * Pins an element, or changes the options of an element already pinned. The element moves
   * into a layer over the canvas. Returns the function that removes it.
   */
  set(element: HTMLElement, options: AnchorOptions<S>): () => void
  /** Takes a pinned element out of the graph. */
  remove(element: HTMLElement): void
}

export interface AnchorBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface AnchorLocator {
  view(): View
  size(): { readonly width: number; readonly height: number }
  nodeBox(key: Key, box: AnchorBox): boolean
  edgePoint(key: Key, box: AnchorBox): boolean
  stateNodes(name: string): readonly Key[]
  inState(name: string, kind: 'nodes' | 'edges', key: Key): boolean
  checkState(name: string): void
}

interface Anchor {
  readonly element: HTMLElement
  readonly wrapper: HTMLDivElement
  options: AnchorOptions
  keys: readonly Key[] | null
  width: number
  height: number
  transform: string
  hidden: boolean
}

const gap = 4

function scrollable(target: EventTarget | null, stop: Element, event: WheelEvent): boolean {
  let element = target instanceof Element ? target : null
  while (element && element !== stop) {
    const style = getComputedStyle(element)
    const vertical =
      /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight
    const horizontal =
      /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth
    if ((vertical && event.deltaY !== 0) || (horizontal && event.deltaX !== 0)) return true
    element = element.parentElement
  }
  return false
}

export class AnchorLayer {
  readonly layer: HTMLDivElement
  readonly #anchors = new Map<HTMLElement, Anchor>()
  readonly #wrappers = new WeakMap<Element, Anchor>()
  readonly #locator: AnchorLocator
  readonly #request: () => void
  readonly #observer: ResizeObserver | null
  readonly #box: AnchorBox = { x0: 0, y0: 0, x1: 0, y1: 0 }
  readonly #part: AnchorBox = { x0: 0, y0: 0, x1: 0, y1: 0 }

  constructor(host: HTMLElement, target: HTMLElement, locator: AnchorLocator, request: () => void) {
    this.#locator = locator
    this.#request = request
    this.layer = document.createElement('div')
    this.layer.setAttribute('data-graph-anchors', '')
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'
    this.layer.addEventListener(
      'wheel',
      (event) => {
        if (scrollable(event.target, this.layer, event)) return
        const copy = new WheelEvent('wheel', event)
        target.dispatchEvent(copy)
        if (copy.defaultPrevented) event.preventDefault()
      },
      { passive: false },
    )
    host.append(this.layer)
    this.#observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
              const anchor = entry.target ? this.#wrappers.get(entry.target) : undefined
              if (!anchor) continue
              anchor.width = (entry.target as HTMLElement).offsetWidth
              anchor.height = (entry.target as HTMLElement).offsetHeight
            }
            this.#request()
          })
        : null
  }

  set(element: HTMLElement, options: AnchorOptions): () => void {
    for (const name of [options.state, options.when]) {
      if (name !== undefined) this.#locator.checkState(name)
    }
    let anchor = this.#anchors.get(element)
    if (!anchor) {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-graph-anchor', '')
      wrapper.style.cssText =
        'position:absolute;left:0;top:0;width:max-content;transform-origin:0 0;visibility:hidden'
      wrapper.append(element)
      this.layer.append(wrapper)
      anchor = {
        element,
        wrapper,
        options,
        keys: null,
        width: wrapper.offsetWidth,
        height: wrapper.offsetHeight,
        transform: '',
        hidden: true,
      }
      this.#anchors.set(element, anchor)
      this.#wrappers.set(wrapper, anchor)
      this.#observer?.observe(wrapper)
    }
    anchor.options = options
    anchor.keys = options.nodes ? [...options.nodes] : null
    anchor.wrapper.style.pointerEvents = options.interactive ? 'auto' : 'none'
    this.#request()
    return () => this.remove(element)
  }

  remove(element: HTMLElement): void {
    const anchor = this.#anchors.get(element)
    if (!anchor) return
    this.#anchors.delete(element)
    this.#observer?.unobserve(anchor.wrapper)
    element.remove()
    anchor.wrapper.remove()
  }

  update(): void {
    if (this.#anchors.size === 0) return
    const { width, height } = this.#locator.size()
    const zoom = this.#locator.view().zoom
    for (const anchor of this.#anchors.values()) {
      const box = this.#box
      const shown = this.#target(anchor, box) && this.#allowed(anchor)
      const scale = anchor.options.scale ? zoom : 1
      const w = anchor.width * scale
      const h = anchor.height * scale
      const position = shown ? this.#place(anchor.options, box, w, h) : null
      const visible =
        position !== null &&
        position.x < width &&
        position.y < height &&
        position.x + w > 0 &&
        position.y + h > 0
      if (visible !== !anchor.hidden) {
        anchor.hidden = !visible
        anchor.wrapper.style.visibility = visible ? '' : 'hidden'
      }
      if (!visible || !position) continue
      const transform = `translate(${Math.round(position.x)}px,${Math.round(position.y)}px)${
        scale === 1 ? '' : ` scale(${scale})`
      }`
      if (transform !== anchor.transform) {
        anchor.transform = transform
        anchor.wrapper.style.transform = transform
      }
    }
  }

  destroy(): void {
    this.#observer?.disconnect()
    for (const element of [...this.#anchors.keys()]) this.remove(element)
    this.layer.remove()
  }

  #target(anchor: Anchor, box: AnchorBox): boolean {
    const options = anchor.options
    const locator = this.#locator
    if (options.node !== undefined) return locator.nodeBox(options.node, box)
    if (options.edge !== undefined) return locator.edgePoint(options.edge, box)
    if (options.point) {
      const { width, height } = locator.size()
      const view = locator.view()
      box.x0 = box.x1 = (options.point.x - view.x) * view.zoom + width / 2
      box.y0 = box.y1 = (options.point.y - view.y) * view.zoom + height / 2
      return true
    }
    const keys =
      anchor.keys ?? (options.state !== undefined ? locator.stateNodes(options.state) : null)
    if (!keys) return false
    let found = false
    for (const key of keys) {
      if (!locator.nodeBox(key, this.#part)) continue
      if (!found) Object.assign(box, this.#part)
      else {
        box.x0 = Math.min(box.x0, this.#part.x0)
        box.y0 = Math.min(box.y0, this.#part.y0)
        box.x1 = Math.max(box.x1, this.#part.x1)
        box.y1 = Math.max(box.y1, this.#part.y1)
      }
      found = true
    }
    return found
  }

  #allowed(anchor: Anchor): boolean {
    const { when, node, edge } = anchor.options
    if (when === undefined) return true
    const locator = this.#locator
    if (node !== undefined) return locator.inState(when, 'nodes', node)
    if (edge !== undefined) return locator.inState(when, 'edges', edge)
    if (anchor.keys) return anchor.keys.some((key) => locator.inState(when, 'nodes', key))
    return true
  }

  #place(options: AnchorOptions, box: AnchorBox, w: number, h: number): Point {
    const side = options.side ?? 'center'
    const align = options.align ?? 'center'
    const along = (start: number, end: number, size: number) =>
      align === 'start' ? start : align === 'end' ? end - size : (start + end - size) / 2
    let x: number
    let y: number
    if (side === 'top' || side === 'bottom') {
      x = along(box.x0, box.x1, w)
      y = side === 'top' ? box.y0 - gap - h : box.y1 + gap
    } else if (side === 'left' || side === 'right') {
      x = side === 'left' ? box.x0 - gap - w : box.x1 + gap
      y = along(box.y0, box.y1, h)
    } else {
      x = (box.x0 + box.x1 - w) / 2
      y = (box.y0 + box.y1 - h) / 2
    }
    return { x: x + (options.offset?.x ?? 0), y: y + (options.offset?.y ?? 0) }
  }
}
