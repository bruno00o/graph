import type { Key } from '../types'
import { IndexSet } from './index-set'
import type { GraphIssue } from './issues'

const none = -1

function grownIndices(array: Int32Array, length: number): Int32Array {
  const next = new Int32Array(length).fill(none)
  next.set(array)
  return next
}

function grownCounts<A extends Int32Array | Uint8Array>(array: A, length: number): A {
  const next = new (array.constructor as new (length: number) => A)(length)
  next.set(array)
  return next
}

export class Hierarchy {
  capacity = 0
  parent: Int32Array = new Int32Array(0)
  firstChild: Int32Array = new Int32Array(0)
  nextSibling: Int32Array = new Int32Array(0)
  previousSibling: Int32Array = new Int32Array(0)
  childCount: Int32Array = new Int32Array(0)
  hiddenBy: Int32Array = new Int32Array(0)
  folded: Uint8Array = new Uint8Array(0)
  present: Uint8Array = new Uint8Array(0)
  readonly keys: (Key | undefined)[] = []
  readonly parentKeys: (Key | null)[] = []
  links = 0
  readonly #indexOf: (key: Key) => number
  readonly #waiting = new Map<Key, Set<number>>()
  readonly #blocked = new Set<number>()
  readonly #stack: number[] = []
  #issueVersion = 0
  #foldedKeys: ReadonlySet<Key> = new Set()
  #moved: number[] = []
  #touched: IndexSet = new IndexSet()
  #reshaped = false

  constructor(indexOf: (key: Key) => number) {
    this.#indexOf = indexOf
  }

  get foldedKeys(): ReadonlySet<Key> {
    return this.#foldedKeys
  }

  get issueVersion(): number {
    return this.#issueVersion
  }

  collectIssues(into: GraphIssue[]): void {
    for (const [parent, children] of this.#waiting) {
      for (const index of children) {
        const key = this.keys[index]
        if (key !== undefined) into.push({ type: 'missing-parent', kind: 'nodes', key, parent })
      }
    }
    for (const index of this.#blocked) {
      const key = this.keys[index]
      const parent = this.parentKeys[index] ?? null
      if (key !== undefined && parent !== null) {
        into.push({ type: 'parent-cycle', kind: 'nodes', key, parent })
      }
    }
  }

  reserve(index: number): void {
    if (index < this.capacity) return
    const capacity = Math.max(64, this.capacity * 2, index + 1)
    this.parent = grownIndices(this.parent, capacity)
    this.firstChild = grownIndices(this.firstChild, capacity)
    this.nextSibling = grownIndices(this.nextSibling, capacity)
    this.previousSibling = grownIndices(this.previousSibling, capacity)
    this.hiddenBy = grownIndices(this.hiddenBy, capacity)
    this.childCount = grownCounts(this.childCount, capacity)
    this.folded = grownCounts(this.folded, capacity)
    this.present = grownCounts(this.present, capacity)
    this.capacity = capacity
  }

  visible(index: number): boolean {
    return this.present[index] === 1 && (this.hiddenBy[index] ?? none) < 0
  }

  isContainer(index: number): boolean {
    return this.visible(index) && this.folded[index] !== 1 && (this.childCount[index] ?? 0) > 0
  }

  representative(index: number): number {
    const hidden = this.hiddenBy[index] ?? none
    return hidden >= 0 ? hidden : index
  }

  forEachDescendant(index: number, visit: (descendant: number) => void): void {
    const stack: number[] = []
    for (
      let child = this.firstChild[index] ?? none;
      child >= 0;
      child = this.nextSibling[child] ?? none
    )
      stack.push(child)
    while (stack.length > 0) {
      const node = stack.pop() ?? none
      visit(node)
      for (
        let child = this.firstChild[node] ?? none;
        child >= 0;
        child = this.nextSibling[child] ?? none
      )
        stack.push(child)
    }
  }

  add(index: number, key: Key, parentKey: Key | null): void {
    this.reserve(index)
    this.present[index] = 1
    this.keys[index] = key
    this.parentKeys[index] = parentKey
    this.parent[index] = none
    this.firstChild[index] = none
    this.nextSibling[index] = none
    this.previousSibling[index] = none
    this.childCount[index] = 0
    this.hiddenBy[index] = none
    this.folded[index] = this.#foldedKeys.has(key) ? 1 : 0
    if (parentKey !== null) this.links++
    this.#touched.add(index)
    this.#attach(index)
    const waiting = this.#waiting.get(key)
    if (waiting) {
      this.#waiting.delete(key)
      this.#issueVersion++
      for (const child of waiting) this.#attach(child)
    }
    this.#refresh(index)
  }

  remove(index: number): void {
    if (this.present[index] !== 1) return
    this.#detach(index)
    const key = this.keys[index]
    const orphans: number[] = []
    for (let child = this.firstChild[index] ?? none; child >= 0; ) {
      const next = this.nextSibling[child] ?? none
      this.parent[child] = none
      this.nextSibling[child] = none
      this.previousSibling[child] = none
      orphans.push(child)
      child = next
    }
    this.firstChild[index] = none
    this.childCount[index] = 0
    if (this.parentKeys[index] !== null && this.parentKeys[index] !== undefined) this.links--
    this.present[index] = 0
    this.parentKeys[index] = null
    this.folded[index] = 0
    this.hiddenBy[index] = none
    this.#touched.add(index)
    for (const orphan of orphans) {
      if (key !== undefined) this.#wait(orphan, key)
      this.#refresh(orphan)
    }
  }

  setParent(index: number, parentKey: Key | null): void {
    const previous = this.parentKeys[index] ?? null
    if (previous === parentKey || this.present[index] !== 1) return
    this.#detach(index)
    this.links += (parentKey !== null ? 1 : 0) - (previous !== null ? 1 : 0)
    this.parentKeys[index] = parentKey
    this.#attach(index)
    this.#refresh(index)
  }

  setFolded(keys: Iterable<Key>): number[] {
    const next = new Set(keys)
    const previous = this.#foldedKeys
    const roots: number[] = []
    const flip = (key: Key, folded: number) => {
      const index = this.#indexOf(key)
      if (index < 0 || this.present[index] !== 1 || this.folded[index] === folded) return
      this.folded[index] = folded
      this.#touched.add(index)
      roots.push(index)
    }
    for (const key of previous) if (!next.has(key)) flip(key, 0)
    for (const key of next) if (!previous.has(key)) flip(key, 1)
    this.#foldedKeys = next
    for (const root of roots) this.#refresh(root)
    return roots
  }

  settle(): void {
    if (this.#reshaped && this.#blocked.size > 0) {
      const blocked = [...this.#blocked]
      this.#blocked.clear()
      this.#issueVersion++
      for (const index of blocked) {
        if (this.present[index] !== 1) continue
        if (this.#attach(index)) this.#refresh(index)
      }
    }
    this.#reshaped = false
  }

  takeMoved(): number[] {
    const moved = this.#moved
    this.#moved = []
    return moved
  }

  takeTouched(): IndexSet {
    const touched = this.#touched
    this.#touched = new IndexSet()
    return touched
  }

  #wait(index: number, parentKey: Key | null): void {
    if (parentKey === null) return
    let waiting = this.#waiting.get(parentKey)
    if (!waiting) {
      waiting = new Set()
      this.#waiting.set(parentKey, waiting)
    }
    waiting.add(index)
    this.#issueVersion++
  }

  #attach(index: number): boolean {
    const parentKey = this.parentKeys[index] ?? null
    if (parentKey === null) return true
    const parent = this.#indexOf(parentKey)
    if (parent < 0 || this.present[parent] !== 1) {
      this.#wait(index, parentKey)
      return false
    }
    for (let at = parent; at >= 0; at = this.parent[at] ?? none) {
      if (at !== index) continue
      this.#blocked.add(index)
      this.#issueVersion++
      return false
    }
    const first = this.firstChild[parent] ?? none
    this.parent[index] = parent
    this.previousSibling[index] = none
    this.nextSibling[index] = first
    if (first >= 0) this.previousSibling[first] = index
    this.firstChild[parent] = index
    this.childCount[parent] = (this.childCount[parent] ?? 0) + 1
    this.#touched.add(parent)
    this.#reshaped = true
    return true
  }

  #detach(index: number): void {
    const parent = this.parent[index] ?? none
    if (parent < 0) {
      const parentKey = this.parentKeys[index] ?? null
      if (parentKey !== null) {
        const waiting = this.#waiting.get(parentKey)
        if (waiting?.delete(index)) this.#issueVersion++
        if (waiting?.size === 0) this.#waiting.delete(parentKey)
      }
      if (this.#blocked.delete(index)) this.#issueVersion++
      return
    }
    const previous = this.previousSibling[index] ?? none
    const next = this.nextSibling[index] ?? none
    if (previous >= 0) this.nextSibling[previous] = next
    else this.firstChild[parent] = next
    if (next >= 0) this.previousSibling[next] = previous
    this.parent[index] = none
    this.nextSibling[index] = none
    this.previousSibling[index] = none
    this.childCount[parent] = (this.childCount[parent] ?? 1) - 1
    this.#touched.add(parent)
    this.#reshaped = true
  }

  #refresh(root: number): void {
    const stack = this.#stack
    stack.length = 0
    stack.push(root)
    while (stack.length > 0) {
      const node = stack.pop() ?? none
      const parent = this.parent[node] ?? none
      const above = parent < 0 ? none : (this.hiddenBy[parent] ?? none)
      const hidden =
        parent < 0 ? none : above >= 0 ? above : this.folded[parent] === 1 ? parent : none
      const changed = this.hiddenBy[node] !== hidden
      if (changed) {
        this.hiddenBy[node] = hidden
        this.#moved.push(node)
        this.#touched.add(node)
      }
      if (!changed && node !== root) continue
      for (
        let child = this.firstChild[node] ?? none;
        child >= 0;
        child = this.nextSibling[child] ?? none
      )
        stack.push(child)
    }
  }
}
