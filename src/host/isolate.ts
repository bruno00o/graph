import type { ReadonlyStore } from '@tanstack/store'

export function report(error: unknown): void {
  const scope = globalThis as { reportError?: (error: unknown) => void }
  if (typeof scope.reportError === 'function') {
    scope.reportError(error)
    return
  }
  setTimeout(() => {
    throw error
  })
}

export function isolated<E>(
  callback: ((event: E) => void) | undefined,
): ((event: E) => void) | undefined {
  if (!callback) return undefined
  return (event) => {
    try {
      callback(event)
    } catch (error) {
      report(error)
    }
  }
}

export function isolateSubscribers<T>(store: ReadonlyStore<T>): ReadonlyStore<T> {
  const subscribe = store.subscribe.bind(store)
  store.subscribe = (observer) => {
    const next = typeof observer === 'function' ? observer : observer.next?.bind(observer)
    return subscribe((value) => {
      try {
        next?.(value)
      } catch (error) {
        report(error)
      }
    })
  }
  return store
}
