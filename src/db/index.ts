import {
  type Collection,
  createPacedMutations,
  type MutationFn,
  type Strategy,
  throttleStrategy,
} from '@tanstack/db'
import type { GraphPositionEvent } from '../host/events'
import type { GraphInstance } from '../host/mount-graph'
import type { FieldOf, FreeState, Key, Point } from '../types'

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
   * Field of the horizontal position.
   * @default 'x'
   */
  readonly x?: FieldOf<T, number> | undefined
  /**
   * Field of the vertical position.
   * @default 'y'
   */
  readonly y?: FieldOf<T, number> | undefined
  /** Maps a node key to a row key. Defaults to the node key itself. */
  readonly key?: ((key: Key) => TKey) | undefined
  /** Builds the row of a node that has none. Without it, such nodes are skipped. */
  readonly create?: ((key: Key, point: Point) => T) | undefined
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

interface Settling {
  when(state: 'settled'): Promise<unknown>
}

interface PendingMarks {
  hold(keys: Iterable<Key>, write: object): void
  settle(write: object, transactions: readonly Settling[]): void
}

function pendingMarks(graph: GraphInstance, name: string | undefined): PendingMarks | null {
  if (name === undefined) return null
  const declared = () => Object.hasOwn(graph.store.state.states, name)
  if (!declared()) throw new Error(`graph: pendingState "${name}" is not a free state of the graph`)
  const owners = new Map<Key, object>()
  const release = (write: object) => {
    const done: Key[] = []
    for (const [key, owner] of owners) if (owner === write) done.push(key)
    for (const key of done) owners.delete(key)
    if (done.length > 0 && declared()) graph.states.remove(name, { nodes: done })
  }
  return {
    hold(keys, write) {
      const added: Key[] = []
      for (const key of keys) {
        if (!owners.has(key)) added.push(key)
        owners.set(key, write)
      }
      if (added.length > 0 && declared()) graph.states.add(name, { nodes: added })
    },
    settle(write, transactions) {
      if (transactions.length === 0) {
        release(write)
        return
      }
      void Promise.allSettled(transactions.map((transaction) => transaction.when('settled'))).then(
        () => release(write),
      )
    },
  }
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

/**
 * Writes the positions of moved nodes to a TanStack DB collection: drags, `positions.set` and
 * layout results. Returns a function that stops listening and writes the last pending move at once.
 * Throws when `pendingState` is not a free state of the graph.
 */
export function persistPositions<
  T extends object,
  TKey extends string | number,
  S extends string = string,
>(graph: GraphInstance<S>, options: PersistPositionsOptions<T, TKey, FreeState<S>>): () => void {
  const { collection, mutationFn, create } = options
  const xField: string = options.x ?? 'x'
  const yField: string = options.y ?? 'y'
  const keyOf = options.key ?? ((key: Key) => key as TKey)
  const marks = pendingMarks(graph, options.pendingState)

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
        transactions.push(collection.insert(create(key, point)))
      }
    }
    if (keys.length === 0) return transactions
    const update = collection.update(keys, (drafts) => {
      drafts.forEach((draft, i) => {
        const point = points[i]
        if (!point) return
        const row = draft as Record<string, unknown>
        row[xField] = point.x
        row[yField] = point.y
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
