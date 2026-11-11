import type { Collection, SubscribeChangesOptions, WithVirtualProps } from '@tanstack/db'
import type { LiveSource, SourceSubscription } from '../types'

/** The `where` option of `subscribeChanges`: a callback that builds an expression on a row. */
export type SubsetWhere<T extends object, TKey extends string | number> = NonNullable<
  SubscribeChangesOptions<T, TKey>['where']
>

type Subscribed = ReturnType<Collection<object, string | number>['subscribeChanges']>

function watched(subscription: Subscribed): SourceSubscription {
  const listeners = new Set<() => void>()
  let failed = false
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  const stops = [
    subscription.on('loadSubset:error', () => {
      failed = true
      notify()
    }),
    subscription.on('status:change', ({ status }) => {
      if (status === 'loadingSubset') failed = false
      notify()
    }),
  ]
  return {
    unsubscribe: () => {
      for (const stop of stops) stop()
      listeners.clear()
      subscription.unsubscribe()
    },
    get status() {
      return failed ? 'error' : subscription.status
    },
    on: (_event, listener) => {
      const own = () => listener()
      listeners.add(own)
      return () => {
        listeners.delete(own)
      }
    },
  }
}

/**
 * A live source of the rows of a collection that match `where`, with no collection created. The
 * graph only receives the rows that enter, change or leave the subset. It is loading while the
 * collection loads, and while an on-demand collection loads the rows of `where`; it has failed
 * when the collection or that load fails.
 */
export function subset<T extends object, TKey extends string | number>(
  collection: Collection<T, TKey>,
  where: SubsetWhere<T, TKey>,
): LiveSource<WithVirtualProps<T, TKey>> {
  return {
    subscribeChanges: (callback, options) => {
      const subscription = collection.subscribeChanges(callback, { where })
      const source = watched(subscription)
      if (options?.includeInitialState) subscription.requestSnapshot()
      return source
    },
    get status() {
      return collection.status
    },
    on: (event, listener) => collection.on(event, listener),
  }
}
