import type { Positions } from '../core/positions'
import type { Scene } from '../core/scene'
import { type StateBuffers, wordFloat } from '../core/state-buffers'
import type { View } from '../types'

export interface FlowWatchOptions {
  readonly scene: Scene
  readonly buffers: StateBuffers
  readonly positions: Positions
  readonly element: HTMLElement
  readonly version: () => number
  readonly wake: () => void
}

export interface FlowWatch {
  time(now: number): number
  moving(view: View, width: number, height: number): boolean
  destroy(): void
}

const timeWrap = 3600
const screenMargin = 64
const curveReach = 0.3
const edgeTable = 32
const noFlow = 0xffffffff

export function createFlowWatch(options: FlowWatchOptions): FlowWatch {
  const { scene, buffers, positions, element, version, wake } = options
  let origin = -1
  let onScreen = true
  let flowing: Int32Array = new Int32Array(0)
  let flowingCount = 0
  let listed = { scene: -1, masks: -1, table: -1 }
  let lastVisible = 0
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')

  const onVisibility = () => {
    if (document.visibilityState !== 'hidden') wake()
  }
  document.addEventListener('visibilitychange', onVisibility)
  motion?.addEventListener?.('change', wake)
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          const entry = entries[entries.length - 1]
          if (!entry) return
          onScreen = entry.isIntersecting
          if (onScreen) wake()
        })
      : null
  observer?.observe(element)

  function speedOf(index: number): number {
    let mask = (buffers.edgeMask[index] ?? 0) & buffers.edgeFlowBits
    for (let bit = 0; mask !== 0; bit++, mask >>>= 1) {
      if ((mask & 1) === 0) continue
      const word = buffers.labels[(edgeTable + bit) * 4 + 1] ?? noFlow
      if (word !== noFlow) return wordFloat(word)
    }
    return scene.edges.flow[index] ?? 0
  }

  function list(): void {
    const key = { scene: version(), masks: buffers.edgeMaskVersion, table: buffers.tableVersion }
    if (key.scene === listed.scene && key.masks === listed.masks && key.table === listed.table) {
      return
    }
    listed = key
    flowingCount = 0
    lastVisible = 0
    const edges = scene.edges
    if (edges.flowCount === 0 && buffers.edgeFlowBits === 0) return
    if (flowing.length < edges.capacity) flowing = new Int32Array(edges.capacity)
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1 || speedOf(index) === 0) continue
      flowing[flowingCount++] = index
    }
  }

  function seen(index: number, left: number, top: number, right: number, bottom: number): boolean {
    const { xy } = positions
    const edges = scene.edges
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
    const x1 = xy[source * 2] ?? 0
    const y1 = xy[source * 2 + 1] ?? 0
    const x2 = xy[target * 2] ?? 0
    const y2 = xy[target * 2 + 1] ?? 0
    const reach = (edges.bend[index] ?? 0) !== 0 ? Math.hypot(x2 - x1, y2 - y1) * curveReach : 0
    return (
      Math.max(x1, x2) + reach >= left &&
      Math.min(x1, x2) - reach <= right &&
      Math.max(y1, y2) + reach >= top &&
      Math.min(y1, y2) - reach <= bottom
    )
  }

  return {
    time(now) {
      if (motion?.matches) return 0
      if (origin < 0) origin = now
      return ((now - origin) / 1000) % timeWrap
    },

    moving(view, width, height) {
      if (motion?.matches || !onScreen || document.visibilityState === 'hidden') return false
      list()
      if (flowingCount === 0) return false
      const margin = screenMargin / view.zoom
      const centerX = view.x - positions.originX
      const centerY = view.y - positions.originY
      const left = centerX - width / 2 / view.zoom - margin
      const right = centerX + width / 2 / view.zoom + margin
      const top = centerY - height / 2 / view.zoom - margin
      const bottom = centerY + height / 2 / view.zoom + margin
      for (let step = 0; step < flowingCount; step++) {
        const at = (lastVisible + step) % flowingCount
        if (!seen(flowing[at] ?? 0, left, top, right, bottom)) continue
        lastVisible = at
        return true
      }
      return false
    },

    destroy() {
      document.removeEventListener('visibilitychange', onVisibility)
      motion?.removeEventListener?.('change', wake)
      observer?.disconnect()
    },
  }
}
