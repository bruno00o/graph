import type {
  BadgeCorner,
  ContainerShape,
  EdgeArrow,
  EdgeDash,
  Key,
  LabelPlacement,
  NodeShape,
} from '../types'

export interface NodeBadge {
  readonly corner: number
  readonly text: string | null
  readonly fill: number
  readonly color: number
  readonly ring: number
}

export const noColor = 0xffffffff

export const containerShape = 3

export const containerCodes: Readonly<Record<ContainerShape, number>> = {
  rectangle: 1,
  circle: 2,
}

export const cornerCodes: Readonly<Record<BadgeCorner, number>> = {
  topLeft: 0,
  topRight: 1,
  bottomLeft: 2,
  bottomRight: 3,
}

export const shapeCodes: Readonly<Record<NodeShape, number>> = {
  circle: 0,
  square: 1,
  diamond: 2,
}

export const placementCodes: Readonly<Record<LabelPlacement, number>> = {
  bottom: 0,
  top: 1,
  right: 2,
  left: 3,
  center: 4,
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

function growColor(array: Uint32Array, length: number): Uint32Array {
  const next = new Uint32Array(length).fill(noColor)
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
  outline: Uint32Array = new Uint32Array(0)
  outlineWidth: Float32Array = new Float32Array(0)
  opacity: Float32Array = new Float32Array(0)
  screenUnits: Uint8Array = new Uint8Array(0)
  label: (string | null)[] = []
  secondary: (string | null)[] = []
  labelBackground: Uint32Array = new Uint32Array(0)
  labelColor: Uint32Array = new Uint32Array(0)
  labelSize: Float32Array = new Float32Array(0)
  labelWeight: Uint16Array = new Uint16Array(0)
  labelFont: (string | null)[] = []
  labelPlacement: Uint8Array = new Uint8Array(0)
  labelMaxWidth: Float32Array = new Float32Array(0)
  labelMinScreenSize: Float32Array = new Float32Array(0)
  image: (string | null)[] = []
  imageScale: Float32Array = new Float32Array(0)
  imageColor: Uint32Array = new Uint32Array(0)
  badges: (readonly NodeBadge[] | null)[] = []
  container: Uint8Array = new Uint8Array(0)
  padding: Float32Array = new Float32Array(0)

  reserve(index: number): void {
    if (index < this.capacity) return
    const capacity = nextCapacity(this.capacity, index)
    this.container = grow(this.container, capacity)
    this.padding = grow(this.padding, capacity)
    this.alive = grow(this.alive, capacity)
    this.slot = grow(this.slot, capacity)
    this.size = grow(this.size, capacity)
    this.shape = grow(this.shape, capacity)
    this.fill = grow(this.fill, capacity)
    this.stroke = grow(this.stroke, capacity)
    this.strokeWidth = grow(this.strokeWidth, capacity)
    this.outline = grow(this.outline, capacity)
    this.outlineWidth = grow(this.outlineWidth, capacity)
    this.opacity = grow(this.opacity, capacity)
    this.screenUnits = grow(this.screenUnits, capacity)
    this.labelBackground = growColor(this.labelBackground, capacity)
    this.labelColor = growColor(this.labelColor, capacity)
    this.labelSize = grow(this.labelSize, capacity)
    this.labelWeight = grow(this.labelWeight, capacity)
    this.labelPlacement = grow(this.labelPlacement, capacity)
    this.labelMaxWidth = grow(this.labelMaxWidth, capacity)
    this.labelMinScreenSize = grow(this.labelMinScreenSize, capacity)
    this.imageScale = grow(this.imageScale, capacity)
    this.imageColor = growColor(this.imageColor, capacity)
    this.capacity = capacity
  }

  clear(index: number): void {
    if (index >= this.capacity) return
    this.alive[index] = 0
    this.container[index] = 0
    this.keys[index] = undefined
    this.label[index] = null
    this.secondary[index] = null
    this.labelFont[index] = null
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
  bend: Float32Array = new Float32Array(0)
  flow: Float32Array = new Float32Array(0)
  flowCount = 0
  bundle: Uint8Array = new Uint8Array(0)
  label: (string | null)[] = []
  labelBackground: Uint32Array = new Uint32Array(0)
  labelColor: Uint32Array = new Uint32Array(0)
  labelSize: Float32Array = new Float32Array(0)
  labelWeight: Uint16Array = new Uint16Array(0)
  labelFont: (string | null)[] = []
  labelMaxWidth: Float32Array = new Float32Array(0)

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
    this.bend = grow(this.bend, capacity)
    this.flow = grow(this.flow, capacity)
    this.bundle = grow(this.bundle, capacity)
    this.labelBackground = growColor(this.labelBackground, capacity)
    this.labelColor = growColor(this.labelColor, capacity)
    this.labelSize = grow(this.labelSize, capacity)
    this.labelWeight = grow(this.labelWeight, capacity)
    this.labelMaxWidth = grow(this.labelMaxWidth, capacity)
    this.capacity = capacity
  }

  clear(index: number): void {
    if (index >= this.capacity) return
    this.alive[index] = 0
    this.bend[index] = 0
    this.bundle[index] = 0
    this.setFlow(index, 0)
    this.keys[index] = undefined
    this.label[index] = null
    this.labelFont[index] = null
  }

  setFlow(index: number, speed: number): void {
    const before = this.flow[index] ?? 0
    if (before === speed) return
    if (before === 0) this.flowCount++
    else if (speed === 0) this.flowCount--
    this.flow[index] = speed
  }
}
