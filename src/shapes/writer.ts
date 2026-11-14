import { isKey, toAccessor } from '../core/accessor'
import { dashCodes, noColor } from '../core/columns'
import { type CompiledLabelText, labelText } from '../core/compile-mark'
import type { ElementChanges, ShapeRecord } from '../core/graph-model'
import type { AnyIssue } from '../core/issues'
import { readBackground, toText, writeLabelText } from '../core/label-text'
import {
  isDrawn,
  type ShapeGeometryData,
  type ShapeLabelColumns,
  type ShapeSource,
  type ShapeWriter,
  shapeKinds,
  shapePicks,
} from '../core/shape-engine'
import { pendingPin, type ShapeStore, unpinned } from '../core/shape-store'
import { readMaxZoom, readMinZoom } from '../core/zoom-range'
import { defaults } from '../theme/tokens'
import type { EdgeDash, Key, ShapeMark } from '../types'
import { type Filled, type FillInput, fillShape } from './fill'
import { FillPool } from './fills'
import { emptyShape, filledWith, readOutline } from './read'

type Read = (datum: unknown) => unknown

export const syncPoints = 100_000
const chunkPoints = 100_000

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
  readonly label: Read | null
  readonly labelBackground: Read | null
  readonly labelText: CompiledLabelText
  readonly node: Read | null
}

interface Waiting {
  readonly index: number
  readonly stamp: number
  readonly geometry: ShapeGeometryData
}

export class ShapeLabels implements ShapeLabelColumns {
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
const compiled = new WeakMap<object, CompiledShapeMark>()

function style(value: unknown): Read | null {
  if (value === undefined) return null
  return typeof value === 'function' ? (value as Read) : () => value
}

function compileShapeMark(mark: ShapeMark<unknown>): CompiledShapeMark {
  const known = compiled.get(mark)
  if (known) return known
  const options = mark.options
  const label = options.label
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

function pinColumn(length: number): Int32Array {
  return new Int32Array(length).fill(unpinned)
}

function taskOf(geometry: ShapeGeometryData): FillInput {
  return {
    points: geometry.points,
    rings: geometry.rings,
    polygons: geometry.polygons ?? new Uint32Array(1),
    polygon: geometry.kind === shapeKinds.polygon,
    closed: geometry.closed,
  }
}

class Writer implements ShapeWriter {
  readonly #store: ShapeStore
  readonly #inputs: unknown[] = []
  readonly #invalid = new Map<number, AnyIssue>()
  readonly #pinKeys: (Key | undefined)[] = []
  #stamps = new Uint32Array(0)
  #stamp = 0
  #waiting: Waiting[] = []
  readonly #batches = new Map<number, Waiting[]>()
  #pool: FillPool | null = null
  #batch = 0
  #pending = 0
  #settle: (() => void)[] = []
  #background = noColor
  #arrivals = 0
  #fill = noColor
  #stroke = noColor
  #order: Uint32Array | null = null
  #ordered = -1

  constructor(store: ShapeStore) {
    this.#store = store
  }

  apply(model: ShapeSource, changes: ElementChanges | undefined, nodes: ElementChanges | null) {
    const store = this.#store
    const repin =
      store.pinCount > 0 &&
      (store.pendingCount > 0 || (nodes !== null && nodes.added.length + nodes.removed.length > 0))
    const { added, updated, removed } = changes ?? noChanges
    if (added.length + updated.length + removed.length === 0 && !repin) return
    for (const { index } of removed) this.#remove(index)
    let structural = removed.length > 0
    for (const refs of [added, updated]) {
      for (const { index } of refs) {
        const record = model.shapeAt?.(index)
        if (record && this.#write(record, model)) structural = true
      }
    }
    if (repin && this.#repin(model)) structural = true
    this.#fillWaiting()
    store.styleVersion++
    if (structural) store.version++
  }

  collect(into: AnyIssue[]): void {
    for (const issue of this.#invalid.values()) into.push(issue)
  }

  drawOrder(): Uint32Array {
    const store = this.#store
    if (this.#order && this.#ordered === store.version) return this.#order
    const indices: number[] = []
    const pins = store.pinNode
    for (let index = 0; index < store.capacity; index++) {
      if (store.alive[index] !== 1 || !isDrawn(store.geometry[index])) continue
      if (!pins || pins[index] !== pendingPin) indices.push(index)
    }
    const { slot, order, arrival } = store
    indices.sort(
      (a, b) =>
        (slot[a] ?? 0) - (slot[b] ?? 0) ||
        (order[a] ?? 0) - (order[b] ?? 0) ||
        (arrival[a] ?? 0) - (arrival[b] ?? 0),
    )
    this.#order = Uint32Array.from(indices)
    this.#ordered = store.version
    return this.#order
  }

  settled(): Promise<void> {
    if (this.#pending === 0) return Promise.resolve()
    return new Promise((done) => this.#settle.push(done))
  }

  destroy(): void {
    this.#pool?.destroy()
    this.#pool = null
    this.#batches.clear()
    this.#pending = 0
    this.#release()
  }

  #release(): void {
    if (this.#pending > 0) return
    for (const done of this.#settle.splice(0)) done()
  }

  #fillWaiting(): void {
    const waiting = this.#waiting
    if (waiting.length === 0) return
    this.#waiting = []
    let size = 0
    for (const entry of waiting) size += entry.geometry.points.length / 2
    const store = this.#store
    if (size <= syncPoints) {
      for (const entry of waiting) {
        this.#place(entry, fillShape(taskOf(entry.geometry)))
      }
      return
    }
    this.#pool ??= new FillPool((id, filled) => this.#arrive(id, filled))
    let part: Waiting[] = []
    let points = 0
    const send = () => {
      if (part.length === 0) return
      const id = this.#batch++
      this.#batches.set(id, part)
      this.#pool?.send(
        id,
        part.map((entry) => taskOf(entry.geometry)),
      )
      this.#pending++
      part = []
      points = 0
    }
    for (const entry of waiting) {
      part.push(entry)
      points += entry.geometry.points.length / 2
      if (points >= chunkPoints) send()
    }
    send()
    store.fillVersion++
  }

  #arrive(id: number, filled: readonly Filled[]): void {
    const part = this.#batches.get(id)
    if (!part) return
    this.#batches.delete(id)
    const store = this.#store
    part.forEach((entry, at) => {
      const result = filled[at]
      if (result) this.#place(entry, result)
    })
    this.#pending--
    store.fillVersion++
    store.wake()
    this.#release()
  }

  #place(entry: Waiting, filled: Filled): void {
    const store = this.#store
    const { index, stamp, geometry } = entry
    if (this.#stamps[index] !== stamp || store.geometry[index] !== geometry) return
    const next = filledWith(geometry, filled)
    store.geometry[index] = next
    const key = store.keys[index]
    if (key !== undefined) this.#report(index, key, next)
  }

  #reserve(index: number): void {
    const store = this.#store
    if (index < store.capacity) return
    const length = Math.max(64, store.capacity * 2, index + 1)
    store.alive = grown(store.alive, length, (n) => new Uint8Array(n))
    store.slot = grown(store.slot, length, (n) => new Uint16Array(n))
    store.arrival = grown(store.arrival, length, (n) => new Float64Array(n))
    store.order = grown(store.order, length, (n) => new Float64Array(n))
    store.fill = grown(store.fill, length, (n) => new Uint32Array(n).fill(noColor))
    store.stroke = grown(store.stroke, length, (n) => new Uint32Array(n).fill(noColor))
    store.strokeWidth = grown(store.strokeWidth, length, (n) => new Float32Array(n))
    store.dash = grown(store.dash, length, (n) => new Uint8Array(n))
    store.opacity = grown(store.opacity, length, (n) => new Float32Array(n))
    store.pick = grown(store.pick, length, (n) => new Uint8Array(n))
    store.zoom.reserve(length)
    store.time.reserve(length)
    ;(store.labels as ShapeLabels | null)?.reserve(length)
    if (store.pinNode) store.pinNode = grown(store.pinNode, length, pinColumn)
    this.#stamps = grown(this.#stamps, length, (n) => new Uint32Array(n))
    store.capacity = length
  }

  #remove(index: number): void {
    const store = this.#store
    if (store.alive[index] !== 1) return
    const palette = store.palette
    palette.drop(store.fill[index] ?? noColor)
    palette.drop(store.stroke[index] ?? noColor)
    store.fill[index] = noColor
    store.stroke[index] = noColor
    store.alive[index] = 0
    store.zoom.clear(index)
    store.time.clear(index)
    this.#writeLabel(index, null, null, undefined)
    this.#writePin(index, undefined, null)
    store.count--
    store.geometry[index] = null
    this.#stamps[index] = ++this.#stamp
    this.#inputs[index] = undefined
    store.keys[index] = undefined
    if (this.#invalid.delete(index)) store.issueVersion++
  }

  #write(record: ShapeRecord, model: ShapeSource): boolean {
    const store = this.#store
    const index = record.index
    this.#reserve(index)
    const mark = compileShapeMark(record.mark)
    const datum = record.datum
    const alive = store.alive[index] === 1
    const input = mark.geometry(datum)
    let structural = !alive
    if (!alive || input !== this.#inputs[index] || store.geometry[index] === undefined) {
      const read = input === undefined ? emptyShape() : readOutline(input)
      store.geometry[index] = read
      const stamp = ++this.#stamp
      this.#stamps[index] = stamp
      if (read?.pending) this.#waiting.push({ index, stamp, geometry: read })
      if (store.labels) store.labels.anchor[index * 2] = Number.NaN
      this.#inputs[index] = input
      this.#report(index, record.key, read)
      structural = true
    }
    const slot = store.slots.get(record.mark) ?? 0
    const order = finiteOr(mark.order?.(datum), 0)
    if (store.slot[index] !== slot || store.order[index] !== order) structural = true
    store.slot[index] = slot
    store.order[index] = order
    if (!alive) {
      store.arrival[index] = ++this.#arrivals
      store.count++
    }
    store.alive[index] = 1
    store.keys[index] = record.key
    const geometry = store.geometry[index]
    const filled = geometry !== null && geometry !== undefined && geometry.kind !== shapeKinds.line
    store.fill[index] = this.#swap(
      store.fill[index] ?? noColor,
      filled ? mark.fill?.(datum) : null,
      'fill',
      alive,
    )
    store.stroke[index] = this.#swap(
      store.stroke[index] ?? noColor,
      mark.stroke?.(datum),
      'stroke',
      alive,
    )
    store.strokeWidth[index] = Math.max(0, finiteOr(mark.strokeWidth?.(datum), 1))
    const dash = mark.dash?.(datum)
    store.dash[index] =
      typeof dash === 'string' && Object.hasOwn(dashCodes, dash) ? dashCodes[dash as EdgeDash] : 0
    store.opacity[index] = Math.min(1, Math.max(0, finiteOr(mark.opacity?.(datum), 1)))
    store.pick[index] = mark.pick
    store.zoom.set(index, readMinZoom(mark.minZoom?.(datum)), readMaxZoom(mark.maxZoom?.(datum)))
    if (mark.time) store.time.read(index, mark.time(datum))
    else store.time.clear(index)
    const text = mark.label ? toText(mark.label(datum)) : null
    if (text || store.labels) this.#writeLabel(index, text || null, mark, datum)
    const node = mark.node?.(datum)
    const pin = isKey(node) ? node : undefined
    if ((pin !== undefined || store.pinNode) && this.#writePin(index, pin, model)) structural = true
    return structural
  }

  #writeLabel(
    index: number,
    text: string | null,
    mark: CompiledShapeMark | null,
    datum: unknown,
  ): void {
    const store = this.#store
    if (!store.labels && !text) return
    if (!store.labels) {
      const made = new ShapeLabels()
      made.reserve(store.capacity)
      store.labels = made
    }
    const labels = store.labels as ShapeLabels
    const palette = store.palette
    const before = labels.text[index] ?? null
    if (before !== text) {
      labels.count += (text ? 1 : 0) - (before ? 1 : 0)
      labels.text[index] = text
      store.labelVersion++
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
    if (changed) store.labelVersion++
  }

  #writePin(index: number, key: Key | undefined, model: ShapeSource | null): boolean {
    const store = this.#store
    const before = this.#pinKeys[index]
    if (key === undefined && before === undefined) return false
    store.pinNode ??= pinColumn(Math.max(64, store.capacity))
    const pins = store.pinNode
    const previous = pins[index] ?? unpinned
    if (before !== undefined) {
      store.pinCount--
      if (previous === pendingPin) store.pendingCount--
    }
    this.#pinKeys[index] = key
    let node = unpinned
    if (key !== undefined) {
      node = model?.node?.(key)?.index ?? pendingPin
      store.pinCount++
      if (node === pendingPin) store.pendingCount++
    }
    pins[index] = node
    return node !== previous
  }

  #repin(model: ShapeSource): boolean {
    let changed = false
    for (let index = 0; index < this.#store.capacity; index++) {
      const key = this.#pinKeys[index]
      if (key !== undefined && this.#writePin(index, key, model)) changed = true
    }
    return changed
  }

  #swap(previous: number, value: unknown, part: 'fill' | 'stroke', alive: boolean): number {
    const palette = this.#store.palette
    const current = alive ? previous : noColor
    if (typeof value === 'string') return palette.swap(current, value, noColor)
    palette.swap(current, null, noColor)
    return value === null ? noColor : this.#fallback(part)
  }

  #fallback(part: 'fill' | 'stroke'): number {
    const palette = this.#store.palette
    if (part === 'fill') {
      if (this.#fill === noColor) this.#fill = palette.id(defaults.shapeFill)
      return this.#fill
    }
    if (this.#stroke === noColor) this.#stroke = palette.id(defaults.shapeStroke)
    return this.#stroke
  }

  #report(index: number, key: Key, geometry: ShapeGeometryData | null): void {
    const store = this.#store
    const reason = geometry?.invalid ?? null
    const known = this.#invalid.get(index)
    if (!reason) {
      if (known && this.#invalid.delete(index)) store.issueVersion++
      return
    }
    if (known && known.type === 'invalid-shape' && known.key === key && known.reason === reason) {
      return
    }
    this.#invalid.set(index, { type: 'invalid-shape', kind: 'shapes', key, reason })
    store.issueVersion++
  }
}

export function createShapeWriter(store: ShapeStore): ShapeWriter {
  return new Writer(store)
}
