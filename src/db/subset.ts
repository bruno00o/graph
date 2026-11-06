import type { Collection, SubscribeChangesOptions, WithVirtualProps } from '@tanstack/db'
import type { LiveSource } from '../types'

/** The `where` option of `subscribeChanges`: a callback that builds an expression on a row. */
export type SubsetWhere<T extends object, TKey extends string | number> = NonNullable<
  SubscribeChangesOptions<T, TKey>['where']
>

/**
 * A live source of the rows of a collection that match `where`, with no collection created. The
 * graph only receives the rows that enter, change or leave the subset.
 */
export function subset<T extends object, TKey extends string | number>(
  collection: Collection<T, TKey>,
  where: SubsetWhere<T, TKey>,
): LiveSource<WithVirtualProps<T, TKey>> {
  return {
    subscribeChanges: (callback, options) =>
      collection.subscribeChanges(callback, { ...options, where }),
  }
}
