import type { Key, Layout, Point } from '../types'
import { instant } from './shared'

/**
 * Where `placed` puts nodes: entries of key and position, such as a `Map` or the result of
 * `positions.snapshot`, or a function of the item of each node that gives its position, or `null`
 * or `undefined` to leave it where it is.
 */
export type PlacedPositions<T = unknown> =
  | Iterable<readonly [Key, Point]>
  | ((datum: T) => Point | null | undefined)

function finite(point: Point | null | undefined): point is Point {
  return (
    point !== null && point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y)
  )
}

function meanOf<T>(
  items: readonly T[],
  read: (datum: T, at: number) => Point | null | undefined,
): Point | null {
  let x = 0
  let y = 0
  let count = 0
  items.forEach((datum, at) => {
    const point = read(datum, at)
    if (!finite(point)) return
    x += point.x
    y += point.y
    count++
  })
  return count === 0 ? null : { x: x / count, y: y / count }
}

/**
 * A layout that moves free nodes to positions you computed, in world units. A node without a
 * position, or with an `x` or `y` that is not finite, stays where it is. It ends at once, and
 * nodes glide to their place.
 */
export function placed<T = unknown>(positions: PlacedPositions<T>): Layout<T> {
  const entries =
    typeof positions === 'function'
      ? null
      : positions instanceof Map
        ? (positions as ReadonlyMap<Key, Point>)
        : new Map<Key, Point>(positions)
  const read = (datum: T, key: Key | undefined): Point | null | undefined => {
    if (entries) return key === undefined ? undefined : entries.get(key)
    return (positions as (datum: T) => Point | null | undefined)(datum)
  }
  return instant(
    'placed',
    { positions },
    (graph) => {
      const xy = Float32Array.from(graph.xy)
      const blocks = graph.blocks
      for (let index = 0; index < graph.capacity; index++) {
        if (graph.alive[index] !== 1 || graph.movable[index] !== 1) continue
        let point = read(graph.datum(index) as T, graph.keys[index])
        if (!finite(point) && blocks && (blocks.size[index] ?? 0) > 0) {
          const keys = blocks.keys(index)
          point = meanOf(blocks.items(index) as readonly T[], (datum, at) => read(datum, keys[at]))
        }
        if (!finite(point)) continue
        xy[index * 2] = point.x
        xy[index * 2 + 1] = point.y
      }
      return xy
    },
    false,
  )
}
