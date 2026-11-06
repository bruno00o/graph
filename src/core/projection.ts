import type {
  AggregateEdge,
  EdgeLabelOptions,
  EdgeMark,
  EdgeOptions,
  Key,
  NodeMark,
} from '../types'
import { isKey, toAccessor } from './accessor'
import { compileNodeMark, type Read } from './compile-mark'
import type { ElementRef, GraphChanges, GraphModel, NodeRecord } from './graph-model'
import { Hierarchy } from './hierarchy'
import { IndexSet } from './index-set'
import type { SceneEdgeRecord, SceneModel, SceneNodeRecord } from './scene'
import type { GraphIssue } from './source-table'

const none = -1
const absent = 0
const direct = 1
const hidden = 2
const merged = 3
const shownOwn = 1
const shownMerged = 2
const shownNode = 1
const shownContainer = 2
const pairStride = 2 ** 26

export interface ProjectionChanges {
  readonly scene: GraphChanges
  readonly revealed: readonly number[]
  readonly fresh: readonly number[]
  readonly concealed: readonly number[]
  readonly folded: readonly number[]
  readonly unfolded: readonly number[]
  readonly edges: readonly number[]
  readonly containers: boolean
}

class Aggregate {
  readonly members: Set<number> = new Set()
  carrier = none
  lead = none
  datum: AggregateEdge | null = null
  record: SceneEdgeRecord | null = null

  constructor(
    readonly mark: EdgeMark<unknown>,
    readonly source: number,
    readonly target: number,
  ) {}

  first(): number {
    for (const member of this.members) return member
    return none
  }
}

const looks = new WeakMap<EdgeMark<unknown>, EdgeMark<unknown>>()

function first(read: Read): (aggregate: AggregateEdge) => unknown {
  return (aggregate) => read(aggregate.data[0])
}

function single(read: Read): (aggregate: AggregateEdge) => unknown {
  return (aggregate) => (aggregate.count === 1 ? read(aggregate.data[0]) : null)
}

function lifted(value: unknown): unknown {
  return typeof value === 'function' ? first(value as Read) : value
}

function liftedLabel(label: EdgeOptions<unknown>['label']): unknown {
  if (label === undefined) return undefined
  if (typeof label !== 'object') return single(toAccessor<unknown, unknown>(label))
  const options = label as EdgeLabelOptions<unknown>
  const text = toAccessor<unknown, unknown>(options.text)
  return {
    text: single(text),
    ...(options.background !== undefined ? { background: lifted(options.background) } : {}),
    ...(options.color !== undefined ? { color: lifted(options.color) } : {}),
    ...(options.size !== undefined ? { size: lifted(options.size) } : {}),
    ...(options.weight !== undefined ? { weight: lifted(options.weight) } : {}),
    ...(options.font !== undefined ? { font: lifted(options.font) } : {}),
    ...(options.maxWidth !== undefined ? { maxWidth: lifted(options.maxWidth) } : {}),
  }
}

export function aggregateLook(mark: EdgeMark<unknown>): EdgeMark<unknown> {
  const cached = looks.get(mark)
  if (cached) return cached
  const options = mark.options
  const fallback: { [name: string]: unknown; color?: unknown; width?: unknown; label?: unknown } =
    {}
  if (options.color !== undefined) fallback.color = first(toAccessor(options.color))
  if (options.width !== undefined) fallback.width = first(toAccessor(options.width))
  for (const name of ['dash', 'arrow', 'stroke', 'opacity', 'flow'] as const) {
    if (options[name] !== undefined) fallback[name] = lifted(options[name])
  }
  if (options.label !== undefined) fallback.label = liftedLabel(options.label)
  const look = Object.freeze({
    type: 'edges',
    name: mark.name,
    data: [],
    options: Object.freeze({
      ...fallback,
      ...options.aggregate,
      source: () => null,
      target: () => null,
    }),
  }) as unknown as EdgeMark<unknown>
  looks.set(mark, look)
  return look
}

function grownIndices(array: Int32Array, length: number): Int32Array {
  if (array.length >= length) return array
  const next = new Int32Array(Math.max(64, array.length * 2, length)).fill(none)
  next.set(array)
  return next
}

function grownBytes(array: Uint8Array, length: number): Uint8Array {
  if (array.length >= length) return array
  const next = new Uint8Array(Math.max(64, array.length * 2, length))
  next.set(array)
  return next
}

interface SceneChanges {
  readonly nodes: { added: ElementRef[]; updated: ElementRef[]; removed: ElementRef[] }
  readonly edges: {
    added: ElementRef[]
    updated: ElementRef[]
    removed: ElementRef[]
    pending: Key[]
  }
  readonly issues: GraphIssue[]
}

function emptyChanges(): SceneChanges {
  return {
    nodes: { added: [], updated: [], removed: [] },
    edges: { added: [], updated: [], removed: [], pending: [] },
    issues: [],
  }
}

export class Projection {
  readonly hierarchy: Hierarchy
  readonly view: SceneModel
  readonly containers: Set<number> = new Set()
  containerVersion = 0
  readonly #model: GraphModel
  #active = false
  #from: Int32Array = new Int32Array(0)
  #to: Int32Array = new Int32Array(0)
  #outNext: Int32Array = new Int32Array(0)
  #outPrevious: Int32Array = new Int32Array(0)
  #inNext: Int32Array = new Int32Array(0)
  #inPrevious: Int32Array = new Int32Array(0)
  #outHead: Int32Array = new Int32Array(0)
  #inHead: Int32Array = new Int32Array(0)
  #mode: Uint8Array = new Uint8Array(0)
  #shownEdge: Uint8Array = new Uint8Array(0)
  #shownNode: Uint8Array = new Uint8Array(0)
  #seen: Uint8Array = new Uint8Array(0)
  readonly #edgeKeys: (Key | undefined)[] = []
  readonly #edgeMarks: (EdgeMark<unknown> | undefined)[] = []
  readonly #aggregateOf: (Aggregate | undefined)[] = []
  readonly #shownAggregate: (Aggregate | undefined)[] = []
  readonly #aggregates = new Map<EdgeMark<unknown>, Map<number, Aggregate>>()
  #touchedEdges: IndexSet = new IndexSet()
  #dataEdges: IndexSet = new IndexSet()
  #dataNodes: IndexSet = new IndexSet()
  #addedNodes: IndexSet = new IndexSet()
  #touchedAggregates = new Set<Aggregate>()
  #foldRoots: number[] = []
  #parentMark: NodeMark<unknown> | null = null
  #parentRead: Read | null = null

  constructor(model: GraphModel) {
    this.#model = model
    this.hierarchy = new Hierarchy((key) => model.node(key)?.index ?? none)
    this.view = this.#createView()
  }

  get active(): boolean {
    return this.#active
  }

  get folded(): ReadonlySet<Key> {
    return this.hierarchy.foldedKeys
  }

  setFolded(keys: Iterable<Key>): void {
    for (const root of this.hierarchy.setFolded(keys)) this.#foldRoots.push(root)
  }

  aggregateAt(index: number): AggregateEdge | null {
    if (!this.#active || this.#shownEdge[index] !== shownMerged) return null
    const aggregate = this.#shownAggregate[index]
    return aggregate ? this.#datum(aggregate) : null
  }

  edgeIndexOf(key: Key): number {
    const index = this.#model.edge(key)?.index ?? none
    if (index < 0 || !this.#active) return index
    if (this.#shownEdge[index] === shownOwn) return index
    if (this.#mode[index] !== merged) return none
    return this.#aggregateOf[index]?.carrier ?? none
  }

  keysAt(index: number): readonly Key[] | null {
    return this.aggregateAt(index)?.keys ?? null
  }

  seen(index: number): boolean {
    return this.#seen[index] === 1
  }

  markSeen(index: number): void {
    if (index < this.#seen.length) this.#seen[index] = 1
  }

  nodeShown(index: number): boolean {
    return !this.#active || (this.#shownNode[index] ?? 0) !== 0
  }

  apply(changes: GraphChanges): ProjectionChanges {
    if (!this.#active) {
      if (!this.#needed(changes)) return this.#passThrough(changes)
      return this.#activate(changes)
    }
    const hierarchy = this.hierarchy
    for (const { index } of changes.edges.removed) this.#unlinkEdge(index)
    for (const { index } of changes.nodes.removed) {
      hierarchy.remove(index)
      this.#seen[index] = 0
    }
    for (const { key, index } of changes.nodes.added) {
      const record = this.#model.nodeAt(index)
      this.#reserveNode(index)
      this.#addedNodes.add(index)
      hierarchy.add(index, key, record ? this.#parentOf(record) : null)
    }
    for (const { index } of changes.nodes.updated) {
      const record = this.#model.nodeAt(index)
      if (record) hierarchy.setParent(index, this.#parentOf(record))
      this.#dataNodes.add(index)
    }
    for (const { index } of changes.edges.added) this.#linkEdge(index)
    for (const { index } of changes.edges.updated) {
      const record = this.#model.edgeAt(index)
      if (!record) continue
      if (
        this.#from[index] !== record.sourceIndex ||
        this.#to[index] !== record.targetIndex ||
        this.#edgeMarks[index] !== record.mark
      ) {
        this.#unlinkEdge(index)
        this.#linkEdge(index)
      }
      this.#dataEdges.add(index)
    }
    return this.#reconcile(changes)
  }

  #needed(changes: GraphChanges): boolean {
    for (const refs of [changes.nodes.added, changes.nodes.updated]) {
      for (const { index } of refs) {
        const record = this.#model.nodeAt(index)
        if (record && this.#parentOf(record) !== null) return true
      }
    }
    return false
  }

  #passThrough(changes: GraphChanges): ProjectionChanges {
    return {
      scene: changes,
      revealed: [],
      fresh: [],
      concealed: [],
      folded: [],
      unfolded: [],
      edges: [],
      containers: false,
    }
  }

  #activate(changes: GraphChanges): ProjectionChanges {
    this.#active = true
    const model = this.#model
    const added = new Set<number>()
    for (const { index } of changes.nodes.added) added.add(index)
    const addedEdges = new Set<number>()
    for (const { index } of changes.edges.added) addedEdges.add(index)
    for (const record of model.nodes()) {
      this.#reserveNode(record.index)
      const fresh = added.has(record.index)
      this.#shownNode[record.index] = fresh ? 0 : shownNode
      this.#seen[record.index] = fresh ? 0 : 1
      if (fresh) this.#addedNodes.add(record.index)
      this.hierarchy.add(record.index, record.key, this.#parentOf(record))
    }
    for (const record of model.edges()) {
      this.#reserveEdge(record.index)
      this.#shownEdge[record.index] = addedEdges.has(record.index) ? 0 : shownOwn
      this.#linkEdge(record.index)
    }
    for (const { index } of changes.nodes.updated) this.#dataNodes.add(index)
    for (const { index } of changes.edges.updated) this.#dataEdges.add(index)
    return this.#reconcile(changes, true)
  }

  #parentOf(record: NodeRecord): Key | null {
    if (record.mark !== this.#parentMark) {
      this.#parentMark = record.mark
      this.#parentRead = compileNodeMark(record.mark).parent
    }
    const value = this.#parentRead?.(record.datum)
    return isKey(value) ? value : null
  }

  #reserveNode(index: number): void {
    const length = index + 1
    this.#outHead = grownIndices(this.#outHead, length)
    this.#inHead = grownIndices(this.#inHead, length)
    this.#shownNode = grownBytes(this.#shownNode, length)
    this.#seen = grownBytes(this.#seen, length)
    this.hierarchy.reserve(index)
  }

  #reserveEdge(index: number): void {
    const length = index + 1
    this.#from = grownIndices(this.#from, length)
    this.#to = grownIndices(this.#to, length)
    this.#outNext = grownIndices(this.#outNext, length)
    this.#outPrevious = grownIndices(this.#outPrevious, length)
    this.#inNext = grownIndices(this.#inNext, length)
    this.#inPrevious = grownIndices(this.#inPrevious, length)
    this.#mode = grownBytes(this.#mode, length)
    this.#shownEdge = grownBytes(this.#shownEdge, length)
  }

  #linkEdge(index: number): void {
    const record = this.#model.edgeAt(index)
    if (!record) return
    this.#reserveEdge(index)
    this.#reserveNode(Math.max(record.sourceIndex, record.targetIndex))
    const from = record.sourceIndex
    const to = record.targetIndex
    this.#from[index] = from
    this.#to[index] = to
    this.#edgeKeys[index] = record.key
    this.#edgeMarks[index] = record.mark
    const outFirst = this.#outHead[from] ?? none
    this.#outPrevious[index] = none
    this.#outNext[index] = outFirst
    if (outFirst >= 0) this.#outPrevious[outFirst] = index
    this.#outHead[from] = index
    const inFirst = this.#inHead[to] ?? none
    this.#inPrevious[index] = none
    this.#inNext[index] = inFirst
    if (inFirst >= 0) this.#inPrevious[inFirst] = index
    this.#inHead[to] = index
    this.#mode[index] = absent
    this.#project(index)
  }

  #unlinkEdge(index: number): void {
    if ((this.#mode[index] ?? absent) === absent) return
    const from = this.#from[index] ?? none
    const to = this.#to[index] ?? none
    const outPrevious = this.#outPrevious[index] ?? none
    const outNext = this.#outNext[index] ?? none
    if (outPrevious >= 0) this.#outNext[outPrevious] = outNext
    else this.#outHead[from] = outNext
    if (outNext >= 0) this.#outPrevious[outNext] = outPrevious
    const inPrevious = this.#inPrevious[index] ?? none
    const inNext = this.#inNext[index] ?? none
    if (inPrevious >= 0) this.#inNext[inPrevious] = inNext
    else this.#inHead[to] = inNext
    if (inNext >= 0) this.#inPrevious[inNext] = inPrevious
    this.#leave(index)
    this.#mode[index] = absent
    this.#touchedEdges.add(index)
  }

  #leave(index: number): void {
    const aggregate = this.#aggregateOf[index]
    if (!aggregate) return
    aggregate.members.delete(index)
    this.#touchedAggregates.add(aggregate)
    this.#aggregateOf[index] = undefined
  }

  #aggregate(mark: EdgeMark<unknown>, source: number, target: number): Aggregate {
    let pairs = this.#aggregates.get(mark)
    if (!pairs) {
      pairs = new Map()
      this.#aggregates.set(mark, pairs)
    }
    const pair = source * pairStride + target
    let aggregate = pairs.get(pair)
    if (!aggregate) {
      aggregate = new Aggregate(mark, source, target)
      pairs.set(pair, aggregate)
    }
    return aggregate
  }

  #project(index: number): void {
    const hierarchy = this.hierarchy
    const from = this.#from[index] ?? none
    const to = this.#to[index] ?? none
    const source = hierarchy.representative(from)
    const target = hierarchy.representative(to)
    const mark = this.#edgeMarks[index]
    let mode: number
    let aggregate: Aggregate | undefined
    if (source === from && target === to) mode = direct
    else if (source === target || !mark) mode = hidden
    else {
      mode = merged
      aggregate = this.#aggregate(mark, source, target)
    }
    const previous = this.#aggregateOf[index]
    if (mode === this.#mode[index] && aggregate === previous) return
    if (previous !== aggregate) {
      this.#leave(index)
      if (aggregate) {
        aggregate.members.add(index)
        this.#touchedAggregates.add(aggregate)
        this.#aggregateOf[index] = aggregate
      }
    }
    this.#mode[index] = mode
    this.#touchedEdges.add(index)
  }

  #reprojectAround(nodes: readonly number[]): void {
    for (const node of nodes) {
      for (let edge = this.#outHead[node] ?? none; edge >= 0; edge = this.#outNext[edge] ?? none)
        this.#project(edge)
      for (let edge = this.#inHead[node] ?? none; edge >= 0; edge = this.#inNext[edge] ?? none)
        this.#project(edge)
    }
  }

  #reconcile(changes: GraphChanges, activating = false): ProjectionChanges {
    const hierarchy = this.hierarchy
    hierarchy.settle()
    this.#reprojectAround(hierarchy.takeMoved())
    const scene = emptyChanges()
    for (const issue of changes.issues) scene.issues.push(issue)
    for (const issue of hierarchy.issues.splice(0)) scene.issues.push(issue)
    const nodes = scene.nodes
    const edges = scene.edges
    if (activating) {
      for (const ref of changes.nodes.removed) nodes.removed.push(ref)
      for (const ref of changes.edges.removed) edges.removed.push(ref)
    }
    for (const key of changes.edges.pending) edges.pending.push(key)
    const revealed: number[] = []
    const fresh: number[] = []
    const concealed: number[] = []
    let containers = false
    const touchedNodes = hierarchy.takeTouched()
    for (const index of this.#dataNodes) touchedNodes.add(index)
    for (const index of touchedNodes.indices()) {
      const key = hierarchy.keys[index]
      if (key === undefined) continue
      const desired = !hierarchy.visible(index)
        ? 0
        : hierarchy.isContainer(index)
          ? shownContainer
          : shownNode
      const shown = this.#shownNode[index] ?? 0
      if (desired !== shown) {
        if (desired === shownContainer) this.containers.add(index)
        else this.containers.delete(index)
        if (desired === shownContainer || shown === shownContainer) containers = true
      }
      if (desired === 0) {
        if (shown !== 0) {
          nodes.removed.push({ key, index })
          if (hierarchy.present[index] === 1) concealed.push(index)
        }
      } else if (shown === 0) {
        nodes.added.push({ key, index })
        if (!this.#addedNodes.has(index)) {
          revealed.push(index)
          if (this.#seen[index] !== 1) fresh.push(index)
        }
        this.#seen[index] = 1
      } else if (desired !== shown || this.#dataNodes.has(index)) {
        nodes.updated.push({ key, index })
      }
      this.#shownNode[index] = desired
    }
    for (const index of this.#dataEdges.indices()) {
      if (this.#mode[index] === merged) {
        const aggregate = this.#aggregateOf[index]
        if (aggregate) this.#touchedAggregates.add(aggregate)
      } else {
        this.#touchedEdges.add(index)
      }
    }
    const touched = this.#touchedEdges
    for (const aggregate of this.#touchedAggregates) {
      aggregate.datum = null
      aggregate.record = null
      if (aggregate.carrier >= 0) touched.add(aggregate.carrier)
      const carrier = aggregate.first()
      aggregate.lead = carrier
      if (carrier >= 0) touched.add(carrier)
      else {
        aggregate.carrier = none
        this.#aggregates
          .get(aggregate.mark)
          ?.delete(aggregate.source * pairStride + aggregate.target)
      }
    }
    const display: number[] = []
    for (const index of touched.indices()) {
      const mode = this.#mode[index] ?? absent
      const aggregate = mode === merged ? this.#aggregateOf[index] : undefined
      const desired =
        mode === direct ? shownOwn : aggregate && aggregate.lead === index ? shownMerged : 0
      const shown = this.#shownEdge[index] ?? 0
      const before = this.#shownAggregate[index]
      const key = this.#edgeKeys[index]
      if (key === undefined) continue
      if (desired === 0) {
        if (shown !== 0) {
          edges.removed.push({ key, index })
          display.push(index)
        }
      } else if (shown === 0) {
        edges.added.push({ key, index })
        display.push(index)
      } else if (desired !== shown || before !== aggregate) {
        edges.updated.push({ key, index })
        display.push(index)
      } else if (
        (aggregate && this.#touchedAggregates.has(aggregate)) ||
        this.#dataEdges.has(index)
      ) {
        edges.updated.push({ key, index })
      }
      if (aggregate && desired === shownMerged) aggregate.carrier = index
      this.#shownEdge[index] = desired
      this.#shownAggregate[index] = desired === shownMerged ? aggregate : undefined
    }
    const folded: number[] = []
    const unfolded: number[] = []
    for (const root of this.#foldRoots) {
      if (!hierarchy.visible(root)) continue
      if (hierarchy.folded[root] === 1) folded.push(root)
      else unfolded.push(root)
    }
    if (containers) this.containerVersion++
    this.#foldRoots = []
    this.#touchedEdges = new IndexSet()
    this.#dataEdges = new IndexSet()
    this.#dataNodes = new IndexSet()
    this.#addedNodes = new IndexSet()
    this.#touchedAggregates = new Set()
    return {
      scene,
      revealed,
      fresh,
      concealed,
      folded,
      unfolded,
      edges: display,
      containers,
    }
  }

  #datum(aggregate: Aggregate): AggregateEdge {
    if (aggregate.datum) return aggregate.datum
    const keys: Key[] = []
    const data: unknown[] = []
    for (const member of aggregate.members) {
      const key = this.#edgeKeys[member]
      if (key === undefined) continue
      keys.push(key)
      data.push(this.#model.edgeAt(member)?.datum)
    }
    const hierarchy = this.hierarchy
    const datum: AggregateEdge = Object.freeze({
      source: hierarchy.keys[aggregate.source] as Key,
      target: hierarchy.keys[aggregate.target] as Key,
      count: keys.length,
      keys: Object.freeze(keys),
      data: Object.freeze(data),
    })
    aggregate.datum = datum
    return datum
  }

  #edgeRecord(aggregate: Aggregate): SceneEdgeRecord | undefined {
    if (aggregate.record) return aggregate.record
    const key = this.#edgeKeys[aggregate.carrier]
    if (key === undefined) return undefined
    const datum = this.#datum(aggregate)
    const record: SceneEdgeRecord = {
      key,
      index: aggregate.carrier,
      datum,
      mark: aggregate.mark,
      look: aggregateLook(aggregate.mark),
      source: datum.source,
      target: datum.target,
      sourceIndex: aggregate.source,
      targetIndex: aggregate.target,
    }
    aggregate.record = record
    return record
  }

  #nodeRecord(record: NodeRecord): SceneNodeRecord | undefined {
    const shown = this.#shownNode[record.index] ?? 0
    if (shown === 0) return undefined
    if (shown !== shownContainer) return record
    return {
      key: record.key,
      index: record.index,
      datum: record.datum,
      mark: record.mark,
      container: true,
    }
  }

  #createView(): SceneModel {
    const model = this.#model
    const edgeAt = (index: number): SceneEdgeRecord | undefined => {
      if (!this.#active) return model.edgeAt(index)
      const shown = this.#shownEdge[index] ?? 0
      if (shown === shownOwn) return model.edgeAt(index)
      const aggregate = shown === shownMerged ? this.#shownAggregate[index] : undefined
      return aggregate ? this.#edgeRecord(aggregate) : undefined
    }
    const nodeAt = (index: number): SceneNodeRecord | undefined => {
      const record = model.nodeAt(index)
      if (!this.#active || !record) return record
      return this.#nodeRecord(record)
    }
    const projection = this
    return {
      nodeAt,
      edgeAt,
      *nodes() {
        for (const record of model.nodes()) {
          const shown = projection.#active ? projection.#nodeRecord(record) : record
          if (shown) yield shown
        }
      },
      *edges() {
        for (const record of model.edges()) {
          const shown = projection.#active ? edgeAt(record.index) : record
          if (shown) yield shown
        }
      },
    }
  }
}
