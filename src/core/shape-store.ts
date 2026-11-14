import { dev } from '../dev'
import type { Key, Mark } from '../types'
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
import { ZoomRanges } from './zoom-range'

export interface PinNodes {
  readonly alive: Uint8Array
  readonly zoom: ZoomRanges
  readonly time: TimeSpans
  readonly slot: Uint16Array
}

export const unpinned = -1
export const pendingPin = -2

const noOrder = new Uint32Array(0)

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
  version = 0
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
  wake: () => void = () => {}
  readonly palette: Palette
  readonly nodes: PinNodes | null
  #writer: ShapeWriter | null = null
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
    for (const mark of marks) {
      if (mark.type !== 'shapes' || slots.has(mark)) continue
      slots.set(mark, slots.size)
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

  pinned(index: number): boolean {
    return (this.pinNode?.[index] ?? unpinned) >= 0
  }

  drawOrder(): Uint32Array {
    return this.#writer?.drawOrder() ?? noOrder
  }

  collectIssues(into: AnyIssue[]): void {
    this.#writer?.collect(into)
  }

  settled(): Promise<void> {
    return this.#writer?.settled() ?? Promise.resolve()
  }

  destroy(): void {
    this.#writer?.destroy()
  }
}
