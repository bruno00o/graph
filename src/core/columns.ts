import type { Badge, BadgeCorner, EdgeArrow, EdgeDash, Key, NodeShape } from '../types'

export type NodeBadges = Readonly<Partial<Record<BadgeCorner, Badge>>>

export const shapeCodes: Readonly<Record<NodeShape, number>> = {
  circle: 0,
  square: 1,
  diamond: 2,
}

export const dashCodes: Readonly<Record<EdgeDash, number>> = { solid: 0, dashed: 1, dotted: 2 }

export const arrowCodes: Readonly<Record<EdgeArrow, number>> = {
  none: 0,
  source: 1,
  target: 2,
  both: 3,
}

type NumericArray = Float32Array | Uint8Array | Uint16Array | Uint32Array

function grow<A extends NumericArray>(array: A, length: number): A {
  const next = new (array.constructor as new (length: number) => A)(length)
  next.set(array)
  return next
}

function nextCapacity(capacity: number, index: number): number {
  return Math.max(64, capacity * 2, index + 1)
}

export class NodeColumns {
  capacity = 0
  keys: (Key | undefined)[] = []
  alive: Uint8Array = new Uint8Array(0)
  slot: Uint16Array = new Uint16Array(0)
  size: Float32Array = new Float32Array(0)
  shape: Uint8Array = new Uint8Array(0)
  fill: Uint32Array = new Uint32Array(0)
  stroke: Uint32Array = new Uint32Array(0)
  strokeWidth: Float32Array = new Float32Array(0)
  opacity: Float32Array = new Float32Array(0)
  screenUnits: Uint8Array = new Uint8Array(0)
  label: (string | null)[] = []
  secondary: (string | null)[] = []
  image: (string | null)[] = []
  badges: (NodeBadges | null)[] = []

  reserve(index: number): void {
    if (index < this.capacity) return
    const capacity = nextCapacity(this.capacity, index)
    this.alive = grow(this.alive, capacity)
    this.slot = grow(this.slot, capacity)
    this.size = grow(this.size, capacity)
    this.shape = grow(this.shape, capacity)
    this.fill = grow(this.fill, capacity)
    this.stroke = grow(this.stroke, capacity)
    this.strokeWidth = grow(this.strokeWidth, capacity)
    this.opacity = grow(this.opacity, capacity)
    this.screenUnits = grow(this.screenUnits, capacity)
    this.capacity = capacity
  }

  clear(index: number): void {
    if (index >= this.capacity) return
    this.alive[index] = 0
    this.keys[index] = undefined
    this.label[index] = null
    this.secondary[index] = null
    this.image[index] = null
    this.badges[index] = null
  }
}

export class EdgeColumns {
  capacity = 0
  keys: (Key | undefined)[] = []
  alive: Uint8Array = new Uint8Array(0)
  slot: Uint16Array = new Uint16Array(0)
  source: Uint32Array = new Uint32Array(0)
  target: Uint32Array = new Uint32Array(0)
  color: Uint32Array = new Uint32Array(0)
  width: Float32Array = new Float32Array(0)
  dash: Uint8Array = new Uint8Array(0)
  arrow: Uint8Array = new Uint8Array(0)
  opacity: Float32Array = new Float32Array(0)
  label: (string | null)[] = []

  reserve(index: number): void {
    if (index < this.capacity) return
    const capacity = nextCapacity(this.capacity, index)
    this.alive = grow(this.alive, capacity)
    this.slot = grow(this.slot, capacity)
    this.source = grow(this.source, capacity)
    this.target = grow(this.target, capacity)
    this.color = grow(this.color, capacity)
    this.width = grow(this.width, capacity)
    this.dash = grow(this.dash, capacity)
    this.arrow = grow(this.arrow, capacity)
    this.opacity = grow(this.opacity, capacity)
    this.capacity = capacity
  }

  clear(index: number): void {
    if (index >= this.capacity) return
    this.alive[index] = 0
    this.keys[index] = undefined
    this.label[index] = null
  }
}
