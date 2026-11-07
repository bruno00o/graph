import type { Key } from '../types'
import { KeyIndex } from './key-index'

export interface KeyedItems<V> {
  readonly size: number
  has(key: Key): boolean
  get(key: Key): V | undefined
  forEach(visit: (value: V, key: Key, position: number) => void): void
}

export class NativeKeyMap<V> implements KeyedItems<V> {
  readonly #map = new Map<Key, V>()

  get size(): number {
    return this.#map.size
  }

  has(key: Key): boolean {
    return this.#map.has(key)
  }

  get(key: Key): V | undefined {
    return this.#map.get(key)
  }

  set(key: Key, value: V): void {
    this.#map.set(key, value)
  }

  delete(key: Key): boolean {
    return this.#map.delete(key)
  }

  forEach(visit: (value: V, key: Key, position: number) => void): void {
    this.#map.forEach((value, key) => {
      visit(value, key, -1)
    })
  }
}

export class KeyMap<V> implements KeyedItems<V> {
  readonly #index = new KeyIndex()
  #keys: Key[] = []
  #values: V[] = []

  get size(): number {
    return this.#index.size
  }

  reserve(count: number): void {
    this.#index.reserve(count)
  }

  has(key: Key): boolean {
    return this.#index.get(key) >= 0
  }

  get(key: Key): V | undefined {
    const at = this.#index.get(key)
    return at < 0 ? undefined : this.#values[at]
  }

  set(key: Key, value: V): boolean {
    const at = this.#index.add(key, this.#keys.length)
    if (at >= 0) {
      this.#values[at] = value
      return false
    }
    this.#keys.push(key)
    this.#values.push(value)
    return true
  }

  clear(): void {
    this.#index.clear()
    this.#keys = []
    this.#values = []
  }

  forEach(visit: (value: V, key: Key, position: number) => void): void {
    const keys = this.#keys
    const values = this.#values
    for (let at = 0; at < keys.length; at++) visit(values[at] as V, keys[at] as Key, at)
  }

  copyIndex(target: KeyIndex): void {
    target.copy(this.#index)
  }
}
