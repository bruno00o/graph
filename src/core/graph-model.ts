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

interface NodeEntry {
  readonly key: Key
  readonly index: number
  datum: unknown
  mark: NodeMark<unknown>
  slot: number
  incident: EdgeEntry | null
}

interface EdgeEntry {
  readonly key: Key
  index: number
  datum: unknown
  mark: EdgeMark<unknown>
  slot: number
  source: Key | null
  target: Key | null
  sourceIndex: number
  targetIndex: number
  sourceNext: EdgeEntry | null
  sourcePrev: EdgeEntry | null
  targetNext: EdgeEntry | null
  targetPrev: EdgeEntry | null
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

function nextAt(entry: EdgeEntry, key: Key): EdgeEntry | null {
  return entry.source === key ? entry.sourceNext : entry.targetNext
}

function previousAt(entry: EdgeEntry, key: Key): EdgeEntry | null {
  return entry.source === key ? entry.sourcePrev : entry.targetPrev
}

function setNextAt(entry: EdgeEntry, key: Key, next: EdgeEntry | null): void {
  if (entry.source === key) entry.sourceNext = next
  else entry.targetNext = next
}

function setPreviousAt(entry: EdgeEntry, key: Key, previous: EdgeEntry | null): void {
  if (entry.source === key) entry.sourcePrev = previous
  else entry.targetPrev = previous
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
  const orphans = new Map<Key, EdgeEntry>()
  const nodesByIndex: (NodeEntry | undefined)[] = []
  const edgesByIndex: (EdgeEntry | undefined)[] = []
  const nodePool = new IndexPool()
  const edgePool = new IndexPool()

  function nodeOf(key: Key | null): NodeEntry | undefined {
    return key === null ? undefined : nodeEntries.get(key)
  }

  function headOf(key: Key, node: NodeEntry | undefined): EdgeEntry | null {
    return node ? node.incident : (orphans.get(key) ?? null)
  }

  function setHead(key: Key, node: NodeEntry | undefined, head: EdgeEntry | null): void {
    if (node) node.incident = head
    else if (head) orphans.set(key, head)
    else orphans.delete(key)
  }

  function attach(key: Key, node: NodeEntry | undefined, entry: EdgeEntry): void {
    setNextAt(entry, key, null)
    const head = headOf(key, node)
    if (head === null) {
      setPreviousAt(entry, key, entry)
      setHead(key, node, entry)
      return
    }
    const tail = previousAt(head, key) ?? head
    setNextAt(tail, key, entry)
    setPreviousAt(entry, key, tail)
    setPreviousAt(head, key, entry)
  }

  function detach(key: Key, entry: EdgeEntry): void {
    const node = nodeEntries.get(key)
    const head = headOf(key, node)
    const next = nextAt(entry, key)
    const previous = previousAt(entry, key)
    if (head === entry) {
      if (next !== null) setPreviousAt(next, key, previous)
      setHead(key, node, next)
    } else if (previous !== null && head !== null) {
      setNextAt(previous, key, next)
      setPreviousAt(next ?? head, key, previous)
    }
    setNextAt(entry, key, null)
    setPreviousAt(entry, key, null)
  }

  function link(entry: EdgeEntry, from: NodeEntry | undefined, to: NodeEntry | undefined): void {
    if (entry.source !== null) attach(entry.source, from, entry)
    if (entry.target !== null && entry.target !== entry.source) attach(entry.target, to, entry)
  }

  function unlink(entry: EdgeEntry): void {
    if (entry.source !== null) detach(entry.source, entry)
    if (entry.target !== null && entry.target !== entry.source) detach(entry.target, entry)
  }

  function visibleIncident(key: Key): VisibleEdge[] {
    const result: VisibleEdge[] = []
    let entry = headOf(key, nodeEntries.get(key))
    for (; entry !== null; entry = nextAt(entry, key)) if (isVisible(entry)) result.push(entry)
    return result
  }

  function flushNodes(changes: MutableChanges, touched: Set<Key>, freed: number[]): void {
    remark(nodeSources.remarked, nodeEntries)
    const touch = (key: Key, head: EdgeEntry | null) => {
      for (let entry = head; entry !== null; entry = nextAt(entry, key)) touched.add(entry.key)
    }
    const known = nodeEntries.size > 0
    nodeSources.forEachDirty((key, forced, source, datum) => {
      const entry = known ? nodeEntries.get(key) : undefined
      if (!source) {
        if (entry) {
          nodeEntries.delete(key)
          nodesByIndex[entry.index] = undefined
          changes.removed.push({ key, index: entry.index })
          freed.push(entry.index)
          touch(key, entry.incident)
          if (entry.incident) orphans.set(key, entry.incident)
          entry.incident = null
        }
        return
      }
      const { mark, slot } = source
      if (!entry) {
        const index = nodePool.acquire()
        const incident = orphans.size > 0 ? (orphans.get(key) ?? null) : null
        if (incident) orphans.delete(key)
        const created: NodeEntry = { key, index, datum, mark, slot, incident }
        nodeEntries.set(key, created)
        nodesByIndex[index] = created
        changes.added.push({ key, index })
        touch(key, incident)
        return
      }
      if (forced || entry.datum !== datum || entry.slot !== slot) {
        changes.updated.push({ key, index: entry.index })
      }
      entry.datum = datum
      entry.mark = mark
      entry.slot = slot
    })
    nodeSources.clearDirty()
  }

  function flushEdges(
    changes: MutableChanges & { readonly pending: Key[] },
    touched: Set<Key>,
    freed: number[],
  ): void {
    remark(edgeSources.remarked, edgeEntries)
    let readMark: EdgeMark<unknown> | null = null
    let readSource: (datum: unknown) => unknown = () => undefined
    let readTarget: (datum: unknown) => unknown = () => undefined
    const known = edgeEntries.size > 0
    let lastSource: Key | null = null
    let lastSourceNode: NodeEntry | undefined
    let lastTarget: Key | null = null
    let lastTargetNode: NodeEntry | undefined
    const sourceNode = (key: Key | null): NodeEntry | undefined => {
      if (key !== lastSource) {
        lastSource = key
        lastSourceNode = nodeOf(key)
      }
      return lastSourceNode
    }
    const targetNode = (key: Key | null): NodeEntry | undefined => {
      if (key !== lastTarget) {
        lastTarget = key
        lastTargetNode = nodeOf(key)
      }
      return lastTargetNode
    }
    const visit = (
      key: Key,
      forced: boolean | undefined,
      owner: Source<EdgeMark<unknown>> | undefined,
      datum: unknown,
    ): void => {
      let entry = known ? edgeEntries.get(key) : undefined
      const wasVisible = entry !== undefined && isVisible(entry)
      const wasPending = entry !== undefined && !wasVisible
      let changed = false
      let resolved = false
      let from: NodeEntry | undefined
      let to: NodeEntry | undefined
      if (forced !== undefined) {
        if (!owner) {
          if (entry) {
            unlink(entry)
            edgeEntries.delete(key)
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
        if (!entry) {
          from = sourceNode(source)
          to = targetNode(target)
          resolved = true
          entry = {
            key,
            index: -1,
            datum,
            mark,
            slot,
            source,
            target,
            sourceIndex: -1,
            targetIndex: -1,
            sourceNext: null,
            sourcePrev: null,
            targetNext: null,
            targetPrev: null,
          }
          edgeEntries.set(key, entry)
          link(entry, from, to)
        } else {
          const moved = entry.source !== source || entry.target !== target
          changed = moved || forced || entry.datum !== datum
          changed ||= entry.slot !== slot
          if (moved) {
            unlink(entry)
            entry.source = source
            entry.target = target
            from = sourceNode(source)
            to = targetNode(target)
            resolved = true
            link(entry, from, to)
          }
          entry.datum = datum
          entry.mark = mark
          entry.slot = slot
        }
      }
      if (!entry) return
      if (!resolved) {
        from = sourceNode(entry.source)
        to = targetNode(entry.target)
      }
      const visible = from !== undefined && to !== undefined
      if (from !== undefined && to !== undefined) {
        entry.sourceIndex = from.index
        entry.targetIndex = to.index
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
    edgeSources.forEachDirty(visit)
    for (const key of touched) {
      if (!edgeSources.isDirty(key)) visit(key, undefined, undefined, undefined)
    }
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

    nodeAt(index) {
      return nodesByIndex[index]
    },

    edgeAt(index) {
      const entry = edgesByIndex[index]
      return entry && isVisible(entry) ? entry : undefined
    },

    get nodeCount() {
      return nodeEntries.size
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
      orphans.clear()
      nodesByIndex.length = 0
      edgesByIndex.length = 0
      issues.length = 0
    },
  }
}
