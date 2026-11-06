import type { EdgeMark, Key, Mark, NodeMark } from '../types'
import { isKey, toAccessor } from './accessor'
import { IndexPool } from './index-pool'
import { IndexSet } from './index-set'
import { KeyIndex } from './key-index'
import { type GraphIssue, type Source, SourceTable } from './source-table'

export type { ElementKind, GraphIssue } from './source-table'

export interface ElementRef {
  readonly key: Key
  readonly index: number
}

export interface ElementChanges {
  readonly added: readonly ElementRef[]
  readonly updated: readonly ElementRef[]
  readonly removed: readonly ElementRef[]
}

export interface EdgeChanges extends ElementChanges {
  readonly pending: readonly Key[]
}

export interface GraphChanges {
  readonly nodes: ElementChanges
  readonly edges: EdgeChanges
  readonly issues: readonly GraphIssue[]
}

export interface NodeRecord {
  readonly key: Key
  readonly index: number
  readonly datum: unknown
  readonly mark: NodeMark<unknown>
}

export interface EdgeRecord {
  readonly key: Key
  readonly index: number
  readonly datum: unknown
  readonly mark: EdgeMark<unknown>
  readonly source: Key
  readonly target: Key
  readonly sourceIndex: number
  readonly targetIndex: number
}

export interface Endpoints {
  readonly source: Key
  readonly target: Key
}

export interface GraphModelOptions {
  readonly schedule?: () => void
}

export interface GraphModel {
  setMarks(marks: readonly Mark[]): void
  flush(): GraphChanges
  node(key: Key): NodeRecord | undefined
  edge(key: Key): EdgeRecord | undefined
  nodeAt(index: number): NodeRecord | undefined
  edgeAt(index: number): EdgeRecord | undefined
  readonly nodeCount: number
  nodes(): IterableIterator<NodeRecord>
  edges(): IterableIterator<EdgeRecord>
  neighbors(key: Key): Key[]
  edgesOf(key: Key): Key[]
  endpoints(key: Key): Endpoints | undefined
  pendingEdges(): Key[]
  destroy(): void
}

class NodeEntry implements NodeRecord {
  constructor(
    readonly key: Key,
    readonly index: number,
    public datum: unknown,
    public slot: number,
    readonly table: SourceTable<NodeMark<unknown>>,
  ) {}

  get mark(): NodeMark<unknown> {
    return this.table.markAt(this.slot)
  }
}

class EdgeEntry {
  sourceIndex = -1
  targetIndex = -1

  constructor(
    readonly key: Key,
    readonly id: number,
    public index: number,
    public datum: unknown,
    public slot: number,
    public source: Key | null,
    public target: Key | null,
    readonly table: SourceTable<EdgeMark<unknown>>,
  ) {}

  get mark(): EdgeMark<unknown> {
    return this.table.markAt(this.slot)
  }
}

type VisibleEdge = EdgeEntry & Endpoints

interface MutableChanges {
  readonly added: ElementRef[]
  readonly updated: ElementRef[]
  readonly removed: ElementRef[]
}

function isNodeMark(mark: Mark): mark is NodeMark<unknown> {
  return mark.type === 'nodes'
}

function isEdgeMark(mark: Mark): mark is EdgeMark<unknown> {
  return mark.type === 'edges'
}

function isVisible(entry: EdgeEntry): entry is VisibleEdge {
  return entry.index >= 0
}

function isIndexed(entry: NodeEntry): entry is NodeEntry {
  return entry.index >= 0
}

class Present<T, R extends T> implements IterableIterator<R> {
  readonly #entries: readonly (T | undefined)[]
  readonly #keep: (entry: T) => entry is R
  #at = 0

  constructor(entries: readonly (T | undefined)[], keep: (entry: T) => entry is R) {
    this.#entries = entries
    this.#keep = keep
  }

  next(): IteratorResult<R, undefined> {
    const entries = this.#entries
    while (this.#at < entries.length) {
      const entry = entries[this.#at++]
      if (entry !== undefined && this.#keep(entry)) return { value: entry, done: false }
    }
    return { value: undefined, done: true }
  }

  [Symbol.iterator](): this {
    return this
  }
}

function emptyChanges(): MutableChanges {
  return { added: [], updated: [], removed: [] }
}

const linkStride = 6
const sourceSide = 2
const targetSide = 4

function grown(array: Int32Array<ArrayBuffer>, length: number): Int32Array<ArrayBuffer> {
  if (length <= array.length) return array
  const next = new Int32Array(Math.max(64, array.length * 2, length)).fill(-1)
  next.set(array)
  return next
}

export function createGraphModel(options: GraphModelOptions = {}): GraphModel {
  const schedule = options.schedule ?? (() => {})
  const issues: GraphIssue[] = []
  const nodeSources = new SourceTable<NodeMark<unknown>>('nodes', issues, schedule)
  const edgeSources = new SourceTable<EdgeMark<unknown>>('edges', issues, schedule)
  const ends = new KeyIndex()
  let endPool = new IndexPool()
  const endKeys: (Key | undefined)[] = []
  let endNode = new Int32Array(0)
  let endHead = new Int32Array(0)
  let endTail = new Int32Array(0)
  const edgeIds = new KeyIndex()
  let entryPool = new IndexPool()
  const entries: (EdgeEntry | undefined)[] = []
  let links = new Int32Array(0)
  const nodesByIndex: (NodeEntry | undefined)[] = []
  const edgesByIndex: (EdgeEntry | undefined)[] = []
  const nodePool = new IndexPool()
  const edgePool = new IndexPool()
  const touched = new IndexSet()
  const unused: number[] = []
  let nodeCount = 0

  function reserveEnds(capacity: number): void {
    if (capacity <= endNode.length) return
    endNode = grown(endNode, capacity)
    endHead = grown(endHead, endNode.length)
    endTail = grown(endTail, endNode.length)
  }

  function reserveEntries(capacity: number): void {
    links = grown(links, capacity * linkStride)
  }

  function intern(key: Key, absent = false): number {
    if (!absent) {
      const known = ends.get(key)
      if (known !== -1) return known
    }
    const end = endPool.acquire()
    ends.add(key, end)
    reserveEnds(end + 1)
    endKeys[end] = key
    endNode[end] = -1
    endHead[end] = -1
    endTail[end] = -1
    return end
  }

  function endOf(key: Key): number {
    return ends.get(key)
  }

  function forget(end: number): void {
    if (endHead[end] === -1 && endNode[end] === -1) unused.push(end)
  }

  function releaseUnused(): void {
    for (const end of unused) {
      const key = endKeys[end]
      if (key === undefined || endHead[end] !== -1 || endNode[end] !== -1) continue
      ends.delete(key)
      endKeys[end] = undefined
      endPool.release(end)
    }
    unused.length = 0
  }

  function sideOf(id: number, end: number): number {
    const at = id * linkStride
    return at + (links[at] === end ? sourceSide : targetSide)
  }

  function nextAt(id: number, end: number): number {
    return links[sideOf(id, end)] ?? -1
  }

  function attach(end: number, id: number): void {
    const at = sideOf(id, end)
    const tail = endTail[end] ?? -1
    links[at] = -1
    links[at + 1] = tail
    if (tail === -1) endHead[end] = id
    else links[sideOf(tail, end)] = id
    endTail[end] = id
  }

  function detach(end: number, id: number): void {
    const at = sideOf(id, end)
    const next = links[at] ?? -1
    const previous = links[at + 1] ?? -1
    if (previous === -1) endHead[end] = next
    else links[sideOf(previous, end)] = next
    if (next === -1) endTail[end] = previous
    else links[sideOf(next, end) + 1] = previous
    links[at] = -1
    links[at + 1] = -1
    forget(end)
  }

  function link(id: number): void {
    const source = links[id * linkStride] ?? -1
    const target = links[id * linkStride + 1] ?? -1
    if (source !== -1) attach(source, id)
    if (target !== -1 && target !== source) attach(target, id)
  }

  function unlink(id: number): void {
    const source = links[id * linkStride] ?? -1
    const target = links[id * linkStride + 1] ?? -1
    if (source !== -1) detach(source, id)
    if (target !== -1 && target !== source) detach(target, id)
  }

  function nodeOf(key: Key): NodeEntry | undefined {
    const end = endOf(key)
    const index = end === -1 ? -1 : (endNode[end] ?? -1)
    return index === -1 ? undefined : nodesByIndex[index]
  }

  function visibleIncident(key: Key): VisibleEdge[] {
    const result: VisibleEdge[] = []
    const end = endOf(key)
    if (end === -1 || endNode[end] === -1) return result
    for (let id = endHead[end] ?? -1; id !== -1; id = nextAt(id, end)) {
      const entry = entries[id]
      if (entry && isVisible(entry)) result.push(entry)
    }
    return result
  }

  function touch(end: number): void {
    for (let id = endHead[end] ?? -1; id !== -1; id = nextAt(id, end)) touched.add(id)
  }

  function flushNodes(changes: MutableChanges, freed: number[]): void {
    const known = ends.size > 0
    const sole = known || endPool.capacity > 0 ? null : nodeSources.sole()
    if (sole) {
      sole.items.copyIndex(ends)
      endPool = new IndexPool(sole.items.size)
      reserveEnds(sole.items.size)
    } else if (!known) {
      ends.reserve(nodeSources.pendingCount)
    }
    nodeSources.forEachDirty((key, forced, source, datum, position) => {
      if (sole && source === sole && position !== -1) {
        const created = nodePool.acquire()
        endKeys[position] = key
        endNode[position] = created
        nodesByIndex[created] = new NodeEntry(key, created, datum, sole.slot, nodeSources)
        nodeCount++
        changes.added.push({ key, index: created })
        return
      }
      const end = known ? endOf(key) : -1
      const index = end === -1 ? -1 : (endNode[end] ?? -1)
      const entry = index === -1 ? undefined : nodesByIndex[index]
      if (!source) {
        if (entry) {
          nodesByIndex[index] = undefined
          endNode[end] = -1
          nodeCount--
          changes.removed.push({ key, index })
          freed.push(index)
          touch(end)
          forget(end)
        }
        return
      }
      const slot = source.slot
      if (!entry) {
        const created = nodePool.acquire()
        const at = end === -1 ? intern(key, true) : end
        endNode[at] = created
        nodesByIndex[created] = new NodeEntry(key, created, datum, slot, nodeSources)
        nodeCount++
        changes.added.push({ key, index: created })
        touch(at)
        return
      }
      if (forced || entry.datum !== datum || entry.slot !== slot) {
        changes.updated.push({ key, index })
      }
      entry.datum = datum
      entry.slot = slot
    })
    nodeSources.clearDirty()
  }

  function flushEdges(
    changes: MutableChanges & { readonly pending: Key[] },
    freed: number[],
    freedEntries: number[],
  ): void {
    let readMark: EdgeMark<unknown> | null = null
    let readSource: (datum: unknown) => unknown = () => undefined
    let readTarget: (datum: unknown) => unknown = () => undefined
    const known = edgeIds.size > 0
    const sole = known || entryPool.capacity > 0 ? null : edgeSources.sole()
    if (sole) {
      sole.items.copyIndex(edgeIds)
      entryPool = new IndexPool(sole.items.size)
      reserveEntries(sole.items.size)
    } else if (!known) {
      const count = edgeSources.pendingCount
      edgeIds.reserve(count)
      reserveEntries(count)
    }
    let lastSource: Key | null = null
    let lastSourceEnd = -1
    let lastTarget: Key | null = null
    let lastTargetEnd = -1
    const sourceEndOf = (key: Key | null): number => {
      if (key === null) return -1
      if (key !== lastSource) {
        lastSource = key
        lastSourceEnd = intern(key)
      }
      return lastSourceEnd
    }
    const targetEndOf = (key: Key | null): number => {
      if (key === null) return -1
      if (key !== lastTarget) {
        lastTarget = key
        lastTargetEnd = intern(key)
      }
      return lastTargetEnd
    }
    if (sole) {
      const options = sole.mark.options
      const readFrom = toAccessor<unknown, unknown>(options.source)
      const readTo = toAccessor<unknown, unknown>(options.target)
      sole.items.forEach((datum, _, position) => {
        const source = readFrom(datum)
        const target = readTo(datum)
        links[position * linkStride] = isKey(source) ? sourceEndOf(source) : -1
        links[position * linkStride + 1] = isKey(target) ? targetEndOf(target) : -1
      })
    }
    const visit = (
      key: Key,
      id: number,
      forced: boolean | undefined,
      owner: Source<EdgeMark<unknown>> | undefined,
      datum: unknown,
      position: number,
    ): void => {
      let entry = id === -1 ? undefined : entries[id]
      const wasVisible = entry !== undefined && isVisible(entry)
      const wasPending = entry !== undefined && !wasVisible
      let changed = false
      if (forced !== undefined) {
        if (!owner) {
          if (entry) {
            unlink(entry.id)
            edgeIds.delete(key)
            entries[entry.id] = undefined
            freedEntries.push(entry.id)
            if (wasVisible) {
              edgesByIndex[entry.index] = undefined
              changes.removed.push({ key, index: entry.index })
              freed.push(entry.index)
            }
          }
          return
        }
        const { mark, slot } = owner
        if (mark !== readMark) {
          readMark = mark
          readSource = toAccessor<unknown, unknown>(mark.options.source)
          readTarget = toAccessor<unknown, unknown>(mark.options.target)
        }
        const sourceValue = readSource(datum)
        const targetValue = readTarget(datum)
        const source = isKey(sourceValue) ? sourceValue : null
        const target = isKey(targetValue) ? targetValue : null
        if (!entry && position !== -1) {
          entry = new EdgeEntry(key, position, -1, datum, slot, source, target, edgeSources)
          entries[position] = entry
          link(position)
        } else if (!entry) {
          const created = entryPool.acquire()
          reserveEntries(created + 1)
          entry = new EdgeEntry(key, created, -1, datum, slot, source, target, edgeSources)
          edgeIds.add(key, created)
          entries[created] = entry
          links[created * linkStride] = sourceEndOf(source)
          links[created * linkStride + 1] = targetEndOf(target)
          link(created)
        } else {
          const moved = entry.source !== source || entry.target !== target
          changed = moved || forced || entry.datum !== datum
          changed ||= entry.slot !== slot
          if (moved) {
            unlink(entry.id)
            entry.source = source
            entry.target = target
            links[entry.id * linkStride] = sourceEndOf(source)
            links[entry.id * linkStride + 1] = targetEndOf(target)
            link(entry.id)
          }
          entry.datum = datum
          entry.slot = slot
        }
      }
      if (!entry) return
      const from = links[entry.id * linkStride] ?? -1
      const to = links[entry.id * linkStride + 1] ?? -1
      const sourceIndex = from === -1 ? -1 : (endNode[from] ?? -1)
      const targetIndex = to === -1 ? -1 : (endNode[to] ?? -1)
      const visible = sourceIndex !== -1 && targetIndex !== -1
      if (visible) {
        entry.sourceIndex = sourceIndex
        entry.targetIndex = targetIndex
      }
      if (visible && !wasVisible) {
        entry.index = edgePool.acquire()
        edgesByIndex[entry.index] = entry
        changes.added.push({ key, index: entry.index })
      } else if (!visible && wasVisible) {
        edgesByIndex[entry.index] = undefined
        changes.removed.push({ key, index: entry.index })
        freed.push(entry.index)
        entry.index = -1
        changes.pending.push(key)
      } else if (visible && changed) {
        changes.updated.push({ key, index: entry.index })
      } else if (!visible && !wasPending) {
        changes.pending.push(key)
      }
    }
    edgeSources.forEachDirty((key, forced, owner, datum, position) => {
      if (sole && owner === sole && position !== -1) visit(key, -1, forced, owner, datum, position)
      else visit(key, known ? edgeIds.get(key) : -1, forced, owner, datum, -1)
    })
    for (const id of touched) {
      const entry = entries[id]
      if (entry && !edgeSources.isDirty(entry.key)) {
        visit(entry.key, id, undefined, undefined, undefined, -1)
      }
    }
    touched.clear()
    edgeSources.clearDirty()
  }

  return {
    setMarks(marks) {
      nodeSources.setMarks(marks.filter(isNodeMark))
      edgeSources.setMarks(marks.filter(isEdgeMark))
      if (nodeSources.pending || edgeSources.pending || issues.length > 0) schedule()
    },

    flush() {
      nodeSources.drain()
      edgeSources.drain()
      const nodes = emptyChanges()
      const edges = { ...emptyChanges(), pending: [] as Key[] }
      const freedNodes: number[] = []
      const freedEdges: number[] = []
      const freedEntries: number[] = []
      flushNodes(nodes, freedNodes)
      flushEdges(edges, freedEdges, freedEntries)
      for (const index of freedNodes) nodePool.release(index)
      for (const index of freedEdges) edgePool.release(index)
      for (const id of freedEntries) entryPool.release(id)
      releaseUnused()
      return { nodes, edges, issues: issues.splice(0) }
    },

    node(key) {
      return nodeOf(key)
    },

    edge(key) {
      const id = edgeIds.get(key)
      const entry = id === -1 ? undefined : entries[id]
      return entry && isVisible(entry) ? entry : undefined
    },

    nodeAt(index) {
      return nodesByIndex[index]
    },

    edgeAt(index) {
      const entry = edgesByIndex[index]
      return entry && isVisible(entry) ? entry : undefined
    },

    get nodeCount() {
      return nodeCount
    },

    nodes() {
      return new Present(nodesByIndex, isIndexed)
    },

    edges() {
      return new Present(edgesByIndex, isVisible)
    },

    neighbors(key) {
      const result = new Set<Key>()
      const end = endOf(key)
      for (const entry of visibleIncident(key)) {
        result.add(links[entry.id * linkStride] === end ? entry.target : entry.source)
      }
      return [...result]
    },

    edgesOf(key) {
      return visibleIncident(key).map((entry) => entry.key)
    },

    endpoints(key) {
      const id = edgeIds.get(key)
      const entry = id === -1 ? undefined : entries[id]
      return entry && isVisible(entry) ? { source: entry.source, target: entry.target } : undefined
    },

    pendingEdges() {
      const result: Key[] = []
      for (const entry of entries) if (entry && !isVisible(entry)) result.push(entry.key)
      return result
    },

    destroy() {
      nodeSources.destroy()
      edgeSources.destroy()
      ends.clear()
      edgeIds.clear()
      endKeys.length = 0
      entries.length = 0
      nodesByIndex.length = 0
      edgesByIndex.length = 0
      touched.clear()
      nodeCount = 0
      issues.length = 0
    },
  }
}
