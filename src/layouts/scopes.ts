import { groupGap, separateGroups } from '../core/group-separation'
import { type GroupTree, groupTree } from '../core/group-tree'
import {
  registerScopeEngine,
  type ScopeEngine,
  type ScopePlan,
  type ScopeRequest,
  sameLayout,
} from '../core/layout-scopes'
import type {
  Key,
  Layout,
  LayoutBlocks,
  LayoutGraph,
  LayoutGroups,
  LayoutListener,
  LayoutRun,
} from '../types'
import { ArrangedPlaces } from './arranged-places'
import { orientBlocks } from './orient'
import { type ScopeRunner, scopeRunOf } from './scope-runs'
import { Arranging } from './unfold-arranging'

const parallel = 4
const pumpBudget = 8
const goldenTurn = Math.PI * (3 - Math.sqrt(5))

export interface Scope {
  readonly slot: number
  readonly leaves: number[]
  readonly blocks: number[]
  readonly groups: number[]
  readonly edges: number[]
  own: Layout | null
  layout: Layout | null
  runs: boolean
  pending: number
}

export interface Structure {
  readonly graph: LayoutGraph
  readonly tree: GroupTree
  readonly scoped: Uint8Array
  readonly above: Int32Array
  readonly depth: Int32Array
  readonly home: Int32Array
  readonly members: number[][]
  readonly filled: Uint8Array
  readonly scopes: Scope[]
  readonly top: Scope
  readonly moves: Uint8Array
  readonly movable: Uint8Array
  readonly leafMovable: Uint8Array
}

function scopeOf(structure: Structure, slot: number): Scope {
  return slot < 0 ? structure.top : (structure.scopes[slot] as Scope)
}

function structureOf(request: ScopeRequest): Structure | null {
  const { graph, layouts } = request
  const tree = groupTree(graph.capacity, graph.alive, graph.groups)
  if (!tree) return null
  const count = tree.count
  const scoped = new Uint8Array(count)
  const owner = new Int32Array(count)
  const above = new Int32Array(count).fill(-1)
  const depth = new Int32Array(count)
  const own: (Layout | null)[] = []
  for (let slot = 0; slot < count; slot++) {
    const layout = layouts.get(tree.node[slot] ?? -1) ?? null
    own.push(layout)
    const parent = tree.parent[slot] ?? -1
    const up = parent >= 0 ? (owner[parent] ?? -1) : -1
    if (layout) {
      scoped[slot] = 1
      owner[slot] = slot
      above[slot] = up
      depth[slot] = up >= 0 ? (depth[up] ?? 0) + 1 : 0
    } else {
      owner[slot] = up
    }
  }
  const home = new Int32Array(graph.capacity).fill(-1)
  const members: number[][] = Array.from({ length: count }, () => [])
  const filled = new Uint8Array(count)
  const scope = (slot: number): Scope => ({
    slot,
    leaves: [],
    blocks: [],
    groups: [],
    edges: [],
    own: slot < 0 ? request.top : (own[slot] ?? null),
    layout: null,
    runs: false,
    pending: 0,
  })
  const scopes = Array.from({ length: count }, (_, slot) => scope(slot))
  const top = scope(-1)
  const structure: Structure = {
    graph,
    tree,
    scoped,
    above,
    depth,
    home,
    members,
    filled,
    scopes,
    top,
    moves: new Uint8Array(count),
    movable: new Uint8Array(graph.capacity),
    leafMovable: new Uint8Array(graph.capacity),
  }
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.alive[index] !== 1) continue
    const group = tree.groupOf[index] ?? -1
    const at = group >= 0 ? (owner[group] ?? -1) : -1
    home[index] = at
    scopeOf(structure, at).leaves.push(index)
    for (let slot = at; slot >= 0; slot = above[slot] ?? -1) members[slot]?.push(index)
    for (let slot = group; slot >= 0 && filled[slot] !== 1; slot = tree.parent[slot] ?? -1) {
      filled[slot] = 1
    }
  }
  for (let slot = 0; slot < count; slot++) {
    if (filled[slot] !== 1) continue
    const parent = tree.parent[slot] ?? -1
    const holder = parent >= 0 ? (owner[parent] ?? -1) : -1
    if (scoped[slot] === 1) scopeOf(structure, holder).blocks.push(slot)
    else scopeOf(structure, owner[slot] ?? -1).groups.push(slot)
  }
  sortEdges(structure)
  return structure
}

function sortEdges(structure: Structure): void {
  const { graph, home, above, depth } = structure
  const level = (slot: number) => (slot < 0 ? -1 : (depth[slot] ?? 0))
  const edges = graph.edges
  for (let at = 0; at + 1 < edges.length; at += 2) {
    const u = edges[at] ?? 0
    const v = edges[at + 1] ?? 0
    if (graph.alive[u] !== 1 || graph.alive[v] !== 1) continue
    let a = home[u] ?? -1
    let b = home[v] ?? -1
    let below = -1
    let over = -1
    while (level(a) > level(b)) {
      below = a
      a = above[a] ?? -1
    }
    while (level(b) > level(a)) {
      over = b
      b = above[b] ?? -1
    }
    while (a !== b) {
      below = a
      a = above[a] ?? -1
      over = b
      b = above[b] ?? -1
    }
    if (below >= 0 && below === over) continue
    scopeOf(structure, a).edges.push(below >= 0 ? -1 - below : u, over >= 0 ? -1 - over : v)
  }
}

function decide(structure: Structure, request: ScopeRequest): void {
  const { graph, tree, above, members, moves, movable, leafMovable } = structure
  const { keyed, rerun, arrivals } = request
  const free = graph.movable
  const rigid = new Uint8Array(tree.count)
  for (let slot = 0; slot < tree.count; slot++) {
    const inside = members[slot] ?? []
    rigid[slot] = inside.length > 0 && inside.every((index) => free[index] === 1) ? 1 : 0
  }
  const keyedLeaf = (index: number) => keyed === null || keyed[index] === 1
  const keyedBlock = (slot: number) => keyed === null || keyed[tree.node[slot] ?? -1] === 1
  const blockMovable = new Uint8Array(tree.count)
  const all = [...structure.scopes, structure.top]
  for (const scope of all) {
    if (scope.slot >= 0 && structure.scoped[scope.slot] !== 1) continue
    const whole =
      (scope.slot >= 0 && rerun?.has(tree.node[scope.slot] ?? -1) === true) ||
      (arrivals &&
        scope.own?.incremental === false &&
        (scope.leaves.some((index) => free[index] === 1 && keyedLeaf(index)) ||
          scope.blocks.some((slot) => rigid[slot] === 1 && keyedBlock(slot))))
    let any = false
    for (const index of scope.leaves) {
      if (free[index] === 1 && (whole || keyedLeaf(index))) {
        leafMovable[index] = 1
        any = true
      }
    }
    for (const slot of scope.blocks) {
      if (rigid[slot] === 1 && (whole || keyedBlock(slot))) {
        blockMovable[slot] = 1
        any = true
      }
    }
    scope.runs = any && scope.own !== null
  }
  for (const scope of structure.scopes) {
    for (const slot of scope.blocks) {
      if (blockMovable[slot] === 1 && scope.runs) moves[slot] = 1
    }
  }
  for (const slot of structure.top.blocks) {
    if (blockMovable[slot] === 1 && (structure.top.runs || request.top === null)) moves[slot] = 1
  }
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.alive[index] !== 1) continue
    const at = structure.home[index] ?? -1
    const home = scopeOf(structure, at)
    let moving = leafMovable[index] === 1 && (home.runs || (home.slot < 0 && request.top === null))
    for (let slot = at; !moving && slot >= 0; slot = above[slot] ?? -1) {
      if (moves[slot] === 1) moving = true
    }
    movable[index] = moving ? 1 : 0
  }
  for (const scope of all) {
    if (!scope.runs) continue
    let outermost = !structure.top.runs || scope.slot < 0
    for (let slot = above[scope.slot] ?? -1; outermost && slot >= 0; slot = above[slot] ?? -1) {
      if (scopeOf(structure, slot).runs) outermost = false
    }
    scope.layout = outermost && request.replace && scope.slot >= 0 ? request.replace : scope.own
  }
}

function nameOf(structure: Structure): string | null {
  if (structure.top.runs) return structure.top.layout?.name ?? null
  for (const scope of structure.scopes) {
    if (!scope.runs) continue
    let outermost = true
    for (let slot = structure.above[scope.slot] ?? -1; slot >= 0; ) {
      if (scopeOf(structure, slot).runs) outermost = false
      slot = structure.above[slot] ?? -1
    }
    if (outermost) return scope.layout?.name ?? null
  }
  return null
}

export function planScopes(request: ScopeRequest): ScopePlan | null {
  const structure = structureOf(request)
  if (!structure) return null
  decide(structure, request)
  const name = nameOf(structure)
  if (name === null || !structure.movable.includes(1)) return null
  return {
    name,
    movable: structure.movable,
    partial: partialOf(structure),
    start: (listener) =>
      new Composite(
        structure,
        request.fresh,
        listener,
        memoryOf(request.memory),
        request.arrivals,
      ).begin(),
  }
}

function partialOf(structure: Structure): boolean {
  const top = structure.top
  return (
    !top.runs &&
    !top.blocks.some((slot) => structure.moves[slot] === 1) &&
    !top.leaves.some((index) => structure.movable[index] === 1)
  )
}

interface Remembered {
  readonly layout: Layout
  readonly print: Print
  readonly relative: Float64Array
}

interface Print {
  readonly keys: readonly (Key | undefined)[]
  readonly data: readonly unknown[]
  readonly numbers: Float64Array
}

const memories = new WeakMap<object, Map<Key, Remembered>>()

function memoryOf(owner: object | undefined): Map<Key, Remembered> | null {
  if (!owner) return null
  let memory = memories.get(owner)
  if (!memory) {
    memory = new Map()
    memories.set(owner, memory)
  }
  return memory
}

function printOf(graph: LayoutGraph): Print {
  const numbers: number[] = [graph.capacity, graph.edges.length]
  const data: unknown[] = []
  for (let at = 0; at < graph.capacity; at++) {
    data.push(graph.datum(at))
    numbers.push(graph.alive[at] ?? 0, graph.radius[at] ?? 0)
    numbers.push(graph.extents?.[at * 2] ?? -1, graph.extents?.[at * 2 + 1] ?? -1)
    numbers.push(graph.blocks?.size[at] ?? -1)
  }
  for (const end of graph.edges) numbers.push(end)
  const groups = graph.groups
  if (groups) {
    for (const at of groups.order) numbers.push(at)
    for (const at of groups.parent) numbers.push(at)
    for (const padding of groups.padding) numbers.push(padding)
    for (const circle of groups.circle) numbers.push(circle)
    for (const space of groups.labelSpace ?? []) numbers.push(space)
  }
  numbers.push(graph.container?.circle ? 1 : 0)
  return { keys: graph.keys, data, numbers: Float64Array.from(numbers) }
}

function samePrint(a: Print, b: Print): boolean {
  const { numbers } = a
  if (numbers.length !== b.numbers.length || a.keys.length !== b.keys.length) return false
  for (let at = 0; at < numbers.length; at++) {
    if (!Object.is(numbers[at], b.numbers[at])) return false
  }
  for (let at = 0; at < a.keys.length; at++) {
    if (a.keys[at] !== b.keys[at] || a.data[at] !== b.data[at]) return false
  }
  return true
}

export const scopeEngine: ScopeEngine = {
  plan: planScopes,
  places: () => new ArrangedPlaces(),
  arrange: (source, homes, opened) => new Arranging(source, homes, opened),
}

export function enableScopes(): void {
  registerScopeEngine(scopeEngine)
}

interface Prepared {
  readonly before: readonly [number, number] | null
  readonly unit: Unit
  readonly graph: LayoutGraph
  readonly whole: boolean
  print: Print | null
}

interface Unit {
  readonly leaves: readonly number[]
  readonly blocks: readonly number[]
  readonly local: Map<number, number>
  readonly start: Float32Array
  readonly origin: Float32Array
  readonly movable: Uint8Array
}

class Composite implements LayoutRun {
  readonly #structure: Structure
  readonly #fresh: boolean
  readonly #listener: LayoutListener
  readonly #xy: Float32Array
  readonly #box: Float64Array
  readonly #queue: number[] = []
  readonly #held: number[] = []
  readonly #running = new Map<number, { run: LayoutRun | null; unit: Unit }>()
  readonly #pins = new Map<number, readonly [number, number]>()
  readonly #memory: Map<Key, Remembered> | null
  readonly #recalls: boolean
  readonly #ran = new Set<number>()
  #head = 0
  #heldHead = 0
  #starts = 0
  #pumping = false
  #later: ReturnType<typeof setTimeout> | undefined
  #stopped = false
  #base: Float32Array | null = null

  constructor(
    structure: Structure,
    fresh: boolean,
    listener: LayoutListener,
    memory: Map<Key, Remembered> | null,
    recalls: boolean,
  ) {
    this.#structure = structure
    this.#fresh = fresh
    this.#listener = listener
    this.#memory = memory
    this.#recalls = recalls
    this.#xy = Float32Array.from(structure.graph.xy)
    this.#box = new Float64Array(structure.tree.count * 4)
  }

  begin(): LayoutRun {
    const structure = this.#structure
    for (const scope of structure.scopes) {
      if (structure.scoped[scope.slot] !== 1) continue
      scope.pending = scope.blocks.length
    }
    structure.top.pending = structure.top.blocks.length
    for (const scope of structure.scopes) {
      const slot = scope.slot
      if (structure.scoped[slot] === 1 && structure.filled[slot] === 1 && scope.pending === 0) {
        this.#queue.push(slot)
      }
    }
    if (structure.top.pending === 0) this.#queue.push(-1)
    this.#pump()
    return this
  }

  pin(index: number, x: number, y: number): void {
    this.#pins.set(index, [x, y])
    const at = this.#structure.home[index] ?? -1
    const running = this.#running.get(at)
    const local = running?.unit.local.get(index)
    if (running?.run && local !== undefined) running.run.pin(local, x, y)
  }

  stop(): void {
    this.#stopped = true
    clearTimeout(this.#later)
    for (const { run } of this.#running.values()) run?.stop()
    this.#running.clear()
  }

  #pump(): void {
    if (this.#pumping || this.#later !== undefined) return
    this.#pumping = true
    const until = performance.now() + pumpBudget
    try {
      while (!this.#stopped) {
        if (this.#head < this.#queue.length && performance.now() >= until) {
          this.#later = setTimeout(() => {
            this.#later = undefined
            this.#pump()
          }, 0)
          break
        }
        if (this.#head < this.#queue.length) {
          this.#launch(this.#queue[this.#head++] ?? -1)
        } else if (this.#heldHead < this.#held.length && this.#starts < parallel) {
          const slot = this.#held[this.#heldHead++] ?? -1
          this.#begin(slot, this.#prepare(scopeOf(this.#structure, slot)), null)
        } else {
          break
        }
      }
    } finally {
      this.#pumping = false
    }
  }

  #launch(slot: number): void {
    const scope = scopeOf(this.#structure, slot)
    if (!scope.runs || !scope.layout) {
      this.#done(slot)
      return
    }
    const runner = scopeRunOf(scope.layout)
    const prepared = this.#prepare(scope)
    if (this.#recall(scope, prepared)) return
    if (runner && this.#begin(slot, prepared, runner)) return
    if (this.#starts < parallel) this.#begin(slot, prepared, null)
    else this.#held.push(slot)
  }

  #prepare(scope: Scope): Prepared {
    const before = scope.slot >= 0 ? this.#measure(scope.slot) : null
    const unit = this.#unit(scope)
    const graph = this.#local(scope, unit)
    const whole = this.#pins.size === 0 && unit.movable.every((flag) => flag === 1)
    return { before, unit, graph, whole, print: null }
  }

  #printed(prepared: Prepared): Print {
    prepared.print ??= printOf(prepared.graph)
    return prepared.print
  }

  #recall(scope: Scope, prepared: Prepared): boolean {
    const memory = this.#memory
    const key = prepared.graph.container?.key
    if (!memory || !this.#recalls || key === undefined || !prepared.whole) return false
    if (scope.blocks.some((slot) => this.#ran.has(slot))) return false
    const remembered = memory.get(key)
    if (!remembered || !sameLayout(remembered.layout, scope.layout)) return false
    if (!samePrint(remembered.print, this.#printed(prepared))) return false
    const { unit } = prepared
    const units = unit.leaves.length + unit.blocks.length
    let x = 0
    let y = 0
    for (let at = 0; at < units; at++) {
      x += unit.origin[at * 2] ?? 0
      y += unit.origin[at * 2 + 1] ?? 0
    }
    x /= Math.max(1, units)
    y /= Math.max(1, units)
    const result = new Float32Array(units * 2)
    for (let at = 0; at < units; at++) {
      result[at * 2] = (remembered.relative[at * 2] ?? 0) + x
      result[at * 2 + 1] = (remembered.relative[at * 2 + 1] ?? 0) + y
    }
    this.#apply(scope, unit, result, prepared.before)
    this.#done(scope.slot)
    return true
  }

  #remember(scope: Scope, prepared: Prepared, xy: Float32Array): void {
    const memory = this.#memory
    const key = prepared.graph.container?.key
    if (!memory || key === undefined || !scope.layout) return
    if (!prepared.whole || this.#pins.size > 0) {
      memory.delete(key)
      return
    }
    const { unit } = prepared
    const units = unit.leaves.length + unit.blocks.length
    let x = 0
    let y = 0
    for (let at = 0; at < units; at++) {
      x += xy[at * 2] ?? 0
      y += xy[at * 2 + 1] ?? 0
    }
    x /= Math.max(1, units)
    y /= Math.max(1, units)
    const relative = new Float64Array(units * 2)
    for (let at = 0; at < units; at++) {
      const dx = (xy[at * 2] ?? Number.NaN) - x
      const dy = (xy[at * 2 + 1] ?? Number.NaN) - y
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        memory.delete(key)
        return
      }
      relative[at * 2] = dx
      relative[at * 2 + 1] = dy
    }
    memory.set(key, { layout: scope.layout, print: this.#printed(prepared), relative })
  }

  #begin(slot: number, prepared: Prepared, runner: ScopeRunner | null): boolean {
    const scope = scopeOf(this.#structure, slot)
    const layout = scope.layout as Layout
    const { unit, graph, before } = prepared
    const entry: { run: LayoutRun | null; unit: Unit } = { run: null, unit }
    this.#running.set(slot, entry)
    if (!runner) this.#starts++
    let ended = false
    const close = () => {
      ended = true
      this.#running.delete(slot)
      if (!runner) this.#starts--
    }
    const listener: LayoutListener = {
      progress: (xy, progress) => {
        if (this.#stopped || ended || slot >= 0) return
        this.#listener.progress(this.#compose(this.#base ?? this.#xy, unit, xy, true), progress)
      },
      end: (xy) => {
        if (this.#stopped || ended) return
        close()
        if (slot >= 0) this.#remember(scope, prepared, xy)
        this.#apply(scope, unit, xy, before)
        this.#done(slot)
      },
    }
    if (slot < 0) this.#base = Float32Array.from(this.#xy)
    this.#ran.add(slot)
    try {
      const run = runner ? runner(graph, listener) : layout.start(graph, listener)
      if (!run) {
        this.#running.delete(slot)
        this.#ran.delete(slot)
        return false
      }
      if (ended || this.#stopped) {
        if (!ended) run.stop()
      } else {
        entry.run = run
      }
    } catch (error) {
      close()
      setTimeout(() => {
        throw error
      }, 0)
      this.#done(slot)
    }
    return true
  }

  #done(slot: number): void {
    if (this.#stopped) return
    const structure = this.#structure
    if (slot < 0) {
      this.#finish()
      return
    }
    this.#measure(slot)
    const parent = scopeOf(structure, structure.above[slot] ?? -1)
    parent.pending--
    if (parent.pending === 0) this.#queue.push(parent.slot)
    this.#pump()
  }

  #unit(scope: Scope): Unit {
    const structure = this.#structure
    const local = new Map<number, number>()
    const units = scope.leaves.length + scope.blocks.length
    const movable = new Uint8Array(units)
    const start = new Float32Array(units * 2)
    scope.leaves.forEach((index, at) => {
      local.set(index, at)
      const pin = this.#pins.get(index)
      movable[at] = structure.leafMovable[index] === 1 && !pin ? 1 : 0
      start[at * 2] = pin?.[0] ?? this.#xy[index * 2] ?? 0
      start[at * 2 + 1] = pin?.[1] ?? this.#xy[index * 2 + 1] ?? 0
    })
    scope.blocks.forEach((slot, offset) => {
      const at = scope.leaves.length + offset
      const pinned = (structure.members[slot] ?? []).some((index) => this.#pins.has(index))
      movable[at] = structure.moves[slot] === 1 && !pinned ? 1 : 0
      const [x, y] = this.#center(slot)
      start[at * 2] = x
      start[at * 2 + 1] = y
    })
    const origin = Float32Array.from(start)
    if (this.#fresh) reseed(start, movable, (at) => this.#reach(scope, at))
    return { leaves: scope.leaves, blocks: scope.blocks, local, start, origin, movable }
  }

  #reach(scope: Scope, at: number): number {
    const graph = this.#structure.graph
    if (at < scope.leaves.length) return graph.radius[scope.leaves[at] ?? 0] ?? 0
    const [halfWidth, halfHeight] = this.#extents(scope.blocks[at - scope.leaves.length] ?? 0)
    return Math.hypot(halfWidth, halfHeight)
  }

  #space(slot: number): readonly [number, number, number, number] {
    const space = this.#structure.graph.groups?.labelSpace
    const index = this.#structure.tree.node[slot] ?? 0
    if (!space) return [0, 0, 0, 0]
    return [
      space[index * 4] ?? 0,
      space[index * 4 + 1] ?? 0,
      space[index * 4 + 2] ?? 0,
      space[index * 4 + 3] ?? 0,
    ]
  }

  #center(slot: number): readonly [number, number] {
    const [top, right, bottom, left] = this.#space(slot)
    return [
      (this.#box[slot * 4] ?? 0) + (right - left) / 2,
      (this.#box[slot * 4 + 1] ?? 0) + (bottom - top) / 2,
    ]
  }

  #extents(slot: number): readonly [number, number] {
    const [top, right, bottom, left] = this.#space(slot)
    return [
      (this.#box[slot * 4 + 2] ?? 0) + (right + left) / 2,
      (this.#box[slot * 4 + 3] ?? 0) + (top + bottom) / 2,
    ]
  }

  #local(scope: Scope, unit: Unit): LayoutGraph {
    const structure = this.#structure
    const { graph, tree } = structure
    const leaves = unit.leaves.length
    const blockCount = unit.blocks.length
    const capacity = leaves + blockCount + scope.groups.length
    const slotLocal = new Map<number, number>()
    scope.groups.forEach((slot, at) => {
      slotLocal.set(slot, leaves + blockCount + at)
    })
    const alive = new Uint8Array(capacity)
    alive.fill(1, 0, leaves + blockCount)
    const movable = new Uint8Array(capacity)
    movable.set(unit.movable)
    const xy = new Float32Array(capacity * 2)
    xy.set(unit.start)
    const radius = new Float32Array(capacity)
    const boxed = graph.extents !== undefined || blockCount > 0
    const extents = boxed ? new Float32Array(capacity * 2) : null
    const keys: (Key | undefined)[] = []
    const sources: number[] = []
    unit.leaves.forEach((index, at) => {
      const r = graph.radius[index] ?? 0
      radius[at] = r
      if (extents) {
        extents[at * 2] = graph.extents?.[index * 2] ?? r
        extents[at * 2 + 1] = graph.extents?.[index * 2 + 1] ?? r
      }
      keys.push(graph.keys[index])
      sources.push(index)
    })
    const size = blockCount > 0 ? new Uint32Array(capacity) : null
    unit.blocks.forEach((slot, offset) => {
      const at = leaves + offset
      const [halfWidth, halfHeight] = this.#extents(slot)
      radius[at] =
        tree.circle[slot] === 1
          ? Math.max(halfWidth, halfHeight)
          : Math.hypot(halfWidth, halfHeight)
      if (extents) {
        extents[at * 2] = halfWidth
        extents[at * 2 + 1] = halfHeight
      }
      if (size) size[at] = structure.members[slot]?.length ?? 0
      const node = tree.node[slot] ?? -1
      keys.push(graph.keys[node])
      sources.push(node)
    })
    for (const slot of scope.groups) {
      const node = tree.node[slot] ?? -1
      keys.push(graph.keys[node])
      sources.push(node)
    }
    const pairs: number[] = []
    const blockAt = new Map<number, number>()
    unit.blocks.forEach((slot, offset) => {
      blockAt.set(slot, leaves + offset)
    })
    for (let at = 0; at + 1 < scope.edges.length; at += 2) {
      const a = scope.edges[at] ?? 0
      const b = scope.edges[at + 1] ?? 0
      const from = a < 0 ? blockAt.get(-1 - a) : unit.local.get(a)
      const to = b < 0 ? blockAt.get(-1 - b) : unit.local.get(b)
      if (from !== undefined && to !== undefined && from !== to) pairs.push(from, to)
    }
    const groups = scope.groups.length > 0 ? this.#groups(scope, unit, slotLocal, capacity) : null
    const blocks: LayoutBlocks | null = size
      ? {
          size,
          items: (at) =>
            (size[at] ?? 0) > 0
              ? (structure.members[unit.blocks[at - leaves] ?? 0] ?? []).map((index) =>
                  graph.datum(index),
                )
              : [],
          keys: (at) =>
            (size[at] ?? 0) > 0
              ? (structure.members[unit.blocks[at - leaves] ?? 0] ?? []).flatMap((index) => {
                  const key = graph.keys[index]
                  return key === undefined ? [] : [key]
                })
              : [],
        }
      : null
    const node = scope.slot >= 0 ? (tree.node[scope.slot] ?? -1) : -1
    const key = node >= 0 ? graph.keys[node] : undefined
    return {
      capacity,
      alive,
      movable,
      xy,
      radius,
      ...(extents ? { extents } : {}),
      edges: Uint32Array.from(pairs),
      ...(groups ? { groups } : {}),
      ...(blocks ? { blocks } : {}),
      ...(key !== undefined
        ? {
            container: {
              key,
              datum: graph.datum(node),
              circle: tree.circle[scope.slot] === 1,
            },
          }
        : {}),
      keys,
      datum: (at) => {
        const source = sources[at]
        return source === undefined || source < 0 ? undefined : graph.datum(source)
      },
    }
  }

  #groups(
    scope: Scope,
    unit: Unit,
    slotLocal: ReadonlyMap<number, number>,
    capacity: number,
  ): LayoutGroups {
    const { graph, tree } = this.#structure
    const parent = new Int32Array(capacity).fill(-1)
    const holder = (slot: number): number =>
      slot >= 0 && slot !== scope.slot ? (slotLocal.get(slot) ?? -1) : -1
    unit.leaves.forEach((index, at) => {
      parent[at] = holder(tree.groupOf[index] ?? -1)
    })
    unit.blocks.forEach((slot, offset) => {
      parent[unit.leaves.length + offset] = holder(tree.parent[slot] ?? -1)
    })
    const padding = new Float32Array(capacity)
    const circle = new Uint8Array(capacity)
    const source = graph.groups?.labelSpace
    const space = source ? new Float32Array(capacity * 4) : null
    const order: number[] = []
    for (const slot of scope.groups) {
      const at = slotLocal.get(slot) ?? 0
      order.push(at)
      parent[at] = holder(tree.parent[slot] ?? -1)
      padding[at] = tree.padding[slot] ?? 0
      circle[at] = tree.circle[slot] ?? 0
      const node = tree.node[slot] ?? 0
      if (space && source) space.set(source.subarray(node * 4, node * 4 + 4), at * 4)
    }
    return {
      order: Uint32Array.from(order),
      parent,
      padding,
      circle,
      ...(space ? { labelSpace: space } : {}),
    }
  }

  #compose(base: Float32Array, unit: Unit, result: Float32Array, copy: boolean): Float32Array {
    const xy = copy ? Float32Array.from(base) : base
    const structure = this.#structure
    unit.leaves.forEach((index, at) => {
      if (unit.movable[at] !== 1) return
      xy[index * 2] = result[at * 2] ?? xy[index * 2] ?? 0
      xy[index * 2 + 1] = result[at * 2 + 1] ?? xy[index * 2 + 1] ?? 0
    })
    unit.blocks.forEach((slot, offset) => {
      const at = unit.leaves.length + offset
      if (unit.movable[at] !== 1) return
      const dx = (result[at * 2] ?? 0) - (unit.origin[at * 2] ?? 0)
      const dy = (result[at * 2 + 1] ?? 0) - (unit.origin[at * 2 + 1] ?? 0)
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
      for (const index of structure.members[slot] ?? []) {
        xy[index * 2] = (xy[index * 2] ?? 0) + dx
        xy[index * 2 + 1] = (xy[index * 2 + 1] ?? 0) + dy
      }
      if (!copy) {
        this.#box[slot * 4] = (this.#box[slot * 4] ?? 0) + dx
        this.#box[slot * 4 + 1] = (this.#box[slot * 4 + 1] ?? 0) + dy
      }
    })
    return xy
  }

  #apply(
    scope: Scope,
    unit: Unit,
    result: Float32Array,
    before: readonly [number, number] | null,
  ): void {
    const structure = this.#structure
    this.#compose(this.#xy, unit, result, false)
    if (!before || structure.moves[scope.slot] === 1 || !unit.movable.every((flag) => flag === 1))
      return
    const [x, y] = this.#measure(scope.slot)
    const dx = before[0] - x
    const dy = before[1] - y
    if (dx === 0 && dy === 0) return
    for (const index of structure.members[scope.slot] ?? []) {
      this.#xy[index * 2] = (this.#xy[index * 2] ?? 0) + dx
      this.#xy[index * 2 + 1] = (this.#xy[index * 2 + 1] ?? 0) + dy
    }
    for (const slot of unit.blocks) {
      this.#box[slot * 4] = (this.#box[slot * 4] ?? 0) + dx
      this.#box[slot * 4 + 1] = (this.#box[slot * 4 + 1] ?? 0) + dy
    }
  }

  #outermost(): number[] {
    const structure = this.#structure
    const found: number[] = []
    for (const scope of structure.scopes) {
      if (!scope.runs) continue
      let outermost = true
      for (let slot = structure.above[scope.slot] ?? -1; outermost && slot >= 0; ) {
        if (scopeOf(structure, slot).runs) outermost = false
        slot = structure.above[slot] ?? -1
      }
      const inside = structure.members[scope.slot] ?? []
      if (outermost && inside.every((index) => structure.movable[index] === 1)) {
        found.push(scope.slot)
      }
    }
    return found
  }

  #measure(slot: number): readonly [number, number] {
    const structure = this.#structure
    const scope = scopeOf(structure, slot)
    for (let at = scope.groups.length - 1; at >= 0; at--) this.#measureSlot(scope.groups[at] ?? 0)
    this.#measureSlot(slot)
    return [this.#box[slot * 4] ?? 0, this.#box[slot * 4 + 1] ?? 0]
  }

  #measureSlot(slot: number): void {
    const { graph, tree } = this.#structure
    const box = this.#box
    const xy = this.#xy
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const leaves = this.#leavesOf(slot)
    const first = tree.first[slot] ?? 0
    const children = tree.children[slot] ?? 0
    for (const index of leaves) {
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      const halfWidth = graph.extents?.[index * 2] ?? graph.radius[index] ?? 0
      const halfHeight = graph.extents?.[index * 2 + 1] ?? graph.radius[index] ?? 0
      minX = Math.min(minX, x - halfWidth)
      minY = Math.min(minY, y - halfHeight)
      maxX = Math.max(maxX, x + halfWidth)
      maxY = Math.max(maxY, y + halfHeight)
    }
    for (let child = first; child < first + children; child++) {
      if ((box[child * 4 + 2] ?? -1) < 0) continue
      const x = box[child * 4] ?? 0
      const y = box[child * 4 + 1] ?? 0
      minX = Math.min(minX, x - (box[child * 4 + 2] ?? 0))
      minY = Math.min(minY, y - (box[child * 4 + 3] ?? 0))
      maxX = Math.max(maxX, x + (box[child * 4 + 2] ?? 0))
      maxY = Math.max(maxY, y + (box[child * 4 + 3] ?? 0))
    }
    if (maxX < minX) {
      box[slot * 4 + 2] = -1
      return
    }
    const padding = tree.padding[slot] ?? 0
    const x = (minX + maxX) / 2
    const y = (minY + maxY) / 2
    let halfWidth = (maxX - minX) / 2 + padding
    let halfHeight = (maxY - minY) / 2 + padding
    if (tree.circle[slot] === 1) {
      let reach = 0
      for (const index of leaves) {
        const dx = (xy[index * 2] ?? 0) - x
        const dy = (xy[index * 2 + 1] ?? 0) - y
        reach = Math.max(reach, Math.hypot(dx, dy) + (graph.radius[index] ?? 0))
      }
      for (let child = first; child < first + children; child++) {
        if ((box[child * 4 + 2] ?? -1) < 0) continue
        const extent =
          tree.circle[child] === 1
            ? (box[child * 4 + 2] ?? 0)
            : Math.hypot(box[child * 4 + 2] ?? 0, box[child * 4 + 3] ?? 0)
        const dx = (box[child * 4] ?? 0) - x
        const dy = (box[child * 4 + 1] ?? 0) - y
        reach = Math.max(reach, Math.hypot(dx, dy) + extent)
      }
      halfWidth = halfHeight = reach + padding
    }
    box[slot * 4] = x
    box[slot * 4 + 1] = y
    box[slot * 4 + 2] = halfWidth
    box[slot * 4 + 3] = halfHeight
  }

  #direct: number[][] | null = null

  #leavesOf(slot: number): readonly number[] {
    if (!this.#direct) {
      const { graph, tree } = this.#structure
      const direct: number[][] = Array.from({ length: tree.count }, () => [])
      for (let index = 0; index < graph.capacity; index++) {
        if (graph.alive[index] !== 1) continue
        const group = tree.groupOf[index] ?? -1
        if (group >= 0) direct[group]?.push(index)
      }
      this.#direct = direct
    }
    return this.#direct[slot] ?? []
  }

  #forget(): void {
    const memory = this.#memory
    if (!memory) return
    const { graph, tree, scoped } = this.#structure
    const kept = new Set<Key>()
    for (let slot = 0; slot < tree.count; slot++) {
      const key = scoped[slot] === 1 ? graph.keys[tree.node[slot] ?? -1] : undefined
      if (key !== undefined) kept.add(key)
    }
    for (const key of memory.keys()) if (!kept.has(key)) memory.delete(key)
  }

  #finish(): void {
    this.#forget()
    const structure = this.#structure
    const { graph, tree, movable } = structure
    const xy = this.#xy
    orientBlocks(structure, xy)
    const held = partialOf(structure) ? this.#outermost() : []
    const centers = held.map((slot) => this.#measure(slot))
    const fixed = new Uint8Array(graph.capacity)
    for (let index = 0; index < graph.capacity; index++) {
      fixed[index] = movable[index] === 1 && !this.#pins.has(index) ? 0 : 1
    }
    separateGroups(tree, graph.alive, graph.radius, fixed, xy, {
      spacing: 0,
      groupSpacing: groupGap,
      rounds: 64,
      nodes: 'all',
    })
    held.forEach((slot, at) => {
      const [x, y] = this.#measure(slot)
      const dx = (centers[at]?.[0] ?? x) - x
      const dy = (centers[at]?.[1] ?? y) - y
      if (dx === 0 && dy === 0) return
      for (const index of structure.members[slot] ?? []) {
        xy[index * 2] = (xy[index * 2] ?? 0) + dx
        xy[index * 2 + 1] = (xy[index * 2 + 1] ?? 0) + dy
      }
    })
    for (const [index, [x, y]] of this.#pins) {
      xy[index * 2] = x
      xy[index * 2 + 1] = y
    }
    for (let index = 0; index < graph.capacity; index++) {
      if (movable[index] === 1 && graph.alive[index] === 1) continue
      xy[index * 2] = graph.xy[index * 2] ?? 0
      xy[index * 2 + 1] = graph.xy[index * 2 + 1] ?? 0
    }
    this.#stopped = true
    this.#listener.end(xy)
  }
}

function reseed(xy: Float32Array, movable: Uint8Array, reach: (at: number) => number): void {
  const moving: number[] = []
  for (let at = 0; at < movable.length; at++) if (movable[at] === 1) moving.push(at)
  if (moving.length < 2) return
  let x = 0
  let y = 0
  const reaches = new Float64Array(moving.length)
  moving.forEach((at, k) => {
    x += xy[at * 2] ?? 0
    y += xy[at * 2 + 1] ?? 0
    reaches[k] = reach(at)
  })
  x /= moving.length
  y /= moving.length
  reaches.sort()
  const pitch = Math.max(24, 2.5 * (reaches[reaches.length >> 1] ?? 0))
  moving.forEach((at, k) => {
    const r = pitch * Math.sqrt(k + 1)
    xy[at * 2] = x + r * Math.cos(k * goldenTurn)
    xy[at * 2 + 1] = y + r * Math.sin(k * goldenTurn)
  })
}
