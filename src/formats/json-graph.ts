import {
  assign,
  type EdgeDraft,
  edgeFieldOf,
  FileBuilder,
  liftEdge,
  liftNode,
  type NodeDraft,
  nodeFieldOf,
} from './builder'
import { FormatError } from './errors'
import { type Entries, edgeFieldEntries, merged, nodeFieldEntries, prepare } from './prepare'
import type {
  AttributeValue,
  FileAttributes,
  FileGraph,
  GraphFile,
  GraphInput,
  JsonGraphReadOptions,
  JsonGraphWriteOptions,
  ReadOptions,
} from './types'
import { isPlainObject, setField, toAttributeValue } from './values'

interface JsonDocument {
  readonly graph?: unknown
  readonly graphs?: unknown
}

interface JsonGraph {
  readonly id?: unknown
  readonly label?: unknown
  readonly type?: unknown
  readonly directed?: unknown
  readonly metadata?: unknown
  readonly nodes?: unknown
  readonly edges?: unknown
  readonly hyperedges?: unknown
}

interface JsonNode {
  readonly id?: unknown
  readonly label?: unknown
  readonly metadata?: unknown
}

interface JsonEdge {
  readonly id?: unknown
  readonly source?: unknown
  readonly target?: unknown
  readonly directed?: unknown
  readonly label?: unknown
  readonly relation?: unknown
  readonly metadata?: unknown
}

function shape<T>(value: unknown): T | undefined {
  return isPlainObject(value) ? (value as T) : undefined
}

function parse(input: string | object): JsonDocument {
  let value: unknown = input
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input)
    } catch (error) {
      throw new FormatError('json-graph', (error as Error).message)
    }
  }
  const document = shape<JsonDocument>(value)
  if (document === undefined) throw new FormatError('json-graph', 'the document is not an object')
  return document
}

function graphsOf(document: JsonDocument): unknown[] {
  if (isPlainObject(document.graph)) return [document.graph]
  if (Array.isArray(document.graphs)) return document.graphs
  throw new FormatError('json-graph', 'the document has no "graph" object and no "graphs" list')
}

function keyOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function eachMetadata(metadata: unknown, visit: (name: string, value: AttributeValue) => void) {
  if (!isPlainObject(metadata)) return
  for (const name of Object.keys(metadata)) {
    const converted = toAttributeValue(metadata[name])
    if (converted !== undefined) visit(name, converted)
  }
}

function readOne<N extends object, E extends object>(
  input: unknown,
  index: number,
  fields: boolean,
): GraphFile<N, E> {
  const value = shape<JsonGraph>(input)
  if (value === undefined) throw new FormatError('json-graph', `graph ${index} is not an object`)
  const builder = new FileBuilder(null)
  const directed = typeof value.directed === 'boolean' ? value.directed : true
  const attributes: Record<string, AttributeValue> = {}
  eachMetadata(value.metadata, (name, converted) => setField(attributes, name, converted))
  const graph: { -readonly [K in keyof FileGraph]: FileGraph[K] } = { directed, attributes }
  if (typeof value.id === 'string') graph.id = value.id
  if (typeof value.label === 'string') graph.label = value.label
  if (typeof value.type === 'string') graph.type = value.type

  const node = (id: string, item: JsonNode | undefined) => {
    const draft: NodeDraft = { id, attributes: {} }
    if (item !== undefined) {
      if (typeof item.label === 'string') draft.label = item.label
      eachMetadata(item.metadata, (name, converted) => {
        const field = fields ? nodeFieldOf(name, []) : undefined
        if (field === undefined || !liftNode(draft, field, converted)) {
          assign(draft.attributes, name, converted)
        }
      })
    }
    builder.addNode(draft)
  }
  const nodes = value.nodes
  if (Array.isArray(nodes)) {
    for (const item of nodes) {
      const entry = shape<JsonNode>(item)
      const id = keyOf(entry?.id)
      if (id === undefined) builder.missingId()
      else node(id, entry)
    }
  } else if (isPlainObject(nodes)) {
    for (const id of Object.keys(nodes)) node(id, shape<JsonNode>(nodes[id]))
  }

  if (Array.isArray(value.edges)) {
    for (const entry of value.edges) {
      const item = shape<JsonEdge>(entry)
      if (item === undefined) {
        builder.missingEnd(undefined)
        continue
      }
      const id = keyOf(item.id)
      const source = keyOf(item.source)
      const target = keyOf(item.target)
      if (source === undefined || target === undefined) {
        builder.missingEnd(id)
        continue
      }
      const draft: EdgeDraft = {
        source,
        target,
        directed: typeof item.directed === 'boolean' ? item.directed : directed,
        attributes: {},
      }
      if (id !== undefined) draft.id = id
      if (typeof item.label === 'string') draft.label = item.label
      if (typeof item.relation === 'string') draft.type = item.relation
      eachMetadata(item.metadata, (name, converted) => {
        const field = fields ? edgeFieldOf(name, ['directed']) : undefined
        if (field === undefined || !liftEdge(draft, field, converted)) {
          assign(draft.attributes, name, converted)
        }
      })
      builder.addEdge(draft)
    }
  }
  if (Array.isArray(value.hyperedges)) {
    for (let count = 0; count < value.hyperedges.length; count++) builder.unsupported('hyperedge')
  }
  return builder.finish<N, E>(graph, { nodes: [], edges: [], graph: [] })
}

/**
 * Read a JSON Graph Format document, version 2, from its text or from the parsed value. In a file
 * of several graphs, `graph` picks one. Metadata become attributes.
 */
export function readJsonGraph<N extends object = FileAttributes, E extends object = FileAttributes>(
  input: string | object,
  options: JsonGraphReadOptions = {},
): GraphFile<N, E> {
  const graphs = graphsOf(parse(input))
  const wanted = options.graph ?? 0
  const index =
    typeof wanted === 'number'
      ? wanted
      : graphs.findIndex((graph) => shape<JsonGraph>(graph)?.id === wanted)
  if (index < 0 || index >= graphs.length || !Number.isInteger(index)) {
    throw new FormatError('json-graph', `the document has no graph ${JSON.stringify(wanted)}`)
  }
  return readOne<N, E>(graphs[index], index, options.fields ?? true)
}

/** Read every graph of a JSON Graph Format document, version 2. */
export function readJsonGraphs<
  N extends object = FileAttributes,
  E extends object = FileAttributes,
>(input: string | object, options: ReadOptions = {}): GraphFile<N, E>[] {
  return graphsOf(parse(input)).map((graph, index) =>
    readOne<N, E>(graph, index, options.fields ?? true),
  )
}

function metadataOf(entries: Entries): Record<string, unknown> | undefined {
  if (entries.length === 0) return undefined
  const metadata: Record<string, unknown> = Object.create(null)
  for (const [name, value] of entries) metadata[name] = value
  return metadata
}

interface NodeOut {
  label?: string
  metadata?: Record<string, unknown>
}

interface EdgeOut {
  id?: string
  source: string
  target: string
  relation?: string
  directed?: boolean
  label?: string
  metadata?: Record<string, unknown>
}

interface GraphOut {
  id?: string
  label?: string
  type?: string
  directed: boolean
  metadata?: Record<string, unknown>
  nodes: Record<string, NodeOut>
  edges: EdgeOut[]
}

function graphObject<N, E>(
  input: GraphInput<N, E>,
  options: JsonGraphWriteOptions<N, E>,
): GraphOut {
  const { graph, nodes, edges } = prepare('json-graph', input, options)
  const metadata = metadataOf(graph.attributes)
  const out: GraphOut = {
    ...(graph.id === undefined ? {} : { id: graph.id }),
    ...(graph.label === undefined ? {} : { label: graph.label }),
    ...(graph.type === undefined ? {} : { type: graph.type }),
    directed: graph.directed,
    ...(metadata === undefined ? {} : { metadata }),
    nodes: Object.create(null),
    edges: [],
  }
  for (const node of nodes) {
    const item: NodeOut = {}
    if (node.label !== undefined) item.label = node.label
    const fields = nodeFieldEntries(node, true, 'value').filter(([name]) => name !== 'label')
    const nodeMetadata = metadataOf(merged(fields, node.attributes))
    if (nodeMetadata !== undefined) item.metadata = nodeMetadata
    out.nodes[node.id] = item
  }
  for (const edge of edges) {
    const item: EdgeOut =
      edge.id === undefined
        ? { source: edge.source, target: edge.target }
        : { id: edge.id, source: edge.source, target: edge.target }
    if (edge.type !== undefined) item.relation = edge.type
    if (edge.directed !== graph.directed) item.directed = edge.directed
    if (edge.label !== undefined) item.label = edge.label
    const edgeMetadata = metadataOf(merged(edgeFieldEntries(edge, 'value', false), edge.attributes))
    if (edgeMetadata !== undefined) item.metadata = edgeMetadata
    out.edges.push(item)
  }
  return out
}

function indentOf(options: { readonly indent?: number | undefined }): number {
  const indent = options.indent ?? 2
  if (!(Number.isInteger(indent) && indent >= 0 && indent <= 10)) {
    throw new RangeError('json-graph: indent must be an integer from 0 to 10')
  }
  return indent
}

/** Write a graph as a JSON Graph Format document, version 2, with a single `graph`. */
export function writeJsonGraph<N, E>(
  input: GraphInput<N, E>,
  options: JsonGraphWriteOptions<N, E> = {},
): string {
  const indent = indentOf(options)
  return JSON.stringify({ graph: graphObject(input, options) }, null, indent)
}

/** Write several graphs as one JSON Graph Format document, version 2, with a `graphs` list. */
export function writeJsonGraphs<N, E>(
  inputs: readonly GraphInput<N, E>[],
  options: JsonGraphWriteOptions<N, E> = {},
): string {
  const indent = indentOf(options)
  return JSON.stringify(
    { graphs: inputs.map((input) => graphObject(input, options)) },
    null,
    indent,
  )
}
