import { groupGap, separateGroups } from '../core/group-separation'
import { type GroupTree, groupTree } from '../core/group-tree'
import type { Key, LayoutGraph } from '../types'

interface Box {
  readonly x: number
  readonly y: number
  readonly halfWidth: number
  readonly halfHeight: number
}

interface Scope {
  readonly leaves: number[]
  readonly blocks: number[]
  readonly edges: number[]
}

interface Unit {
  readonly kind: 'leaf' | 'block' | 'loose'
  readonly id: number
}

type Compute<T> = (graph: LayoutGraph<T>) => Float32Array

export function inBlocks<T>(graph: LayoutGraph<T>, compute: Compute<T>): Float32Array {
  const tree = groupTree(graph.capacity, graph.alive, graph.groups)
  if (!tree) return compute(graph)
  return new Blocks(graph, tree, compute).run()
}

class Blocks<T> {
  readonly #graph: LayoutGraph<T>
  readonly #tree: GroupTree
  readonly #compute: Compute<T>
  readonly #xy: Float32Array
  readonly #reach: Float64Array
  readonly #rigid: Uint8Array
  readonly #subtree: number[][]
  readonly #scopes: Scope[]
  readonly #top: Scope

  constructor(graph: LayoutGraph<T>, tree: GroupTree, compute: Compute<T>) {
    this.#graph = graph
    this.#tree = tree
    this.#compute = compute
    this.#xy = Float32Array.from(graph.xy)
    this.#reach = new Float64Array(tree.count)
    for (let slot = 0; slot < tree.count; slot++) {
      const parent = tree.parent[slot] ?? -1
      this.#reach[slot] = (tree.padding[slot] ?? 0) + (parent >= 0 ? (this.#reach[parent] ?? 0) : 0)
    }
    const scope = (): Scope => ({ leaves: [], blocks: [], edges: [] })
    this.#scopes = Array.from({ length: tree.count }, scope)
    this.#top = scope()
    this.#subtree = Array.from({ length: tree.count }, () => [])
    const stuck = new Uint8Array(tree.count)
    for (let index = 0; index < graph.capacity; index++) {
      if (graph.alive[index] !== 1) continue
      const slot = tree.groupOf[index] ?? -1
      this.#scopeOf(slot).leaves.push(index)
      for (let at = slot; at >= 0; at = tree.parent[at] ?? -1) {
        this.#subtree[at]?.push(index)
        if (graph.movable[index] !== 1) stuck[at] = 1
      }
    }
    this.#rigid = new Uint8Array(tree.count)
    for (let slot = 0; slot < tree.count; slot++) {
      if ((this.#subtree[slot]?.length ?? 0) === 0) continue
      this.#rigid[slot] = stuck[slot] === 1 ? 0 : 1
      this.#scopeOf(tree.parent[slot] ?? -1).blocks.push(slot)
    }
    this.#sortEdges()
  }

  run(): Float32Array {
    for (let slot = this.#tree.count - 1; slot >= 0; slot--) {
      this.#arrange(this.#scopes[slot] as Scope)
    }
    this.#arrange(this.#top)
    const graph = this.#graph
    const fixed = new Uint8Array(graph.capacity)
    for (let index = 0; index < graph.capacity; index++) {
      fixed[index] = graph.movable[index] === 1 ? 0 : 1
    }
    separateGroups(this.#tree, graph.alive, graph.radius, fixed, this.#xy, {
      spacing: 0,
      groupSpacing: groupGap,
      rounds: 64,
      nodes: 'moved',
    })
    for (let index = 0; index < graph.capacity; index++) {
      if (graph.alive[index] === 1) continue
      this.#xy[index * 2] = graph.xy[index * 2] ?? 0
      this.#xy[index * 2 + 1] = graph.xy[index * 2 + 1] ?? 0
    }
    return this.#xy
  }

  #scopeOf(slot: number): Scope {
    return slot < 0 ? this.#top : (this.#scopes[slot] as Scope)
  }

  #sortEdges(): void {
    const { edges, alive } = this.#graph
    const tree = this.#tree
    const depth = (slot: number) => (slot < 0 ? -1 : (tree.depth[slot] ?? 0))
    for (let at = 0; at + 1 < edges.length; at += 2) {
      const u = edges[at] ?? 0
      const v = edges[at + 1] ?? 0
      if (alive[u] !== 1 || alive[v] !== 1) continue
      let a = tree.groupOf[u] ?? -1
      let b = tree.groupOf[v] ?? -1
      let below = -1
      let above = -1
      while (depth(a) > depth(b)) {
        below = a
        a = tree.parent[a] ?? -1
      }
      while (depth(b) > depth(a)) {
        above = b
        b = tree.parent[b] ?? -1
      }
      while (a !== b) {
        below = a
        a = tree.parent[a] ?? -1
        above = b
        b = tree.parent[b] ?? -1
      }
      if (below >= 0 && below === above) continue
      this.#scopeOf(a).edges.push(below >= 0 ? -1 - below : u, above >= 0 ? -1 - above : v)
    }
  }

  #box(slot: number): Box {
    const graph = this.#graph
    const tree = this.#tree
    const xy = this.#xy
    const parent = tree.parent[slot] ?? -1
    const base = parent >= 0 ? (this.#reach[parent] ?? 0) : 0
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const index of this.#subtree[slot] ?? []) {
      const inside = tree.groupOf[index] ?? -1
      const reach = (graph.radius[index] ?? 0) + (this.#reach[inside] ?? 0) - base
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      minX = Math.min(minX, x - reach)
      minY = Math.min(minY, y - reach)
      maxX = Math.max(maxX, x + reach)
      maxY = Math.max(maxY, y + reach)
    }
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      halfWidth: (maxX - minX) / 2,
      halfHeight: (maxY - minY) / 2,
    }
  }

  #arrange(scope: Scope): void {
    const { leaves, blocks, edges } = scope
    const single = leaves.map((id): Unit => ({ kind: 'leaf', id }))
    if (blocks.length === 0) {
      if (leaves.length > 0) this.#place(single, edges)
      return
    }
    if (leaves.length > 1) this.#place(single, edges)
    const units = blocks.map((id): Unit => ({ kind: 'block', id }))
    if (leaves.length > 0) units.push({ kind: 'loose', id: -1 })
    this.#place(units, edges, leaves)
  }

  #place(units: readonly Unit[], edges: readonly number[], loose: readonly number[] = []): void {
    const graph = this.#graph
    const count = units.length
    const local = new Map<number, number>()
    const alive = new Uint8Array(count).fill(1)
    const movable = new Uint8Array(count)
    const xy = new Float32Array(count * 2)
    const radius = new Float32Array(count)
    const keys: (Key | undefined)[] = []
    const items: (T | undefined)[] = []
    const boxes: Box[] = []
    units.forEach((unit, at) => {
      let box: Box
      if (unit.kind === 'leaf') {
        local.set(unit.id, at)
        box = {
          x: this.#xy[unit.id * 2] ?? 0,
          y: this.#xy[unit.id * 2 + 1] ?? 0,
          halfWidth: graph.radius[unit.id] ?? 0,
          halfHeight: graph.radius[unit.id] ?? 0,
        }
        movable[at] = graph.movable[unit.id] ?? 0
        keys.push(graph.keys[unit.id])
        items.push(graph.datum(unit.id))
      } else if (unit.kind === 'block') {
        local.set(-1 - unit.id, at)
        box = this.#box(unit.id)
        movable[at] = this.#rigid[unit.id] ?? 0
        const node = this.#tree.node[unit.id] ?? -1
        keys.push(graph.keys[node])
        items.push(graph.datum(node))
      } else {
        for (const index of loose) local.set(index, at)
        box = this.#looseBox(loose)
        movable[at] = loose.every((index) => graph.movable[index] === 1) ? 1 : 0
        keys.push(undefined)
        items.push(undefined)
      }
      boxes.push(box)
      xy[at * 2] = box.x
      xy[at * 2 + 1] = box.y
      radius[at] = Math.sqrt(box.halfWidth * box.halfHeight)
    })
    if (loose.length > 0 || units.some((unit) => unit.kind === 'block')) {
      const sorted = Float32Array.from(radius).sort()
      radius.fill(sorted[Math.floor(sorted.length / 2)] ?? 0)
    }
    const pairs: number[] = []
    for (let at = 0; at + 1 < edges.length; at += 2) {
      const a = local.get(edges[at] ?? 0)
      const b = local.get(edges[at + 1] ?? 0)
      if (a !== undefined && b !== undefined && a !== b) pairs.push(a, b)
    }
    if (!movable.includes(1)) return
    const result = this.#compute({
      capacity: count,
      alive,
      movable,
      xy,
      radius,
      edges: Uint32Array.from(pairs),
      keys,
      datum: (index) => items[index],
    })
    units.forEach((unit, at) => {
      if (movable[at] !== 1) return
      const box = boxes[at] as Box
      const dx = (result[at * 2] ?? box.x) - box.x
      const dy = (result[at * 2 + 1] ?? box.y) - box.y
      const moved =
        unit.kind === 'leaf'
          ? [unit.id]
          : unit.kind === 'block'
            ? (this.#subtree[unit.id] ?? [])
            : loose
      for (const index of moved) {
        this.#xy[index * 2] = (this.#xy[index * 2] ?? 0) + dx
        this.#xy[index * 2 + 1] = (this.#xy[index * 2 + 1] ?? 0) + dy
      }
    })
  }

  #looseBox(loose: readonly number[]): Box {
    const graph = this.#graph
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const index of loose) {
      const r = (graph.radius[index] ?? 0) + groupGap / 2
      const x = this.#xy[index * 2] ?? 0
      const y = this.#xy[index * 2 + 1] ?? 0
      minX = Math.min(minX, x - r)
      minY = Math.min(minY, y - r)
      maxX = Math.max(maxX, x + r)
      maxY = Math.max(maxY, y + r)
    }
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      halfWidth: (maxX - minX) / 2,
      halfHeight: (maxY - minY) / 2,
    }
  }
}
