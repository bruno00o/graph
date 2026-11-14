import {
  type Collection,
  createPacedMutations,
  type MutationFn,
  type Strategy,
  throttleStrategy,
} from '@tanstack/db'
import type { ShapeEditor } from '../editor/editor'
import type { ShapeAddEdit, ShapeEdit, ShapeMarkName } from '../editor/edits'
import { editorLink } from '../editor/link'
import type { FieldOf, Key, Mark, ShapeGeometry, WritableShapeGeometry } from '../types'
import { defaultWait, pace, pendingMarks, type Settling } from './pending'

/** Fields of a row that `persistShapes` writes. `T` is the type of the rows. */
export interface PersistShapeFields<T> {
  /**
   * Field of the outline.
   * @default 'geometry'
   */
  readonly geometry?: FieldOf<T, ShapeGeometry> | undefined
  /**
   * Field of the drawing order, written by the edits that change it.
   * @default 'order'
   */
  readonly order?: FieldOf<T, number> | undefined
  /**
   * Field of the text, written by the edits that change it.
   * @default 'text'
   */
  readonly text?: FieldOf<T, string> | undefined
}

/** Options of `persistShapes`. `M` is the union of the marks of the graph. */
export interface PersistShapesOptions<
  T extends object,
  TKey extends string | number,
  M extends Mark = Mark,
> {
  /** Collection to write to. */
  readonly collection: Collection<T, TKey>
  /** Fields of a row that hold what an edit changes. Defaults to the names of the edit fields. */
  readonly fields?: PersistShapeFields<T> | undefined
  /** Maps a shape key to a row key. Defaults to the shape key itself. */
  readonly key?: ((key: Key) => TKey) | undefined
  /**
   * Saves only the edits of the mark with this name. Defaults to every edit whose row is in the
   * collection, which suits a graph with one shape mark.
   */
  readonly mark?: ShapeMarkName<M> | undefined
  /**
   * Builds the row of a new shape, drawn or copied; a copy carries the copied item in `datum`.
   * Without it, an add whose `datum` with the new outline has the key of the shape, as the undo of a
   * removal has, inserts that row, and the other new shapes are left out.
   */
  readonly create?: ((edit: ShapeAddEdit<M, WritableShapeGeometry>) => T) | undefined
  /**
   * Persists through `createPacedMutations`, with an optimistic write that a failure rolls back.
   * Without it, the collection persists the writes through its own handlers.
   */
  readonly mutationFn?: MutationFn<T> | undefined
  /**
   * Pacing of the calls to `mutationFn`. Without `mutationFn`, it is not read.
   * @default throttleStrategy({ wait: 100, leading: true, trailing: true })
   */
  readonly strategy?: Strategy | undefined
  /**
   * Writes during a gesture too: `true` every 100 milliseconds, a number every that many
   * milliseconds. Defaults to `false`, one write when the gesture ends.
   */
  readonly live?: boolean | number | undefined
  /**
   * Free state of the definition that holds the shapes whose write is pending, from the write
   * until it is done or has failed. Without it, no state is set.
   */
  readonly pendingState?: string | undefined
}

const liveRest = 4

type Handed = ShapeEdit<Mark, WritableShapeGeometry>

const virtualProps = ['$hasPendingWrites', '$origin', '$key', '$collectionId'] as const

type Values = readonly (readonly [string, unknown])[]

interface Written {
  readonly transaction: Settling
  readonly edits: readonly Handed[]
}

interface Batch {
  readonly written: Written[]
  readonly edits: Handed[]
  readonly same: Handed[]
}

function liveWait(live: boolean | number | undefined): number | null {
  if (live === undefined || live === false) return null
  if (live === true) return defaultWait
  if (Number.isNaN(live) || live < 0) {
    throw new RangeError(`persistShapes: live must be 0 or more, got ${live}`)
  }
  return Number.isFinite(live) ? live : null
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let index = 0; index < a.length; index++) {
      if (!sameValue(a[index], b[index])) return false
    }
    return true
  }
  if (Array.isArray(b)) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  for (const key of keys) {
    if (!Object.hasOwn(right, key) || !sameValue(left[key], right[key])) return false
  }
  return true
}

/**
 * Writes the edits of a shape editor to a TanStack DB collection: the changed fields of each
 * changed shape, the removed rows and, with `create`, the new ones. Returns a function that stops
 * writing. Throws when `pendingState` is not a free state of the graph.
 */
export function persistShapes<T extends object, TKey extends string | number, M extends Mark>(
  editor: ShapeEditor<M>,
  options: PersistShapesOptions<T, TKey, M>,
): () => void {
  const link = editorLink(editor, 'persistShapes')
  const { collection, mutationFn, create } = options
  const wait = liveWait(options.live)
  const keyOf = options.key ?? ((key: Key) => key as TKey)
  const only = options.mark as string | undefined
  const marks = pendingMarks(link.graph, options.pendingState, 'shapes')
  const geometryField: string = options.fields?.geometry ?? 'geometry'
  const fields: readonly (readonly [string, string])[] = [
    ['geometry', geometryField],
    ['order', options.fields?.order ?? 'order'],
    ['text', options.fields?.text ?? 'text'],
  ]

  const valuesOf = (edit: Handed, row: Record<string, unknown>): Values => {
    const values: [string, unknown][] = []
    const given = edit as unknown as Record<string, unknown>
    for (const [name, field] of fields) {
      const value = given[name]
      if (value !== undefined && !sameValue(row[field], value)) values.push([field, value])
    }
    return values
  }

  const restored = (edit: ShapeAddEdit): T | null => {
    const datum = edit.datum
    if (typeof datum !== 'object' || datum === null) return null
    const row: Record<string, unknown> = { ...datum, [geometryField]: edit.geometry }
    for (const name of virtualProps) delete row[name]
    const rowKey = collection.getKeyFromItem(row as T)
    return rowKey === keyOf(edit.key) && collection.get(rowKey) === undefined ? (row as T) : null
  }

  const apply = (edits: readonly Handed[]): Batch => {
    const batch: Batch = { written: [], edits: [], same: [] }
    const keys: TKey[] = []
    const rows: Values[] = []
    const changed: Handed[] = []
    const removed: TKey[] = []
    const gone: Handed[] = []
    for (const edit of edits) {
      if (only !== undefined && edit.mark !== only) continue
      if (edit.type === 'add') {
        const row = create ? create(edit as ShapeAddEdit<M, WritableShapeGeometry>) : restored(edit)
        if (row === null) continue
        batch.written.push({ transaction: collection.insert(row), edits: [edit] })
        batch.edits.push(edit)
        continue
      }
      const rowKey = keyOf(edit.key)
      const row = collection.get(rowKey)
      if (row === undefined) continue
      if (edit.type === 'remove') {
        removed.push(rowKey)
        gone.push(edit)
        continue
      }
      const values = valuesOf(edit, row as Record<string, unknown>)
      if (values.length === 0) {
        batch.same.push(edit)
        continue
      }
      keys.push(rowKey)
      rows.push(values)
      changed.push(edit)
    }
    if (keys.length > 0) {
      const transaction = collection.update(keys, (drafts) => {
        drafts.forEach((draft, index) => {
          const row = draft as Record<string, unknown>
          for (const [field, value] of rows[index] ?? []) row[field] = value
        })
      })
      batch.written.push({ transaction, edits: changed })
      batch.edits.push(...changed)
    }
    if (removed.length > 0) {
      batch.written.push({ transaction: collection.delete(removed), edits: gone })
      batch.edits.push(...gone)
    }
    return batch
  }

  const carried = new Map<Settling, Handed[]>()
  const writers = new Map<Key, Settling>()
  const track = (transaction: Settling): Handed[] => {
    const known = carried.get(transaction)
    if (known) return known
    const list: Handed[] = []
    carried.set(transaction, list)
    const done = (failed: boolean) => {
      carried.delete(transaction)
      for (const [key, writer] of writers) if (writer === transaction) writers.delete(key)
      if (failed && list.length > 0) link.lose(list)
    }
    transaction.when('settled').then(
      () => done(false),
      () => done(true),
    )
    return list
  }
  const settle = (batch: Batch, release: boolean, written: readonly Written[]) => {
    if (batch.same.length > 0) {
      if (release) {
        for (const edit of batch.same) {
          const writer = writers.get(edit.key)
          if (writer) carried.get(writer)?.push(edit)
        }
      }
      link.answer(batch.same)
    }
    for (const { transaction, edits } of written) {
      const list = track(transaction)
      for (const edit of edits) writers.set(edit.key, transaction)
      if (release) list.push(...edits)
    }
  }

  let write: (edits: readonly Handed[], release: boolean) => void
  if (mutationFn) {
    let last: Batch | null = null
    const mutate = createPacedMutations<readonly Handed[], T>({
      onMutate: (edits) => {
        last = apply(edits)
      },
      mutationFn,
      strategy:
        options.strategy ?? throttleStrategy({ wait: defaultWait, leading: true, trailing: true }),
    })
    write = (edits, release) => {
      last = null
      let transaction: Settling
      try {
        transaction = mutate(edits)
      } catch (error) {
        if (release) link.lose(edits)
        throw error
      }
      const batch = last as Batch | null
      if (!batch) return
      const fresh = !carried.has(transaction)
      settle(batch, release, batch.edits.length > 0 ? [{ transaction, edits: batch.edits }] : [])
      if (batch.edits.length === 0) return
      marks?.hold(
        batch.edits.map((edit) => edit.key),
        transaction,
      )
      if (fresh) marks?.settle(transaction, [transaction])
    }
  } else {
    write = (edits, release) => {
      let batch: Batch
      try {
        batch = apply(edits)
      } catch (error) {
        if (release) link.lose(edits)
        throw error
      }
      settle(batch, release, batch.written)
      if (batch.edits.length === 0) return
      const token = {}
      marks?.hold(
        batch.edits.map((edit) => edit.key),
        token,
      )
      marks?.settle(
        token,
        batch.written.map((each) => each.transaction),
      )
    }
  }

  let wrote = false
  const paced =
    wait === null
      ? null
      : pace(
          wait,
          () => {
            const edits = link.current()
            if (edits.length === 0) return
            wrote = true
            write(edits, false)
          },
          liveRest,
        )
  const unwatch = link.watch({
    moved() {
      paced?.call()
    },
    cancelled(revert) {
      paced?.cancel()
      if (!wrote) return
      wrote = false
      write(revert(), false)
    },
  })
  const unlisten = editor.on('edit', ({ edits }) => {
    paced?.cancel()
    wrote = false
    write(edits, true)
  })
  return () => {
    unlisten()
    unwatch()
    paced?.cancel()
  }
}
