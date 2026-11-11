import { dev } from '../dev'
import { defaults } from '../theme/tokens'
import type { EdgeDash, Key, Mark, ShapeMark } from '../types'
import { isKey, toAccessor } from './accessor'
import { dashCodes, noColor } from './columns'
import { type CompiledLabelText, labelText } from './compile-mark'
import type { ElementChanges, ShapeRecord } from './graph-model'
import type { AnyIssue } from './issues'
import { type LabelTextColumns, readBackground, toText, writeLabelText } from './label-text'
import type { Palette } from './palette'
import {
  isDrawn,
  type ShapeEngine,
  type ShapeGeometryData,
  shapeEngineOf,
  shapeKinds,
  shapePicks,
} from './shape-engine'
import { TimeSpans } from './time-range'
import { readMaxZoom, readMinZoom, ZoomRanges } from './zoom-range'

type Read = (datum: unknown) => unknown

interface CompiledShapeMark {
  readonly geometry: Read
  readonly fill: Read | null
  readonly stroke: Read | null
  readonly strokeWidth: Read | null
  readonly dash: Read | null
  readonly opacity: Read | null
  readonly order: Read | null
  readonly minZoom: Read | null
  readonly maxZoom: Read | null
  readonly time: Read | null
  readonly pick: number
  readonly read: (value: unknown) => ShapeGeometryData | null
  readonly label: Read | null
  readonly labelBackground: Read | null
  readonly labelText: CompiledLabelText
  readonly node: Read | null
}

export interface ShapeSource {
  shapeAt?(index: number): ShapeRecord | undefined
  shapes?(): Iterable<ShapeRecord>
  node?(key: Key): { readonly index: number } | undefined
}

export interface PinNodes {
  readonly alive: Uint8Array
  readonly zoom: ZoomRanges
  readonly time: TimeSpans
  readonly slot: Uint16Array
}

export const unpinned = -1
export const pendingPin = -2

export class ShapeLabels implements LabelTextColumns {
  text: (string | null)[] = []
  labelBackground: Uint32Array = new Uint32Array(0)
  labelColor: Uint32Array = new Uint32Array(0)
  labelSize: Float32Array = new Float32Array(0)
  labelWeight: Uint16Array = new Uint16Array(0)
  labelFont: (string | null)[] = []
  labelMaxWidth: Float32Array = new Float32Array(0)
  anchor: Float64Array = new Float64Array(0)
  count = 0

  reserve(length: number): void {
    if (length <= this.labelSize.length) return
    const colors = (n: number) => new Uint32Array(n).fill(noColor)
    this.labelBackground = grown(this.labelBackground, length, colors)
    this.labelColor = grown(this.labelColor, length, colors)
    this.labelSize = grown(this.labelSize, length, (n) => new Float32Array(n))
    this.labelWeight = grown(this.labelWeight, length, (n) => new Uint16Array(n))
    this.labelMaxWidth = grown(this.labelMaxWidth, length, (n) => new Float32Array(n))
    this.anchor = grown(this.anchor, length * 2, (n) => new Float64Array(n).fill(Number.NaN))
  }
}

const noChanges: ElementChanges = { added: [], updated: [], removed: [] }
const noOrder = new Uint32Array(0)

const compiled = new WeakMap<ShapeMark<unknown>, CompiledShapeMark>()

function style(value: unknown): Read | null {
  if (value === undefined) return null
  return typeof value === 'function' ? (value as Read) : () => value
}

function compileShapeMark(mark: ShapeMark<unknown>): CompiledShapeMark {
  const known = compiled.get(mark)
  if (known) return known
  const options = mark.options
  const label = options.label
  const engine = shapeEngineOf(mark)
  const made: CompiledShapeMark = {
    geometry: toAccessor<unknown, unknown>(
      (options.geometry as string | Read | undefined) ?? 'geometry',
    ),
    fill: style(options.fill),
    stroke: style(options.stroke),
    strokeWidth: style(options.strokeWidth),
    dash: style(options.dash),
    opacity: style(options.opacity),
    order:
      options.order === undefined
        ? null
        : toAccessor<unknown, unknown>(options.order as string | Read),
    minZoom: style(options.minZoom),
    maxZoom: style(options.maxZoom),
    time:
      options.time === undefined
        ? null
        : toAccessor<unknown, unknown>(options.time as string | Read),
    pick:
      options.pick === false
        ? shapePicks.none
        : options.pick === 'stroke'
          ? shapePicks.stroke
          : shapePicks.painted,
    read: (value) => (engine ? engine.read(value) : null),
    label:
      label === undefined
        ? null
        : toAccessor<unknown, unknown>(
            (typeof label === 'object' ? label.text : label) as string | Read,
          ),
    labelBackground: style(typeof label === 'object' ? label.background : undefined),
    labelText: labelText(typeof label === 'object' ? label : null),
    node:
      options.node === undefined
        ? null
        : toAccessor<unknown, unknown>(options.node as string | Read),
  }
  compiled.set(mark, made)
  return made
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function grown<
  A extends Float64Array | Float32Array | Uint32Array | Uint8Array | Uint16Array | Int32Array,
>(array: A, length: number, make: (length: number) => A): A {
  if (length <= array.length) return array
  const next = make(Math.max(64, array.length * 2, length))
  next.set(array)
  return next
}

export class ShapeStore {
  capacity = 0
  alive: Uint8Array = new Uint8Array(0)
  slot: Uint16Array = new Uint16Array(0)
  arrival: Float64Array = new Float64Array(0)
  order: Float64Array = new Float64Array(0)
  fill: Uint32Array = new Uint32Array(0)
  stroke: Uint32Array = new Uint32Array(0)
  strokeWidth: Float32Array = new Float32Array(0)
  dash: Uint8Array = new Uint8Array(0)
  opacity: Float32Array = new Float32Array(0)
  pick: Uint8Array = new Uint8Array(0)
  readonly zoom: ZoomRanges = new ZoomRanges()
  readonly time: TimeSpans = new TimeSpans()
  readonly geometry: (ShapeGeometryData | null)[] = []
  readonly keys: (Key | undefined)[] = []
  readonly #inputs: unknown[] = []
  readonly #invalid = new Map<number, AnyIssue>()
  version = 0
  styleVersion = 0
  issueVersion = 0
  count = 0
  points = 0
  triangles = 0
  readTime = 0
  engine: ShapeEngine | null = null
  labels: ShapeLabels | null = null
  labelVersion = 0
  anchorVersion = 0
  pinNode: Int32Array | null = null
  pinCount = 0
  pendingCount = 0
  readonly nodes: PinNodes | null
  readonly #pinKeys: (Key | undefined)[] = []
  #labelOrder: Uint32Array | null = null
  #labelBoxes: Float64Array = new Float64Array(0)
  #labelOrdered = ''
  #background = noColor
  #warned = false
  #arrivals = 0
  #slots = new Map<ShapeMark<unknown>, number>()
  #fill = noColor
  #stroke = noColor
  #order: Uint32Array | null = null
  #ordered = -1
  readonly #palette: Palette

  constructor(palette: Palette, nodes: PinNodes | null = null) {
    this.#palette = palette
    this.nodes = nodes
  }

  get any(): boolean {
    return this.count > 0
  }

  get marked(): boolean {
    return this.#slots.size > 0
  }

  setMarks(marks: readonly Mark[]): void {
    const slots = new Map<ShapeMark<unknown>, number>()
    let slot = 0
    for (const mark of marks) {
      if (mark.type !== 'shapes' || slots.has(mark as ShapeMark<unknown>)) continue
      slots.set(mark as ShapeMark<unknown>, slot++)
      const engine = shapeEngineOf(mark)
      if (engine) this.engine ??= engine
      else if (dev && !this.#warned) {
        this.#warned = true
        console.warn(
          'graph: a shape mark comes from another copy of @bruno00o/graph, its shapes are not drawn',
        )
      }
    }
    this.#slots = slots
  }

  apply(
    model: ShapeSource,
    changes: ElementChanges | undefined,
    nodes: ElementChanges | null = null,
  ): void {
    const repin =
      this.pinCount > 0 &&
      (this.pendingCount > 0 || (nodes !== null && nodes.added.length + nodes.removed.length > 0))
    const { added, updated, removed } = changes ?? noChanges
    if (added.length + updated.length + removed.length === 0 && !repin) return
    const start = performance.now()
    for (const { index } of removed) this.#remove(index)
    let structural = removed.length > 0
    for (const refs of [added, updated]) {
      for (const { index } of refs) {
        const record = model.shapeAt?.(index)
        if (record && this.#write(record, model)) structural = true
      }
    }
    if (repin && this.#repin(model)) structural = true
    this.readTime = performance.now() - start
    this.styleVersion++
    if (structural) {
      this.version++
      this.#ordered = -1
    }
  }

  pinned(index: number): boolean {
    return (this.pinNode?.[index] ?? unpinned) >= 0
  }

  labelAnchor(index: number): boolean {
    const labels = this.labels
    const geometry = this.geometry[index]
    if (!labels || !this.engine || !isDrawn(geometry)) return false
    if (Number.isNaN(labels.anchor[index * 2] ?? Number.NaN)) {
      const point = this.engine.anchor(geometry)
      labels.anchor[index * 2] = point.x
      labels.anchor[index * 2 + 1] = point.y
      this.anchorVersion++
    }
    return true
  }

  labelOrder(): Uint32Array {
    const labels = this.labels
    if (!labels || labels.count === 0) return noOrder
    const key = `${this.version}:${this.labelVersion}`
    if (this.#labelOrder && this.#labelOrdered === key) return this.#labelOrder
    const indices = Array.from(this.drawOrder()).filter((index) => !!labels.text[index])
    const area = (index: number) => {
      const geometry = this.geometry[index]
      return geometry ? (geometry.maxX - geometry.minX) * (geometry.maxY - geometry.minY) : 0
    }
    indices.sort((a, b) => area(b) - area(a))
    const boxes = new Float64Array(indices.length * 4)
    indices.forEach((index, at) => {
      const geometry = this.geometry[index]
      boxes[at * 4] = geometry?.minX ?? 0
      boxes[at * 4 + 1] = geometry?.minY ?? 0
      boxes[at * 4 + 2] = geometry?.maxX ?? 0
      boxes[at * 4 + 3] = geometry?.maxY ?? 0
    })
    this.#labelOrder = Uint32Array.from(indices)
    this.#labelBoxes = boxes
    this.#labelOrdered = key
    return this.#labelOrder
  }

  labelBoxes(): Float64Array {
    this.labelOrder()
    return this.#labelBoxes
  }

  drawOrder(): Uint32Array {
    if (this.#order && this.#ordered === this.version) return this.#order
    const indices: number[] = []
    const pins = this.pinNode
    for (let index = 0; index < this.capacity; index++) {
      if (this.alive[index] !== 1 || !isDrawn(this.geometry[index])) continue
      if (!pins || pins[index] !== pendingPin) indices.push(index)
    }
    const { slot, order, arrival } = this
    indices.sort(
      (a, b) =>
        (slot[a] ?? 0) - (slot[b] ?? 0) ||
        (order[a] ?? 0) - (order[b] ?? 0) ||
        (arrival[a] ?? 0) - (arrival[b] ?? 0),
    )
    this.#order = Uint32Array.from(indices)
    this.#ordered = this.version
    return this.#order
  }

  collectIssues(into: AnyIssue[]): void {
    for (const issue of this.#invalid.values()) into.push(issue)
  }

  #reserve(index: number): void {
    if (index < this.capacity) return
    const length = Math.max(64, this.capacity * 2, index + 1)
    this.alive = grown(this.alive, length, (n) => new Uint8Array(n))
    this.slot = grown(this.slot, length, (n) => new Uint16Array(n))
    this.arrival = grown(this.arrival, length, (n) => new Float64Array(n))
    this.order = grown(this.order, length, (n) => new Float64Array(n))
    this.fill = grown(this.fill, length, (n) => new Uint32Array(n).fill(noColor))
    this.stroke = grown(this.stroke, length, (n) => new Uint32Array(n).fill(noColor))
    this.strokeWidth = grown(this.strokeWidth, length, (n) => new Float32Array(n))
    this.dash = grown(this.dash, length, (n) => new Uint8Array(n))
    this.opacity = grown(this.opacity, length, (n) => new Float32Array(n))
    this.pick = grown(this.pick, length, (n) => new Uint8Array(n))
    this.zoom.reserve(length)
    this.time.reserve(length)
    this.labels?.reserve(length)
    if (this.pinNode) this.pinNode = grown(this.pinNode, length, pinColumn)
    this.capacity = length
  }

  #remove(index: number): void {
    if (this.alive[index] !== 1) return
    const palette = this.#palette
    palette.drop(this.fill[index] ?? noColor)
    palette.drop(this.stroke[index] ?? noColor)
    this.fill[index] = noColor
    this.stroke[index] = noColor
    this.alive[index] = 0
    this.zoom.clear(index)
    this.time.clear(index)
    this.#writeLabel(index, null, null, undefined)
    this.#writePin(index, undefined, null)
    this.count--
    this.#count(this.geometry[index], -1)
    this.geometry[index] = null
    this.#inputs[index] = undefined
    this.keys[index] = undefined
    if (this.#invalid.delete(index)) this.issueVersion++
  }

  #count(geometry: ShapeGeometryData | null | undefined, sign: number): void {
    if (!geometry) return
    this.points += sign * (geometry.points.length / 2)
    this.triangles += sign * (geometry.triangles.length / 3)
  }

  #write(record: ShapeRecord, model: ShapeSource): boolean {
    const index = record.index
    this.#reserve(index)
    const mark = compileShapeMark(record.mark)
    const datum = record.datum
    const alive = this.alive[index] === 1
    const input = mark.geometry(datum)
    let structural = !alive
    if (!alive || input !== this.#inputs[index] || this.geometry[index] === undefined) {
      const geometry = input === undefined ? null : mark.read(input)
      const read = input === undefined ? emptyRead : geometry
      if (alive) this.#count(this.geometry[index], -1)
      this.geometry[index] = read
      this.#count(read, 1)
      if (this.labels) this.labels.anchor[index * 2] = Number.NaN
      this.#inputs[index] = input
      this.#report(index, record.key, read)
      structural = true
    }
    const slot = this.#slots.get(record.mark) ?? 0
    const order = finiteOr(mark.order?.(datum), 0)
    if (this.slot[index] !== slot || this.order[index] !== order) structural = true
    this.slot[index] = slot
    this.order[index] = order
    if (!alive) {
      this.arrival[index] = ++this.#arrivals
      this.count++
    }
    this.alive[index] = 1
    this.keys[index] = record.key
    const geometry = this.geometry[index]
    const filled = geometry !== null && geometry !== undefined && geometry.kind !== shapeKinds.line
    this.fill[index] = this.#swap(
      this.fill[index] ?? noColor,
      filled ? mark.fill?.(datum) : null,
      'fill',
      alive,
    )
    this.stroke[index] = this.#swap(
      this.stroke[index] ?? noColor,
      mark.stroke?.(datum),
      'stroke',
      alive,
    )
    this.strokeWidth[index] = Math.max(0, finiteOr(mark.strokeWidth?.(datum), 1))
    const dash = mark.dash?.(datum)
    this.dash[index] =
      typeof dash === 'string' && Object.hasOwn(dashCodes, dash) ? dashCodes[dash as EdgeDash] : 0
    this.opacity[index] = Math.min(1, Math.max(0, finiteOr(mark.opacity?.(datum), 1)))
    this.pick[index] = mark.pick
    this.zoom.set(index, readMinZoom(mark.minZoom?.(datum)), readMaxZoom(mark.maxZoom?.(datum)))
    if (mark.time) this.time.read(index, mark.time(datum))
    else this.time.clear(index)
    const text = mark.label ? toText(mark.label(datum)) : null
    if (text || this.labels) this.#writeLabel(index, text || null, mark, datum)
    const node = mark.node?.(datum)
    const pin = isKey(node) ? node : undefined
    if ((pin !== undefined || this.pinNode) && this.#writePin(index, pin, model)) structural = true
    return structural
  }

  #writeLabel(
    index: number,
    text: string | null,
    mark: CompiledShapeMark | null,
    datum: unknown,
  ): void {
    if (!this.labels && !text) return
    if (!this.labels) {
      this.labels = new ShapeLabels()
      this.labels.reserve(this.capacity)
    }
    const labels = this.labels
    const palette = this.#palette
    const before = labels.text[index] ?? null
    if (before !== text) {
      labels.count += (text ? 1 : 0) - (before ? 1 : 0)
      labels.text[index] = text
      this.labelVersion++
    }
    if (!mark || !text) {
      palette.drop(labels.labelColor[index] ?? noColor)
      palette.drop(labels.labelBackground[index] ?? noColor)
      labels.labelColor[index] = noColor
      labels.labelBackground[index] = noColor
      return
    }
    const size = labels.labelSize[index]
    const weight = labels.labelWeight[index]
    const font = labels.labelFont[index] ?? null
    const width = labels.labelMaxWidth[index]
    if (this.#background === noColor) this.#background = palette.id(defaults.labelBackground)
    labels.labelBackground[index] = readBackground(
      labels.labelBackground[index] ?? noColor,
      mark.labelBackground?.(datum),
      palette,
      { labelBackground: this.#background },
    )
    writeLabelText(labels, index, mark.labelText, datum, palette)
    const changed =
      size !== labels.labelSize[index] ||
      weight !== labels.labelWeight[index] ||
      font !== (labels.labelFont[index] ?? null) ||
      width !== labels.labelMaxWidth[index]
    if (changed) this.labelVersion++
  }

  #writePin(index: number, key: Key | undefined, model: ShapeSource | null): boolean {
    const before = this.#pinKeys[index]
    if (key === undefined && before === undefined) return false
    this.pinNode ??= pinColumn(Math.max(64, this.capacity))
    const pins = this.pinNode
    const previous = pins[index] ?? unpinned
    if (before !== undefined) {
      this.pinCount--
      if (previous === pendingPin) this.pendingCount--
    }
    this.#pinKeys[index] = key
    let node = unpinned
    if (key !== undefined) {
      node = model?.node?.(key)?.index ?? pendingPin
      this.pinCount++
      if (node === pendingPin) this.pendingCount++
    }
    pins[index] = node
    return node !== previous
  }

  #repin(model: ShapeSource): boolean {
    let changed = false
    for (let index = 0; index < this.capacity; index++) {
      const key = this.#pinKeys[index]
      if (key !== undefined && this.#writePin(index, key, model)) changed = true
    }
    return changed
  }

  #swap(previous: number, value: unknown, part: 'fill' | 'stroke', alive: boolean): number {
    const palette = this.#palette
    const current = alive ? previous : noColor
    if (typeof value === 'string') return palette.swap(current, value, noColor)
    palette.swap(current, null, noColor)
    return value === null ? noColor : this.#fallback(part)
  }

  #fallback(part: 'fill' | 'stroke'): number {
    if (part === 'fill') {
      if (this.#fill === noColor) this.#fill = this.#palette.id(defaults.shapeFill)
      return this.#fill
    }
    if (this.#stroke === noColor) this.#stroke = this.#palette.id(defaults.shapeStroke)
    return this.#stroke
  }

  #report(index: number, key: Key, geometry: ShapeGeometryData | null): void {
    const reason = geometry?.invalid ?? null
    const known = this.#invalid.get(index)
    if (!reason) {
      if (known && this.#invalid.delete(index)) this.issueVersion++
      return
    }
    if (known && known.type === 'invalid-shape' && known.key === key && known.reason === reason) {
      return
    }
    this.#invalid.set(index, { type: 'invalid-shape', kind: 'shapes', key, reason })
    this.issueVersion++
  }
}

function pinColumn(length: number): Int32Array {
  return new Int32Array(length).fill(unpinned)
}

const emptyRead: ShapeGeometryData = {
  kind: shapeKinds.polygon,
  points: new Float64Array(0),
  rings: new Uint32Array(0),
  closed: true,
  triangles: new Uint32Array(0),
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
  round: null,
  invalid: 'empty',
}
