import type { Accessor, Key } from '../types'

export function toAccessor<T, V>(channel: string | Accessor<T, V>): Accessor<T, V> {
  if (typeof channel === 'function') return channel
  return (datum) =>
    (datum === null || datum === undefined
      ? undefined
      : (datum as Record<string, unknown>)[channel]) as V
}

export function isKey(value: unknown): value is Key {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}
