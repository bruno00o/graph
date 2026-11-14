import { createStore, type ReadonlyStore } from '@tanstack/store'
import { toAccessor } from '../core/accessor'
import { worldSize } from '../core/geo'
import type { GraphChanges, ShapeRecord } from '../core/graph-model'
import type { GraphInstance } from '../host/graph-instance'
import { internalsOf } from '../host/internals'
import { isolateSubscribers, report } from '../host/isolate'
import type { PointerTool, ToolPointer } from '../host/pointer-tool'
import { readonlyOf } from '../host/readonly-store'
import type { Key, KeyList, Mark, Point, ShapeGeometry } from '../types'
import {
  backgroundStep,
  circleGeometry,
  drawTools,
  pathGeometry,
  randomKey,
  rectangleGeometry,
  type ShapeDrawTool,
  type ShapeEditorSnap,
  type ShapeEditorTool,
  simplifyStroke,
  snapToGrid,
  squareFrom,
  turnBy,
} from './draw'
import type { ShapeAddEdit, ShapeEdit, ShapeMarkName } from './edits'
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
  sameOutline,
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
  type Rings,
  ringsOf,
  type Screen,
  screenTolerance,
  tracePath,
  vertexHandle,
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
  /**
   * Tool to start with: `'select'`, `'rectangle'`, `'circle'`, `'line'`, `'polygon'` or
   * `'freehand'`. In `update`, sets the tool as `setTool` does.
   * @default 'select'
   */
  readonly tool?: ShapeEditorTool | undefined
  /** Makes the key of each new shape. Defaults to `crypto.randomUUID()`. */
  readonly newKey?: (() => Key) | undefined
  /**
   * Name of the shape mark that drawn shapes are meant for. Defaults to the first name of `marks`,
   * else to the first shape mark of the graph.
   */
  readonly newMark?: ShapeMarkName<M> | undefined
  /**
   * Units of drawn shapes: `'world'`, `'degrees'` for GeoJSON and places in degrees, or `'auto'`
   * for degrees on a map and world units elsewhere. Edited shapes keep their own units.
   * @default 'auto'
   */
  readonly units?: 'auto' | 'world' | 'degrees' | undefined
  /** Snapping of drawn and dragged points to a grid, and of Shift to angles. */
  readonly snap?: ShapeEditorSnap | undefined
  /**
   * How many of its own edits the editor can undo, 0 for none.
   * @default 100
   */
  readonly history?: number | undefined
}

/** A gesture in progress. */
export interface ShapeEditorGesture {
  /** `'move'` moves shapes, `'vertex'` moves, adds or removes a point, `'resize'` scales shapes. */
  readonly type: 'move' | 'vertex' | 'resize'
  /** Keys of the shapes the gesture changes. */
  readonly keys: readonly Key[]
}

/** A shape being drawn. */
export interface ShapeEditorDrawing {
  /** Tool that draws it. */
  readonly tool: ShapeDrawTool
  /**
   * Points placed so far: the clicks of a line or a polygon, 1 once a rectangle or a circle has its
   * first corner or its center, 0 for a freehand stroke.
   */
  readonly points: number
}

/** State of a shape editor. */
export interface ShapeEditorState {
  /** Selected shapes that the editor can edit, in the order of the selection. */
  readonly selected: readonly Key[]
  /** The gesture in progress, or `null`. */
  readonly gesture: ShapeEditorGesture | null
  /** Shapes whose proposed edit waits for their data to change. */
  readonly pending: readonly Key[]
  /** Tool of the next press. */
  readonly tool: ShapeEditorTool
  /** The shape being drawn, or `null`. */
  readonly drawing: ShapeEditorDrawing | null
  /** Whether `undo` has an edit to take back. */
  readonly canUndo: boolean
  /** Whether `redo` has an edit to make again. */
  readonly canRedo: boolean
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
  /** Chooses the tool of the next press, and cancels the shape being drawn. */
  setTool(tool: ShapeEditorTool): void
  /** Proposes to remove shapes, by default the selected ones the editor can edit. */
  remove(keys?: KeyList): void
  /**
   * Proposes copies of shapes, by default of the selected ones the editor can edit, 16 screen pixels
   * lower and to the right, and selects them.
   */
  duplicate(keys?: KeyList): void
  /** Proposes to draw shapes above the others of their mark, by default the selected ones. */
  raise(keys?: KeyList): void
  /** Proposes to draw shapes under the others of their mark, by default the selected ones. */
  lower(keys?: KeyList): void
  /**
   * Proposes to take back the last edit of this editor. An edit whose shapes changed since, by
   * someone else or by a declined write, is skipped and forgotten.
   */
  undo(): void
  /** Proposes again the last edit taken back by `undo`, under the same rule. */
  redo(): void
  /** Cancels the gesture in progress, whose shapes go back to where they were, and the drawing. */
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
  readonly drawing: string
  readonly drawingFill: boolean
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

interface Look {
  readonly fill: string | null
  readonly stroke: string | null
  readonly width: number
  readonly dash: number
  readonly opacity: number
}

interface Pending {
  readonly edit: ShapeEdit
  readonly outline: Outline | null
  readonly batch: number
  readonly order: number | undefined
  readonly pin: Key | null
  readonly look: Look | null
}

interface Snapshot {
  readonly outline: Outline
  readonly order: number
  readonly datum: unknown
  readonly pin: Key | null
  readonly look: Look | null
}

interface Step {
  readonly key: Key
  readonly mark: string | undefined
  readonly before: Snapshot | null
  readonly after: Snapshot | null
}

interface Proposal {
  readonly edit: ShapeEdit
  readonly outline: Outline | null
  readonly order: number | undefined
  readonly pin: Key | null
  readonly look: Look | null
  readonly step: Step
}

interface Moved {
  readonly key: Key
  readonly base: Snapshot
  readonly entry: Entry
}

interface Press {
  readonly from: Point
  readonly start: Point
  readonly touch: boolean
  readonly finish: boolean
  started: boolean
}

interface Draw {
  readonly tool: ShapeDrawTool
  readonly points: Point[]
  press: Press | null
  last: { readonly at: Point; readonly time: number } | null
  trail: Point | null
  shift: boolean
}

interface MoveGesture {
  readonly type: 'move'
  readonly keys: readonly Key[]
  readonly bases: ReadonlyMap<Key, Outline>
  readonly corner: Point | null
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
const duplicateOffset = 16
const defaultHistory = 100
const defaultAngle = 15
const doubleClickTime = 500
const strokeSpacing = 2
const strokeTolerance = 0.5
const circleSteps = 64
const accent = 'var(--graph-accent,#c93700)'
const drawnLook: Look = Object.freeze({
  fill: `color-mix(in srgb,${accent} 20%,transparent)`,
  stroke: accent,
  width: 1.5,
  dash: 0,
  opacity: 1,
})
const noKeys: readonly Key[] = Object.freeze([])
const emptyState: ShapeEditorState = Object.freeze({
  selected: noKeys,
  gesture: null,
  pending: noKeys,
  tool: 'select',
  drawing: null,
  canUndo: false,
  canRedo: false,
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

function checkTool(value: unknown, caller: string): ShapeEditorTool {
  if (typeof value === 'string' && drawTools.has(value)) return value as ShapeEditorTool
  throw new TypeError(`${caller}: unknown tool ${String(value)}`)
}

function checkGrid(value: ShapeEditorSnap['grid']): 'background' | number {
  if (value === undefined || value === null) return 0
  if (value === 'background') return value
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new RangeError(`createShapeEditor: snap.grid must be 'background' or 0 or more`)
  }
  return Number.isFinite(value) ? value : 0
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
  let newKey: () => Key = randomKey
  let newMark: string | undefined
  let units: 'auto' | 'world' | 'degrees' = 'auto'
  let grid: 'background' | number = 0
  let angle = defaultAngle
  let historySize = defaultHistory
  let tool: ShapeEditorTool =
    options.tool === undefined ? 'select' : checkTool(options.tool, 'createShapeEditor')
  let draw: Draw | null = null
  const undoStack: Step[][] = []
  const redoStack: Step[][] = []
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
    const nextGrid = checkGrid(next.snap?.grid)
    const nextAngle = positiveNumber(next.snap?.angle, defaultAngle, 'snap.angle')
    const nextHistory = Math.floor(positiveNumber(next.history, defaultHistory, 'history'))
    if (next.units !== undefined && !['auto', 'world', 'degrees'].includes(next.units)) {
      throw new TypeError(`createShapeEditor: unknown units ${String(next.units)}`)
    }
    marks = next.marks === undefined ? null : new Set<string>(next.marks as Iterable<string>)
    hold = positiveNumber(next.hold, defaultHold, 'hold')
    handleSize = positiveNumber(next.handleSize, defaultHandleSize, 'handleSize') || 1
    onEdit = next.onEdit
    newKey = next.newKey ?? randomKey
    newMark = next.newMark
    units = next.units ?? 'auto'
    grid = nextGrid
    angle = nextAngle
    historySize = nextHistory
    if (undoStack.length > historySize) undoStack.splice(0, undoStack.length - historySize)
    if (redoStack.length > historySize) redoStack.splice(0, redoStack.length - historySize)
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

  function originOf(pin: Key | null, outline: Outline, view: Screen): Point | null {
    let x = 0
    let y = 0
    if (pin !== null) {
      const node = graph.positions.get(pin)
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
    const points = draw === null || draw.tool === 'freehand' ? 0 : draw.points.length
    const drawing =
      draw === null
        ? null
        : previous.drawing?.tool === draw.tool && previous.drawing.points === points
          ? previous.drawing
          : Object.freeze({ tool: draw.tool, points })
    const next: ShapeEditorState = {
      selected: sameKeys(previous.selected, selected) ? previous.selected : Object.freeze(selected),
      gesture: nextGesture,
      pending: sameKeys(previous.pending, keys) ? previous.pending : Object.freeze(keys),
      tool,
      drawing,
      canUndo: prune(undoStack, 'after'),
      canRedo: prune(redoStack, 'before'),
    }
    if (
      next.selected === previous.selected &&
      next.gesture === previous.gesture &&
      next.pending === previous.pending &&
      next.tool === previous.tool &&
      next.drawing === previous.drawing &&
      next.canUndo === previous.canUndo &&
      next.canRedo === previous.canRedo
    ) {
      return
    }
    store.setState(() => Object.freeze(next))
  }

  function orderAt(index: number): number {
    return internals.scene.shapes.order[index] ?? 0
  }

  function lookOf(index: number): Look {
    const palette = internals.palette()
    const shapes = internals.scene.shapes
    return {
      fill: color(palette, shapes.fill[index]),
      stroke: color(palette, shapes.stroke[index]),
      width: shapes.strokeWidth[index] ?? 1,
      dash: shapes.dash[index] ?? 0,
      opacity: shapes.opacity[index] ?? 1,
    }
  }

  function snapshotOf(key: Key): Snapshot | null {
    const waiting = pending.get(key)
    const entry = entryOf(key)
    if (waiting) {
      if (!waiting.outline) return null
      const edit = waiting.edit
      return {
        outline: waiting.outline,
        order: waiting.order ?? (entry ? orderAt(entry.record.index) : 0),
        datum: entry ? entry.record.datum : edit.type === 'add' ? edit.datum : undefined,
        pin: waiting.pin,
        look: entry ? lookOf(entry.record.index) : waiting.look,
      }
    }
    if (!entry) return null
    const index = entry.record.index
    return {
      outline: entry.outline,
      order: orderAt(index),
      datum: entry.record.datum,
      pin: entry.pin,
      look: lookOf(index),
    }
  }

  function matches(step: Step, side: 'before' | 'after'): boolean {
    const target = step[side]
    const current = snapshotOf(step.key)
    if (!target || !current) return target === current
    const ordered = step.before !== null && step.after !== null
    if (ordered && step.before.order !== step.after.order && current.order !== target.order) {
      return false
    }
    return sameOutline(current.outline, target.outline)
  }

  function prune(stack: Step[][], side: 'before' | 'after'): boolean {
    for (;;) {
      const top = stack[stack.length - 1]
      if (!top) return false
      if (top.every((step) => matches(step, side))) return true
      stack.pop()
    }
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
    const previews: PreviewShape[] = []
    for (const key of drafted) {
      const entry = entryOf(key)
      const waiting = pending.get(key)
      const outline = entry ? outlineOf(key, entry) : (waiting?.outline ?? null)
      const pin = entry ? entry.pin : (waiting?.pin ?? null)
      const look = entry ? lookOf(entry.record.index) : (waiting?.look ?? null)
      const origin = outline ? originOf(pin, outline, view) : null
      if (!outline || !origin || !look) continue
      const path: string[] = []
      const rings = ringsOf(outline)
      tracePath(view, rings, origin.x, origin.y, path)
      previews.push({ ...look, d: path.join(' '), fill: rings.filled ? look.fill : null })
    }
    const handles: Handle[] = []
    const box: string[] = []
    let owner: Key | null = null
    let pressed: Handle | null = null
    const moving = gesture?.type === 'move' && gesture.started
    const selected = moving || tool !== 'select' ? [] : selectedKeys()
    const only = selected.length === 1 ? selected[0] : undefined
    const single = only === undefined ? null : entryOf(only)
    const singleOutline = only !== undefined && single ? outlineOf(only, single) : null
    if (only !== undefined && single && singleOutline?.kind === 'path') {
      const origin = originOf(single.pin, singleOutline, view)
      if (origin) {
        owner = only
        const pointer = gesture?.type === 'vertex' ? null : hover
        vertexHandles(view, singleOutline, origin.x, origin.y, pointer, reach(false), handles)
        if (gesture?.type === 'vertex' && gesture.started) {
          const point = singleOutline.parts[gesture.part]?.points[gesture.index]
          const at = { x: 0, y: 0 }
          if (point && project(view, point.x + origin.x, point.y + origin.y, at)) {
            pressed = { kind: 0, x: at.x, y: at.y, part: gesture.part, index: gesture.index }
            handles.push(pressed)
          }
        }
      }
    } else if (selected.length > 0) {
      const bounds = selectionBounds(selected, view)
      if (bounds) boxHandles(view, bounds, handles, box)
    }
    if (!gesture && hover) pressed = hitHandle(handles, hover, reach(false))
    const last = !gesture && active?.key === owner ? active : null
    const chosen = last
      ? handles.find(
          (handle) =>
            handle.kind === vertexHandle &&
            handle.part === last.part &&
            handle.index === last.index,
        )
      : undefined
    const marked = [pressed, chosen].filter((handle): handle is Handle => handle != null)
    const sketch = sketchOf(view)
    if (sketch) handles.push(...sketch.handles)
    const result = {
      frame: {
        drawing: sketch?.d ?? '',
        drawingFill: sketch?.filled ?? false,
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
        active: squares(marked, handleSize + 2),
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
      const origin = entry && outline ? originOf(entry.pin, outline, view) : null
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
    const proposals: Proposal[] = []
    for (const [key, outline] of changes) {
      const entry = entryOf(key)
      if (!entry) continue
      const { mark, datum } = entry.record
      const before = snapshotOf(key)
      const edit: ShapeEdit = outline
        ? { type: 'change', key, mark: mark.name, datum, geometry: writeEditable(outline) }
        : { type: 'remove', key, mark: mark.name, datum }
      const after = outline && before ? { ...before, outline } : null
      proposals.push({
        edit,
        outline,
        order: after?.order,
        pin: entry.pin,
        look: null,
        step: { key, mark: mark.name, before, after },
      })
    }
    submit(proposals, true)
  }

  function submit(proposals: readonly Proposal[], record: boolean): void {
    if (proposals.length === 0 || destroyed) return
    const batch = ++batches
    for (const { edit, outline, order, pin, look } of proposals) {
      pending.set(edit.key, { edit, outline, batch, order, pin, look })
    }
    if (record && historySize > 0) {
      undoStack.push(proposals.map((proposal) => proposal.step))
      if (undoStack.length > historySize) undoStack.shift()
      redoStack.length = 0
    }
    if (Number.isFinite(hold)) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        expire(batch)
      }, hold)
      timers.add(timer)
    }
    changed()
    emit(
      'edit',
      proposals.map((proposal) => proposal.edit),
    )
  }

  function selectKeys(keys: readonly Key[]): void {
    const mode = internals.definition().interaction.select
    if (mode === false || keys.length === 0 || destroyed) return
    const shapes = mode === 'multiple' ? [...keys] : keys.slice(0, 1)
    graph.selection.set({ nodes: [], edges: [], shapes })
  }

  function targetMark(): string | undefined {
    if (newMark !== undefined) return newMark
    if (marks) for (const name of marks) return name
    for (const mark of internals.definition().marks) {
      if (mark.type !== 'shapes') continue
      const name = (mark as { readonly name?: unknown }).name
      return typeof name === 'string' ? name : undefined
    }
    return undefined
  }

  function inDegrees(): boolean {
    return units === 'degrees' || (units === 'auto' && internals.onMap)
  }

  function add(geometry: ShapeGeometry, drawn: ShapeDrawTool): void {
    const outline = readEditable(geometry)
    if (!outline) return
    const key = newKey()
    const mark = targetMark()
    const edit: ShapeAddEdit = { type: 'add', key, mark, geometry, tool: drawn }
    const after: Snapshot = { outline, order: 0, datum: undefined, pin: null, look: drawnLook }
    const step: Step = { key, mark, before: null, after }
    submit([{ edit, outline, order: undefined, pin: null, look: drawnLook, step }], true)
    selectKeys([key])
  }

  function duplicate(keys: readonly Key[]): void {
    const offset = screenTolerance(screen(), duplicateOffset)
    const proposals: Proposal[] = []
    for (const key of keys) {
      const entry = entryOf(key)
      const base = snapshotOf(key)
      if (!entry || !base) continue
      const outline = translateOutline(base.outline, offset, offset)
      const copy = newKey()
      const mark = entry.record.mark.name
      const datum = entry.record.datum
      const geometry = writeEditable(outline)
      const edit: ShapeAddEdit = { type: 'add', key: copy, mark, geometry, datum }
      const after: Snapshot = { ...base, outline, datum }
      proposals.push({
        edit,
        outline,
        order: undefined,
        pin: base.pin,
        look: base.look,
        step: { key: copy, mark, before: null, after },
      })
    }
    submit(proposals, true)
    selectKeys(proposals.map((proposal) => proposal.edit.key))
  }

  function reorder(keys: readonly Key[], up: boolean): void {
    const store = internals.scene.shapes
    const groups = new Map<number, Moved[]>()
    const moved = new Set<number>()
    for (const key of keys) {
      const entry = entryOf(key)
      const base = snapshotOf(key)
      if (!entry || !base) continue
      const index = entry.record.index
      const slot = store.slot[index] ?? 0
      moved.add(index)
      const group = groups.get(slot) ?? []
      group.push({ key, base, entry })
      groups.set(slot, group)
    }
    const proposals: Proposal[] = []
    for (const [slot, group] of groups) {
      let edge = up ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
      for (let index = 0; index < store.capacity; index++) {
        if (store.alive[index] !== 1 || store.slot[index] !== slot || moved.has(index)) continue
        const order = orderAt(index)
        edge = up ? Math.max(edge, order) : Math.min(edge, order)
      }
      if (!Number.isFinite(edge)) continue
      const orders = group.map(({ base }) => base.order)
      if (up ? Math.min(...orders) > edge : Math.max(...orders) < edge) continue
      group.sort(
        (a, b) =>
          a.base.order - b.base.order ||
          (store.arrival[a.entry.record.index] ?? 0) - (store.arrival[b.entry.record.index] ?? 0),
      )
      group.forEach(({ key, base, entry }, at) => {
        const order = up ? edge + at + 1 : edge - group.length + at
        const { mark, datum } = entry.record
        proposals.push({
          edit: { type: 'change', key, mark: mark.name, datum, order },
          outline: base.outline,
          order,
          pin: entry.pin,
          look: null,
          step: { key, mark: mark.name, before: base, after: { ...base, order } },
        })
      })
    }
    submit(proposals, true)
  }

  function restore(steps: readonly Step[], side: 'before' | 'after'): void {
    const proposals: Proposal[] = []
    for (const step of steps) {
      const target = step[side]
      const from = step[side === 'before' ? 'after' : 'before']
      const { key, mark } = step
      const entry = entryOf(key)
      if (!target) {
        const datum = entry ? entry.record.datum : from?.datum
        proposals.push({
          edit: { type: 'remove', key, mark, datum },
          outline: null,
          order: undefined,
          pin: from?.pin ?? null,
          look: null,
          step,
        })
        continue
      }
      const geometry = writeEditable(target.outline)
      if (!from || !entry) {
        const edit: ShapeAddEdit =
          target.datum === undefined
            ? { type: 'add', key, mark, geometry }
            : { type: 'add', key, mark, geometry, datum: target.datum }
        proposals.push({
          edit,
          outline: target.outline,
          order: undefined,
          pin: target.pin,
          look: target.look ?? drawnLook,
          step,
        })
        continue
      }
      const reshaped = !sameOutline(from.outline, target.outline)
      const ordered = from.order !== target.order
      const edit: ShapeEdit = {
        type: 'change',
        key,
        mark,
        datum: entry.record.datum,
        ...(reshaped ? { geometry } : {}),
        ...(ordered ? { order: target.order } : {}),
      }
      proposals.push({
        edit,
        outline: target.outline,
        order: target.order,
        pin: entry.pin,
        look: null,
        step,
      })
    }
    submit(proposals, false)
  }

  function undo(): void {
    if (gesture || !prune(undoStack, 'after')) {
      publish()
      return
    }
    const steps = undoStack.pop()
    if (!steps) return
    redoStack.push(steps)
    restore(steps, 'before')
  }

  function redo(): void {
    if (gesture || !prune(redoStack, 'before')) {
      publish()
      return
    }
    const steps = redoStack.pop()
    if (!steps) return
    undoStack.push(steps)
    restore(steps, 'after')
  }

  function gridStep(): number {
    if (typeof grid === 'number') return grid
    const background = internals.definition().background
    if (!background) return 0
    const zoom = graph.store.state.view.zoom
    return backgroundStep(background.spacing, zoom, background.adaptive)
  }

  function snapped(world: Point): Point {
    return snapToGrid(world, gridStep())
  }

  function anchorOf(current: Draw): Point | null {
    const press = current.press?.started ? current.press.start : null
    if (current.tool === 'rectangle' || current.tool === 'circle') {
      return current.points[0] ?? press
    }
    if (current.tool === 'freehand') return null
    return current.points[current.points.length - 1] ?? press
  }

  function targetOf(point: Point, shift: boolean, current: Draw): Point | null {
    const view = screen()
    const world = worldAt(view, point)
    if (!world) return null
    if (current.tool === 'freehand') return world
    const anchor = anchorOf(current)
    if (!shift || !anchor || current.tool === 'circle') return snapped(world)
    if (current.tool === 'rectangle') return squareFrom(anchor, snapped(world))
    const at = { x: 0, y: 0 }
    if (!project(view, anchor.x, anchor.y, at)) return snapped(world)
    return worldAt(view, turnBy(at, point, angle)) ?? world
  }

  function circleRing(center: Point, edge: Point): Float64Array {
    const radius = Math.hypot(edge.x - center.x, edge.y - center.y)
    const ring = new Float64Array(circleSteps * 2)
    for (let step = 0; step < circleSteps; step++) {
      const turn = (step / circleSteps) * 2 * Math.PI
      ring[step * 2] = center.x + Math.cos(turn) * radius
      ring[step * 2 + 1] = center.y + Math.sin(turn) * radius
    }
    return ring
  }

  function flat(points: readonly Point[]): Float64Array {
    const ring = new Float64Array(points.length * 2)
    points.forEach((point, index) => {
      ring[index * 2] = point.x
      ring[index * 2 + 1] = point.y
    })
    return ring
  }

  function sketchOf(view: Screen): { d: string; filled: boolean; handles: Handle[] } | null {
    const current = draw
    if (!current) return null
    const target = hover ? targetOf(hover, current.shift, current) : null
    const anchor = anchorOf(current)
    let rings: Rings | null = null
    const placed: Point[] = []
    switch (current.tool) {
      case 'rectangle':
      case 'circle': {
        const first = current.points[0]
        if (first) placed.push(first)
        if (anchor && target) {
          const corners = [
            anchor,
            { x: target.x, y: anchor.y },
            target,
            { x: anchor.x, y: target.y },
          ]
          const ring = current.tool === 'circle' ? circleRing(anchor, target) : flat(corners)
          rings = { rings: [ring], closed: true, filled: true }
        }
        break
      }
      case 'line':
      case 'polygon': {
        placed.push(...current.points)
        const points = [...current.points]
        if (points.length === 0 && current.press?.started) points.push(current.press.start)
        if (points.length > 0 && target) points.push(target)
        const polygon = current.tool === 'polygon' && points.length > 2
        if (points.length > 1) rings = { rings: [flat(points)], closed: polygon, filled: polygon }
        break
      }
      case 'freehand':
        if (current.points.length > 1) {
          rings = { rings: [flat(current.points)], closed: false, filled: false }
        }
        break
    }
    const path: string[] = []
    if (rings) tracePath(view, rings, 0, 0, path)
    const handles: Handle[] = []
    const at = { x: 0, y: 0 }
    placed.forEach((point, index) => {
      if (project(view, point.x, point.y, at)) {
        handles.push({ kind: vertexHandle, x: at.x, y: at.y, part: -1, index })
      }
    })
    return { d: path.join(' '), filled: rings?.filled ?? false, handles }
  }

  function endDrawing(geometry: ShapeGeometry | null, drawn: ShapeDrawTool): void {
    draw = null
    if (geometry) add(geometry, drawn)
    changed()
  }

  function finishPath(current: Draw): boolean {
    const closed = current.tool === 'polygon'
    if (current.points.length < (closed ? 3 : 2)) return false
    endDrawing(pathGeometry(current.points, closed, inDegrees()), current.tool)
    return true
  }

  function finishStroke(current: Draw, touch: boolean): void {
    const view = screen()
    const at = { x: 0, y: 0 }
    const worlds: Point[] = []
    const xy: number[] = []
    for (const point of current.points) {
      if (!project(view, point.x, point.y, at)) continue
      worlds.push(point)
      xy.push(at.x, at.y)
    }
    const meet = reach(touch)
    const gap = (index: number) =>
      Math.hypot((xy[index * 2] ?? 0) - (xy[0] ?? 0), (xy[index * 2 + 1] ?? 0) - (xy[1] ?? 0))
    let length = 0
    for (let index = 1; index < worlds.length; index++) {
      length += Math.hypot(
        (xy[index * 2] ?? 0) - (xy[index * 2 - 2] ?? 0),
        (xy[index * 2 + 1] ?? 0) - (xy[index * 2 - 1] ?? 0),
      )
    }
    let closed = worlds.length > 3 && length > meet * 4 && gap(worlds.length - 1) <= meet
    while (closed && worlds.length > 3 && gap(worlds.length - 1) <= meet) {
      worlds.pop()
      xy.length -= 2
    }
    const kept = simplifyStroke(Float64Array.from(xy), closed, strokeTolerance)
    if (kept.length < 3) closed = false
    const points = kept.flatMap((index) => {
      const point = worlds[index]
      return point ? [point] : []
    })
    endDrawing(pathGeometry(points, closed, inDegrees()), 'freehand')
  }

  function dropPoint(): boolean {
    const current = draw
    if (!current || current.press || current.tool === 'freehand') return false
    current.points.pop()
    if (current.points.length === 0) draw = null
    changed()
    return true
  }

  function stopDrawing(): boolean {
    if (!draw) return false
    draw = null
    changed()
    return true
  }

  function drawDown(pointer: ToolPointer): boolean {
    const point = pointer.point
    if (!worldAt(screen(), point)) return false
    const touch = pointer.event.pointerType === 'touch'
    const current: Draw = draw ?? {
      tool: tool as ShapeDrawTool,
      points: [],
      press: null,
      last: null,
      trail: null,
      shift: false,
    }
    current.shift = pointer.event.shiftKey
    const last = current.last
    const slop = (touch ? touchSlop : clickSlop) * 2
    const finish =
      (current.tool === 'line' || current.tool === 'polygon') &&
      current.points.length > 0 &&
      last !== null &&
      performance.now() - last.time < doubleClickTime &&
      Math.hypot(point.x - last.at.x, point.y - last.at.y) <= slop
    const start = targetOf(point, current.shift, current)
    if (!start) return false
    draw = current
    current.press = { from: point, start, touch, finish, started: false }
    current.trail = point
    hover = point
    changed()
    return true
  }

  function follow(current: Draw, pointer: ToolPointer): void {
    const view = screen()
    const event = pointer.event
    const list = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
    const samples = list.length > 0 ? list : [event]
    if (current.points.length === 0 && current.press) current.points.push(current.press.start)
    for (const sample of samples) {
      const point = {
        x: pointer.point.x + sample.clientX - event.clientX,
        y: pointer.point.y + sample.clientY - event.clientY,
      }
      const trail = current.trail
      if (trail && Math.hypot(point.x - trail.x, point.y - trail.y) < strokeSpacing) continue
      const world = worldAt(view, point)
      if (!world) continue
      current.points.push(world)
      current.trail = point
    }
  }

  function drawMove(current: Draw, press: Press, pointer: ToolPointer): void {
    const point = pointer.point
    hover = point
    current.shift = pointer.event.shiftKey
    if (!press.started) {
      const slop = press.touch ? touchSlop : clickSlop
      if (Math.hypot(point.x - press.from.x, point.y - press.from.y) <= slop) return
      press.started = true
    }
    if (current.tool === 'freehand') follow(current, pointer)
    changed()
  }

  function closesOnFirst(current: Draw, point: Point, touch: boolean): boolean {
    const first = current.points[0]
    const at = { x: 0, y: 0 }
    return (
      current.tool === 'polygon' &&
      current.points.length > 2 &&
      first !== undefined &&
      project(screen(), first.x, first.y, at) &&
      Math.hypot(point.x - at.x, point.y - at.y) <= reach(touch)
    )
  }

  function drawUp(current: Draw, press: Press, pointer: ToolPointer, cancelled: boolean): void {
    const point = pointer.point
    const touch = press.touch
    hover = touch ? null : point
    current.shift = pointer.event.shiftKey
    const end = targetOf(point, current.shift, current) ?? press.start
    current.press = null
    if (cancelled) {
      if (current.tool === 'freehand' || current.points.length === 0) draw = null
      changed()
      return
    }
    current.last = { at: point, time: performance.now() }
    if (current.tool === 'freehand') {
      const trail = current.trail
      const world = worldAt(screen(), point)
      if (press.started && world && trail && (trail.x !== point.x || trail.y !== point.y)) {
        current.points.push(world)
      }
      if (press.started && current.points.length > 1) finishStroke(current, touch)
      else stopDrawing()
      return
    }
    if (current.tool === 'rectangle' || current.tool === 'circle') {
      const corner = current.points[0] ?? (press.started ? press.start : null)
      if (corner) {
        const make = current.tool === 'circle' ? circleGeometry : rectangleGeometry
        endDrawing(make(corner, end, inDegrees()), current.tool)
        return
      }
      current.points.push(press.start)
      changed()
      return
    }
    if (press.finish) {
      if (!finishPath(current)) stopDrawing()
      return
    }
    if (closesOnFirst(current, point, touch)) {
      finishPath(current)
      return
    }
    if (current.points.length === 0) {
      current.points.push(press.start)
      if (!press.started) {
        changed()
        return
      }
    }
    const previous = current.points[current.points.length - 1]
    if (!previous || previous.x !== end.x || previous.y !== end.y) current.points.push(end)
    if (current.tool === 'line' && press.started && current.points.length === 2) {
      finishPath(current)
      return
    }
    changed()
  }

  function setTool(next: ShapeEditorTool): void {
    const chosen = checkTool(next, 'setTool')
    if (destroyed || (chosen === tool && !draw)) return
    gesture = null
    draw = null
    active = null
    tool = chosen
    changed()
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
      const origin = entry && outline ? originOf(entry.pin, outline, view) : null
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
    const origin = entry && outline ? originOf(entry.pin, outline, view) : null
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
    const bounds = gridStep() > 0 ? selectionBounds([...bases.keys()], screen()) : null
    gesture = {
      type: 'move',
      keys: [...bases.keys()],
      bases,
      corner: bounds ? { x: bounds[0], y: bounds[1] } : null,
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
      const origin = entry ? originOf(entry.pin, base, view) : null
      if (!origin) continue
      next.set(key, scaleOutline(base, anchor.x - origin.x, anchor.y - origin.y, sx, sy))
    }
    current.current = next
  }

  const pointerTool: PointerTool = {
    down(pointer) {
      if (destroyed || spaceHeld || pointer.event.button !== 0) return false
      if (tool !== 'select') return drawDown(pointer)
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
      if (destroyed) return
      const press = draw?.press
      if (draw && press) {
        drawMove(draw, press, pointer)
        return
      }
      const current = gesture
      if (!current) return
      hover = pointer.point
      if (!current.started) {
        if (!slopPassed(current, pointer.point)) return
        current.started = true
      }
      const world = pointerWorld(pointer.point)
      if (!world) return
      if (current.type === 'move') {
        const corner = current.corner
        const dx = world.x - current.start.x
        const dy = world.y - current.start.y
        const to = corner ? snapped({ x: corner.x + dx, y: corner.y + dy }) : null
        current.dx = corner && to ? to.x - corner.x : dx
        current.dy = corner && to ? to.y - corner.y : dy
      } else if (current.type === 'vertex') {
        const entry = entryOf(current.key)
        const origin = entry ? originOf(entry.pin, current.current, screen()) : null
        if (!origin) return
        const to = snapped({ x: world.x + current.grab.x, y: world.y + current.grab.y })
        current.current = moveVertex(
          current.current,
          current.part,
          current.index,
          to.x - origin.x,
          to.y - origin.y,
        )
      } else resizeTo(current, snapped(world), pointer.event.shiftKey)
      changed()
    },

    up(pointer, cancelled) {
      if (destroyed) return false
      const press = draw?.press
      if (draw && press) {
        drawUp(draw, press, pointer, cancelled)
        return false
      }
      const current = gesture
      if (!current) return false
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
      if (tool !== 'select') {
        const previous = hover
        hover = pointer.point
        if (draw && !draw.press) draw.shift = pointer.event.shiftKey
        if (draw && (previous?.x !== hover.x || previous?.y !== hover.y)) schedule()
        return 'crosshair'
      }
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

    doubleClick() {
      return !destroyed && tool !== 'select'
    },

    key(event) {
      if (destroyed) return false
      if (event.metaKey || event.ctrlKey) return !event.altKey && command(event)
      if (event.altKey) return false
      if (event.key === 'Escape') return cancelGesture() || stopDrawing()
      if (gesture) return false
      if (draw) {
        if (event.key === 'Enter') return finishPath(draw)
        if (event.key === 'Backspace' || event.key === 'Delete') return dropPoint()
      }
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

  function command(event: KeyboardEvent): boolean {
    if (gesture || draw?.press) return false
    const name = event.key.toLowerCase()
    const redoing = name === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey
    if (name === 'z' || redoing) {
      if (!event.shiftKey && !redoing && dropPoint()) return true
      if (historySize === 0) return false
      if (event.shiftKey || redoing) redo()
      else undo()
      return true
    }
    if (name === 'd' && !event.shiftKey) {
      const selected = selectedKeys()
      if (selected.length === 0) return false
      duplicate(selected)
      return true
    }
    return false
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

  if (!destroyed && internals.tool(pointerTool)) {
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
    draw = null
    undoStack.length = 0
    redoStack.length = 0
    pending.clear()
    entries.clear()
    store.setState((state) =>
      state.gesture === null &&
      state.pending.length === 0 &&
      state.drawing === null &&
      !state.canUndo &&
      !state.canRedo
        ? state
        : Object.freeze({
            ...state,
            gesture: null,
            pending: noKeys,
            drawing: null,
            canUndo: false,
            canRedo: false,
          }),
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
    setTool,
    remove(keys) {
      if (destroyed) return
      removeShapes(keys ? [...keys] : selectedKeys())
    },
    duplicate(keys) {
      if (!destroyed) duplicate(keys ? [...keys] : selectedKeys())
    },
    raise(keys) {
      if (!destroyed) reorder(keys ? [...keys] : selectedKeys(), true)
    },
    lower(keys) {
      if (!destroyed) reorder(keys ? [...keys] : selectedKeys(), false)
    },
    undo() {
      if (!destroyed) undo()
    },
    redo() {
      if (!destroyed) redo()
    },
    cancel() {
      if (destroyed) return
      cancelGesture()
      stopDrawing()
    },
    update(next) {
      if (destroyed) return
      const merged = { ...given, ...next }
      const chosen = next.tool === undefined ? null : checkTool(next.tool, 'update')
      resolve(merged)
      given = merged
      entries.clear()
      if (chosen !== null && chosen !== tool) setTool(chosen)
      else changed()
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
