export const maxStates = 32
export const noPaint = 0xffffffff
export const builtInRaise = 0b111

export type StateKind = 'nodes' | 'edges'

const tableOffset: Readonly<Record<StateKind, number>> = { nodes: 0, edges: maxStates }

export interface ResolvedStateStyle {
  readonly opacity?: number
  readonly strokeWidth?: number
  readonly halo?: boolean
  readonly label?: boolean
  readonly fill?: number
  readonly stroke?: number
  readonly outline?: number
  readonly outlineWidth?: number
  readonly labelColor?: number
  readonly flow?: number
  readonly raise?: boolean
  readonly hide?: boolean
}

export interface StateMasks {
  readonly nodeMask: Uint32Array
  readonly edgeMask: Uint32Array
}

export interface HideFilter {
  readonly masks: StateMasks
  readonly nodes: number
  readonly edges: number
  readonly serial: number
}

function countHidden(masks: Uint32Array, bits: number): number {
  if (bits === 0) return 0
  let count = 0
  for (let index = 0; index < masks.length; index++) {
    if (((masks[index] ?? 0) & bits) !== 0) count++
  }
  return count
}

export class DirtyRange {
  from: number = Number.POSITIVE_INFINITY
  to = -1

  add(index: number): void {
    if (index < this.from) this.from = index
    if (index > this.to) this.to = index
  }

  take(): readonly [number, number] | null {
    if (this.to < this.from) return null
    const range = [this.from, this.to] as const
    this.from = Number.POSITIVE_INFINITY
    this.to = -1
    return range
  }
}

const bits = new Float32Array(1)
const word = new Uint32Array(bits.buffer)

export function floatWord(value: number): number {
  bits[0] = value
  return word[0] ?? 0
}

export function wordFloat(value: number): number {
  word[0] = value
  return bits[0] ?? 0
}

function grow(array: Uint32Array, capacity: number): Uint32Array {
  if (capacity <= array.length) return array
  const next = new Uint32Array(Math.max(capacity, array.length * 2))
  next.set(array)
  return next
}

export class StateBuffers {
  readonly numbers: Float32Array = new Float32Array(maxStates * 8).fill(-1)
  readonly paint: Uint32Array = new Uint32Array(maxStates * 8).fill(noPaint)
  readonly labels: Uint32Array = new Uint32Array(maxStates * 8).fill(noPaint)
  readonly labelFlags: Int8Array = new Int8Array(maxStates).fill(-1)
  readonly edgeLabelFlags: Int8Array = new Int8Array(maxStates).fill(-1)
  readonly nodeDirty: DirtyRange = new DirtyRange()
  readonly edgeDirty: DirtyRange = new DirtyRange()
  nodeMask: Uint32Array = new Uint32Array(0)
  edgeMask: Uint32Array = new Uint32Array(0)
  highlightedNodes: readonly number[] = []
  highlightedEdges: readonly number[] = []
  tableVersion = 0
  highlightVersion = 0
  edgeMaskVersion = 0
  edgeFlowBits = 0
  nodeRaise: number = builtInRaise
  edgeRaise: number = builtInRaise
  nodeHide = 0
  edgeHide = 0
  hideVersion = 0
  #hiddenNodes = 0
  #hiddenEdges = 0
  #hide: HideFilter | null = null
  #hideAt = -1

  get hide(): HideFilter | null {
    if (this.#hideAt === this.hideVersion) return this.#hide
    this.#hideAt = this.hideVersion
    this.#hide =
      this.#hiddenNodes + this.#hiddenEdges > 0
        ? { masks: this, nodes: this.nodeHide, edges: this.edgeHide, serial: this.hideVersion }
        : null
    return this.#hide
  }

  reserve(nodeCapacity: number, edgeCapacity: number): void {
    this.nodeMask = grow(this.nodeMask, nodeCapacity)
    this.edgeMask = grow(this.edgeMask, edgeCapacity)
  }

  setNode(index: number, mask: number): void {
    this.nodeMask = grow(this.nodeMask, index + 1)
    const before = this.nodeMask[index] ?? 0
    if (before === mask >>> 0) return
    if (this.nodeHide !== 0) {
      const change = Number((mask & this.nodeHide) !== 0) - Number((before & this.nodeHide) !== 0)
      if (change !== 0) {
        this.#hiddenNodes += change
        this.hideVersion++
      }
    }
    this.nodeMask[index] = mask >>> 0
    this.nodeDirty.add(index)
  }

  setEdge(index: number, mask: number): void {
    this.edgeMask = grow(this.edgeMask, index + 1)
    const before = this.edgeMask[index] ?? 0
    if (before === mask >>> 0) return
    if (this.edgeHide !== 0) {
      const change = Number((mask & this.edgeHide) !== 0) - Number((before & this.edgeHide) !== 0)
      if (change !== 0) {
        this.#hiddenEdges += change
        this.hideVersion++
      }
    }
    this.edgeMask[index] = mask >>> 0
    this.edgeDirty.add(index)
    this.edgeMaskVersion++
  }

  setStyle(kind: StateKind, bit: number, style: ResolvedStateStyle | null): void {
    const at = (tableOffset[kind] + bit) * 4
    this.numbers[at] = style?.opacity ?? -1
    this.numbers[at + 1] = style?.strokeWidth ?? -1
    this.numbers[at + 2] = style?.halo === undefined ? -1 : style.halo ? 1 : 0
    this.numbers[at + 3] = style?.label === undefined ? -1 : style.label ? 1 : 0
    this.paint[at] = style?.fill ?? noPaint
    this.paint[at + 1] = style?.stroke ?? noPaint
    this.paint[at + 2] = style?.outline ?? noPaint
    this.paint[at + 3] =
      style?.outlineWidth === undefined ? noPaint : floatWord(Math.max(0, style.outlineWidth))
    this.labels[at] = style?.labelColor ?? noPaint
    this.labels[at + 1] = style?.flow === undefined ? noPaint : floatWord(style.flow)
    const flag = (1 << bit) >>> 0
    if (kind === 'edges') {
      this.edgeFlowBits =
        (style?.flow === undefined ? this.edgeFlowBits & ~flag : this.edgeFlowBits | flag) >>> 0
      this.edgeRaise = (style?.raise ? this.edgeRaise | flag : this.edgeRaise & ~flag) >>> 0
      const hide = (style?.hide ? this.edgeHide | flag : this.edgeHide & ~flag) >>> 0
      if (hide !== this.edgeHide) {
        this.edgeHide = hide
        this.#hiddenEdges = countHidden(this.edgeMask, hide)
        this.hideVersion++
      }
    } else {
      this.nodeRaise = (style?.raise ? this.nodeRaise | flag : this.nodeRaise & ~flag) >>> 0
      const hide = (style?.hide ? this.nodeHide | flag : this.nodeHide & ~flag) >>> 0
      if (hide !== this.nodeHide) {
        this.nodeHide = hide
        this.#hiddenNodes = countHidden(this.nodeMask, hide)
        this.hideVersion++
      }
    }
    const flags = kind === 'nodes' ? this.labelFlags : this.edgeLabelFlags
    flags[bit] = this.numbers[at + 3] ?? -1
    this.tableVersion++
  }

  copyHide(from: StateBuffers): void {
    this.nodeHide = from.nodeHide
    this.edgeHide = from.edgeHide
    this.#hiddenNodes = countHidden(this.nodeMask, this.nodeHide)
    this.#hiddenEdges = countHidden(this.edgeMask, this.edgeHide)
    this.hideVersion++
  }

  raised(kind: StateKind): number {
    return kind === 'nodes' ? this.nodeRaise : this.edgeRaise
  }

  setHighlighted(nodes: readonly number[], edges: readonly number[]): void {
    this.highlightedNodes = nodes
    this.highlightedEdges = edges
    this.highlightVersion++
  }
}
