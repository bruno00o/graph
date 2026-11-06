import type { Key, Layout } from '../types'
import { centroid, indexOfKey, instant, movers, type NodeOrder, ordered, spacingOf } from './shared'

export interface RingsOptions<T = unknown> {
  readonly center?: Key
  readonly order?: NodeOrder<T>
  readonly spacing?: number
}

export function rings<T = unknown>(options: RingsOptions<T> = {}): Layout {
  return instant('rings', options, (graph) => {
    const xy = Float32Array.from(graph.xy)
    const indices = movers(graph)
    if (indices.length === 0) return xy
    const spacing = spacingOf(graph, indices, options.spacing)
    let sorted = ordered(graph, indices, options.order ?? 'degree')
    let [x, y] = centroid(graph, indices)
    const center = options.center === undefined ? -1 : indexOfKey(graph, options.center)
    if (center >= 0 && graph.movable[center] === 1) {
      sorted = [center, ...sorted.filter((index) => index !== center)]
    } else if (center >= 0) {
      x = graph.xy[center * 2] ?? 0
      y = graph.xy[center * 2 + 1] ?? 0
      sorted.unshift(-1)
    }
    let at = 0
    for (let ring = 0; at < sorted.length; ring++) {
      const room = ring === 0 ? 1 : Math.floor(2 * Math.PI * ring)
      const count = Math.min(room, sorted.length - at)
      for (let slot = 0; slot < count; slot++) {
        const index = sorted[at + slot] ?? -1
        if (index < 0) continue
        const angle = -Math.PI / 2 + (2 * Math.PI * slot) / count
        xy[index * 2] = x + Math.cos(angle) * ring * spacing
        xy[index * 2 + 1] = y + Math.sin(angle) * ring * spacing
      }
      at += count
    }
    return xy
  })
}
