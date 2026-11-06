import { containerShape, type NodeColumns } from '../core/columns'
import type { Hierarchy } from '../core/hierarchy'
import type { Positions } from '../core/positions'
import type { Bounds } from '../core/view'
import type { ContainerFrame } from './renderer'

const circle = 2

export class ContainerBoxes implements ContainerFrame {
  boxes: Float32Array = new Float32Array(0)
  order: Uint32Array = new Uint32Array(0)
  count = 0
  version = 0
  #structure = -1
  #positions = -1
  #scene = -1
  #zoom = 0
  #screenUnits = false

  sync(
    containers: ReadonlySet<number>,
    structure: number,
    hierarchy: Hierarchy,
    nodes: NodeColumns,
    positions: Positions,
    scene: number,
    zoom: number,
  ): boolean {
    const reordered = structure !== this.#structure
    if (
      !reordered &&
      scene === this.#scene &&
      positions.version === this.#positions &&
      (!this.#screenUnits || zoom === this.#zoom)
    ) {
      return false
    }
    this.#structure = structure
    this.#scene = scene
    this.#zoom = zoom
    if (reordered) this.#sort(containers, hierarchy)
    if (this.boxes.length < nodes.capacity * 4) {
      const boxes = new Float32Array(nodes.capacity * 4)
      boxes.set(this.boxes.subarray(0, Math.min(this.boxes.length, boxes.length)))
      this.boxes = boxes
    }
    if (this.count > 0 || reordered) this.#measure(hierarchy, nodes, positions, zoom)
    this.#positions = positions.version
    this.version++
    return true
  }

  pick(x: number, y: number, positions: Positions): number {
    for (let slot = this.count - 1; slot >= 0; slot--) {
      const index = this.order[slot] ?? 0
      const dx = Math.abs(x - positions.x(index))
      const dy = Math.abs(y - positions.y(index))
      const halfWidth = this.boxes[index * 4] ?? 0
      const halfHeight = this.boxes[index * 4 + 1] ?? 0
      const corner = this.boxes[index * 4 + 2] ?? 0
      const qx = Math.max(dx - halfWidth + corner, 0)
      const qy = Math.max(dy - halfHeight + corner, 0)
      if (dx <= halfWidth && dy <= halfHeight && Math.hypot(qx, qy) <= corner) return index
    }
    return -1
  }

  bounds(index: number, positions: Positions): Bounds {
    const x = positions.x(index)
    const y = positions.y(index)
    const halfWidth = this.boxes[index * 4] ?? 0
    const halfHeight = this.boxes[index * 4 + 1] ?? 0
    return { minX: x - halfWidth, minY: y - halfHeight, maxX: x + halfWidth, maxY: y + halfHeight }
  }

  #sort(containers: ReadonlySet<number>, hierarchy: Hierarchy): void {
    if (this.order.length < containers.size) this.order = new Uint32Array(containers.size * 2)
    const order = this.order
    let count = 0
    const stack: number[] = []
    for (const index of containers) {
      const parent = hierarchy.parent[index] ?? -1
      if (parent < 0 || !containers.has(parent)) stack.push(index)
    }
    while (stack.length > 0) {
      const index = stack.pop() ?? 0
      order[count++] = index
      for (
        let child = hierarchy.firstChild[index] ?? -1;
        child >= 0;
        child = hierarchy.nextSibling[child] ?? -1
      ) {
        if (containers.has(child)) stack.push(child)
      }
    }
    this.count = count
  }

  #measure(hierarchy: Hierarchy, nodes: NodeColumns, positions: Positions, zoom: number): void {
    const boxes = this.boxes
    let screenUnits = false
    const radius = (index: number): number => {
      const size = (nodes.size[index] ?? 0) / 2
      if (nodes.screenUnits[index] !== 1) return size
      screenUnits = true
      return size / zoom
    }
    for (let slot = this.count - 1; slot >= 0; slot--) {
      const index = this.order[slot] ?? 0
      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      for (
        let child = hierarchy.firstChild[index] ?? -1;
        child >= 0;
        child = hierarchy.nextSibling[child] ?? -1
      ) {
        if (nodes.alive[child] !== 1) continue
        const x = positions.x(child)
        const y = positions.y(child)
        const nested = nodes.shape[child] === containerShape
        const halfWidth = nested ? (boxes[child * 4] ?? 0) : radius(child)
        const halfHeight = nested ? (boxes[child * 4 + 1] ?? 0) : halfWidth
        minX = Math.min(minX, x - halfWidth)
        minY = Math.min(minY, y - halfHeight)
        maxX = Math.max(maxX, x + halfWidth)
        maxY = Math.max(maxY, y + halfHeight)
      }
      if (maxX < minX) {
        minX = maxX = positions.x(index)
        minY = maxY = positions.y(index)
      }
      const padding = nodes.padding[index] ?? 0
      const x = (minX + maxX) / 2
      const y = (minY + maxY) / 2
      let halfWidth = (maxX - minX) / 2 + padding
      let halfHeight = (maxY - minY) / 2 + padding
      let corner = Math.min(padding, halfWidth, halfHeight)
      if (nodes.container[index] === circle) {
        let reach = 0
        for (
          let child = hierarchy.firstChild[index] ?? -1;
          child >= 0;
          child = hierarchy.nextSibling[child] ?? -1
        ) {
          if (nodes.alive[child] !== 1) continue
          const nested = nodes.shape[child] === containerShape
          const extent = nested
            ? nodes.container[child] === circle
              ? (boxes[child * 4] ?? 0)
              : Math.hypot(boxes[child * 4] ?? 0, boxes[child * 4 + 1] ?? 0)
            : radius(child)
          reach = Math.max(
            reach,
            Math.hypot(positions.x(child) - x, positions.y(child) - y) + extent,
          )
        }
        halfWidth = halfHeight = corner = reach + padding
      }
      boxes[index * 4] = halfWidth
      boxes[index * 4 + 1] = halfHeight
      boxes[index * 4 + 2] = corner
      if (positions.x(index) !== Math.fround(x) || positions.y(index) !== Math.fround(y))
        positions.set(index, x, y)
    }
    this.#screenUnits = screenUnits
  }
}
