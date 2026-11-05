export const maxStates = 32
export const noPaint = 0xffffffff

export interface ResolvedStateStyle {
  readonly opacity?: number
  readonly strokeWidth?: number
  readonly halo?: boolean
  readonly label?: boolean
  readonly fill?: number
  readonly stroke?: number
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

function grow(array: Uint32Array, capacity: number): Uint32Array {
  if (capacity <= array.length) return array
  const next = new Uint32Array(Math.max(capacity, array.length * 2))
  next.set(array)
  return next
}

export class StateBuffers {
  readonly numbers: Float32Array = new Float32Array(maxStates * 4).fill(-1)
  readonly paint: Uint32Array = new Uint32Array(maxStates * 4).fill(noPaint)
  readonly labelFlags: Int8Array = new Int8Array(maxStates).fill(-1)
  readonly nodeDirty: DirtyRange = new DirtyRange()
  readonly edgeDirty: DirtyRange = new DirtyRange()
  nodeMask: Uint32Array = new Uint32Array(0)
  edgeMask: Uint32Array = new Uint32Array(0)
  highlightedNodes: readonly number[] = []
  highlightedEdges: readonly number[] = []
  tableVersion = 0
  highlightVersion = 0

  reserve(nodeCapacity: number, edgeCapacity: number): void {
    this.nodeMask = grow(this.nodeMask, nodeCapacity)
    this.edgeMask = grow(this.edgeMask, edgeCapacity)
  }

  setNode(index: number, mask: number): void {
    this.nodeMask = grow(this.nodeMask, index + 1)
    if (this.nodeMask[index] === mask >>> 0) return
    this.nodeMask[index] = mask >>> 0
    this.nodeDirty.add(index)
  }

  setEdge(index: number, mask: number): void {
    this.edgeMask = grow(this.edgeMask, index + 1)
    if (this.edgeMask[index] === mask >>> 0) return
    this.edgeMask[index] = mask >>> 0
    this.edgeDirty.add(index)
  }

  setStyle(bit: number, style: ResolvedStateStyle | null): void {
    const at = bit * 4
    this.numbers[at] = style?.opacity ?? -1
    this.numbers[at + 1] = style?.strokeWidth ?? -1
    this.numbers[at + 2] = style?.halo === undefined ? -1 : style.halo ? 1 : 0
    this.numbers[at + 3] = style?.label === undefined ? -1 : style.label ? 1 : 0
    this.paint[at] = style?.fill ?? noPaint
    this.paint[at + 1] = style?.stroke ?? noPaint
    this.labelFlags[bit] = this.numbers[at + 3] ?? -1
    this.tableVersion++
  }

  setHighlighted(nodes: readonly number[], edges: readonly number[]): void {
    this.highlightedNodes = nodes
    this.highlightedEdges = edges
    this.highlightVersion++
  }
}
