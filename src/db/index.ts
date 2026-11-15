import {
  type Collection,
  createPacedMutations,
  type MutationFn,
  type Strategy,
  throttleStrategy,
} from '@tanstack/db'
import { degreesOf } from '../core/geo'
import type { GraphPositionEvent } from '../host/events'
import type { GraphInstance } from '../host/mount-graph'
import type { FieldOf, FreeState, GeoPoint, Key, Point } from '../types'
import { defaultWait, pace, pendingMarks, type Settling } from './pending'

export {
  type PersistShapeFields,
  type PersistShapesOptions,
  persistShapes,
} from './persist-shapes'
export {
  type Presence,
  type PresenceFields,
  type PresenceParticipant,
  type PresenceSelection,
  type PresenceValues,
  type ShowPresenceOptions,
  showPresence,
} from './presence'
export { type SubsetWhere, subset } from './subset'

/** Options of `persistPositions`. `S` is the union of the free state names of the graph. */
export interface PersistPositionsOptions<
  T extends object,
  TKey extends string | number,
  S extends string = string,
> {
  /** Collection to write to. */
  readonly collection: Collection<T, TKey>
  /**
   * Field of the horizontal position, in world units. Defaults to `'x'`, unless `longitude` and
   * `latitude` are set: then it is written only when you name it.
   */
  readonly x?: FieldOf<T, number> | undefined
  /**
   * Field of the vertical position, in world units. Defaults to `'y'`, unless `longitude` and
   * `latitude` are set: then it is written only when you name it.
   */
  readonly y?: FieldOf<T, number> | undefined
  /**
   * Field of the longitude, in degrees from -180 up to 180, for nodes placed by `longitude` and
   * `latitude`, on a map or not. Needs `latitude`, and throws without it.
   */
  readonly longitude?: FieldOf<T, number> | undefined
  /**
   * Field of the latitude, in degrees. Needs `longitude`, and throws without it.
   */
  readonly latitude?: FieldOf<T, number> | undefined
  /** Maps a node key to a row key. Defaults to the node key itself. */
  readonly key?: ((key: Key) => TKey) | undefined
  /**
   * Builds the row of a node that has none, from its position in world units and in degrees.
   * Without it, such nodes are skipped.
   */
  readonly create?: ((key: Key, point: Point, geo: GeoPoint) => T) | undefined
  /**
   * Persists through `createPacedMutations`, with an optimistic write that a failure rolls back.
   * Without it, the collection persists the updates through its own handlers.
   */
  readonly mutationFn?: MutationFn<T> | undefined
  /**
   * Pacing of the writes. Without `mutationFn`, only its `wait` is read.
   * @default throttleStrategy({ wait: 100, leading: true, trailing: true })
   */
  readonly strategy?: Strategy | undefined
  /**
   * Free state of the definition that holds the nodes whose write is pending, from the move until
   * the write is done or has failed. Without it, no state is set.
   */
  readonly pendingState?: S | undefined
}

/**
 * Writes the positions of moved nodes to a TanStack DB collection, in world units or as degrees:
 * drags, `positions.set`, `positions.reset` and layout results. Returns a function that stops listening and writes the last pending move at once.
 * Throws when `pendingState` is not a free state of the graph.
 */
export function persistPositions<
  T extends object,
  TKey extends string | number,
  S extends string = string,
>(graph: GraphInstance<S>, options: PersistPositionsOptions<T, TKey, FreeState<S>>): () => void {
  const { collection, mutationFn, create } = options
  const degrees = options.longitude !== undefined || options.latitude !== undefined
  if (degrees && (options.longitude === undefined || options.latitude === undefined)) {
    throw new TypeError('graph: persistPositions needs both longitude and latitude')
  }
  const world = !degrees || options.x !== undefined || options.y !== undefined
  const xField: string = options.x ?? 'x'
  const yField: string = options.y ?? 'y'
  const longitudeField: string | undefined = options.longitude
  const latitudeField: string | undefined = options.latitude
  const keyOf = options.key ?? ((key: Key) => key as TKey)
  const marks = pendingMarks(graph, options.pendingState, 'nodes')

  const write = (positions: ReadonlyMap<Key, Point>): Settling[] => {
    const keys: TKey[] = []
    const points: Point[] = []
    const transactions: Settling[] = []
    for (const [key, point] of positions) {
      const rowKey = keyOf(key)
      if (collection.has(rowKey)) {
        keys.push(rowKey)
        points.push(point)
      } else if (create) {
        transactions.push(collection.insert(create(key, point, degreesOf(point))))
      }
    }
    if (keys.length === 0) return transactions
    const update = collection.update(keys, (drafts) => {
      drafts.forEach((draft, i) => {
        const point = points[i]
        if (!point) return
        const row = draft as Record<string, unknown>
        if (world) {
          row[xField] = point.x
          row[yField] = point.y
        }
        if (longitudeField !== undefined && latitudeField !== undefined) {
          const geo = degreesOf(point)
          row[longitudeField] = geo.longitude
          row[latitudeField] = geo.latitude
        }
      })
    })
    transactions.push(update)
    return transactions
  }

  if (mutationFn) {
    const mutate = createPacedMutations<ReadonlyMap<Key, Point>, T>({
      onMutate: (positions) => {
        write(positions)
      },
      mutationFn,
      strategy:
        options.strategy ?? throttleStrategy({ wait: defaultWait, leading: true, trailing: true }),
    })
    const tracked = new WeakSet<object>()
    return graph.on('positionchange', (event: GraphPositionEvent) => {
      const transaction = mutate(event.positions)
      if (!marks) return
      marks.hold(event.positions.keys(), transaction)
      if (tracked.has(transaction)) return
      tracked.add(transaction)
      marks.settle(transaction, [transaction])
    })
  }

  let pending = new Map<Key, Point>()
  const paced = pace(options.strategy?.options?.wait ?? defaultWait, () => {
    const positions = pending
    pending = new Map()
    let transactions: Settling[] = []
    try {
      transactions = write(positions)
    } finally {
      marks?.settle(positions, transactions)
    }
  })
  const stop = graph.on('positionchange', (event: GraphPositionEvent) => {
    for (const [key, point] of event.positions) pending.set(key, point)
    marks?.hold(event.positions.keys(), pending)
    paced.call()
  })
  return () => {
    stop()
    paced.flush()
  }
}
