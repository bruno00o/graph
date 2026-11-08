import { convertValue, type IntegerMode, integerText, isObject } from './values'

/** Properties of a node or a relationship, with integers, dates and points already converted. */
export type CypherProperties = Readonly<Record<string, unknown>>

/** A node of a Cypher result, ready for `nodes()`: the key is `id`. */
export interface CypherNode<P extends object = CypherProperties> {
  /** The `elementId` of the node. */
  readonly id: string
  /** Labels of the node, in the order the database returned them. */
  readonly labels: readonly string[]
  /** Properties of the node. */
  readonly properties: P
}

/**
 * A relationship of a Cypher result, ready for `edges()` with `source: 'source'` and
 * `target: 'target'`: the key is `id`.
 */
export interface CypherEdge<P extends object = CypherProperties> {
  /** The `elementId` of the relationship. */
  readonly id: string
  /** Type of the relationship. */
  readonly type: string
  /** The `elementId` of the start node. */
  readonly source: string
  /** The `elementId` of the end node. */
  readonly target: string
  /** Properties of the relationship. */
  readonly properties: P
}

/** Nodes and edges extracted from Cypher results, without duplicates. */
export interface CypherGraph<
  N extends object = CypherProperties,
  E extends object = CypherProperties,
> {
  /** Distinct nodes, in the order they first appear. */
  readonly nodes: readonly CypherNode<N>[]
  /**
   * Distinct relationships, in the order they first appear. An end node that is not in `nodes`
   * does not remove the edge: the graph keeps it pending until that node arrives.
   */
  readonly edges: readonly CypherEdge<E>[]
}

/** The part of a driver `Node` that the adapter reads. */
export interface CypherNodeLike {
  /** Identifier of the node, unique in the database. */
  readonly elementId: string
  /** Labels of the node. */
  readonly labels: readonly string[]
  /** Properties of the node. */
  readonly properties: object
}

/** The part of a driver `Relationship` that the adapter reads. */
export interface CypherRelationshipLike {
  /** Identifier of the relationship, unique in the database. */
  readonly elementId: string
  /** Type of the relationship. */
  readonly type: string
  /** The `elementId` of the start node. */
  readonly startNodeElementId: string
  /** The `elementId` of the end node. */
  readonly endNodeElementId: string
  /** Properties of the relationship. */
  readonly properties: object
}

/** One step of a driver `Path`. */
export interface CypherPathSegmentLike {
  /** Node the step leaves. */
  readonly start: CypherNodeLike
  /** Relationship the step follows. */
  readonly relationship: CypherRelationshipLike
  /** Node the step reaches. */
  readonly end: CypherNodeLike
}

/** The part of a driver `Path` that the adapter reads. */
export interface CypherPathLike {
  /** First node of the path. */
  readonly start: CypherNodeLike
  /** Last node of the path. */
  readonly end: CypherNodeLike
  /** Steps of the path, in order. */
  readonly segments: readonly CypherPathSegmentLike[]
}

/** The part of a driver `Record` (a row) that the adapter reads. */
export interface CypherRecordLike {
  /** Column names of the row. */
  readonly keys: readonly PropertyKey[]
  /** Value of a column. */
  get(key: string): unknown
}

/** The part of a driver result (`QueryResult`, `EagerResult`) that the adapter reads. */
export interface CypherResultLike {
  /** Rows of the result. */
  readonly records: readonly CypherRecordLike[]
}

/**
 * What `cypherGraph` accepts: a result, a row, a node, a relationship, a path, or any list or map
 * that contains them, including the same values parsed from JSON.
 */
export type CypherInput =
  | CypherResultLike
  | CypherRecordLike
  | CypherNodeLike
  | CypherRelationshipLike
  | CypherPathLike
  | Iterable<unknown>
  | Readonly<Record<string, unknown>>

/** Options of `cypherGraph`. */
export interface CypherOptions {
  /**
   * How 64-bit integers in properties become JavaScript values: `'safe'` gives a number when it is
   * exact and a decimal string otherwise, `'number'` always a number (large values lose
   * precision), `'string'` always a decimal string, `'bigint'` always a `bigint`, `'keep'` leaves
   * the value as the driver returned it, and a function receives the `bigint` and returns the
   * value. Native `number` values are never touched.
   * @default 'safe'
   */
  readonly integers?:
    | 'safe'
    | 'number'
    | 'string'
    | 'bigint'
    | 'keep'
    | ((value: bigint) => unknown)
    | undefined
}

interface Shape {
  readonly elementId?: unknown
  readonly identity?: unknown
  readonly labels?: unknown
  readonly type?: unknown
  readonly properties?: unknown
  readonly start?: unknown
  readonly end?: unknown
  readonly startNodeElementId?: unknown
  readonly endNodeElementId?: unknown
  readonly records?: unknown
  readonly segments?: unknown
  readonly relationship?: unknown
  readonly keys?: unknown
  readonly get?: unknown
}

interface Collector {
  readonly mode: IntegerMode
  readonly nodes: Map<string, CypherNode>
  readonly edges: Map<string, CypherEdge>
  readonly seen: WeakSet<object>
}

function hasId(value: Shape): boolean {
  return typeof value.elementId === 'string' || value.identity !== undefined
}

function idOf(value: Shape): string | undefined {
  return typeof value.elementId === 'string' ? value.elementId : integerText(value.identity)
}

function addNode(value: Shape, collector: Collector): void {
  const id = idOf(value)
  if (id === undefined || collector.nodes.has(id)) return
  collector.nodes.set(id, {
    id,
    labels: (value.labels as unknown[]).map(String),
    properties: convertValue(value.properties, collector.mode) as CypherProperties,
  })
}

function addEdge(value: Shape, collector: Collector): void {
  const id = idOf(value)
  if (id === undefined || collector.edges.has(id)) return
  const source =
    typeof value.startNodeElementId === 'string'
      ? value.startNodeElementId
      : integerText(value.start)
  const target =
    typeof value.endNodeElementId === 'string' ? value.endNodeElementId : integerText(value.end)
  if (source === undefined || target === undefined) return
  collector.edges.set(id, {
    id,
    type: value.type as string,
    source,
    target,
    properties: convertValue(value.properties, collector.mode) as CypherProperties,
  })
}

function walkPath(path: Shape, collector: Collector): void {
  walk(path.start, collector)
  for (const segment of path.segments as unknown[]) {
    const step = segment as Shape
    walk(step.start, collector)
    walk(step.relationship, collector)
    walk(step.end, collector)
  }
  walk(path.end, collector)
}

function walkRecord(record: Shape, collector: Collector): void {
  const get = record.get as (key: unknown) => unknown
  for (const key of record.keys as unknown[]) walk(get.call(record, key), collector)
}

function walk(input: unknown, collector: Collector): void {
  if (!isObject(input) || collector.seen.has(input)) return
  collector.seen.add(input)
  if (ArrayBuffer.isView(input) || input instanceof Date) return
  const value = input as Shape
  if (Array.isArray(value.labels) && isObject(value.properties) && hasId(value)) {
    addNode(value, collector)
  } else if (typeof value.type === 'string' && isObject(value.properties) && hasId(value)) {
    addEdge(value, collector)
  } else if (Array.isArray(value.records)) {
    for (const record of value.records) walk(record, collector)
  } else if (Array.isArray(value.keys) && typeof value.get === 'function') {
    walkRecord(value, collector)
  } else if (isObject(value.start) && isObject(value.end) && Array.isArray(value.segments)) {
    walkPath(value, collector)
  } else if (Symbol.iterator in input) {
    for (const item of input as Iterable<unknown>) walk(item, collector)
  } else {
    for (const item of Object.values(input)) walk(item, collector)
  }
}

/**
 * Extracts the nodes, relationships and paths found in Cypher results, in rows, lists or maps at
 * any depth. Elements are deduplicated by `elementId`, the first occurrence wins. It accepts the
 * values of the official JavaScript driver and the same values serialized as JSON.
 */
export function cypherGraph<
  N extends object = CypherProperties,
  E extends object = CypherProperties,
>(input: CypherInput, options: CypherOptions = {}): CypherGraph<N, E> {
  const collector: Collector = {
    mode: options.integers ?? 'safe',
    nodes: new Map(),
    edges: new Map(),
    seen: new WeakSet(),
  }
  walk(input, collector)
  return {
    nodes: [...collector.nodes.values()] as unknown as CypherNode<N>[],
    edges: [...collector.edges.values()] as unknown as CypherEdge<E>[],
  }
}
