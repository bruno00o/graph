import type {
  AggregateDirection,
  AggregateEdge,
  EdgeArrow,
  EdgeEnd,
  EdgeEndOptions,
  EdgeEndsOptions,
  EdgeLabelOptions,
  EdgeMark,
  EdgeMergeOptions,
  EdgeOptions,
  Key,
  Mark,
  NodeMark,
} from '../types'
import { isKey, toAccessor } from './accessor'
import { compileNodeMark, type Read } from './compile-mark'
import { EdgeMerges } from './edge-merges'
import type { ElementRef, GraphChanges, GraphModel, NodeRecord } from './graph-model'
import { type Grouping, groupingOf } from './group-index'
import { Hierarchy } from './hierarchy'
import { IndexSet } from './index-set'
import { raw, rawRead } from './raw'
import { sameOptions } from './same-options'
import type { SceneEdgeRecord, SceneModel, SceneNodeRecord } from './scene'
import { readSpan } from './time-range'
import { withoutUndefined } from './without-undefined'

const none = -1
const absent = 0
const direct = 1
const hidden = 2
const merged = 3
const shownOwn = 1
const shownMerged = 2
const shownNode = 1
const shownContainer = 2
const defaultMin = 2

export interface ProjectionChanges {
  readonly scene: GraphChanges
  readonly revealed: readonly number[]
  readonly fresh: readonly number[]
  readonly concealed: readonly number[]
  readonly folded: readonly number[]
  readonly unfolded: readonly number[]
  readonly edges: readonly number[]
  readonly containers: boolean
  readonly reshaped: boolean
}

interface MergeRule {
  readonly by: Read | null
  readonly channel: unknown
  readonly directed: boolean
  readonly halves: boolean
  readonly min: number
}

function ruleOf(option: boolean | EdgeMergeOptions<unknown> | undefined): MergeRule | null {
  if (!option) return null
  const given = option === true ? {} : option
  const min = given.min ?? defaultMin
  return {
    by: given.by === undefined ? null : toAccessor<unknown, unknown>(given.by),
    channel: given.by,
    directed: given.directed !== false,
    halves: given.directed === false && given.halves === true,
    min: Number.isFinite(min) ? Math.max(1, Math.floor(min)) : defaultMin,
  }
}

function sameRule(a: MergeRule | null | undefined, b: MergeRule | null | undefined): boolean {
  if (!a || !b) return !a === !b
  return (
    Object.is(a.channel, b.channel) &&
    a.directed === b.directed &&
    a.halves === b.halves &&
    a.min === b.min
  )
}

function sameLook(a: object | undefined, b: object | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && sameOptions(a, b))
}

function isEdgeMark(mark: Mark): mark is EdgeMark<unknown> {
  return mark.type === 'edges'
}

function groupingsOf(marks: readonly Mark[]): Grouping[] {
  const found: Grouping[] = []
  for (const mark of marks) {
    const grouping = mark.type === 'nodes' ? groupingOf(mark) : undefined
    if (grouping && !found.some((known) => known.index === grouping.index)) found.push(grouping)
  }
  return found
}

const looks = new WeakMap<EdgeMark<unknown>, EdgeMark<unknown>>()

function first(read: Read): (aggregate: AggregateEdge) => unknown {
  return (aggregate) => read(aggregate.data[0])
}

function single(read: Read): (aggregate: AggregateEdge) => unknown {
  return (aggregate) => (aggregate.count === 1 ? read(aggregate.data[0]) : null)
}

function spanning(read: Read): (aggregate: AggregateEdge) => unknown {
  return (aggregate) => {
    let start = Number.POSITIVE_INFINITY
    let end = Number.NEGATIVE_INFINITY
    for (const datum of aggregate.data) {
      const span = readSpan(read(datum))
      if (!span) return null
      start = Math.min(start, span[0])
      end = Math.max(end, span[1])
    }
    if (start > end) return null
    return {
      start: start === Number.NEGATIVE_INFINITY ? null : start,
      end: end === Number.POSITIVE_INFINITY ? null : end,
    }
  }
}

function lifted(value: unknown): unknown {
  return typeof value === 'function' ? first(value as Read) : value
}

const reversed: Readonly<Record<EdgeArrow, EdgeArrow>> = {
  none: 'none',
  source: 'target',
  target: 'source',
  both: 'both',
}

function joinedArrows(a: unknown, b: unknown): unknown {
  if (b === 'none' || b === a) return a
  if (a === 'none') return b
  return 'both'
}

function arrows(style: unknown): (aggregate: AggregateEdge) => unknown {
  const read: Read = typeof style === 'function' ? (style as Read) : () => style
  return ({ forward, backward }) => {
    const ahead = forward.count > 0 ? read(forward.data[0]) : 'none'
    if (backward.count === 0) return ahead
    const back = read(backward.data[0])
    return joinedArrows(ahead, reversed[back as EdgeArrow] ?? back)
  }
}

function liftedChannel(channel: unknown): unknown {
  if (channel === undefined || typeof channel === 'number') return channel
  const own = rawRead(channel)
  return own ? raw(first(own)) : first(toAccessor(channel as string | Read))
}

function liftedLabel(label: EdgeOptions<unknown>['label']): unknown {
  if (label === undefined) return undefined
  if (typeof label !== 'object') return single(toAccessor<unknown, unknown>(label))
  const options = label as EdgeLabelOptions<unknown>
  const text = toAccessor<unknown, unknown>(options.text)
  return {
    text: single(text),
    background: lifted(options.background),
    color: lifted(options.color),
    size: lifted(options.size),
    weight: lifted(options.weight),
    font: lifted(options.font),
    maxWidth: lifted(options.maxWidth),
  }
}

function liftedEnd(end: EdgeEndOptions<unknown> | undefined): unknown {
  if (!end) return undefined
  return {
    color: liftedChannel(end.color),
    width: liftedChannel(end.width),
    stroke: lifted(end.stroke),
    dash: lifted(end.dash),
    label: liftedLabel(end.label),
  }
}

function liftedEnds(ends: EdgeEndsOptions<unknown>): unknown {
  return {
    split: lifted(ends.split),
    source: liftedEnd(ends.source),
    target: liftedEnd(ends.target),
  }
}

export function aggregateLook(mark: EdgeMark<unknown>): EdgeMark<unknown> {
  const cached = looks.get(mark)
  if (cached) return cached
  const options = mark.options
  const fallback: {
    [name: string]: unknown
    color?: unknown
    width?: unknown
    arrow?: unknown
    label?: unknown
    time?: unknown
    waypoints?: unknown
    ends?: unknown
  } = {}
  if (options.color !== undefined) fallback.color = liftedChannel(options.color)
  if (options.width !== undefined) fallback.width = liftedChannel(options.width)
  if (options.arrow !== undefined) fallback.arrow = arrows(options.arrow)
  for (const name of ['dash', 'stroke', 'opacity', 'flow', 'minZoom', 'maxZoom'] as const) {
    if (options[name] !== undefined) fallback[name] = lifted(options[name])
  }
  if (options.time !== undefined) fallback.time = spanning(toAccessor(options.time))
  if (options.waypoints !== undefined) fallback.waypoints = first(toAccessor(options.waypoints))
  if (options.label !== undefined) fallback.label = liftedLabel(options.label)
  if (options.ends !== undefined) fallback.ends = liftedEnds(options.ends)
  const look = Object.freeze({
    type: 'edges',
    name: mark.name,
    layer: mark.layer,
    data: [],
    options: Object.freeze({
      ...fallback,
      ...(options.aggregate && withoutUndefined(options.aggregate)),
      source: () => null,
      target: () => null,
    }),
  }) as unknown as EdgeMark<unknown>
  looks.set(mark, look)
  return look
}

const noEdges: AggregateDirection = Object.freeze({
  count: 0,
  keys: Object.freeze([]),
  data: Object.freeze([]),
})

interface Members {
  readonly keys: Key[]
  readonly data: unknown[]
}

function members(): Members {
  return { keys: [], data: [] }
}

function direction({ keys, data }: Members): AggregateDirection {
  if (keys.length === 0) return noEdges
  return Object.freeze({ count: keys.length, keys: Object.freeze(keys), data: Object.freeze(data) })
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
}

function emptyChanges(): SceneChanges {
  return {
    nodes: { added: [], updated: [], removed: [] },
    edges: { added: [], updated: [], removed: [], pending: [] },
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
  #unitsMark: NodeMark<unknown> | null = null
  #unitsFollow = false
  #edgeSlot: Int32Array = new Int32Array(0)
  #shownAggregate: Int32Array = new Int32Array(0)
  readonly #edgeKeys: (Key | undefined)[] = []
  readonly #merges = new EdgeMerges()
  readonly #records: (SceneEdgeRecord | undefined)[] = []
  readonly #data: (AggregateEdge | undefined)[] = []
  #slots = new Map<EdgeMark<unknown>, number>()
  #rules: (MergeRule | null)[] = []
  #looks: (object | undefined)[] = []
  #lifts: boolean[] = []
  #lifting = false
  #endSource = none
  #endTarget = none
  #merging = false
  readonly #remerge = new Set<number>()
  readonly #relift = new Set<number>()
  readonly #restyle = new Set<number>()
  #touchedEdges: IndexSet = new IndexSet()
  #dataEdges: IndexSet = new IndexSet()
  #dataNodes: IndexSet = new IndexSet()
  #addedNodes: IndexSet = new IndexSet()
  #touchedAggregates: IndexSet = new IndexSet()
  #reshaped = false
  #foldRoots: number[] = []
  #parentMark: NodeMark<unknown> | null = null
  #parentRead: Read | null = null
  #groupings: Grouping[] = []
  readonly #regrouped = new Set<Key>()

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

  get grouping(): boolean {
    return this.#groupings.length > 0
  }

  setMarks(marks: readonly Mark[]): void {
    this.#setGroupings(groupingsOf(marks))
    const edgeMarks = marks.filter(isEdgeMark)
    const slots = new Map<EdgeMark<unknown>, number>()
    const rules: (MergeRule | null)[] = []
    const looks: (object | undefined)[] = []
    const lifts: boolean[] = []
    let merging = false
    let lifting = false
    edgeMarks.forEach((mark, slot) => {
      if (!slots.has(mark)) slots.set(mark, slot)
      const known = this.#rules[slot]
      const given = ruleOf(mark.options.merge)
      const rule = known !== undefined && sameRule(given, known) ? known : given
      rules.push(rule)
      if (rule) merging = true
      looks.push(mark.options.aggregate)
      const lift = mark.options.betweenGroups === 'groups'
      lifts.push(lift)
      if (lift) lifting = true
      if (lift !== (this.#lifts[slot] ?? false)) this.#relift.add(slot)
      if (!sameRule(rule, known)) this.#remerge.add(slot)
      if (rule?.min !== known?.min) this.#restyle.add(slot)
      if (!sameLook(mark.options.aggregate, this.#looks[slot])) this.#restyle.add(slot)
    })
    for (let slot = edgeMarks.length; slot < this.#rules.length; slot++) {
      this.#remerge.add(slot)
      this.#relift.delete(slot)
    }
    this.#slots = slots
    this.#rules = rules
    this.#looks = looks
    this.#lifts = lifts
    this.#lifting = lifting
    this.#merging = merging
    this.#records.length = 0
  }

  #setGroupings(next: Grouping[]): void {
    const previous = this.#groupings
    const changed = (list: Grouping[], other: Grouping[]) =>
      list.filter((grouping) => !other.some((known) => known.index === grouping.index))
    const gone = changed(previous, next)
    const come = changed(next, previous)
    if (gone.length === 0 && come.length === 0) return
    this.#reshaped = true
    for (const { index } of [...gone, ...come]) {
      index.takeMoved()
      for (const key of index.members()) {
        if (index.groupOf(key) !== undefined) this.#regrouped.add(key)
      }
    }
    this.#groupings = next
  }

  #regroup(): void {
    for (const { index } of this.#groupings) {
      for (const key of index.takeMoved()) this.#regrouped.add(key)
    }
    if (this.#regrouped.size === 0) return
    const hierarchy = this.hierarchy
    for (const key of this.#regrouped) {
      const record = this.#model.node(key)
      if (record) hierarchy.setParent(record.index, this.#parentOf(record))
    }
    this.#regrouped.clear()
  }

  setFolded(keys: Iterable<Key>): void {
    for (const root of this.hierarchy.setFolded(keys)) this.#foldRoots.push(root)
  }

  aggregateAt(index: number): AggregateEdge | null {
    if (!this.#active || this.#shownEdge[index] !== shownMerged) return null
    const aggregate = this.#shownAggregate[index] ?? none
    return aggregate >= 0 ? this.#datum(aggregate) : null
  }

  edgeIndexOf(key: Key): number {
    const index = this.#model.edge(key)?.index ?? none
    if (index < 0 || !this.#active) return index
    if (this.#shownEdge[index] === shownOwn) return index
    if (this.#mode[index] !== merged) return none
    const aggregate = this.#merges.of[index] ?? none
    return aggregate >= 0 ? (this.#merges.carrier[aggregate] ?? none) : none
  }

  keysAt(index: number, end?: EdgeEnd): readonly Key[] | null {
    const aggregate = this.aggregateAt(index)
    if (!aggregate) return null
    if (end === undefined || !this.halvedAt(index)) return aggregate.keys
    return (end === 'target' ? aggregate.forward : aggregate.backward).keys
  }

  halvedAt(index: number): boolean {
    if (!this.#active || this.#shownEdge[index] !== shownMerged) return false
    const aggregate = this.#shownAggregate[index] ?? none
    return aggregate >= 0 && this.#halved(aggregate)
  }

  #halved(aggregate: number): boolean {
    if (this.#rules[this.#merges.slot[aggregate] ?? none]?.halves !== true) return false
    const datum = this.#datum(aggregate)
    return datum.forward.count > 0 && datum.backward.count > 0
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
      if (!this.#merging && !this.#needed(changes)) {
        this.#remerge.clear()
        this.#relift.clear()
        this.#restyle.clear()
        return this.#passThrough(changes)
      }
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
    this.#regroup()
    for (const { index } of changes.edges.added) this.#linkEdge(index)
    for (const { index } of changes.edges.updated) {
      const record = this.#model.edgeAt(index)
      if (!record) continue
      if (
        this.#from[index] !== record.sourceIndex ||
        this.#to[index] !== record.targetIndex ||
        this.#edgeSlot[index] !== this.#slotOf(record.mark)
      ) {
        this.#unlinkEdge(index)
        this.#linkEdge(index)
      } else if (this.#rules[this.#edgeSlot[index] ?? none]?.by) {
        this.#project(index)
      }
      this.#dataEdges.add(index)
    }
    this.#refreshRules()
    return this.#reconcile(changes)
  }

  #needed(changes: GraphChanges): boolean {
    if (this.#groupings.length > 0) return true
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
      reshaped: false,
    }
  }

  #activate(changes: GraphChanges): ProjectionChanges {
    this.#active = true
    this.#remerge.clear()
    this.#relift.clear()
    this.#restyle.clear()
    this.#regrouped.clear()
    for (const { index } of this.#groupings) index.takeMoved()
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
    this.hierarchy.takeRelinked()
    for (const record of model.edges()) {
      this.#reserveEdge(record.index)
      this.#shownEdge[record.index] = addedEdges.has(record.index) ? 0 : shownOwn
      this.#linkEdge(record.index)
    }
    for (const { index } of changes.nodes.updated) this.#dataNodes.add(index)
    for (const { index } of changes.edges.updated) this.#dataEdges.add(index)
    return this.#reconcile(changes, true)
  }

  #refreshRules(): void {
    const remerge = this.#remerge
    const relift = this.#relift
    const restyle = this.#restyle
    if (remerge.size === 0 && relift.size === 0 && restyle.size === 0) return
    if (remerge.size > 0 || relift.size > 0) {
      for (const record of this.#model.edges()) {
        const index = record.index
        const slot = this.#edgeSlot[index] ?? none
        const merged = remerge.has(slot)
        if ((merged || relift.has(slot)) && this.#project(index) && merged) this.#reshaped = true
      }
    }
    const merges = this.#merges
    if (restyle.size > 0) {
      merges.forEach((id) => {
        if (restyle.has(merges.slot[id] ?? none)) this.#touchedAggregates.add(id)
      })
    }
    remerge.clear()
    relift.clear()
    restyle.clear()
  }

  #slotOf(mark: EdgeMark<unknown>): number {
    const known = this.#slots.get(mark)
    if (known !== undefined) return known
    const slot = this.#rules.length
    this.#slots.set(mark, slot)
    const rule = ruleOf(mark.options.merge)
    this.#rules.push(rule)
    this.#looks.push(mark.options.aggregate)
    const lift = mark.options.betweenGroups === 'groups'
    this.#lifts.push(lift)
    if (lift) this.#lifting = true
    if (rule) this.#merging = true
    return slot
  }

  #parentOf(record: NodeRecord): Key | null {
    for (const { index } of this.#groupings) {
      const group = index.groupOf(record.key)
      if (group !== undefined) return group
    }
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
    this.#edgeSlot = grownIndices(this.#edgeSlot, length)
    this.#shownAggregate = grownIndices(this.#shownAggregate, length)
    this.#mode = grownBytes(this.#mode, length)
    this.#shownEdge = grownBytes(this.#shownEdge, length)
    this.#merges.reserveEdges(length)
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
    this.#edgeSlot[index] = this.#slotOf(record.mark)
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
    const left = this.#merges.leave(index)
    if (left >= 0) this.#touchedAggregates.add(left)
    this.#mode[index] = absent
    this.#touchedEdges.add(index)
  }

  #valueOf(index: number, read: Read): Key | undefined {
    const value = read(this.#model.edgeAt(index)?.datum)
    return isKey(value) ? value : undefined
  }

  #endsOf(index: number): void {
    const hierarchy = this.hierarchy
    const source = hierarchy.representative(this.#from[index] ?? none)
    const target = hierarchy.representative(this.#to[index] ?? none)
    if (source !== target && this.#lifts[this.#edgeSlot[index] ?? none] === true) {
      this.#lift(source, target)
    } else {
      this.#endSource = source
      this.#endTarget = target
    }
  }

  #lift(source: number, target: number): void {
    const parent = this.hierarchy.parent
    let sourceDepth = 0
    for (let at = parent[source] ?? none; at >= 0; at = parent[at] ?? none) sourceDepth++
    let targetDepth = 0
    for (let at = parent[target] ?? none; at >= 0; at = parent[at] ?? none) targetDepth++
    let a = source
    let b = target
    for (; sourceDepth > targetDepth; sourceDepth--) a = parent[a] ?? none
    for (; targetDepth > sourceDepth; targetDepth--) b = parent[b] ?? none
    while (a !== b) {
      a = parent[a] ?? none
      b = parent[b] ?? none
    }
    this.#endSource = this.#childToward(source, a)
    this.#endTarget = this.#childToward(target, a)
  }

  #childToward(node: number, ancestor: number): number {
    const parent = this.hierarchy.parent
    let at = node
    while (at !== ancestor) {
      const up = parent[at] ?? none
      if (up === ancestor) return at
      at = up
    }
    return at
  }

  #project(index: number): boolean {
    const merges = this.#merges
    const from = this.#from[index] ?? none
    const to = this.#to[index] ?? none
    this.#endsOf(index)
    const source = this.#endSource
    const target = this.#endTarget
    const slot = this.#edgeSlot[index] ?? none
    const rule = slot >= 0 ? (this.#rules[slot] ?? null) : null
    const shown = source === from && target === to
    let mode = hidden
    let aggregate = none
    if (slot < 0 || (!shown && source === target)) mode = hidden
    else if (shown && !rule) mode = direct
    else {
      mode = merged
      const value = rule?.by ? this.#valueOf(index, rule.by) : undefined
      aggregate = merges.find(
        slot,
        source,
        target,
        rule?.directed ?? true,
        value,
        this.#lifts[slot] === true,
      )
    }
    const previous = merges.of[index] ?? none
    if (previous !== aggregate) {
      if (previous >= 0) {
        merges.leave(index)
        this.#touchedAggregates.add(previous)
      }
      if (aggregate >= 0) {
        merges.join(aggregate, index, shown, this.#model.edgeAt(index)?.order ?? 0)
        this.#touchedAggregates.add(aggregate)
      }
    } else if (aggregate >= 0 && merges.wasShown(index) !== shown) {
      merges.setShown(index, shown)
      this.#touchedAggregates.add(aggregate)
    } else if (mode === this.#mode[index]) {
      return false
    }
    this.#mode[index] = mode
    this.#touchedEdges.add(index)
    return true
  }

  #reprojectBelow(nodes: readonly number[]): void {
    const hierarchy = this.hierarchy
    const visited = new IndexSet()
    const stack: number[] = []
    for (const node of nodes) {
      if (node < 0 || visited.has(node)) continue
      visited.add(node)
      stack.push(node)
      while (stack.length > 0) {
        const at = stack.pop() ?? none
        this.#reliftAt(at)
        for (
          let child = hierarchy.firstChild[at] ?? none;
          child >= 0;
          child = hierarchy.nextSibling[child] ?? none
        ) {
          if (visited.has(child)) continue
          visited.add(child)
          stack.push(child)
        }
      }
    }
  }

  #reliftAt(node: number): void {
    const lifts = this.#lifts
    const slots = this.#edgeSlot
    for (let edge = this.#outHead[node] ?? none; edge >= 0; edge = this.#outNext[edge] ?? none) {
      if (lifts[slots[edge] ?? none] === true) this.#project(edge)
    }
    for (let edge = this.#inHead[node] ?? none; edge >= 0; edge = this.#inNext[edge] ?? none) {
      if (lifts[slots[edge] ?? none] === true) this.#project(edge)
    }
  }

  #reprojectAround(nodes: readonly number[]): void {
    for (const node of nodes) {
      for (let edge = this.#outHead[node] ?? none; edge >= 0; edge = this.#outNext[edge] ?? none)
        this.#project(edge)
      for (let edge = this.#inHead[node] ?? none; edge >= 0; edge = this.#inNext[edge] ?? none)
        this.#project(edge)
    }
  }

  #isOpen(aggregate: number): boolean {
    const merges = this.#merges
    const min = this.#rules[merges.slot[aggregate] ?? none]?.min ?? 1
    return (merges.folded[aggregate] ?? 0) === 0 && (merges.count[aggregate] ?? 0) < min
  }

  #reconcile(changes: GraphChanges, activating = false): ProjectionChanges {
    const hierarchy = this.hierarchy
    hierarchy.settle()
    this.#reprojectAround(hierarchy.takeMoved())
    const relinked = hierarchy.takeRelinked()
    if (this.#lifting && relinked.length > 0) this.#reprojectBelow(relinked)
    const scene = emptyChanges()
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
    const leaders: number[] = []
    for (const index of this.#dataNodes) {
      touchedNodes.add(index)
      const parent = hierarchy.parent[index] ?? none
      if (parent >= 0 && hierarchy.firstChild[parent] === index) leaders.push(parent)
    }
    for (const parent of leaders) {
      const record = this.#model.nodeAt(parent)
      if (!record || this.#memberUnits(record) === undefined) continue
      touchedNodes.add(parent)
      this.#dataNodes.add(parent)
    }
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
    const merges = this.#merges
    for (const index of this.#dataEdges.indices()) {
      const aggregate = this.#mode[index] === merged ? (merges.of[index] ?? none) : none
      if (aggregate >= 0) this.#touchedAggregates.add(aggregate)
      else this.#touchedEdges.add(index)
    }
    const touched = this.#touchedEdges
    const touchedAggregates = this.#touchedAggregates
    for (const aggregate of touchedAggregates.indices()) {
      this.#records[aggregate] = undefined
      this.#data[aggregate] = undefined
      const carrier = merges.carrier[aggregate] ?? none
      if (carrier >= 0) touched.add(carrier)
      const head = merges.head[aggregate] ?? none
      if (head < 0) {
        merges.release(aggregate)
        continue
      }
      const first = merges.first(aggregate)
      if (this.#rules[merges.slot[aggregate] ?? none]?.directed === false) {
        this.#endsOf(first)
        merges.source[aggregate] = this.#endSource
        merges.target[aggregate] = this.#endTarget
      }
      const open = this.#isOpen(aggregate)
      if (open || open !== (merges.open[aggregate] === 1)) {
        for (let at = head; at >= 0; at = merges.next[at] ?? none) touched.add(at)
      } else {
        touched.add(first)
      }
      merges.open[aggregate] = open ? 1 : 0
    }
    const display: number[] = []
    for (const index of touched.indices()) {
      const key = this.#edgeKeys[index]
      if (key === undefined) continue
      const mode = this.#mode[index] ?? absent
      const aggregate = mode === merged ? (merges.of[index] ?? none) : none
      const open = aggregate >= 0 && merges.open[aggregate] === 1
      const desired =
        mode === direct || open
          ? shownOwn
          : aggregate >= 0 && merges.first(aggregate) === index
            ? shownMerged
            : 0
      const after = desired === shownMerged ? aggregate : none
      const shown = this.#shownEdge[index] ?? 0
      const before = this.#shownAggregate[index] ?? none
      if (desired === 0) {
        if (shown !== 0) {
          edges.removed.push({ key, index })
          display.push(index)
        }
      } else if (shown === 0) {
        edges.added.push({ key, index })
        display.push(index)
      } else if (desired !== shown || before !== after) {
        edges.updated.push({ key, index })
        display.push(index)
      } else if (after >= 0 && touchedAggregates.has(after)) {
        edges.updated.push({ key, index })
        display.push(index)
      } else if (this.#dataEdges.has(index)) {
        edges.updated.push({ key, index })
      }
      if (after >= 0) merges.carrier[after] = index
      this.#shownEdge[index] = desired
      this.#shownAggregate[index] = after
    }
    const folded: number[] = []
    const unfolded: number[] = []
    for (const root of this.#foldRoots) {
      if (!hierarchy.visible(root)) continue
      if (hierarchy.folded[root] === 1) folded.push(root)
      else unfolded.push(root)
    }
    if (containers) this.containerVersion++
    const reshaped = this.#reshaped || folded.length > 0 || unfolded.length > 0
    this.#reshaped = false
    this.#foldRoots = []
    this.#touchedEdges = new IndexSet()
    this.#dataEdges = new IndexSet()
    this.#dataNodes = new IndexSet()
    this.#addedNodes = new IndexSet()
    this.#touchedAggregates = new IndexSet()
    return {
      scene,
      revealed,
      fresh,
      concealed,
      folded,
      unfolded,
      edges: display,
      containers,
      reshaped,
    }
  }

  #datum(aggregate: number): AggregateEdge {
    const cached = this.#data[aggregate]
    if (cached) return cached
    const merges = this.#merges
    const hierarchy = this.hierarchy
    const source = merges.source[aggregate] ?? none
    const split = this.#rules[merges.slot[aggregate] ?? none]?.directed === false
    const keys: Key[] = []
    const data: unknown[] = []
    const sides: [Members, Members] | null = split ? [members(), members()] : null
    for (const at of merges.ordered(aggregate)) {
      const key = this.#edgeKeys[at]
      if (key === undefined) continue
      const datum = this.#model.edgeAt(at)?.datum
      keys.push(key)
      data.push(datum)
      if (sides) this.#endsOf(at)
      const side = sides?.[this.#endSource === source ? 0 : 1]
      side?.keys.push(key)
      side?.data.push(datum)
    }
    const all = { count: keys.length, keys: Object.freeze(keys), data: Object.freeze(data) }
    const forward = sides ? direction(sides[0]) : Object.freeze(all)
    const backward = sides ? direction(sides[1]) : noEdges
    const value = merges.value(aggregate)
    const datum: AggregateEdge = Object.freeze({
      source: hierarchy.keys[source] as Key,
      target: hierarchy.keys[merges.target[aggregate] ?? none] as Key,
      ...all,
      forward,
      backward,
      ...(value !== undefined ? { value } : {}),
    })
    this.#data[aggregate] = datum
    return datum
  }

  #edgeRecord(aggregate: number): SceneEdgeRecord | undefined {
    const cached = this.#records[aggregate]
    if (cached) return cached
    const carrier = this.#merges.carrier[aggregate] ?? none
    const key = this.#edgeKeys[carrier]
    const own = this.#model.edgeAt(carrier)
    const mark = own?.mark
    if (key === undefined || !own || !mark) return undefined
    const datum = this.#datum(aggregate)
    const record: SceneEdgeRecord = {
      key,
      index: carrier,
      datum,
      mark,
      look: aggregateLook(mark),
      source: datum.source,
      target: datum.target,
      sourceIndex: this.#merges.source[aggregate] ?? none,
      targetIndex: this.#merges.target[aggregate] ?? none,
      order: own.order,
      straight: this.#lifts[this.#merges.slot[aggregate] ?? none] === true,
      halves: this.#halved(aggregate),
    }
    this.#records[aggregate] = record
    return record
  }

  #nodeRecord(record: NodeRecord): SceneNodeRecord | undefined {
    const shown = this.#shownNode[record.index] ?? 0
    if (shown === 0) return undefined
    if (shown !== shownContainer) {
      const screenUnits = this.#memberUnits(record)
      if (screenUnits === undefined) return record
      return {
        key: record.key,
        index: record.index,
        datum: record.datum,
        mark: record.mark,
        screenUnits,
      }
    }
    return {
      key: record.key,
      index: record.index,
      datum: record.datum,
      mark: record.mark,
      container: true,
    }
  }

  #memberUnits(record: NodeRecord): boolean | undefined {
    if (record.mark !== this.#unitsMark) {
      this.#unitsMark = record.mark
      this.#unitsFollow =
        groupingOf(record.mark) !== undefined && record.mark.options.units === undefined
    }
    if (!this.#unitsFollow) return undefined
    const hierarchy = this.hierarchy
    let mark = record.mark
    let index = record.index
    for (let depth = 0; depth < hierarchy.capacity; depth++) {
      if (!groupingOf(mark) || mark.options.units !== undefined) break
      const child = hierarchy.firstChild[index] ?? none
      const member = child >= 0 ? this.#model.nodeAt(child) : undefined
      if (!member) return undefined
      mark = member.mark
      index = child
    }
    return index === record.index ? undefined : compileNodeMark(mark).screenUnits
  }

  #createView(): SceneModel {
    const model = this.#model
    const edgeAt = (index: number): SceneEdgeRecord | undefined => {
      if (!this.#active) return model.edgeAt(index)
      const shown = this.#shownEdge[index] ?? 0
      if (shown === shownOwn) return model.edgeAt(index)
      const aggregate = shown === shownMerged ? (this.#shownAggregate[index] ?? none) : none
      return aggregate >= 0 ? this.#edgeRecord(aggregate) : undefined
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
