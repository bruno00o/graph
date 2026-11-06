import type { Key } from '../types'
import { KeyIndex } from './key-index'

const compactFloor = 64

export interface KeyedItems<V> {
  readonly size: number
  readonly dense: boolean
  reserve(count: number): void
  has(key: Key): boolean
  get(key: Key): V | undefined
  set(key: Key, value: V): boolean
  delete(key: Key): boolean
  clear(): void
  forEach(visit: (value: V, key: Key, position: number) => void): void
}

export class NativeKeyMap<V> implements KeyedItems<V> {
  readonly #map = new Map<Key, V>()

  get size(): number {
    return this.#map.size
  }

  get dense(): boolean {
    return false
  }

  reserve(): void {}

  has(key: Key): boolean {
    return this.#map.has(key)
  }

  get(key: Key): V | undefined {
    return this.#map.get(key)
  }

  set(key: Key, value: V): boolean {
    const size = this.#map.size
    this.#map.set(key, value)
    return this.#map.size !== size
  }

  delete(key: Key): boolean {
    return this.#map.delete(key)
  }

  clear(): void {
    this.#map.clear()
  }

  forEach(visit: (value: V, key: Key, position: number) => void): void {
    this.#map.forEach((value, key) => {
      visit(value, key, -1)
    })
  }
}

export class KeyMap<V> implements KeyedItems<V> {
  readonly #index = new KeyIndex()
  #keys: (Key | undefined)[] = []
  #values: (V | undefined)[] = []
  #deleted = 0

  get size(): number {
    return this.#index.size
  }

  get dense(): boolean {
    return this.#deleted === 0
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

  delete(key: Key): boolean {
    const at = this.#index.delete(key)
    if (at < 0) return false
    this.#keys[at] = undefined
    this.#values[at] = undefined
    this.#deleted++
    if (this.#deleted > compactFloor && this.#deleted * 2 > this.#keys.length) this.#compact()
    return true
  }

  clear(): void {
    this.#index.clear()
    this.#keys = []
    this.#values = []
    this.#deleted = 0
  }

  forEach(visit: (value: V, key: Key, position: number) => void): void {
    const keys = this.#keys
    const values = this.#values
    for (let at = 0; at < keys.length; at++) {
      const key = keys[at]
      if (key !== undefined) visit(values[at] as V, key, at)
    }
  }

  copyIndex(target: KeyIndex): void {
    target.copy(this.#index)
  }

  #compact(): void {
    const keys = this.#keys
    const values = this.#values
    this.#index.clear()
    this.#keys = []
    this.#values = []
    this.#deleted = 0
    for (let at = 0; at < keys.length; at++) {
      const key = keys[at]
      if (key !== undefined) this.set(key, values[at] as V)
    }
  }
}
