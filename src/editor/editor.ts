import { createStore, type ReadonlyStore } from '@tanstack/store'
import { toAccessor } from '../core/accessor'
import { worldSize } from '../core/geo'
import type { GraphChanges, ShapeRecord } from '../core/graph-model'
import type { GraphInstance } from '../host/graph-instance'
import { internalsOf } from '../host/internals'
import { isolateSubscribers, report } from '../host/isolate'
import type { PointerTool, ToolPointer } from '../host/pointer-tool'
import { readonlyOf } from '../host/readonly-store'
import type { Key, KeyList, Mark, Point } from '../types'
import type { ShapeEdit, ShapeMarkName } from './edits'
import {
  type Bounds,
  boundsOf,
  geoOutline,
  insertVertex,
  moveVertex,
  type Outline,
  type PathOutline,
  readEditable,
  removeVertex,
  scaleOutline,
  translateOutline,
  writeEditable,
} from './geometry'
import {
  boxCorners,
  boxHandle,
  boxHandles,
  type Handle,
  hitHandle,
  insideRings,
  middleHandle,
  project,
  ringsOf,
  type Screen,
  screenTolerance,
  tracePath,
  vertexHandles,
  worldAt,
} from './screen'

/** Options of `createShapeEditor`. `M` is the union of the marks of the graph. */
export interface ShapeEditorOptions<M extends Mark = Mark> {
  /** Names of the shape marks whose shapes can be edited. Defaults to every shape mark. */
  readonly marks?: KeyList<ShapeMarkName<M>> | undefined
  /** Called with each batch of edits the editor proposes, like the `edit` event. */
  readonly onEdit?: ((edits: readonly ShapeEdit<M>[]) => void) | undefined
  /**
   * How long a proposed shape stays drawn as proposed while its data does not change, in
   * milliseconds; then the data wins and `editlost` is emitted. `Infinity` waits for good.
   * @default 10000
   */
  readonly hold?: number | undefined
  /**
   * Side of a handle, in screen pixels.
   * @default 8
   */
  readonly handleSize?: number | undefined
}

/** A gesture in progress. */
export interface ShapeEditorGesture {
  /** `'move'` moves shapes, `'vertex'` moves, adds or removes a point, `'resize'` scales shapes. */
  readonly type: 'move' | 'vertex' | 'resize'
  /** Keys of the shapes the gesture changes. */
  readonly keys: readonly Key[]
}

/** State of a shape editor. */
export interface ShapeEditorState {
  /** Selected shapes that the editor can edit, in the order of the selection. */
  readonly selected: readonly Key[]
  /** The gesture in progress, or `null`. */
  readonly gesture: ShapeEditorGesture | null
  /** Shapes whose proposed edit waits for their data to change. */
  readonly pending: readonly Key[]
}

/** Payload of the `edit` and `editlost` events of a shape editor. */
export interface ShapeEditEvent<M extends Mark = Mark> {
  /** The edits, in the order they were made. */
  readonly edits: readonly ShapeEdit<M>[]
}

/**
 * Events of a shape editor: `edit` for each batch of proposed edits, `editlost` for the edits whose
 * data did not change within `hold`.
 */
export interface ShapeEditorEvents<M extends Mark = Mark> {
  /** Edits proposed at the end of a gesture or by a key. */
  readonly edit: ShapeEditEvent<M>
  /** Edits whose shapes went back to their data. */
  readonly editlost: ShapeEditEvent<M>
}

/** A shape editor, made by `createShapeEditor`. `M` is the union of the marks of the graph. */
export interface ShapeEditor<M extends Mark = Mark> {
  /** State of the editor. */
  readonly store: ReadonlyStore<ShapeEditorState>
  /** Listens to an event; returns a function that stops listening. */
  on<K extends keyof ShapeEditorEvents<M>>(
    name: K,
    handler: (event: ShapeEditorEvents<M>[K]) => void,
  ): () => void
  /** Proposes to remove shapes, by default the selected ones the editor can edit. */
  remove(keys?: KeyList): void
  /** Cancels the gesture in progress: its shapes go back to where they were. */
  cancel(): void
  /** Changes options; the options left out keep their value. */
  update(options: ShapeEditorOptions<M>): void
  /** Stops editing and lets the pointer and the keys go back to the graph. */
  destroy(): void
}

export interface PreviewShape {
  readonly d: string
  readonly fill: string | null
  readonly stroke: string | null
  readonly width: number
  readonly dash: number
  readonly opacity: number
}

export interface EditorFrame {
  readonly shapes: readonly PreviewShape[]
  readonly box: string
  readonly handles: string
  readonly middles: string
  readonly active: string
}

export interface EditorDrawing {
  readonly element: HTMLElement
  frame(): EditorFrame
  listen(listener: (destroyed: boolean) => void): () => void
}

interface Entry {
  readonly record: ShapeRecord
  readonly outline: Outline
  readonly pin: Key | null
}

interface Pending {
  readonly edit: ShapeEdit
  readonly outline: Outline | null
  readonly batch: number
}

interface MoveGesture {
  readonly type: 'move'
  readonly keys: readonly Key[]
  readonly bases: ReadonlyMap<Key, Outline>
  readonly start: Point
  readonly from: Point
  readonly touch: boolean
  readonly pressed: Key
  readonly wasSelected: boolean
  dx: number
  dy: number
  started: boolean
}

interface VertexGesture {
  readonly type: 'vertex'
  readonly keys: readonly Key[]
  readonly key: Key
  readonly part: number
  readonly index: number
  readonly grab: Point
  readonly from: Point
  readonly touch: boolean
  readonly remove: boolean
  readonly inserted: boolean
  current: PathOutline
  started: boolean
}

interface ResizeGesture {
  readonly type: 'resize'
  readonly keys: readonly Key[]
  readonly bases: ReadonlyMap<Key, Outline>
  readonly box: Bounds
  readonly handle: number
  readonly start: Point
  readonly from: Point
  readonly touch: boolean
  readonly round: boolean
  current: ReadonlyMap<Key, Outline>
  started: boolean
}

type Gesture = MoveGesture | VertexGesture | ResizeGesture

interface ActiveVertex {
  readonly key: Key
  readonly part: number
  readonly index: number
}

const clickSlop = 4
const touchSlop = 10
const defaultHold = 10_000
const defaultHandleSize = 8
const arrowStep = 1
const arrowLongStep = 10
const noKeys: readonly Key[] = Object.freeze([])
const emptyState: ShapeEditorState = Object.freeze({
  selected: noKeys,
  gesture: null,
  pending: noKeys,
})
const resizeCursors = [
  'nwse-resize',
  'ns-resize',
  'nesw-resize',
  'ew-resize',
  'nwse-resize',
  'ns-resize',
  'nesw-resize',
  'ew-resize',
] as const
const drawings = new WeakMap<object, EditorDrawing>()
const editing = new WeakSet<object>()

export function drawingOf(editor: object): EditorDrawing {
  const drawing = drawings.get(editor)
  if (!drawing) throw new Error('mountShapeEditor: needs an editor made by createShapeEditor')
  return drawing
}

function positiveNumber(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (Number.isNaN(value) || value < 0) {
    throw new RangeError(`createShapeEditor: ${name} must be 0 or more, got ${value}`)
  }
  return value
}

function sameKeys(a: readonly Key[], b: readonly Key[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index])
}

function color(palette: Uint8Array, id: number | undefined): string | null {
  if (id === undefined || id === 0xffffffff) return null
  const at = id * 4
  const alpha = (palette[at + 3] ?? 255) / 255
  return `rgba(${palette[at] ?? 0},${palette[at + 1] ?? 0},${palette[at + 2] ?? 0},${alpha})`
}

function squares(handles: readonly Handle[], size: number): string {
  const half = size / 2
  return handles
    .map(
      (handle) =>
        `M${Math.round((handle.x - half) * 10) / 10} ${Math.round((handle.y - half) * 10) / 10}h${size}v${size}h${-size}Z`,
    )
    .join('')
}

/**
 * Lets the pointer and the keys move and reshape the shapes of a graph. The editor proposes each
 * change through `onEdit` and the `edit` event; the application writes it to its data. Draw it
 * with `mountShapeEditor`. One editor per graph.
 */
export function createShapeEditor<S extends string, M extends Mark>(
  graph: GraphInstance<S, M>,
  options: ShapeEditorOptions<M> = {},
): ShapeEditor<M> {
  const internals = internalsOf(graph, 'createShapeEditor')
  if (editing.has(graph)) {
    throw new Error('createShapeEditor: this graph has an editor already, destroy it first')
  }
  let given = options
  let marks: ReadonlySet<string> | null = null
  let hold = defaultHold
  let handleSize = defaultHandleSize
  let onEdit = options.onEdit
  const store = createStore<ShapeEditorState>(emptyState)
  const readonlyStore = isolateSubscribers(readonlyOf(store))
  const handlers = new Map<string, Set<(event: never) => void>>()
  const listeners = new Set<(destroyed: boolean) => void>()
  const entries = new Map<Key, Entry>()
  const pending = new Map<Key, Pending>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let gesture: Gesture | null = null
  let active: ActiveVertex | null = null
  let hover: Point | null = null
  let drafted: readonly Key[] = noKeys
  let batches = 0
  let destroyed = false
  let spaceHeld = false
  let request = 0
  let drawnStamp = ''
  let cachedStamp = ''
  let cached: { frame: EditorFrame; handles: readonly Handle[]; owner: Key | null } | null = null
  let lastSelection: unknown = null

  function resolve(next: ShapeEditorOptions<M>): void {
    marks = next.marks === undefined ? null : new Set<string>(next.marks as Iterable<string>)
    hold = positiveNumber(next.hold, defaultHold, 'hold')
    handleSize = positiveNumber(next.handleSize, defaultHandleSize, 'handleSize') || 1
    onEdit = next.onEdit
  }

  resolve(options)

  function emit(name: 'edit' | 'editlost', edits: readonly ShapeEdit[]): void {
    const event = { edits } as ShapeEditEvent<M>
    if (name === 'edit' && onEdit) {
      try {
        onEdit(event.edits)
      } catch (error) {
        report(error)
      }
    }
    const set = handlers.get(name)
    if (!set) return
    for (const handler of [...set]) {
      if (!set.has(handler) || destroyed) continue
      try {
        ;(handler as (event: ShapeEditEvent<M>) => void)(event)
      } catch (error) {
        report(error)
      }
    }
  }

  function screen(): Screen {
    const { view, width, height } = graph.store.state
    return { view, width, height, globe: internals.globe() }
  }

  function editable(record: ShapeRecord): boolean {
    return marks === null || (record.mark.name !== undefined && marks.has(record.mark.name))
  }

  function entryOf(key: Key): Entry | null {
    const record = internals.shape(key)
    if (!record || !editable(record)) {
      entries.delete(key)
      return null
    }
    const known = entries.get(key)
    if (known && known.record.datum === record.datum && known.record.mark === record.mark) {
      return known
    }
    const options = record.mark.options
    const read = toAccessor<unknown, unknown>(options.geometry ?? 'geometry')
    const outline = readEditable(read(record.datum))
    if (!outline) {
      entries.delete(key)
      return null
    }
    const pinned = options.node === undefined ? null : toAccessor<unknown, unknown>(options.node)
    const pin = pinned ? pinned(record.datum) : null
    const entry: Entry = {
      record,
      outline,
      pin: typeof pin === 'string' || typeof pin === 'number' ? pin : null,
    }
    entries.set(key, entry)
    return entry
  }

  function originOf(entry: Entry, outline: Outline, view: Screen): Point | null {
    let x = 0
    let y = 0
    if (entry.pin !== null) {
      const node = graph.positions.get(entry.pin)
      if (!node) return null
      x = node.x
      y = node.y
    }
    if (!view.globe && geoOutline(outline)) {
      const [minX, , maxX] = boundsOf(outline)
      const middle = (minX + maxX) / 2 + x
      x += worldSize * Math.round((view.view.x - middle) / worldSize)
    }
    return { x, y }
  }

  function outlineOf(key: Key, entry: Entry): Outline | null {
    if (gesture?.keys.includes(key)) {
      if (gesture.type === 'vertex') return gesture.current
      if (gesture.type === 'resize') return gesture.current.get(key) ?? entry.outline
      const base = gesture.bases.get(key) ?? entry.outline
      return translateOutline(base, gesture.dx, gesture.dy)
    }
    const waiting = pending.get(key)
    if (waiting) return waiting.outline
    return entry.outline
  }

  function selectedKeys(): Key[] {
    const shapes = (graph.selection.get() as { readonly shapes?: readonly Key[] }).shapes ?? []
    return shapes.filter((key) => entryOf(key) !== null && pending.get(key)?.outline !== null)
  }

  function publish(): void {
    if (destroyed) return
    const selected = selectedKeys()
    const previous = store.state
    const shown = gesture && gestureStarted(gesture) ? gesture : null
    const nextGesture =
      shown === null
        ? null
        : previous.gesture?.type === shown.type && sameKeys(previous.gesture.keys, shown.keys)
          ? previous.gesture
          : Object.freeze({ type: shown.type, keys: Object.freeze([...shown.keys]) })
    const keys = [...pending.keys()]
    const next = {
      selected: sameKeys(previous.selected, selected) ? previous.selected : Object.freeze(selected),
      gesture: nextGesture,
      pending: sameKeys(previous.pending, keys) ? previous.pending : Object.freeze(keys),
    }
    if (
      next.selected === previous.selected &&
      next.gesture === previous.gesture &&
      next.pending === previous.pending
    ) {
      return
    }
    store.setState(() => Object.freeze(next))
  }

  function gestureStarted(current: Gesture): boolean {
    return current.started || (current.type === 'vertex' && current.inserted)
  }

  function syncDrafts(): void {
    const keys = new Set<Key>(pending.keys())
    if (gesture && gestureStarted(gesture)) for (const key of gesture.keys) keys.add(key)
    const next = [...keys]
    if (sameKeys(next, drafted)) return
    drafted = next
    internals.draft(next)
  }

  function changed(): void {
    cached = null
    syncDrafts()
    publish()
    schedule()
  }

  function schedule(): void {
    if (destroyed || request !== 0 || listeners.size === 0) return
    request = requestAnimationFrame(() => {
      request = 0
      notify()
    })
  }

  function notify(): void {
    for (const listener of [...listeners]) listener(destroyed)
  }

  function stampOf(view: Screen): string {
    const { x, y, zoom } = view.view
    const { scene, positions, palette } = internals.stamp()
    return `${x}:${y}:${zoom}:${view.width}:${view.height}:${scene}:${positions}:${palette}`
  }

  function frame(): { frame: EditorFrame; handles: readonly Handle[]; owner: Key | null } {
    const view = screen()
    const stamp = `${stampOf(view)}:${hover?.x}:${hover?.y}`
    if (cached && cachedStamp === stamp && !view.globe) return cached
    const palette = internals.palette()
    const shapes = internals.scene.shapes
    const previews: PreviewShape[] = []
    const shown = new Set<Key>()
    for (const key of drafted) {
      const entry = entryOf(key)
      const outline = entry ? outlineOf(key, entry) : null
      const origin = entry && outline ? originOf(entry, outline, view) : null
      if (!entry || !outline || !origin) continue
      shown.add(key)
      const path: string[] = []
      tracePath(view, ringsOf(outline), origin.x, origin.y, path)
      const index = entry.record.index
      previews.push({
        d: path.join(' '),
        fill: ringsOf(outline).filled ? color(palette, shapes.fill[index]) : null,
        stroke: color(palette, shapes.stroke[index]),
        width: shapes.strokeWidth[index] ?? 1,
        dash: shapes.dash[index] ?? 0,
        opacity: shapes.opacity[index] ?? 1,
      })
    }
    const handles: Handle[] = []
    const box: string[] = []
    let owner: Key | null = null
    const moving = gesture?.type === 'move' && gesture.started
    const selected = moving ? [] : selectedKeys()
    const only = selected.length === 1 ? selected[0] : undefined
    const single = only === undefined ? null : entryOf(only)
    const singleOutline = only !== undefined && single ? outlineOf(only, single) : null
    if (only !== undefined && single && singleOutline?.kind === 'path') {
      const origin = originOf(single, singleOutline, view)
      if (origin) {
        owner = only
        const pointer = gesture?.type === 'vertex' ? null : hover
        vertexHandles(view, singleOutline, origin.x, origin.y, pointer, reach(false), handles)
        if (gesture?.type === 'vertex' && gesture.started) {
          const point = singleOutline.parts[gesture.part]?.points[gesture.index]
          const at = { x: 0, y: 0 }
          if (point && project(view, point.x + origin.x, point.y + origin.y, at)) {
            handles.push({
              kind: 0,
              x: at.x,
              y: at.y,
              part: gesture.part,
              index: gesture.index,
            })
          }
        }
      }
    } else if (selected.length > 0) {
      const bounds = selectionBounds(selected, view)
      if (bounds) boxHandles(view, bounds, handles, box)
    }
    const hovered = hover && !gesture ? hitHandle(handles, hover, reach(false)) : null
    const pressed =
      gesture?.type === 'vertex' ? handles[handles.length - 1] : gesture ? null : hovered
    const result = {
      frame: {
        shapes: previews,
        box: box.join(' '),
        handles: squares(
          handles.filter((handle) => handle.kind !== middleHandle),
          handleSize,
        ),
        middles: squares(
          handles.filter((handle) => handle.kind === middleHandle),
          Math.max(2, handleSize * 0.75),
        ),
        active: pressed ? squares([pressed], handleSize + 2) : '',
      },
      handles,
      owner,
    }
    cached = result
    cachedStamp = stamp
    return result
  }

  function selectionBounds(keys: readonly Key[], view: Screen): Bounds | null {
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const key of keys) {
      const entry = entryOf(key)
      const outline = entry ? outlineOf(key, entry) : null
      const origin = entry && outline ? originOf(entry, outline, view) : null
      if (!outline || !origin) continue
      const [x0, y0, x1, y1] = boundsOf(outline)
      minX = Math.min(minX, x0 + origin.x)
      minY = Math.min(minY, y0 + origin.y)
      maxX = Math.max(maxX, x1 + origin.x)
      maxY = Math.max(maxY, y1 + origin.y)
    }
    return minX <= maxX ? [minX, minY, maxX, maxY] : null
  }

  function reach(touch: boolean): number {
    return handleSize / 2 + (touch ? 12 : 4)
  }

  function select(key: Key, additive: boolean): void {
    const mode = internals.definition().interaction.select
    if (mode === false) return
    const current = graph.selection.get() as {
      readonly nodes: readonly Key[]
      readonly edges: readonly Key[]
      readonly shapes?: readonly Key[]
    }
    const shapes = current.shapes ?? []
    if (additive && mode === 'multiple') {
      if (shapes.includes(key)) return
      graph.selection.set({ ...current, shapes: [...shapes, key] })
      return
    }
    if (current.nodes.length === 0 && current.edges.length === 0 && sameKeys(shapes, [key])) return
    graph.selection.set({ nodes: [], edges: [], shapes: [key] })
  }

  function deselect(key: Key): void {
    const current = graph.selection.get() as {
      readonly nodes: readonly Key[]
      readonly edges: readonly Key[]
      readonly shapes?: readonly Key[]
    }
    const shapes = current.shapes ?? []
    if (!shapes.includes(key)) return
    graph.selection.set({ ...current, shapes: shapes.filter((other) => other !== key) })
  }

  function propose(changes: readonly (readonly [Key, Outline | null])[]): void {
    const edits: ShapeEdit[] = []
    const batch = ++batches
    for (const [key, outline] of changes) {
      const entry = entryOf(key)
      if (!entry) continue
      const { mark, datum } = entry.record
      const edit: ShapeEdit = outline
        ? { type: 'change', key, mark: mark.name, datum, geometry: writeEditable(outline) }
        : { type: 'remove', key, mark: mark.name, datum }
      edits.push(edit)
      pending.set(key, { edit, outline, batch })
    }
    if (edits.length === 0) return
    if (Number.isFinite(hold)) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        expire(batch)
      }, hold)
      timers.add(timer)
    }
    changed()
    emit('edit', edits)
  }

  function expire(batch: number): void {
    if (destroyed) return
    const lost: ShapeEdit[] = []
    for (const [key, waiting] of pending) {
      if (waiting.batch !== batch) continue
      pending.delete(key)
      lost.push(waiting.edit)
    }
    if (lost.length === 0) return
    changed()
    emit('editlost', lost)
  }

  function cancelGesture(): boolean {
    if (!gesture) return false
    gesture = null
    changed()
    return true
  }

  function pointerWorld(point: Point): Point | null {
    return worldAt(screen(), point)
  }

  function slopPassed(current: Gesture, point: Point): boolean {
    const slop = current.touch ? touchSlop : clickSlop
    return Math.hypot(point.x - current.from.x, point.y - current.from.y) > slop
  }

  function hitPending(point: Point, view: Screen): Key | null {
    const world = worldAt(view, point)
    if (!world) return null
    const tolerance = screenTolerance(view, 4)
    for (const [key, waiting] of [...pending].reverse()) {
      const entry = entryOf(key)
      const outline = waiting.outline
      const origin = entry && outline ? originOf(entry, outline, view) : null
      if (!outline || !origin) continue
      if (insideRings(ringsOf(outline), world.x - origin.x, world.y - origin.y, tolerance)) {
        return key
      }
    }
    return null
  }

  function startBox(keys: readonly Key[], handle: Handle, world: Point, pointer: ToolPointer) {
    const view = screen()
    const box = selectionBounds(keys, view)
    if (!box) return false
    const bases = new Map<Key, Outline>()
    let round = true
    for (const key of keys) {
      const entry = entryOf(key)
      const outline = entry ? outlineOf(key, entry) : null
      if (!outline) continue
      bases.set(key, outline)
      if (outline.kind !== 'circle') round = false
    }
    gesture = {
      type: 'resize',
      keys: [...bases.keys()],
      bases,
      box,
      handle: handle.index,
      start: world,
      from: pointer.point,
      touch: pointer.event.pointerType === 'touch',
      round,
      current: bases,
      started: false,
    }
    return true
  }

  function startVertex(key: Key, handle: Handle, world: Point, pointer: ToolPointer): boolean {
    const entry = entryOf(key)
    const outline = entry ? outlineOf(key, entry) : null
    const view = screen()
    const origin = entry && outline ? originOf(entry, outline, view) : null
    if (outline?.kind !== 'path' || !origin) return false
    const local = { x: world.x - origin.x, y: world.y - origin.y }
    let current = outline
    let index = handle.index
    const inserted = handle.kind === middleHandle
    if (inserted) {
      const points = outline.parts[handle.part]?.points
      const a = points?.[handle.index]
      const b = points?.[(handle.index + 1) % (points?.length ?? 1)]
      if (!a || !b) return false
      current = insertVertex(outline, handle.part, handle.index, (a.x + b.x) / 2, (a.y + b.y) / 2)
      index = handle.index + 1
    }
    const point = current.parts[handle.part]?.points[index]
    if (!point) return false
    gesture = {
      type: 'vertex',
      keys: [key],
      key,
      part: handle.part,
      index,
      grab: { x: point.x - local.x, y: point.y - local.y },
      from: pointer.point,
      touch: pointer.event.pointerType === 'touch',
      remove: pointer.event.altKey && !inserted,
      inserted,
      current,
      started: false,
    }
    active = { key, part: handle.part, index }
    if (inserted) changed()
    return true
  }

  function startMove(key: Key, world: Point, pointer: ToolPointer): boolean {
    const selected = selectedKeys()
    const wasSelected = selected.includes(key)
    const { shiftKey, metaKey, ctrlKey } = pointer.event
    const additive = shiftKey || metaKey || ctrlKey
    if (!wasSelected) select(key, additive)
    const after = wasSelected ? selected : selectedKeys()
    const keys = after.includes(key) ? after : [key]
    const bases = new Map<Key, Outline>()
    for (const each of keys) {
      const entry = entryOf(each)
      const outline = entry ? outlineOf(each, entry) : null
      if (outline) bases.set(each, outline)
    }
    gesture = {
      type: 'move',
      keys: [...bases.keys()],
      bases,
      start: world,
      from: pointer.point,
      touch: pointer.event.pointerType === 'touch',
      pressed: key,
      wasSelected,
      dx: 0,
      dy: 0,
      started: false,
    }
    active = null
    return true
  }

  function resizeTo(current: ResizeGesture, world: Point, shift: boolean): void {
    const view = screen()
    const corners = boxCorners(current.box)
    const handle = corners[current.handle]
    const anchor = corners[(current.handle + 4) % 8]
    if (!handle || !anchor) return
    const px = handle.x + world.x - current.start.x
    const py = handle.y + world.y - current.start.y
    const side = current.handle % 2 === 1
    const horizontal = current.handle === 1 || current.handle === 5
    let sx = handle.x === anchor.x || horizontal ? 1 : (px - anchor.x) / (handle.x - anchor.x)
    let sy =
      handle.y === anchor.y || (side && !horizontal) ? 1 : (py - anchor.y) / (handle.y - anchor.y)
    if (shift || current.round) {
      if (side) {
        const factor = Math.abs(horizontal ? sy : sx)
        sx = factor
        sy = factor
      } else {
        const factor = Math.max(Math.abs(sx), Math.abs(sy))
        sx = Math.sign(sx || 1) * factor
        sy = Math.sign(sy || 1) * factor
      }
    }
    const next = new Map<Key, Outline>()
    for (const [key, base] of current.bases) {
      const entry = entryOf(key)
      const origin = entry ? originOf(entry, base, view) : null
      if (!origin) continue
      next.set(key, scaleOutline(base, anchor.x - origin.x, anchor.y - origin.y, sx, sy))
    }
    current.current = next
  }

  const tool: PointerTool = {
    down(pointer) {
      if (destroyed || spaceHeld || pointer.event.button !== 0) return false
      const world = pointerWorld(pointer.point)
      if (!world) return false
      const touch = pointer.event.pointerType === 'touch'
      hover = pointer.point
      cached = null
      const built = frame()
      const handle = hitHandle(built.handles, pointer.point, reach(touch))
      if (handle) {
        if (handle.kind === boxHandle) return startBox(selectedKeys(), handle, world, pointer)
        if (built.owner !== null) return startVertex(built.owner, handle, world, pointer)
      }
      const view = screen()
      const hit = pointer.hit
      const key =
        hitPending(pointer.point, view) ??
        (hit?.kind === 'shape' && entryOf(hit.key) !== null ? hit.key : null)
      if (key === null) return false
      return startMove(key, world, pointer)
    },

    move(pointer) {
      const current = gesture
      if (!current || destroyed) return
      hover = pointer.point
      if (!current.started) {
        if (!slopPassed(current, pointer.point)) return
        current.started = true
      }
      const world = pointerWorld(pointer.point)
      if (!world) return
      if (current.type === 'move') {
        current.dx = world.x - current.start.x
        current.dy = world.y - current.start.y
      } else if (current.type === 'vertex') {
        const entry = entryOf(current.key)
        const origin = entry ? originOf(entry, current.current, screen()) : null
        if (!origin) return
        current.current = moveVertex(
          current.current,
          current.part,
          current.index,
          world.x - origin.x + current.grab.x,
          world.y - origin.y + current.grab.y,
        )
      } else resizeTo(current, world, pointer.event.shiftKey)
      changed()
    },

    up(pointer, cancelled) {
      const current = gesture
      if (!current || destroyed) return false
      gesture = null
      hover = pointer.event.pointerType === 'touch' ? null : pointer.point
      if (cancelled) {
        changed()
        return false
      }
      if (current.type === 'move') {
        if (current.started) {
          propose(
            current.keys.map((key) => {
              const base = current.bases.get(key) as Outline
              return [key, translateOutline(base, current.dx, current.dy)] as const
            }),
          )
          return false
        }
        const { shiftKey, metaKey, ctrlKey } = pointer.event
        if (current.wasSelected) {
          if (shiftKey || metaKey || ctrlKey) deselect(current.pressed)
          else select(current.pressed, false)
        }
        changed()
        return true
      }
      if (current.type === 'vertex') {
        if (current.remove && !current.started) {
          active = null
          const next = removeVertex(current.current, current.part, current.index)
          if (next !== current.current) propose([[current.key, next]])
          else changed()
          return false
        }
        if (current.started || current.inserted) propose([[current.key, current.current]])
        else changed()
        return false
      }
      if (current.started) propose([...current.current])
      else changed()
      return false
    },

    cursor(pointer) {
      if (destroyed || spaceHeld) return null
      const current = gesture
      if (current) {
        if (current.type === 'resize') return resizeCursors[current.handle] ?? null
        return 'move'
      }
      const previous = hover
      hover = pointer.point
      if (previous?.x !== hover.x || previous?.y !== hover.y) schedule()
      const built = frame()
      const handle = hitHandle(built.handles, pointer.point, reach(false))
      if (handle?.kind === boxHandle) return resizeCursors[handle.index] ?? null
      if (handle) return 'pointer'
      const hit = pointer.hit
      if (hitPending(pointer.point, screen()) !== null) return 'move'
      return hit?.kind === 'shape' && entryOf(hit.key) !== null ? 'move' : null
    },

    key(event) {
      if (destroyed || event.metaKey || event.ctrlKey || event.altKey) return false
      if (event.key === 'Escape') return cancelGesture()
      if (gesture) return false
      const selected = selectedKeys()
      if (selected.length === 0) return false
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const vertex = active
        if (vertex && selected.length === 1 && selected[0] === vertex.key) {
          const entry = entryOf(vertex.key)
          const outline = entry ? outlineOf(vertex.key, entry) : null
          if (outline?.kind === 'path') {
            const next = removeVertex(outline, vertex.part, vertex.index)
            active = null
            if (next !== outline) propose([[vertex.key, next]])
            return true
          }
        }
        removeShapes(selected)
        return true
      }
      const step = event.shiftKey ? arrowLongStep : arrowStep
      const moves: Record<string, readonly [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const move = moves[event.key]
      if (!move) return false
      const view = screen()
      const dx = screenTolerance(view, move[0])
      const dy = screenTolerance(view, move[1])
      propose(
        selected.flatMap((key) => {
          const entry = entryOf(key)
          const outline = entry ? outlineOf(key, entry) : null
          return outline ? [[key, translateOutline(outline, dx, dy)] as const] : []
        }),
      )
      return true
    },
  }

  function removeShapes(keys: readonly Key[]): void {
    active = null
    propose(keys.filter((key) => entryOf(key) !== null).map((key) => [key, null] as const))
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== ' ') return
    const target = event.target as HTMLElement | null
    if (target?.isContentEditable || target?.closest?.('input, textarea, select')) return
    spaceHeld = event.type === 'keydown'
  }

  function onBlur(): void {
    spaceHeld = false
  }

  const subscription = graph.store.subscribe(() => {
    const state = graph.store.state
    if (state.selection === lastSelection) return
    lastSelection = state.selection
    active = null
    changed()
  })

  const unwatch = internals.watch({
    frame() {
      if (destroyed || listeners.size === 0) return
      const view = screen()
      const stamp = stampOf(view)
      if (stamp === drawnStamp && !view.globe) return
      drawnStamp = stamp
      notify()
    },
    changed(changes: GraphChanges) {
      if (destroyed) return
      let touched = false
      for (const list of [changes.shapes.added, changes.shapes.updated, changes.shapes.removed]) {
        for (const { key } of list) {
          entries.delete(key)
          if (pending.delete(key)) touched = true
          if (gesture?.keys.includes(key) && list === changes.shapes.removed) gesture = null
          touched ||= list !== changes.shapes.added
        }
      }
      if (touched || changes.shapes.added.length > 0) changed()
    },
    destroy() {
      teardown()
    },
  })

  if (!destroyed && internals.tool(tool)) {
    editing.add(graph)
    addEventListener('keydown', onKey)
    addEventListener('keyup', onKey)
    addEventListener('blur', onBlur)
    lastSelection = graph.store.state.selection
    publish()
  } else {
    unwatch()
    teardown()
  }

  function teardown(): void {
    if (destroyed) return
    destroyed = true
    if (request !== 0) cancelAnimationFrame(request)
    request = 0
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    subscription.unsubscribe()
    removeEventListener('keydown', onKey)
    removeEventListener('keyup', onKey)
    removeEventListener('blur', onBlur)
    if (editing.has(graph)) {
      editing.delete(graph)
      internals.tool(null)
      internals.draft([])
    }
    gesture = null
    pending.clear()
    entries.clear()
    store.setState((state) =>
      state.gesture === null && state.pending.length === 0
        ? state
        : Object.freeze({ ...state, gesture: null, pending: noKeys }),
    )
    notify()
    listeners.clear()
    handlers.clear()
  }

  const editor: ShapeEditor<M> = {
    store: readonlyStore,
    on(name, handler) {
      if (destroyed) return () => {}
      let set = handlers.get(name)
      if (!set) {
        set = new Set()
        handlers.set(name, set)
      }
      const entry = handler as (event: never) => void
      set.add(entry)
      return () => {
        set.delete(entry)
      }
    },
    remove(keys) {
      if (destroyed) return
      removeShapes(keys ? [...keys] : selectedKeys())
    },
    cancel() {
      if (!destroyed) cancelGesture()
    },
    update(next) {
      if (destroyed) return
      const merged = { ...given, ...next }
      resolve(merged)
      given = merged
      entries.clear()
      changed()
    },
    destroy() {
      unwatch()
      teardown()
    },
  }

  drawings.set(editor, {
    element: graph.element,
    frame: () => frame().frame,
    listen(listener) {
      if (destroyed) {
        listener(true)
        return () => {}
      }
      listeners.add(listener)
      schedule()
      return () => {
        listeners.delete(listener)
      }
    },
  })
  return editor
}
