import {
  type Collection,
  createPacedMutations,
  type MutationFn,
  type Strategy,
  throttleStrategy,
} from '@tanstack/db'
import type { GraphPositionEvent } from '../host/events'
import type { GraphInstance } from '../host/mount-graph'
import type { FieldOf, Key, Point } from '../types'

export interface PersistPositionsOptions<T extends object, TKey extends string | number> {
  readonly collection: Collection<T, TKey>
  readonly x?: FieldOf<T, number>
  readonly y?: FieldOf<T, number>
  readonly key?: (key: Key) => TKey
  readonly create?: (key: Key, point: Point) => T
  readonly mutationFn?: MutationFn<T>
  readonly strategy?: Strategy
}

const defaultWait = 100

function pace(
  wait: number,
  run: () => void,
): { readonly call: () => void; readonly flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  let next = 0
  let pending = false
  const fire = () => {
    timer = undefined
    pending = false
    next = Date.now() + wait
    run()
  }
  return {
    call() {
      pending = true
      if (timer !== undefined) return
      const delay = next - Date.now()
      if (delay <= 0) fire()
      else timer = setTimeout(fire, delay)
    },
    flush() {
      if (timer !== undefined) clearTimeout(timer)
      if (pending) fire()
    },
  }
}

export function persistPositions<T extends object, TKey extends string | number>(
  graph: GraphInstance,
  options: PersistPositionsOptions<T, TKey>,
): () => void {
  const { collection, mutationFn, create } = options
  const xField: string = options.x ?? 'x'
  const yField: string = options.y ?? 'y'
  const keyOf = options.key ?? ((key: Key) => key as TKey)

  const write = (positions: ReadonlyMap<Key, Point>) => {
    const keys: TKey[] = []
    const points: Point[] = []
    for (const [key, point] of positions) {
      const rowKey = keyOf(key)
      if (collection.has(rowKey)) {
        keys.push(rowKey)
        points.push(point)
      } else if (create) {
        collection.insert(create(key, point))
      }
    }
    if (keys.length === 0) return
    collection.update(keys, (drafts) => {
      drafts.forEach((draft, i) => {
        const point = points[i]
        if (!point) return
        const row = draft as Record<string, unknown>
        row[xField] = point.x
        row[yField] = point.y
      })
    })
  }

  if (mutationFn) {
    const mutate = createPacedMutations<ReadonlyMap<Key, Point>, T>({
      onMutate: write,
      mutationFn,
      strategy:
        options.strategy ?? throttleStrategy({ wait: defaultWait, leading: true, trailing: true }),
    })
    return graph.on('positionchange', (event: GraphPositionEvent) => {
      mutate(event.positions)
    })
  }

  let pending = new Map<Key, Point>()
  const paced = pace(options.strategy?.options?.wait ?? defaultWait, () => {
    const positions = pending
    pending = new Map()
    write(positions)
  })
  const stop = graph.on('positionchange', (event: GraphPositionEvent) => {
    for (const [key, point] of event.positions) pending.set(key, point)
    paced.call()
  })
  return () => {
    stop()
    paced.flush()
  }
}
