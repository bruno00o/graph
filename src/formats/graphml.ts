import {
  assign,
  type EdgeDraft,
  type EdgeField,
  edgeFieldOf,
  FileBuilder,
  liftEdge,
  liftNode,
  type NodeDraft,
  type NodeField,
  nodeFieldOf,
} from './builder'
import { FormatError } from './errors'
import {
  type Column,
  columnsOf,
  type Entries,
  edgeFieldEntries,
  isDefault,
  merged,
  nodeFieldEntries,
  prepare,
  type WriteNode,
} from './prepare'
import type {
  AttributeDeclaration,
  AttributeType,
  AttributeValue,
  FileAttributes,
  FileGraph,
  GraphFile,
  GraphInput,
  ReadOptions,
  WriteOptions,
} from './types'
import { formatScalar, parseScalar, type ScalarType, setField } from './values'
import { attributeOf, escapeAttribute, escapeText, parseXml, type XmlElement, xmlSafe } from './xml'

type Domain = 'nodes' | 'edges' | 'graph'

interface Key {
  readonly id: string
  readonly domain: Domain | 'all' | 'other'
  readonly type: ScalarType
  readonly sourceName: string
  readonly offset: number
  readonly defaultText: string | undefined
}

interface Resolved {
  readonly key: Key
  readonly name: string
  readonly nodeField: NodeField | undefined
  readonly edgeField: EdgeField | undefined
  readonly fallback: AttributeValue | undefined
}

const typeNames: Readonly<Record<string, ScalarType>> = {
  boolean: 'boolean',
  int: 'integer',
  long: 'long',
  float: 'float',
  double: 'double',
  string: 'string',
}

const domains: Readonly<Record<string, Domain | 'all'>> = {
  node: 'nodes',
  edge: 'edges',
  graph: 'graph',
  all: 'all',
}

function textOf(element: XmlElement): string {
  return element.text
}

class GraphmlReader {
  readonly builder: FileBuilder
  readonly fields: boolean
  readonly keys = new Map<string, Key>()
  readonly resolved = new Map<Domain, Map<string, Resolved>>()
  readonly defaults = new Map<Domain, Resolved[]>()
  readonly schema: Record<Domain, AttributeDeclaration[]> = { nodes: [], edges: [], graph: [] }
  graph: FileGraph | undefined

  constructor(text: string, fields: boolean) {
    this.builder = new FileBuilder(text)
    this.fields = fields
  }

  declare(element: XmlElement): void {
    const id = attributeOf(element, 'id')
    if (id === undefined) return
    const domain = domains[attributeOf(element, 'for') ?? 'all'] ?? 'other'
    const typeName = attributeOf(element, 'attr.type')
    const type = (typeName !== undefined ? typeNames[typeName.trim()] : undefined) ?? 'string'
    const fallback = element.children.find((child) => child.name === 'default')
    if (element.children.some((child) => child.name !== 'default' && child.name !== 'desc')) {
      this.builder.unsupported('structured-data', element.offset)
    }
    this.keys.set(id, {
      id,
      domain,
      type,
      sourceName: attributeOf(element, 'attr.name') ?? id,
      offset: element.offset,
      defaultText: fallback === undefined ? undefined : textOf(fallback),
    })
  }

  resolve(): void {
    for (const domain of ['nodes', 'edges', 'graph'] as const) {
      const byId = new Map<string, Resolved>()
      const names = new Set<string>()
      const withDefaults: Resolved[] = []
      for (const key of this.keys.values()) {
        if (key.domain !== domain && key.domain !== 'all') continue
        const name = names.has(key.sourceName) ? key.id : key.sourceName
        names.add(name)
        let fallback: AttributeValue | undefined
        if (key.defaultText !== undefined) {
          fallback = parseScalar(key.type, key.defaultText)
          if (fallback === undefined) {
            this.builder.invalid(domain, name, key.defaultText, key.offset)
            fallback = key.defaultText
          }
        }
        const resolved: Resolved = {
          key,
          name,
          nodeField:
            this.fields && domain === 'nodes' ? nodeFieldOf(name, ['parent', 'spells']) : undefined,
          edgeField:
            this.fields && domain === 'edges'
              ? edgeFieldOf(name, ['spells', 'directed'])
              : undefined,
          fallback,
        }
        byId.set(key.id, resolved)
        if (fallback !== undefined) withDefaults.push(resolved)
        const declaration: AttributeDeclaration =
          fallback === undefined
            ? { name, type: key.type }
            : { name, type: key.type, default: fallback }
        this.schema[domain].push(declaration)
      }
      this.resolved.set(domain, byId)
      this.defaults.set(domain, withDefaults)
    }
  }

  value(domain: Domain, data: XmlElement): [Resolved | string, AttributeValue] | undefined {
    const id = attributeOf(data, 'key')
    if (id === undefined) return undefined
    if (data.children.length > 0) {
      this.builder.unsupported('structured-data', data.offset)
      return undefined
    }
    const text = textOf(data)
    const resolved = this.resolved.get(domain)?.get(id)
    if (resolved === undefined) {
      this.builder.unknown(domain, id, data.offset)
      return [id, text]
    }
    const value = parseScalar(resolved.key.type, text)
    if (value === undefined) {
      this.builder.invalid(domain, resolved.name, text, data.offset)
      return [resolved, text]
    }
    return [resolved, value]
  }

  node(element: XmlElement, parent: string | undefined): void {
    const id = attributeOf(element, 'id')
    if (id === undefined) {
      this.builder.missingId(element.offset)
      return
    }
    const draft: NodeDraft = { id, attributes: {} }
    if (parent !== undefined) draft.parent = parent
    const nested: XmlElement[] = []
    for (const child of element.children) {
      switch (child.name) {
        case 'data': {
          const entry = this.value('nodes', child)
          if (entry === undefined) break
          const [resolved, value] = entry
          if (typeof resolved === 'string') assign(draft.attributes, resolved, value)
          else if (
            resolved.nodeField === undefined ||
            !liftNode(draft, resolved.nodeField, value)
          ) {
            assign(draft.attributes, resolved.name, value)
          }
          break
        }
        case 'graph':
          nested.push(child)
          break
        case 'port':
          this.builder.unsupported('port', child.offset)
          break
        case 'locator':
          this.builder.unsupported('locator', child.offset)
          break
      }
    }
    for (const resolved of this.defaults.get('nodes') ?? []) {
      if (Object.hasOwn(draft.attributes, resolved.name)) continue
      const fallback = resolved.fallback as AttributeValue
      if (resolved.nodeField !== undefined && this.hasNodeField(draft, resolved.nodeField)) continue
      if (resolved.nodeField === undefined || !liftNode(draft, resolved.nodeField, fallback)) {
        assign(draft.attributes, resolved.name, fallback)
      }
    }
    this.builder.addNode(draft, element.offset)
    for (const graph of nested) this.walk(graph, id, false)
  }

  hasNodeField(draft: NodeDraft, field: NodeField): boolean {
    if (field === 'start' || field === 'end') {
      return typeof draft.time === 'object' && draft.time[field] !== undefined
    }
    return draft[field] !== undefined
  }

  hasEdgeField(draft: EdgeDraft, field: EdgeField): boolean {
    if (field === 'start' || field === 'end') {
      return typeof draft.time === 'object' && draft.time[field] !== undefined
    }
    return field !== 'directed' && draft[field] !== undefined
  }

  edge(element: XmlElement, directedByDefault: boolean): void {
    const source = attributeOf(element, 'source')
    const target = attributeOf(element, 'target')
    const id = attributeOf(element, 'id')
    if (source === undefined || target === undefined) {
      this.builder.missingEnd(id, element.offset)
      return
    }
    if (
      attributeOf(element, 'sourceport') !== undefined ||
      attributeOf(element, 'targetport') !== undefined
    ) {
      this.builder.unsupported('port', element.offset)
    }
    const directed = attributeOf(element, 'directed')
    const draft: EdgeDraft = {
      source,
      target,
      directed: directed === undefined ? directedByDefault : directed.trim() !== 'false',
      attributes: {},
    }
    if (id !== undefined) draft.id = id
    for (const child of element.children) {
      if (child.name === 'data') {
        const entry = this.value('edges', child)
        if (entry === undefined) continue
        const [resolved, value] = entry
        if (typeof resolved === 'string') assign(draft.attributes, resolved, value)
        else if (resolved.edgeField === undefined || !liftEdge(draft, resolved.edgeField, value)) {
          assign(draft.attributes, resolved.name, value)
        }
      } else if (child.name === 'graph') {
        this.builder.unsupported('graph-in-edge', child.offset)
      }
    }
    for (const resolved of this.defaults.get('edges') ?? []) {
      if (Object.hasOwn(draft.attributes, resolved.name)) continue
      const fallback = resolved.fallback as AttributeValue
      if (resolved.edgeField !== undefined && this.hasEdgeField(draft, resolved.edgeField)) continue
      if (resolved.edgeField === undefined || !liftEdge(draft, resolved.edgeField, fallback)) {
        assign(draft.attributes, resolved.name, fallback)
      }
    }
    this.builder.addEdge(draft, element.offset)
  }

  walk(graph: XmlElement, parent: string | undefined, top: boolean): void {
    const directed = attributeOf(graph, 'edgedefault')?.trim() !== 'undirected'
    let attributes: Record<string, AttributeValue> | undefined
    if (top && this.graph === undefined) {
      attributes = {}
      const info: { -readonly [K in keyof FileGraph]: FileGraph[K] } = { directed, attributes }
      const id = attributeOf(graph, 'id')
      if (id !== undefined) info.id = id
      this.graph = info
    }
    for (const child of graph.children) {
      switch (child.name) {
        case 'node':
          this.node(child, parent)
          break
        case 'edge':
          this.edge(child, directed)
          break
        case 'hyperedge':
          this.builder.unsupported('hyperedge', child.offset)
          break
        case 'locator':
          this.builder.unsupported('locator', child.offset)
          break
        case 'data':
          if (attributes !== undefined) {
            const entry = this.value('graph', child)
            if (entry !== undefined) {
              const [resolved, value] = entry
              setField(attributes, typeof resolved === 'string' ? resolved : resolved.name, value)
            }
          }
          break
      }
    }
    if (attributes !== undefined) {
      for (const resolved of this.defaults.get('graph') ?? []) {
        if (!Object.hasOwn(attributes, resolved.name))
          setField(attributes, resolved.name, resolved.fallback)
      }
    }
  }
}

/**
 * Read a GraphML document. Nodes of nested graphs get the id of the node that holds the graph in
 * `parent`. Data are typed from the `<key>` declarations, with their defaults.
 */
export function readGraphml<N extends object = FileAttributes, E extends object = FileAttributes>(
  text: string,
  options: ReadOptions = {},
): GraphFile<N, E> {
  const root = parseXml('graphml', text)
  if (root.name !== 'graphml') {
    throw new FormatError('graphml', `the root element is <${root.name}>, expected <graphml>`)
  }
  const reader = new GraphmlReader(text, options.fields ?? true)
  for (const child of root.children) if (child.name === 'key') reader.declare(child)
  reader.resolve()
  for (const child of root.children) if (child.name === 'graph') reader.walk(child, undefined, true)
  return reader.builder.finish<N, E>(
    reader.graph ?? { directed: true, attributes: {} },
    reader.schema,
  )
}

const graphmlTypes: Readonly<Record<AttributeType, string>> = {
  string: 'string',
  boolean: 'boolean',
  integer: 'int',
  long: 'long',
  float: 'float',
  double: 'double',
  'string[]': 'string',
  'boolean[]': 'string',
  'integer[]': 'string',
  'long[]': 'string',
  'float[]': 'string',
  'double[]': 'string',
}

interface KeyColumn extends Column {
  readonly id: string
}

function keyColumns(columns: readonly Column[], prefix: string): Map<string, KeyColumn> {
  const map = new Map<string, KeyColumn>()
  columns.forEach((column, index) => {
    const type: AttributeType = graphmlTypes[column.type] === 'string' ? 'string' : column.type
    const base = column.type === type ? column : { ...column, type }
    map.set(column.name, { ...base, id: `${prefix}${index}` })
  })
  return map
}

function dataOf(entries: Entries, columns: ReadonlyMap<string, KeyColumn>, indent: string): string {
  let out = ''
  for (const [name, value] of entries) {
    if (value === null) continue
    const column = columns.get(name) as KeyColumn
    if (isDefault(column, value)) continue
    out += `${indent}<data key="${column.id}">${escapeText(xmlSafe(formatScalar(value)))}</data>\n`
  }
  return out
}

function keyLines(domain: string, columns: ReadonlyMap<string, KeyColumn>): string {
  let out = ''
  for (const column of columns.values()) {
    const head = `  <key id="${column.id}" for="${domain}" attr.name="${escapeAttribute(xmlSafe(column.name))}" attr.type="${graphmlTypes[column.type]}"`
    out +=
      column.default === undefined
        ? `${head}/>\n`
        : `${head}>\n    <default>${escapeText(xmlSafe(formatScalar(column.default)))}</default>\n  </key>\n`
  }
  return out
}

/**
 * Write a graph as GraphML. Nodes with a `parent` among the nodes are written in a nested graph of
 * that node. Label, position, size, color, shape, image and time become data of the same name.
 */
export function writeGraphml<N, E>(
  input: GraphInput<N, E>,
  options: WriteOptions<N, E> = {},
): string {
  const prepared = prepare('graphml', input, options)
  const { graph, nodes, edges } = prepared
  const nodeRows = nodes.map((node) =>
    merged(nodeFieldEntries(node, false, 'columns'), node.attributes),
  )
  const edgeRows = edges.map((edge) =>
    merged(edgeFieldEntries(edge, 'columns', true), edge.attributes),
  )
  const nodeColumns = keyColumns(
    columnsOf(nodeRows, prepared.declared.nodes, prepared.types.nodes, true),
    'n',
  )
  const edgeColumns = keyColumns(
    columnsOf(edgeRows, prepared.declared.edges, prepared.types.edges, true),
    'e',
  )
  const graphColumns = keyColumns(
    columnsOf([graph.attributes], prepared.declared.graph, {}, true),
    'g',
  )

  let out = '<?xml version="1.0" encoding="UTF-8"?>\n'
  out +=
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">\n'
  out += keyLines('graph', graphColumns)
  out += keyLines('node', nodeColumns)
  out += keyLines('edge', edgeColumns)
  const edgedefault = graph.directed ? 'directed' : 'undirected'
  const graphId = graph.id === undefined ? '' : ` id="${escapeAttribute(xmlSafe(graph.id))}"`
  out += `  <graph${graphId} edgedefault="${edgedefault}">\n`
  out += dataOf(graph.attributes, graphColumns, '    ')

  const ids = new Set(nodes.map((node) => node.id))
  const children = new Map<string, number[]>()
  const roots: number[] = []
  nodes.forEach((node, index) => {
    const parent = node.parent
    if (parent === undefined || parent === node.id || !ids.has(parent)) roots.push(index)
    else {
      const list = children.get(parent)
      if (list === undefined) children.set(parent, [index])
      else list.push(index)
    }
  })
  const written = new Uint8Array(nodes.length)
  const writeTree = (start: number, depth: number) => {
    const stack: { index: number; depth: number; close: boolean }[] = [
      { index: start, depth, close: false },
    ]
    while (stack.length > 0) {
      const item = stack.pop() as { index: number; depth: number; close: boolean }
      const node = nodes[item.index] as WriteNode
      const indent = '  '.repeat(item.depth)
      if (item.close) {
        out += `${indent}  </graph>\n${indent}</node>\n`
        continue
      }
      if (written[item.index] === 1) continue
      written[item.index] = 1
      const id = escapeAttribute(xmlSafe(node.id))
      const data = dataOf(nodeRows[item.index] as Entries, nodeColumns, `${indent}  `)
      const inner = (children.get(node.id) ?? []).filter((child) => written[child] === 0)
      if (inner.length === 0) {
        out +=
          data === ''
            ? `${indent}<node id="${id}"/>\n`
            : `${indent}<node id="${id}">\n${data}${indent}</node>\n`
        continue
      }
      out += `${indent}<node id="${id}">\n${data}${indent}  <graph id="${id}:" edgedefault="${edgedefault}">\n`
      stack.push({ index: item.index, depth: item.depth, close: true })
      for (let child = inner.length - 1; child >= 0; child--) {
        stack.push({ index: inner[child] as number, depth: item.depth + 2, close: false })
      }
    }
  }
  for (const index of roots) writeTree(index, 2)
  for (let index = 0; index < nodes.length; index++) if (written[index] === 0) writeTree(index, 2)

  edges.forEach((edge, index) => {
    let head = '    <edge'
    if (edge.id !== undefined) head += ` id="${escapeAttribute(xmlSafe(edge.id))}"`
    head += ` source="${escapeAttribute(xmlSafe(edge.source))}" target="${escapeAttribute(xmlSafe(edge.target))}"`
    if (edge.directed !== graph.directed) head += ` directed="${edge.directed}"`
    const data = dataOf(edgeRows[index] as Entries, edgeColumns, '      ')
    out += data === '' ? `${head}/>\n` : `${head}>\n${data}    </edge>\n`
  })
  out += '  </graph>\n</graphml>\n'
  return out
}
