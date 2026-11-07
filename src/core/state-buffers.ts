export const maxStates = 32
export const othersRow: number = maxStates * 2
export const stateRows: number = maxStates * 4
export const noPaint = 0xffffffff
export const builtInRaise = 0b111
export const labelAlways = 2

export type StateKind = 'nodes' | 'edges'

const tableOffset: Readonly<Record<StateKind, number>> = { nodes: 0, edges: maxStates }

export interface ResolvedStateStyle {
  readonly opacity?: number | undefined
  readonly strokeWidth?: number | undefined
  readonly halo?: boolean | undefined
  readonly label?: boolean | 'always' | undefined
  readonly fill?: number | undefined
  readonly stroke?: number | undefined
  readonly outline?: number | undefined
  readonly outlineWidth?: number | undefined
  readonly labelColor?: number | undefined
  readonly flow?: number | undefined
  readonly raise?: boolean | undefined
  readonly hide?: boolean | undefined
}

export interface StateMasks {
  readonly nodeMask: Uint32Array
  readonly edgeMask: Uint32Array
}

export interface HideFilter {
  readonly masks: StateMasks
  readonly nodes: number
  readonly edges: number
  readonly otherNodes: number
  readonly otherEdges: number
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

function labelWord(label: boolean | 'always' | undefined): number {
  if (label === undefined) return -1
  return label === 'always' ? labelAlways : label ? 1 : 0
}

function setBit(bits: number, flag: number, on: boolean): number {
  return (on ? bits | flag : bits & ~flag) >>> 0
}

export function stateRow(kind: StateKind, bit: number, member: boolean): number {
  return (member ? 0 : othersRow) + tableOffset[kind] + bit
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
  readonly numbers: Float32Array = new Float32Array(stateRows * 4).fill(-1)
  readonly paint: Uint32Array = new Uint32Array(stateRows * 4).fill(noPaint)
  readonly labels: Uint32Array = new Uint32Array(stateRows * 4).fill(noPaint)
  readonly labelFlags: Int8Array = new Int8Array(maxStates * 2).fill(-1)
  readonly edgeLabelFlags: Int8Array = new Int8Array(maxStates * 2).fill(-1)
  readonly nodeDirty: DirtyRange = new DirtyRange()
  readonly edgeDirty: DirtyRange = new DirtyRange()
  nodeMask: Uint32Array = new Uint32Array(0)
  edgeMask: Uint32Array = new Uint32Array(0)
  highlightedNodes: readonly number[] = []
  highlightedEdges: readonly number[] = []
  alwaysNodes: readonly number[] = []
  alwaysEdges: readonly number[] = []
  tableVersion = 0
  highlightVersion = 0
  edgeMaskVersion = 0
  edgeFlowBits = 0
  nodeRaise: number = builtInRaise
  edgeRaise: number = builtInRaise
  nodeAlways = 0
  edgeAlways = 0
  nodeHide = 0
  edgeHide = 0
  hideVersion = 0
  active = 0
  #nodeOthers = 0
  #edgeOthers = 0
  #nodeOthersHide = 0
  #edgeOthersHide = 0
  #nodeOthersAlways = 0
  #edgeOthersAlways = 0
  #edgeOthersFlow = 0
  #members: Int32Array = new Int32Array(maxStates)
  #hiddenNodes = 0
  #hiddenEdges = 0
  #hide: HideFilter | null = null
  #hideAt = -1

  get hide(): HideFilter | null {
    if (this.#hideAt === this.hideVersion) return this.#hide
    this.#hideAt = this.hideVersion
    const otherNodes = this.othersHidden('nodes')
    const otherEdges = this.othersHidden('edges')
    this.#hide =
      this.#hiddenNodes + this.#hiddenEdges > 0 || (otherNodes | otherEdges) !== 0
        ? {
            masks: this,
            nodes: this.nodeHide,
            edges: this.edgeHide,
            otherNodes,
            otherEdges,
            serial: this.hideVersion,
          }
        : null
    return this.#hide
  }

  others(kind: StateKind): number {
    return ((kind === 'nodes' ? this.#nodeOthers : this.#edgeOthers) & this.active) >>> 0
  }

  othersHidden(kind: StateKind): number {
    return ((kind === 'nodes' ? this.#nodeOthersHide : this.#edgeOthersHide) & this.active) >>> 0
  }

  othersAlways(kind: StateKind): number {
    return (
      ((kind === 'nodes' ? this.#nodeOthersAlways : this.#edgeOthersAlways) & this.active) >>> 0
    )
  }

  othersFlow(): number {
    return (this.#edgeOthersFlow & this.active) >>> 0
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
    this.#count(before, mask)
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
    this.#count(before, mask)
  }

  #count(before: number, after: number): void {
    let changed = (before ^ after) >>> 0
    let toggled = 0
    while (changed !== 0) {
      const bit = 31 - Math.clz32(changed & -changed)
      changed &= changed - 1
      const joined = ((after >>> bit) & 1) === 1
      const count = (this.#members[bit] ?? 0) + (joined ? 1 : -1)
      this.#members[bit] = count
      if ((joined && count === 1) || (!joined && count === 0)) toggled |= 1 << bit
    }
    if (toggled === 0) return
    this.active = (this.active ^ toggled) >>> 0
    if ((toggled & (this.#nodeOthers | this.#edgeOthers)) !== 0) this.tableVersion++
    if ((toggled & (this.#nodeOthersHide | this.#edgeOthersHide)) !== 0) this.hideVersion++
  }

  #write(row: number, style: ResolvedStateStyle | null): void {
    const at = row * 4
    this.numbers[at] = style?.opacity ?? -1
    this.numbers[at + 1] = style?.strokeWidth ?? -1
    this.numbers[at + 2] = style?.halo === undefined ? -1 : style.halo ? 1 : 0
    this.numbers[at + 3] = labelWord(style?.label)
    this.paint[at] = style?.fill ?? noPaint
    this.paint[at + 1] = style?.stroke ?? noPaint
    this.paint[at + 2] = style?.outline ?? noPaint
    this.paint[at + 3] =
      style?.outlineWidth === undefined ? noPaint : floatWord(Math.max(0, style.outlineWidth))
    this.labels[at] = style?.labelColor ?? noPaint
    this.labels[at + 1] = style?.flow === undefined ? noPaint : floatWord(style.flow)
  }

  setStyle(
    kind: StateKind,
    bit: number,
    style: ResolvedStateStyle | null,
    others: ResolvedStateStyle | null = null,
  ): void {
    this.#write(stateRow(kind, bit, true), style)
    this.#write(stateRow(kind, bit, false), others)
    const flag = (1 << bit) >>> 0
    const always = style?.label === 'always'
    const othersAlways = others?.label === 'always'
    if (kind === 'edges') {
      this.edgeFlowBits = setBit(this.edgeFlowBits, flag, style?.flow !== undefined)
      this.#edgeOthersFlow = setBit(this.#edgeOthersFlow, flag, others?.flow !== undefined)
      this.edgeRaise = setBit(this.edgeRaise, flag, style?.raise === true)
      this.edgeAlways = setBit(this.edgeAlways, flag, always)
      this.#edgeOthers = setBit(this.#edgeOthers, flag, others !== null)
      this.#edgeOthersAlways = setBit(this.#edgeOthersAlways, flag, othersAlways)
      const othersHide = setBit(this.#edgeOthersHide, flag, others?.hide === true)
      if (othersHide !== this.#edgeOthersHide) {
        this.#edgeOthersHide = othersHide
        this.hideVersion++
      }
      const hide = setBit(this.edgeHide, flag, style?.hide === true)
      if (hide !== this.edgeHide) {
        this.edgeHide = hide
        this.#hiddenEdges = countHidden(this.edgeMask, hide)
        this.hideVersion++
      }
    } else {
      this.nodeRaise = setBit(this.nodeRaise, flag, style?.raise === true)
      this.nodeAlways = setBit(this.nodeAlways, flag, always)
      this.#nodeOthers = setBit(this.#nodeOthers, flag, others !== null)
      this.#nodeOthersAlways = setBit(this.#nodeOthersAlways, flag, othersAlways)
      const othersHide = setBit(this.#nodeOthersHide, flag, others?.hide === true)
      if (othersHide !== this.#nodeOthersHide) {
        this.#nodeOthersHide = othersHide
        this.hideVersion++
      }
      const hide = setBit(this.nodeHide, flag, style?.hide === true)
      if (hide !== this.nodeHide) {
        this.nodeHide = hide
        this.#hiddenNodes = countHidden(this.nodeMask, hide)
        this.hideVersion++
      }
    }
    const flags = kind === 'nodes' ? this.labelFlags : this.edgeLabelFlags
    flags[bit] = labelWord(style?.label)
    flags[maxStates + bit] = labelWord(others?.label)
    this.tableVersion++
  }

  copy(): StateBuffers {
    const copy = new StateBuffers()
    copy.numbers.set(this.numbers)
    copy.paint.set(this.paint)
    copy.labels.set(this.labels)
    copy.labelFlags.set(this.labelFlags)
    copy.edgeLabelFlags.set(this.edgeLabelFlags)
    copy.nodeMask = this.nodeMask.slice()
    copy.edgeMask = this.edgeMask.slice()
    copy.edgeFlowBits = this.edgeFlowBits
    copy.nodeRaise = this.nodeRaise
    copy.edgeRaise = this.edgeRaise
    copy.nodeAlways = this.nodeAlways
    copy.edgeAlways = this.edgeAlways
    copy.nodeHide = this.nodeHide
    copy.edgeHide = this.edgeHide
    copy.active = this.active
    copy.#nodeOthers = this.#nodeOthers
    copy.#edgeOthers = this.#edgeOthers
    copy.#nodeOthersHide = this.#nodeOthersHide
    copy.#edgeOthersHide = this.#edgeOthersHide
    copy.#nodeOthersAlways = this.#nodeOthersAlways
    copy.#edgeOthersAlways = this.#edgeOthersAlways
    copy.#edgeOthersFlow = this.#edgeOthersFlow
    copy.#members.set(this.#members)
    copy.#hiddenNodes = this.#hiddenNodes
    copy.#hiddenEdges = this.#hiddenEdges
    copy.hideVersion = this.hideVersion
    copy.setHighlighted([...this.highlightedNodes], [...this.highlightedEdges])
    copy.setAlways([...this.alwaysNodes], [...this.alwaysEdges])
    return copy
  }

  raised(kind: StateKind): number {
    return kind === 'nodes' ? this.nodeRaise : this.edgeRaise
  }

  always(kind: StateKind): number {
    return kind === 'nodes' ? this.nodeAlways : this.edgeAlways
  }

  setHighlighted(nodes: readonly number[], edges: readonly number[]): void {
    this.highlightedNodes = nodes
    this.highlightedEdges = edges
    this.highlightVersion++
  }

  setAlways(nodes: readonly number[], edges: readonly number[]): void {
    this.alwaysNodes = nodes
    this.alwaysEdges = edges
    this.highlightVersion++
  }
}
