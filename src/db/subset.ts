import type { Collection, SubscribeChangesOptions, WithVirtualProps } from '@tanstack/db'
import type { LiveSource } from '../types'

export type SubsetWhere<T extends object, TKey extends string | number> = NonNullable<
  SubscribeChangesOptions<T, TKey>['where']
>

export function subset<T extends object, TKey extends string | number>(
  collection: Collection<T, TKey>,
  where: SubsetWhere<T, TKey>,
): LiveSource<WithVirtualProps<T, TKey>> {
  return {
    subscribeChanges: (callback, options) =>
      collection.subscribeChanges(callback, { ...options, where }),
  }
}
