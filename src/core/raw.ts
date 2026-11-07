import type { Accessor, RawAccessor } from '../types'

const raws = new WeakMap<object, Accessor<unknown, unknown>>()

/**
 * Marks a function of a `size`, `width` or `color` channel as raw: its value is used as is, a
 * diameter, a width in screen pixels or a CSS color, without the scale of the channel, and stays
 * out of the extent and the categories of that scale.
 */
export function raw<T, V>(read: Accessor<T, V>): RawAccessor<T, V> {
  if (typeof read !== 'function') throw new TypeError('raw() takes a function')
  const marked = ((datum: T) => read(datum)) as RawAccessor<T, V>
  raws.set(marked, read as Accessor<unknown, unknown>)
  return marked
}

export function rawRead(value: unknown): Accessor<unknown, unknown> | undefined {
  return typeof value === 'function' ? raws.get(value) : undefined
}
