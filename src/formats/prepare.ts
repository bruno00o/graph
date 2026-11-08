import type { EdgeDash, NodeShape } from '../types'
import type {
  AttributeDeclaration,
  AttributeType,
  AttributeValue,
  FileTime,
  GraphFormat,
  GraphInput,
  TimeFormat,
  WriteOptions,
} from './types'
import { fits, isPlainObject, sameValue, TypeGuess, toAttributeValue } from './values'

export type Entries = [string, AttributeValue][]

export interface WriteNode {
  id: string
  label?: string
  parent?: string
  x?: number
  y?: number
  size?: number
  color?: string
  shape?: NodeShape
  image?: string
  time?: FileTime
  spells?: FileTime[]
  attributes: Entries
}

export interface WriteEdge {
  id?: string
  source: string
  target: string
  directed: boolean
  label?: string
  type?: string
  weight?: number
  color?: string
  width?: number
  dash?: EdgeDash
  time?: FileTime
  spells?: FileTime[]
  attributes: Entries
}

export interface WriteGraph {
  id?: string
  label?: string
  type?: string
  directed: boolean
  timeFormat?: TimeFormat
  attributes: Entries
}

export interface Prepared {
  readonly graph: WriteGraph
  readonly nodes: WriteNode[]
  readonly edges: WriteEdge[]
  readonly declared: {
    readonly nodes: readonly AttributeDeclaration[]
    readonly edges: readonly AttributeDeclaration[]
    readonly graph: readonly AttributeDeclaration[]
  }
  readonly types: {
    readonly nodes: Readonly<Record<string, AttributeType>>
    readonly edges: Readonly<Record<string, AttributeType>>
  }
}

type Read = (datum: unknown) => unknown

const nodeShapes: ReadonlySet<string> = new Set(['circle', 'square', 'diamond', 'box'])
const edgeDashes: ReadonlySet<string> = new Set(['solid', 'dashed', 'dotted'])

function reader(given: unknown, fallback: string, used: Set<string>): Read | null {
  if (given === null) return null
  if (typeof given === 'function') return given as Read
  const name = typeof given === 'string' ? given : fallback
  used.add(name)
  return (datum) =>
    typeof datum === 'object' && datum !== null
      ? (datum as Record<string, unknown>)[name]
      : undefined
}

function get(read: Read | null, datum: unknown): unknown {
  return read === null ? undefined : read(datum)
}

function keyOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function moment(value: unknown): number | undefined {
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? undefined : time
  }
  return finite(value)
}

export function timeValue(value: unknown): FileTime | undefined {
  const instant = moment(value)
  if (instant !== undefined) return instant
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const span = value as { readonly start?: unknown; readonly end?: unknown }
  const start = moment(span.start)
  const end = moment(span.end)
  if (start === undefined && span.start != null) return undefined
  if (end === undefined && span.end != null) return undefined
  const result: { start?: number; end?: number } = {}
  if (start !== undefined) result.start = start
  if (end !== undefined) result.end = end
  return result
}

function spellsValue(value: unknown): FileTime[] | undefined {
  if (!Array.isArray(value)) return undefined
  const spells: FileTime[] = []
  for (const item of value) {
    const time = timeValue(item)
    if (time !== undefined) spells.push(time)
  }
  return spells.length > 0 ? spells : undefined
}

function attributeReader(given: unknown, used: ReadonlySet<string>): (datum: unknown) => Entries {
  const collect = (record: Readonly<Record<string, unknown>>, names: Iterable<string>) => {
    const entries: Entries = []
    for (const name of names) {
      const value = toAttributeValue(record[name])
      if (value !== undefined) entries.push([name, value])
    }
    return entries
  }
  if (Array.isArray(given)) {
    const names = given as readonly string[]
    return (datum) =>
      typeof datum === 'object' && datum !== null
        ? collect(datum as Record<string, unknown>, names)
        : []
  }
  if (typeof given === 'function') {
    return (datum) => {
      const record = (given as Read)(datum)
      return typeof record === 'object' && record !== null
        ? collect(record as Record<string, unknown>, Object.keys(record))
        : []
    }
  }
  return (datum) => {
    if (typeof datum !== 'object' || datum === null) return []
    const record = datum as Record<string, unknown>
    const { attributes } = datum as { readonly attributes?: unknown }
    if (isPlainObject(attributes)) return collect(attributes, Object.keys(attributes))
    return collect(
      record,
      Object.keys(record).filter((name) => !used.has(name) && name !== 'attributes'),
    )
  }
}

function graphOf<N, E>(input: GraphInput<N, E>, options: WriteOptions<N, E>): WriteGraph {
  const given = input.graph
  const graph: WriteGraph = {
    directed: options.directed ?? given?.directed ?? true,
    attributes: [],
  }
  if (typeof given?.id === 'string') graph.id = given.id
  if (typeof given?.label === 'string') graph.label = given.label
  if (typeof given?.type === 'string') graph.type = given.type
  if (given?.timeFormat !== undefined) graph.timeFormat = given.timeFormat
  const attributes = given?.attributes
  if (attributes !== undefined) {
    for (const name of Object.keys(attributes)) {
      const value = toAttributeValue(attributes[name])
      if (value !== undefined) graph.attributes.push([name, value])
    }
  }
  return graph
}

export function prepare<N, E>(
  format: GraphFormat,
  input: GraphInput<N, E>,
  options: WriteOptions<N, E> = {},
): Prepared {
  const graph = graphOf(input, options)
  const nodeOptions = options.nodes ?? {}
  const edgeOptions = options.edges ?? {}
  const positions = options.positions

  const nodeUsed = new Set<string>()
  const read = {
    key: reader(nodeOptions.key, 'id', nodeUsed) as Read,
    label: reader(nodeOptions.label, 'label', nodeUsed),
    parent: reader(nodeOptions.parent, 'parent', nodeUsed),
    x: reader(nodeOptions.x, 'x', nodeUsed),
    y: reader(nodeOptions.y, 'y', nodeUsed),
    size: reader(nodeOptions.size, 'size', nodeUsed),
    color: reader(nodeOptions.color, 'color', nodeUsed),
    shape: reader(nodeOptions.shape, 'shape', nodeUsed),
    image: reader(nodeOptions.image, 'image', nodeUsed),
    time: reader(nodeOptions.time, 'time', nodeUsed),
    spells: reader(nodeOptions.spells, 'spells', nodeUsed),
  }
  const nodeAttributes = attributeReader(nodeOptions.attributes, nodeUsed)

  const nodes: WriteNode[] = []
  let index = 0
  for (const datum of input.nodes) {
    const id = keyOf(read.key(datum))
    if (id === undefined) throw new TypeError(`${format}: node ${index} has no key`)
    index += 1
    const node: WriteNode = { id, attributes: nodeAttributes(datum) }
    const label = text(get(read.label, datum))
    if (label !== undefined) node.label = label
    const parent = keyOf(get(read.parent, datum))
    if (parent !== undefined) node.parent = parent
    const point = positions?.get(id) ?? positions?.get(Number(id))
    const x = finite(point?.x) ?? finite(get(read.x, datum))
    const y = finite(point?.y) ?? finite(get(read.y, datum))
    if (x !== undefined) node.x = x
    if (y !== undefined) node.y = y
    const size = finite(get(read.size, datum))
    if (size !== undefined) node.size = size
    const color = get(read.color, datum)
    if (typeof color === 'string' && color !== '') node.color = color
    const shape = get(read.shape, datum)
    if (typeof shape === 'string' && nodeShapes.has(shape)) node.shape = shape as NodeShape
    const image = get(read.image, datum)
    if (typeof image === 'string' && image !== '') node.image = image
    const time = timeValue(get(read.time, datum))
    if (time !== undefined) node.time = time
    const spells = spellsValue(get(read.spells, datum))
    if (spells !== undefined) node.spells = spells
    nodes.push(node)
  }

  const edgeUsed = new Set<string>()
  const readEdge = {
    key: reader(edgeOptions.key, 'id', edgeUsed),
    source: reader(edgeOptions.source, 'source', edgeUsed) as Read,
    target: reader(edgeOptions.target, 'target', edgeUsed) as Read,
    directed: reader(edgeOptions.directed, 'directed', edgeUsed),
    label: reader(edgeOptions.label, 'label', edgeUsed),
    type: reader(edgeOptions.type, 'type', edgeUsed),
    weight: reader(edgeOptions.weight, 'weight', edgeUsed),
    color: reader(edgeOptions.color, 'color', edgeUsed),
    width: reader(edgeOptions.width, 'width', edgeUsed),
    dash: reader(edgeOptions.dash, 'dash', edgeUsed),
    time: reader(edgeOptions.time, 'time', edgeUsed),
    spells: reader(edgeOptions.spells, 'spells', edgeUsed),
  }
  const edgeAttributes = attributeReader(edgeOptions.attributes, edgeUsed)

  const edges: WriteEdge[] = []
  index = 0
  for (const datum of input.edges ?? []) {
    const source = keyOf(readEdge.source(datum))
    const target = keyOf(readEdge.target(datum))
    if (source === undefined || target === undefined) {
      throw new TypeError(`${format}: edge ${index} has no source or no target`)
    }
    index += 1
    const directed = get(readEdge.directed, datum)
    const edge: WriteEdge = {
      source,
      target,
      directed: typeof directed === 'boolean' ? directed : graph.directed,
      attributes: edgeAttributes(datum),
    }
    const id = keyOf(get(readEdge.key, datum))
    if (id !== undefined) edge.id = id
    const label = text(get(readEdge.label, datum))
    if (label !== undefined) edge.label = label
    const type = get(readEdge.type, datum)
    if (typeof type === 'string') edge.type = type
    const weight = finite(get(readEdge.weight, datum))
    if (weight !== undefined) edge.weight = weight
    const color = get(readEdge.color, datum)
    if (typeof color === 'string' && color !== '') edge.color = color
    const width = finite(get(readEdge.width, datum))
    if (width !== undefined) edge.width = width
    const dash = get(readEdge.dash, datum)
    if (typeof dash === 'string' && edgeDashes.has(dash)) edge.dash = dash as EdgeDash
    const time = timeValue(get(readEdge.time, datum))
    if (time !== undefined) edge.time = time
    const spells = spellsValue(get(readEdge.spells, datum))
    if (spells !== undefined) edge.spells = spells
    edges.push(edge)
  }

  return {
    graph,
    nodes,
    edges,
    declared: {
      nodes: input.schema?.nodes ?? [],
      edges: input.schema?.edges ?? [],
      graph: input.schema?.graph ?? [],
    },
    types: { nodes: nodeOptions.types ?? {}, edges: edgeOptions.types ?? {} },
  }
}

export interface Column {
  readonly name: string
  readonly type: AttributeType
  readonly default?: AttributeValue
}

export function columnsOf(
  rows: readonly Entries[],
  declared: readonly AttributeDeclaration[],
  explicit: Readonly<Record<string, AttributeType>>,
  defaults: boolean,
): Column[] {
  const guesses = new Map<string, TypeGuess>()
  const values = new Map<string, AttributeValue[]>()
  for (const entries of rows) {
    for (const [name, value] of entries) {
      if (value === null) continue
      let guess = guesses.get(name)
      if (guess === undefined) {
        guess = new TypeGuess()
        guesses.set(name, guess)
        values.set(name, [])
      }
      guess.add(value)
      ;(values.get(name) as AttributeValue[]).push(value)
    }
  }
  const declarations = new Map(declared.map((declaration) => [declaration.name, declaration]))
  const names: string[] = []
  for (const declaration of declared) {
    if (guesses.has(declaration.name) || (defaults && declaration.default !== undefined)) {
      names.push(declaration.name)
    }
  }
  const listed = new Set(names)
  for (const name of guesses.keys()) if (!listed.has(name)) names.push(name)
  return names.map((name) => {
    const seen = values.get(name) ?? []
    const declaration = declarations.get(name)
    const forced = explicit[name]
    let type: AttributeType
    if (forced !== undefined) type = forced
    else if (
      declaration !== undefined &&
      seen.every((value) => fits(declaration.type, value)) &&
      (declaration.default === undefined || fits(declaration.type, declaration.default))
    ) {
      type = declaration.type
    } else type = guesses.get(name)?.type() ?? 'string'
    const fallback = declaration?.default
    return defaults && fallback !== undefined && fallback !== null && fits(type, fallback)
      ? { name, type, default: fallback }
      : { name, type }
  })
}

export function isDefault(column: Column, value: AttributeValue): boolean {
  return column.default !== undefined && sameValue(column.default, value)
}

export function nodeFieldEntries(
  node: WriteNode,
  parent: boolean,
  timeAs: 'columns' | 'value',
): Entries {
  const entries: Entries = []
  if (node.label !== undefined) entries.push(['label', node.label])
  if (parent && node.parent !== undefined) entries.push(['parent', node.parent])
  if (node.x !== undefined) entries.push(['x', node.x])
  if (node.y !== undefined) entries.push(['y', node.y])
  if (node.size !== undefined) entries.push(['size', node.size])
  if (node.color !== undefined) entries.push(['color', node.color])
  if (node.shape !== undefined) entries.push(['shape', node.shape])
  if (node.image !== undefined) entries.push(['image', node.image])
  pushTime(entries, node.time, node.spells, timeAs)
  return entries
}

export function edgeFieldEntries(
  edge: WriteEdge,
  timeAs: 'columns' | 'value',
  named: boolean,
): Entries {
  const entries: Entries = []
  if (named && edge.label !== undefined) entries.push(['label', edge.label])
  if (named && edge.type !== undefined) entries.push(['type', edge.type])
  if (edge.weight !== undefined) entries.push(['weight', edge.weight])
  if (edge.color !== undefined) entries.push(['color', edge.color])
  if (edge.width !== undefined) entries.push(['width', edge.width])
  if (edge.dash !== undefined) entries.push(['dash', edge.dash])
  pushTime(entries, edge.time, edge.spells, timeAs)
  return entries
}

function pushTime(
  entries: Entries,
  time: FileTime | undefined,
  spells: readonly FileTime[] | undefined,
  timeAs: 'columns' | 'value',
): void {
  if (timeAs === 'value') {
    if (time !== undefined) entries.push(['time', typeof time === 'number' ? time : { ...time }])
    if (spells !== undefined) {
      entries.push([
        'spells',
        spells.map((spell) => (typeof spell === 'number' ? spell : { ...spell })),
      ])
    }
    return
  }
  if (time === undefined) return
  if (typeof time === 'number') entries.push(['time', time])
  else {
    if (time.start !== undefined) entries.push(['start', time.start])
    if (time.end !== undefined) entries.push(['end', time.end])
  }
}

export function merged(fields: Entries, attributes: Entries): Entries {
  if (fields.length === 0) return attributes
  const names = new Set(fields.map(([name]) => name))
  return [...fields, ...attributes.filter(([name]) => !names.has(name))]
}
