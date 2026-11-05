import type { EdgeMark, Key, Mark, NodeMark } from '../types'
import { isKey, toAccessor } from './accessor'
import { IndexPool } from './index-pool'
import { type AnyMark, type GraphIssue, type Source, SourceTable } from './source-table'

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
  nodes(): IterableIterator<NodeRecord>
  edges(): IterableIterator<EdgeRecord>
  neighbors(key: Key): Key[]
  edgesOf(key: Key): Key[]
  endpoints(key: Key): Endpoints | undefined
  pendingEdges(): Key[]
  destroy(): void
}

interface NodeEntry {
  readonly key: Key
  readonly index: number
  datum: unknown
  mark: NodeMark<unknown>
  slot: number
}

interface EdgeEntry {
  readonly key: Key
  index: number
  datum: unknown
  mark: EdgeMark<unknown>
  slot: number
  source: Key | null
  target: Key | null
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

function endpoint(channel: EdgeMark<unknown>['options']['source'], datum: unknown): Key | null {
  const value = toAccessor<unknown, unknown>(channel)(datum)
  return isKey(value) ? value : null
}

function emptyChanges(): MutableChanges {
  return { added: [], updated: [], removed: [] }
}

function remark<M extends AnyMark>(
  sources: Source<M>[],
  entries: ReadonlyMap<Key, { slot: number; mark: M }>,
): void {
  for (const source of sources) {
    if (source.retired) continue
    for (const key of source.items.keys()) {
      const entry = entries.get(key)
      if (entry?.slot === source.slot) entry.mark = source.mark
    }
  }
  sources.length = 0
}

export function createGraphModel(options: GraphModelOptions = {}): GraphModel {
  const schedule = options.schedule ?? (() => {})
  const issues: GraphIssue[] = []
  const nodeSources = new SourceTable<NodeMark<unknown>>('nodes', issues, schedule)
  const edgeSources = new SourceTable<EdgeMark<unknown>>('edges', issues, schedule)
  const nodeEntries = new Map<Key, NodeEntry>()
  const edgeEntries = new Map<Key, EdgeEntry>()
  const incident = new Map<Key, Set<Key>>()
  const nodePool = new IndexPool()
  const edgePool = new IndexPool()

  function link(entry: EdgeEntry): void {
    for (const key of [entry.source, entry.target]) {
      if (key === null) continue
      let edges = incident.get(key)
      if (!edges) {
        edges = new Set()
        incident.set(key, edges)
      }
      edges.add(entry.key)
    }
  }

  function unlink(entry: EdgeEntry): void {
    for (const key of [entry.source, entry.target]) {
      if (key === null) continue
      const edges = incident.get(key)
      edges?.delete(entry.key)
      if (edges?.size === 0) incident.delete(key)
    }
  }

  function visibleIncident(key: Key): VisibleEdge[] {
    const result: VisibleEdge[] = []
    for (const edgeKey of incident.get(key) ?? []) {
      const entry = edgeEntries.get(edgeKey)
      if (entry && isVisible(entry)) result.push(entry)
    }
    return result
  }

  function flushNodes(changes: MutableChanges, touched: Set<Key>, freed: number[]): void {
    remark(nodeSources.remarked, nodeEntries)
    const touch = (key: Key) => {
      for (const edgeKey of incident.get(key) ?? []) touched.add(edgeKey)
    }
    for (const [key, forced] of nodeSources.dirty) {
      const owner = nodeSources.owner(key)
      const entry = nodeEntries.get(key)
      if (!owner) {
        if (entry) {
          nodeEntries.delete(key)
          changes.removed.push({ key, index: entry.index })
          freed.push(entry.index)
          touch(key)
        }
        continue
      }
      const { mark, slot } = owner.source
      if (!entry) {
        const index = nodePool.acquire()
        nodeEntries.set(key, { key, index, datum: owner.datum, mark, slot })
        changes.added.push({ key, index })
        touch(key)
        continue
      }
      if (forced || entry.datum !== owner.datum || entry.slot !== slot) {
        changes.updated.push({ key, index: entry.index })
      }
      entry.datum = owner.datum
      entry.mark = mark
      entry.slot = slot
    }
    nodeSources.dirty.clear()
  }

  function flushEdges(
    changes: MutableChanges & { readonly pending: Key[] },
    touched: Set<Key>,
    freed: number[],
  ): void {
    remark(edgeSources.remarked, edgeEntries)
    const dirty = edgeSources.dirty
    for (const key of new Set([...dirty.keys(), ...touched])) {
      let entry = edgeEntries.get(key)
      const wasVisible = entry !== undefined && isVisible(entry)
      const wasPending = entry !== undefined && !wasVisible
      let changed = false
      if (dirty.has(key)) {
        const owner = edgeSources.owner(key)
        if (!owner) {
          if (entry) {
            unlink(entry)
            edgeEntries.delete(key)
            if (wasVisible) {
              changes.removed.push({ key, index: entry.index })
              freed.push(entry.index)
            }
          }
          continue
        }
        const { mark, slot } = owner.source
        const source = endpoint(mark.options.source, owner.datum)
        const target = endpoint(mark.options.target, owner.datum)
        if (!entry) {
          entry = { key, index: -1, datum: owner.datum, mark, slot, source, target }
          edgeEntries.set(key, entry)
          link(entry)
        } else {
          const moved = entry.source !== source || entry.target !== target
          changed = moved || dirty.get(key) === true || entry.datum !== owner.datum
          changed ||= entry.slot !== slot
          if (moved) {
            unlink(entry)
            entry.source = source
            entry.target = target
            link(entry)
          }
          entry.datum = owner.datum
          entry.mark = mark
          entry.slot = slot
        }
      }
      if (!entry) continue
      const visible =
        entry.source !== null &&
        entry.target !== null &&
        nodeEntries.has(entry.source) &&
        nodeEntries.has(entry.target)
      if (visible && !wasVisible) {
        entry.index = edgePool.acquire()
        changes.added.push({ key, index: entry.index })
      } else if (!visible && wasVisible) {
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
    dirty.clear()
  }

  return {
    setMarks(marks) {
      nodeSources.setMarks(marks.filter(isNodeMark))
      edgeSources.setMarks(marks.filter(isEdgeMark))
      const pending =
        nodeSources.dirty.size > 0 ||
        edgeSources.dirty.size > 0 ||
        nodeSources.remarked.length > 0 ||
        edgeSources.remarked.length > 0 ||
        issues.length > 0
      if (pending) schedule()
    },

    flush() {
      nodeSources.drain()
      edgeSources.drain()
      const nodes = emptyChanges()
      const edges = { ...emptyChanges(), pending: [] as Key[] }
      const touched = new Set<Key>()
      const freedNodes: number[] = []
      const freedEdges: number[] = []
      flushNodes(nodes, touched, freedNodes)
      flushEdges(edges, touched, freedEdges)
      for (const index of freedNodes) nodePool.release(index)
      for (const index of freedEdges) edgePool.release(index)
      return { nodes, edges, issues: issues.splice(0) }
    },

    node(key) {
      return nodeEntries.get(key)
    },

    edge(key) {
      const entry = edgeEntries.get(key)
      return entry && isVisible(entry) ? entry : undefined
    },

    nodes() {
      return nodeEntries.values()
    },

    *edges() {
      for (const entry of edgeEntries.values()) if (isVisible(entry)) yield entry
    },

    neighbors(key) {
      const result = new Set<Key>()
      for (const entry of visibleIncident(key)) {
        result.add(entry.source === key ? entry.target : entry.source)
      }
      return [...result]
    },

    edgesOf(key) {
      return visibleIncident(key).map((entry) => entry.key)
    },

    endpoints(key) {
      const entry = edgeEntries.get(key)
      return entry && isVisible(entry) ? { source: entry.source, target: entry.target } : undefined
    },

    pendingEdges() {
      const result: Key[] = []
      for (const entry of edgeEntries.values()) if (!isVisible(entry)) result.push(entry.key)
      return result
    },

    destroy() {
      nodeSources.destroy()
      edgeSources.destroy()
      nodeEntries.clear()
      edgeEntries.clear()
      incident.clear()
      issues.length = 0
    },
  }
}
