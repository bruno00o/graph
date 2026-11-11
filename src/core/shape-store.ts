import { dev } from '../dev'
import { defaults } from '../theme/tokens'
import type { EdgeDash, Key, Mark, ShapeMark } from '../types'
import { toAccessor } from './accessor'
import { dashCodes, noColor } from './columns'
import type { ElementChanges, ShapeRecord } from './graph-model'
import type { AnyIssue } from './issues'
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
}

export interface ShapeSource {
  shapeAt?(index: number): ShapeRecord | undefined
  shapes?(): Iterable<ShapeRecord>
}

const compiled = new WeakMap<ShapeMark<unknown>, CompiledShapeMark>()

function style(value: unknown): Read | null {
  if (value === undefined) return null
  return typeof value === 'function' ? (value as Read) : () => value
}

function compileShapeMark(mark: ShapeMark<unknown>): CompiledShapeMark {
  const known = compiled.get(mark)
  if (known) return known
  const options = mark.options
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
  }
  compiled.set(mark, made)
  return made
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function grown<A extends Float64Array | Float32Array | Uint32Array | Uint8Array | Uint16Array>(
  array: A,
  length: number,
  make: (length: number) => A,
): A {
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
  shown = true
  engine: ShapeEngine | null = null
  #warned = false
  #arrivals = 0
  #slots = new Map<ShapeMark<unknown>, number>()
  #fill = noColor
  #stroke = noColor
  #order: Uint32Array | null = null
  #ordered = -1
  readonly #palette: Palette

  constructor(palette: Palette) {
    this.#palette = palette
  }

  get any(): boolean {
    return this.shown && this.count > 0
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

  apply(model: ShapeSource, changes: ElementChanges | undefined): void {
    if (!changes) return
    const { added, updated, removed } = changes
    if (added.length + updated.length + removed.length === 0) return
    const start = performance.now()
    for (const { index } of removed) this.#remove(index)
    let structural = removed.length > 0
    for (const refs of [added, updated]) {
      for (const { index } of refs) {
        const record = model.shapeAt?.(index)
        if (record && this.#write(record)) structural = true
      }
    }
    this.readTime = performance.now() - start
    this.styleVersion++
    if (structural) {
      this.version++
      this.#ordered = -1
    }
  }

  drawOrder(): Uint32Array {
    if (this.#order && this.#ordered === this.version) return this.#order
    const indices: number[] = []
    for (let index = 0; this.shown && index < this.capacity; index++) {
      if (this.alive[index] === 1 && isDrawn(this.geometry[index])) indices.push(index)
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

  #write(record: ShapeRecord): boolean {
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
    return structural
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
