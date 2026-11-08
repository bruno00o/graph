import type {
  Accessor,
  Channel,
  EdgeDash,
  Key,
  KeyChannel,
  NodeShape,
  Point,
  TimeValue,
} from '../types'

/**
 * A value of an attribute: a string, a number, a boolean, a list, or, in JSON Graph Format
 * metadata only, `null` or an object.
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | readonly AttributeValue[]
  | { readonly [name: string]: AttributeValue }

/** Attributes of a node, an edge or a graph, by name. */
export type FileAttributes = Readonly<Record<string, AttributeValue>>

/**
 * Type of an attribute: `'string'`, `'boolean'`, `'integer'` (32 bits), `'long'` (64 bits),
 * `'float'`, `'double'`, or a list of one of them (`'string[]'`, `'boolean[]'`, `'integer[]'`,
 * `'long[]'`, `'float[]'`, `'double[]'`). Integers become numbers when they are exact, decimal
 * strings otherwise.
 */
export type AttributeType =
  | 'string'
  | 'boolean'
  | 'integer'
  | 'long'
  | 'float'
  | 'double'
  | 'string[]'
  | 'boolean[]'
  | 'integer[]'
  | 'long[]'
  | 'float[]'
  | 'double[]'

/** An attribute as the file declares it. */
export interface AttributeDeclaration {
  /** Name of the attribute, the key of its value in `attributes`. */
  readonly name: string
  /** Type of its values. */
  readonly type: AttributeType
  /** Value given to the elements that do not set one, if the file declares it. */
  readonly default?: AttributeValue | undefined
}

/** Attributes declared by a file, for nodes, edges and the graph. */
export interface FileSchema {
  /** Declared node attributes. */
  readonly nodes: readonly AttributeDeclaration[]
  /** Declared edge attributes. */
  readonly edges: readonly AttributeDeclaration[]
  /** Declared graph attributes. */
  readonly graph: readonly AttributeDeclaration[]
}

/**
 * How a GEXF file writes time: `'integer'` and `'double'` as numbers, `'date'` as `yyyy-mm-dd`,
 * `'dateTime'` as an ISO 8601 date and time.
 */
export type TimeFormat = 'integer' | 'double' | 'date' | 'dateTime'

/** A period: from `start` to `end`. A missing bound leaves the period open on that side. */
export interface FileTimeSpan {
  /** First moment of the period. */
  readonly start?: number
  /** Last moment of the period. */
  readonly end?: number
}

/**
 * When an element exists, ready for the `time` channel: a moment or a period. Dates are in
 * milliseconds since 1 January 1970 UTC, other times are the numbers of the file.
 */
export type FileTime = number | FileTimeSpan

/** A node read from a file, ready for `nodes()`: the key is `id`. */
export interface FileNode<A extends object = FileAttributes> {
  /** Identifier of the node, unique in the file. */
  readonly id: string
  /** Label of the node. */
  readonly label?: string
  /** Identifier of the node that contains this one, ready for the `parent` channel. */
  readonly parent?: string
  /** Horizontal position, in the units of the file. */
  readonly x?: number
  /** Vertical position, in the units of the file. */
  readonly y?: number
  /** Size of the node, in the units of the file. */
  readonly size?: number
  /** CSS color of the node. */
  readonly color?: string
  /** Shape of the node, when the file names one that the graph draws. */
  readonly shape?: NodeShape
  /** URL of an image drawn in the node. */
  readonly image?: string
  /** When the node exists, ready for the `time` channel. With several periods, the whole span. */
  readonly time?: FileTime
  /** Every period of a node that exists more than once, in file order. */
  readonly spells?: readonly FileTime[]
  /** Other attributes, typed from the declarations of the file. */
  readonly attributes: A
}

/**
 * An edge read from a file, ready for `edges()` with `source: 'source'` and `target: 'target'`:
 * the key is `id`.
 */
export interface FileEdge<A extends object = FileAttributes> {
  /**
   * Identifier of the edge. When the file gives none, it is made from the ends, `a->b` or
   * `a--b`, with `#2`, `#3`... for parallel edges: stable for the same file, and unique.
   */
  readonly id: string
  /** Identifier of the source node. */
  readonly source: string
  /** Identifier of the target node. */
  readonly target: string
  /** Whether the edge goes from source to target, or links both ways. */
  readonly directed: boolean
  /** Label of the edge. */
  readonly label?: string
  /** Category of the edge: `kind` in GEXF, `relation` in JSON Graph Format. */
  readonly type?: string
  /** Weight of the edge. */
  readonly weight?: number
  /** CSS color of the edge. */
  readonly color?: string
  /** Width of the edge, in the units of the file. */
  readonly width?: number
  /** Line pattern of the edge. */
  readonly dash?: EdgeDash
  /** When the edge exists, ready for the `time` channel. With several periods, the whole span. */
  readonly time?: FileTime
  /** Every period of an edge that exists more than once, in file order. */
  readonly spells?: readonly FileTime[]
  /** Other attributes, typed from the declarations of the file. */
  readonly attributes: A
}

/** The graph a file describes, apart from its nodes and edges. */
export interface FileGraph {
  /** Identifier of the graph. */
  readonly id?: string
  /** Label of the graph. */
  readonly label?: string
  /** Type of the graph, in JSON Graph Format. */
  readonly type?: string
  /** Whether edges that do not say otherwise are directed. */
  readonly directed: boolean
  /** How a GEXF file writes time. */
  readonly timeFormat?: TimeFormat
  /** Attributes of the graph: GraphML data, GEXF meta, JSON Graph Format metadata. */
  readonly attributes: FileAttributes
}

/** A node, or an edge, of the same id as an earlier one. The first one wins. */
export interface DuplicateIdIssue {
  /** Type of the issue. */
  readonly type: 'duplicate-id'
  /** Kind of the elements that share the id: `'nodes'` or `'edges'`. */
  readonly kind: 'nodes' | 'edges'
  /** The shared id. */
  readonly id: string
  /** Line of the skipped element, from 1. */
  readonly line?: number
}

/** A node with no id. It is skipped. */
export interface MissingIdIssue {
  /** Type of the issue. */
  readonly type: 'missing-id'
  /** Always `'nodes'`. */
  readonly kind: 'nodes'
  /** Line of the node, from 1. */
  readonly line?: number
}

/** An edge with no source or no target. It is skipped. */
export interface MissingEndIssue {
  /** Type of the issue. */
  readonly type: 'missing-end'
  /** Always `'edges'`. */
  readonly kind: 'edges'
  /** Id of the edge, if the file gives one. */
  readonly id?: string
  /** Line of the edge, from 1. */
  readonly line?: number
}

/** An edge whose end names no node of the file. The edge is kept, pending in the graph. */
export interface MissingNodeIssue {
  /** Type of the issue. */
  readonly type: 'missing-node'
  /** Always `'edges'`. */
  readonly kind: 'edges'
  /** Id of the edge. */
  readonly id: string
  /** The node id that the edge names. */
  readonly node: string
  /** Line of the edge, from 1. */
  readonly line?: number
}

/** A value that does not match the type of its attribute. It is kept as the string of the file. */
export interface InvalidValueIssue {
  /** Type of the issue. */
  readonly type: 'invalid-value'
  /** Kind of the element: `'nodes'`, `'edges'` or `'graph'`. */
  readonly kind: 'nodes' | 'edges' | 'graph'
  /** Name of the attribute. */
  readonly name: string
  /** The value of the file. */
  readonly value: string
  /** Line of the element, from 1. */
  readonly line?: number
}

/** A value for an attribute that the file does not declare. It is kept as a string. */
export interface UnknownAttributeIssue {
  /** Type of the issue. */
  readonly type: 'unknown-attribute'
  /** Kind of the element: `'nodes'`, `'edges'` or `'graph'`. */
  readonly kind: 'nodes' | 'edges' | 'graph'
  /** The attribute id the file names, used as its name. */
  readonly name: string
  /** Line of the first use, from 1. */
  readonly line?: number
}

/**
 * A part of a format that the reader skips: `'hyperedge'`, `'port'`, `'structured-data'` (GraphML
 * data with elements inside), `'graph-in-edge'`, `'locator'` (a graph stored in another file),
 * `'dynamic-attribute'` (only the first value of a GEXF attribute over time is kept),
 * `'node-shape'` and `'edge-shape'` (a GEXF shape the graph does not draw), `'phylogeny'` (GEXF
 * nodes with several parents) and `'time-zone'` (dates are read as UTC).
 */
export type UnsupportedFeature =
  | 'hyperedge'
  | 'port'
  | 'structured-data'
  | 'graph-in-edge'
  | 'locator'
  | 'dynamic-attribute'
  | 'node-shape'
  | 'edge-shape'
  | 'phylogeny'
  | 'time-zone'

/** A part of the file that the reader skips, counted once for the whole file. */
export interface UnsupportedIssue {
  /** Type of the issue. */
  readonly type: 'unsupported'
  /** What the reader skips. */
  readonly feature: UnsupportedFeature
  /** How many times the file uses it. */
  readonly count: number
  /** Line of the first use, from 1. */
  readonly line?: number
}

/** A CSV row with more or fewer fields than the header. Missing fields are empty. */
export interface MalformedRowIssue {
  /** Type of the issue. */
  readonly type: 'malformed-row'
  /** Table of the row: `'nodes'` or `'edges'`. */
  readonly kind: 'nodes' | 'edges'
  /** Number of fields of the header. */
  readonly expected: number
  /** Number of fields of the row. */
  readonly found: number
  /** Line where the row starts, from 1. */
  readonly line: number
}

/** A problem in a file. The reader works around it and never throws for it. */
export type FormatIssue =
  | DuplicateIdIssue
  | MissingIdIssue
  | MissingEndIssue
  | MissingNodeIssue
  | InvalidValueIssue
  | UnknownAttributeIssue
  | UnsupportedIssue
  | MalformedRowIssue

/** What a reader returns: plain nodes and edges for the marks, and what else the file says. */
export interface GraphFile<N extends object = FileAttributes, E extends object = FileAttributes> {
  /** The graph itself: direction, identifiers, attributes. */
  readonly graph: FileGraph
  /** Nodes, in file order, without duplicates. */
  readonly nodes: readonly FileNode<N>[]
  /**
   * Edges, in file order, without duplicates. An edge whose end is not in `nodes` stays: the graph
   * keeps it pending until that node arrives.
   */
  readonly edges: readonly FileEdge<E>[]
  /** Attributes the file declares, with their types and defaults. */
  readonly schema: FileSchema
  /** Problems found while reading. Empty for a clean file. */
  readonly issues: readonly FormatIssue[]
}

/** Options shared by the readers of GraphML, JSON Graph Format and CSV. */
export interface ReadOptions {
  /**
   * Read the attributes named `label`, `x`, `y`, `size`, `color`, `shape`, `image`, `time`, `start`
   * and `end` (and `parent` outside GraphML; `type`, `weight`, `width`, `dash` for edges) into the
   * fields of the same name, when their values fit. These formats have no place of their own for
   * them, and the writers put them there.
   * @default true
   */
  readonly fields?: boolean | undefined
}

/** Options of `readJsonGraph`. */
export interface JsonGraphReadOptions extends ReadOptions {
  /**
   * The graph to read in a file of several graphs: its index, or its `id`.
   * @default 0
   */
  readonly graph?: number | string | undefined
}

/** Options of `readCsv`. */
export interface CsvReadOptions extends ReadOptions {
  /**
   * Character between the fields of a row.
   * @default ','
   */
  readonly separator?: string | undefined
  /**
   * Whether edges are directed when the edge table has no `directed` column.
   * @default true
   */
  readonly directed?: boolean | undefined
  /**
   * Column of the node table that holds the node id, and of the edge table that holds the edge id.
   * Column names match without case.
   * @default 'id'
   */
  readonly id?: string | undefined
  /**
   * Column of the edge table that holds the source node id.
   * @default 'source'
   */
  readonly source?: string | undefined
  /**
   * Column of the edge table that holds the target node id.
   * @default 'target'
   */
  readonly target?: string | undefined
  /**
   * Types of columns, by name, for nodes and edges. Other columns are numbers when every unquoted
   * value is a number written the way JavaScript writes it, booleans when every value is `true` or
   * `false`, and strings otherwise.
   */
  readonly types?: CsvTypes | undefined
}

/** Types of CSV columns, by name. */
export interface CsvTypes {
  /** Types of the columns of the node table. */
  readonly nodes?: Readonly<Record<string, AttributeType>> | undefined
  /** Types of the columns of the edge table. */
  readonly edges?: Readonly<Record<string, AttributeType>> | undefined
}

/** The two tables of a graph in CSV. */
export interface CsvTables {
  /** Table of nodes, with a header row. Without it, the nodes are the ends of the edges. */
  readonly nodes?: string | undefined
  /** Table of edges, with a header row. */
  readonly edges?: string | undefined
}

/** The two tables that `writeCsv` returns. */
export interface CsvFiles {
  /** Table of nodes. */
  readonly nodes: string
  /** Table of edges. */
  readonly edges: string
}

/** Where to find positions by node key, such as the map of `graph.positions.snapshot()`. */
export interface PositionLookup {
  /** Position of a node, or `undefined`. */
  get(key: Key): Point | undefined
}

/** The graph-level information a writer accepts, such as the `graph` of a `GraphFile`. */
export interface GraphInfoInput {
  /** Identifier of the graph. */
  readonly id?: string | undefined
  /** Label of the graph. */
  readonly label?: string | undefined
  /** Type of the graph, in JSON Graph Format. */
  readonly type?: string | undefined
  /** Whether edges are directed unless they say otherwise. */
  readonly directed?: boolean | undefined
  /** How a GEXF file writes time. */
  readonly timeFormat?: TimeFormat | undefined
  /** Attributes of the graph. */
  readonly attributes?: Readonly<Record<string, unknown>> | undefined
}

/** Declared attributes a writer accepts, such as the `schema` of a `GraphFile`. */
export interface SchemaInput {
  /** Declared node attributes. */
  readonly nodes?: readonly AttributeDeclaration[] | undefined
  /** Declared edge attributes. */
  readonly edges?: readonly AttributeDeclaration[] | undefined
  /** Declared graph attributes. */
  readonly graph?: readonly AttributeDeclaration[] | undefined
}

/** What a writer takes: any nodes and edges, such as a `GraphFile` or the data of the marks. */
export interface GraphInput<N, E> {
  /** Nodes to write. */
  readonly nodes: Iterable<N>
  /** Edges to write. */
  readonly edges?: Iterable<E> | undefined
  /** The graph itself. */
  readonly graph?: GraphInfoInput | undefined
  /** Declared attributes, used for their types and defaults when the values fit them. */
  readonly schema?: SchemaInput | undefined
}

/**
 * Which attributes to write: a list of field names, or a function that returns them by name.
 * By default, the `attributes` object of an item, or else its fields that no other option reads.
 */
export type AttributesInput<T> =
  | readonly string[]
  | Accessor<T, Readonly<Record<string, unknown>> | null | undefined>

/** Where a writer reads each part of a node. `null` skips a part. */
export interface NodeFields<T> {
  /**
   * Identifier of the node.
   * @default 'id'
   */
  readonly key?: KeyChannel<T> | undefined
  /**
   * Label of the node.
   * @default 'label'
   */
  readonly label?: Channel<T, string> | null | undefined
  /**
   * Key of the node that contains this one.
   * @default 'parent'
   */
  readonly parent?: Channel<T, Key> | null | undefined
  /**
   * Horizontal position. A position from `positions` wins.
   * @default 'x'
   */
  readonly x?: Channel<T, number> | null | undefined
  /**
   * Vertical position. A position from `positions` wins.
   * @default 'y'
   */
  readonly y?: Channel<T, number> | null | undefined
  /**
   * Size of the node.
   * @default 'size'
   */
  readonly size?: Channel<T, number> | null | undefined
  /**
   * CSS color of the node: hexadecimal, `rgb()` or `rgba()` for GEXF, any string elsewhere.
   * @default 'color'
   */
  readonly color?: Channel<T, string> | null | undefined
  /**
   * Shape of the node.
   * @default 'shape'
   */
  readonly shape?: Channel<T, NodeShape> | null | undefined
  /**
   * URL of the image of the node.
   * @default 'image'
   */
  readonly image?: Channel<T, string> | null | undefined
  /**
   * When the node exists.
   * @default 'time'
   */
  readonly time?: Channel<T, TimeValue> | null | undefined
  /**
   * Every period of the node, written by GEXF and JSON Graph Format.
   * @default 'spells'
   */
  readonly spells?: Channel<T, readonly TimeValue[]> | null | undefined
  /** Other attributes. */
  readonly attributes?: AttributesInput<T> | undefined
  /** Types of attributes, by name. Others come from the schema when the values fit, or from the values. */
  readonly types?: Readonly<Record<string, AttributeType>> | undefined
}

/** Where a writer reads each part of an edge. `null` skips a part. */
export interface EdgeFields<T> {
  /**
   * Identifier of the edge. Without one, the formats that allow it write none.
   * @default 'id'
   */
  readonly key?: Channel<T, Key> | null | undefined
  /**
   * Key of the source node.
   * @default 'source'
   */
  readonly source?: KeyChannel<T> | undefined
  /**
   * Key of the target node.
   * @default 'target'
   */
  readonly target?: KeyChannel<T> | undefined
  /**
   * Whether the edge is directed. Defaults to the direction of the graph.
   * @default 'directed'
   */
  readonly directed?: Channel<T, boolean> | null | undefined
  /**
   * Label of the edge.
   * @default 'label'
   */
  readonly label?: Channel<T, string> | null | undefined
  /**
   * Category of the edge.
   * @default 'type'
   */
  readonly type?: Channel<T, string> | null | undefined
  /**
   * Weight of the edge.
   * @default 'weight'
   */
  readonly weight?: Channel<T, number> | null | undefined
  /**
   * CSS color of the edge.
   * @default 'color'
   */
  readonly color?: Channel<T, string> | null | undefined
  /**
   * Width of the edge.
   * @default 'width'
   */
  readonly width?: Channel<T, number> | null | undefined
  /**
   * Line pattern of the edge.
   * @default 'dash'
   */
  readonly dash?: Channel<T, EdgeDash> | null | undefined
  /**
   * When the edge exists.
   * @default 'time'
   */
  readonly time?: Channel<T, TimeValue> | null | undefined
  /**
   * Every period of the edge, written by GEXF and JSON Graph Format.
   * @default 'spells'
   */
  readonly spells?: Channel<T, readonly TimeValue[]> | null | undefined
  /** Other attributes. */
  readonly attributes?: AttributesInput<T> | undefined
  /** Types of attributes, by name. Others come from the schema when the values fit, or from the values. */
  readonly types?: Readonly<Record<string, AttributeType>> | undefined
}

/** Options shared by the writers. */
export interface WriteOptions<N, E> {
  /** Where to read each part of a node. */
  readonly nodes?: NodeFields<N> | undefined
  /** Where to read each part of an edge. */
  readonly edges?: EdgeFields<E> | undefined
  /** Positions by node key, such as `graph.positions.snapshot()`. They win over `x` and `y`. */
  readonly positions?: PositionLookup | undefined
  /** Whether edges are directed unless they say otherwise. Defaults to the graph, then `true`. */
  readonly directed?: boolean | undefined
}

/** Options of `writeGexf`. */
export interface GexfWriteOptions<N, E> extends WriteOptions<N, E> {
  /**
   * Version of GEXF to write: `'1.3'` or `'1.2'`.
   * @default '1.3'
   */
  readonly version?: '1.2' | '1.3' | undefined
  /**
   * How to write time. Defaults to the format of the graph, then `'double'`. With `'date'`, a
   * moment that is not midnight UTC switches the file to `'dateTime'`.
   */
  readonly timeFormat?: TimeFormat | undefined
}

/** Options of `writeJsonGraph` and `writeJsonGraphs`. */
export interface JsonGraphWriteOptions<N, E> extends WriteOptions<N, E> {
  /**
   * Spaces of indentation, 0 for a single line.
   * @default 2
   */
  readonly indent?: number | undefined
}

/** Options of `writeCsv`. */
export interface CsvWriteOptions<N, E> extends WriteOptions<N, E> {
  /**
   * Character between the fields of a row.
   * @default ','
   */
  readonly separator?: string | undefined
  /**
   * Line break between rows: `'\r\n'` as RFC 4180 says, or `'\n'`.
   * @default '\r\n'
   */
  readonly lineBreak?: '\r\n' | '\n' | undefined
  /**
   * Start each table with a byte order mark, for spreadsheets that need it to read UTF-8.
   * @default false
   */
  readonly bom?: boolean | undefined
}

/** A graph file format: `'graphml'`, `'gexf'`, `'json-graph'` or `'csv'`. */
export type GraphFormat = 'graphml' | 'gexf' | 'json-graph' | 'csv'
