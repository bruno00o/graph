import { dev } from '../dev'
import type { Key, LayoutWork, Mark, ShapeMark } from '../types'
import { ChangeLog } from './change-log'
import type { ElementChanges } from './graph-model'
import type { AnyIssue } from './issues'
import type { Palette } from './palette'
import {
  type ShapeEngine,
  type ShapeGeometryData,
  type ShapeLabelColumns,
  type ShapeSource,
  type ShapeWriter,
  shapeEngineOf,
} from './shape-engine'
import { TimeSpans } from './time-range'
import { leastWidth, WidthFloors } from './width-scale'
import { ZoomRanges } from './zoom-range'

export interface PinNodes {
  readonly alive: Uint8Array
  readonly zoom: ZoomRanges
  readonly time: TimeSpans
  readonly slot: Uint16Array
}

export interface ShapeShift {
  readonly keys: readonly Key[]
  readonly x: number
  readonly y: number
}

export const unpinned = -1
export const pendingPin = -2
export const shiftSlots = 7

const noOrder = new Uint32Array(0)

function same(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, at) => value === b[at])
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
  readonly floors: WidthFloors = new WidthFloors()
  readonly geometry: (ShapeGeometryData | null)[] = []
  readonly keys: (Key | undefined)[] = []
  version = 0
  geometryVersion = 0
  readonly moved: ChangeLog = new ChangeLog()
  pickVersion = 0
  fillVersion = 0
  styleVersion = 0
  issueVersion = 0
  count = 0
  engine: ShapeEngine | null = null
  labels: ShapeLabelColumns | null = null
  labelVersion = 0
  anchorVersion = 0
  pinNode: Int32Array | null = null
  pinCount = 0
  pendingCount = 0
  slots: Map<object, number> = new Map()
  draft: Uint8Array = new Uint8Array(0)
  draftVersion = 0
  draftTouched: readonly number[] = []
  readonly shift: Float64Array = new Float64Array(shiftSlots * 2)
  shiftVersion = 0
  wake: () => void = () => {}
  work: LayoutWork | null = null
  readonly palette: Palette
  readonly nodes: PinNodes | null
  #writer: ShapeWriter | null = null
  #drafted: readonly number[] = []
  #kinds: readonly number[] = []
  #warned = false

  constructor(palette: Palette, nodes: PinNodes | null = null) {
    this.palette = palette
    this.nodes = nodes
  }

  get any(): boolean {
    return this.count > 0
  }

  get marked(): boolean {
    return this.slots.size > 0
  }

  setMarks(marks: readonly Mark[]): void {
    const slots = new Map<object, number>()
    const floors: number[] = []
    for (const mark of marks) {
      if (mark.type !== 'shapes' || slots.has(mark)) continue
      slots.set(mark, slots.size)
      floors.push(leastWidth((mark as ShapeMark<unknown>).options))
      const engine = shapeEngineOf(mark)
      if (engine) this.engine ??= engine
      else if (dev && !this.#warned) {
        this.#warned = true
        console.warn(
          'graph: a shape mark comes from another copy of @bruno00o/graph, its shapes are not drawn',
        )
      }
    }
    this.slots = slots
    this.floors.set(floors)
  }

  apply(
    model: ShapeSource,
    changes: ElementChanges | undefined,
    nodes: ElementChanges | null = null,
  ): void {
    if (this.engine) {
      this.#writer ??= this.engine.writer(this)
      this.#writer.apply(model, changes, nodes)
    } else if (changes) this.count += changes.added.length - changes.removed.length
  }

  setDrafts(indices: readonly number[], kinds: readonly number[] = []): void {
    const before = this.#drafted
    if (same(before, indices) && same(this.#kinds, kinds)) return
    if (this.draft.length < this.capacity) {
      const grown = new Uint8Array(this.capacity)
      grown.set(this.draft)
      this.draft = grown
    }
    for (const index of before) this.draft[index] = 0
    indices.forEach((index, at) => {
      this.draft[index] = kinds[at] ?? 1
    })
    this.draftTouched = [...before, ...indices]
    this.#drafted = [...indices]
    this.#kinds = [...kinds]
    this.draftVersion++
    const shown = before.filter((index) => this.draft[index] !== 1)
    if (shown.length > 0) this.#writer?.revealed(shown)
  }

  fillHidden(): void {
    this.#writer?.revealed(this.#drafted)
  }

  setShift(slot: number, x: number, y: number): void {
    const at = slot * 2
    if (this.shift[at] === x && this.shift[at + 1] === y) return
    this.shift[at] = x
    this.shift[at + 1] = y
    this.shiftVersion++
  }

  pinned(index: number): boolean {
    return (this.pinNode?.[index] ?? unpinned) >= 0
  }

  drawOrder(): Uint32Array {
    return this.#writer?.drawOrder() ?? noOrder
  }

  collectIssues(into: AnyIssue[]): void {
    this.#writer?.collect(into)
  }

  get filling(): boolean {
    return this.#writer?.filling ?? false
  }

  settled(): Promise<void> {
    return this.#writer?.settled() ?? Promise.resolve()
  }

  destroy(): void {
    this.#writer?.destroy()
  }
}
