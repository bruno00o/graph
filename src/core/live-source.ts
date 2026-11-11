import type { GraphData, LiveSource, SourceSubscription } from '../types'

export function isLiveSource<T>(data: GraphData<T>): data is LiveSource<T> {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as Partial<LiveSource<T>>).subscribeChanges === 'function'
  )
}

export type Readiness = 'ready' | 'loading' | 'error'

export function readinessOf(status: unknown): Readiness {
  switch (status) {
    case 'loading':
    case 'loadingSubset':
    case 'idle':
      return 'loading'
    case 'error':
    case 'crashed':
      return 'error'
    default:
      return 'ready'
  }
}

export function sourceReadiness(
  live: LiveSource<unknown>,
  subscription: SourceSubscription | null,
): Readiness {
  const own = readinessOf(live.status)
  const held = readinessOf(subscription?.status)
  if (own === 'error' || held === 'error') return 'error'
  return own === 'loading' || held === 'loading' ? 'loading' : 'ready'
}

export function watchReadiness(
  live: LiveSource<unknown>,
  subscription: SourceSubscription | null,
  listener: () => void,
): () => void {
  const stops: unknown[] = []
  if (typeof live.on === 'function') stops.push(live.on('status:change', listener))
  if (typeof subscription?.on === 'function') {
    stops.push(subscription.on('status:change', listener))
  }
  return () => {
    for (const stop of stops) if (typeof stop === 'function') stop()
  }
}
