import type { NodeShape } from '../types'
import {
  assign,
  type EdgeDraft,
  FileBuilder,
  type NodeDraft,
  parseTimeText,
  spanOf,
} from './builder'
import { FormatError } from './errors'
import { type Column, columnsOf, type Entries, isDefault, prepare, type WriteNode } from './prepare'
import type {
  AttributeDeclaration,
  AttributeType,
  AttributeValue,
  FileAttributes,
  FileGraph,
  FileTime,
  GexfWriteOptions,
  GraphFile,
  GraphInput,
  TimeFormat,
} from './types'
import {
  elementType,
  formatNumber,
  formatScalar,
  isListType,
  parseDecimal,
  parseScalar,
  setField,
} from './values'
import { attributeOf, escapeAttribute, escapeText, parseXml, type XmlElement, xmlSafe } from './xml'

const gexfTypes: Readonly<Record<string, AttributeType>> = {
  integer: 'integer',
  byte: 'integer',
  short: 'integer',
  long: 'long',
  biginteger: 'long',
  float: 'float',
  double: 'double',
  bigdecimal: 'double',
  boolean: 'boolean',
  string: 'string',
  char: 'string',
  anyURI: 'string',
  liststring: 'string[]',
  listchar: 'string[]',
  listboolean: 'boolean[]',
  listinteger: 'integer[]',
  listbyte: 'integer[]',
  listshort: 'integer[]',
  listlong: 'long[]',
  listbiginteger: 'long[]',
  listfloat: 'float[]',
  listdouble: 'double[]',
  listbigdecimal: 'double[]',
}

const timeFormats: ReadonlySet<string> = new Set(['integer', 'double', 'date', 'dateTime'])

interface Declared {
  readonly name: string
  readonly type: AttributeType
  readonly fallback: AttributeValue | undefined
}

type Kind = 'nodes' | 'edges'

function splitList(text: string): string[] | undefined {
  const trimmed = text.trim()
  if (!(trimmed.startsWith('[') && trimmed.endsWith(']'))) return trimmed.split('|')
  const inner = trimmed.slice(1, -1)
  const items: string[] = []
  let index = 0
  while (index < inner.length) {
    while (index < inner.length && /\s/.test(inner.charAt(index))) index++
    if (index >= inner.length) break
    const first = inner.charAt(index)
    let item: string
    if (first === '"' || first === "'") {
      const end = inner.indexOf(first, index + 1)
      if (end === -1) return undefined
      item = inner.slice(index + 1, end)
      index = end + 1
      while (index < inner.length && /\s/.test(inner.charAt(index))) index++
      if (index < inner.length && inner.charAt(index) !== ',') return undefined
    } else {
      const end = inner.indexOf(',', index)
      item = (end === -1 ? inner.slice(index) : inner.slice(index, end)).trim()
      index = end === -1 ? inner.length : end
    }
    items.push(item)
    if (inner.charAt(index) === ',') index++
  }
  return items
}

function parseTyped(type: AttributeType, text: string): AttributeValue | undefined {
  if (!isListType(type)) return parseScalar(elementType(type), text)
  const items = splitList(text)
  if (items === undefined) return undefined
  const element = elementType(type)
  const values: AttributeValue[] = []
  for (const item of items) {
    const value = parseScalar(element, item)
    if (value === undefined) return undefined
    values.push(value)
  }
  return values
}

function channel(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const number = Number(value.trim())
  return Number.isInteger(number) && number >= 0 && number <= 255 ? number : undefined
}

function hexPair(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function colorOf(element: XmlElement): string | undefined {
  const alphaText = attributeOf(element, 'a')
  const alpha = alphaText === undefined ? 1 : parseDecimal(alphaText)
  if (alpha === undefined || !(alpha >= 0 && alpha <= 1)) return undefined
  let r: number | undefined
  let g: number | undefined
  let b: number | undefined
  const hex = attributeOf(element, 'hex')
  if (hex !== undefined) {
    const digits = hex.trim().replace(/^#/, '')
    if (!/^[0-9a-fA-F]{6}$/.test(digits)) return undefined
    r = Number.parseInt(digits.slice(0, 2), 16)
    g = Number.parseInt(digits.slice(2, 4), 16)
    b = Number.parseInt(digits.slice(4, 6), 16)
  } else {
    r = channel(attributeOf(element, 'r'))
    g = channel(attributeOf(element, 'g'))
    b = channel(attributeOf(element, 'b'))
  }
  if (r === undefined || g === undefined || b === undefined) return undefined
  return alpha === 1
    ? `#${hexPair(r)}${hexPair(g)}${hexPair(b)}`
    : `rgba(${r}, ${g}, ${b}, ${formatNumber(alpha)})`
}

const nodeShapes: Readonly<Record<string, NodeShape>> = {
  disc: 'circle',
  square: 'square',
  diamond: 'diamond',
}

class GexfReader {
  readonly builder: FileBuilder
  readonly declared: Record<Kind, Map<string, Declared>> = { nodes: new Map(), edges: new Map() }
  readonly schema: { nodes: AttributeDeclaration[]; edges: AttributeDeclaration[] } = {
    nodes: [],
    edges: [],
  }
  directed = false

  constructor(text: string) {
    this.builder = new FileBuilder(text)
  }

  declare(element: XmlElement): void {
    const kind: Kind | undefined =
      attributeOf(element, 'class') === 'node'
        ? 'nodes'
        : attributeOf(element, 'class') === 'edge'
          ? 'edges'
          : undefined
    if (kind === undefined) return
    const names = new Set([...this.declared[kind].values()].map((declared) => declared.name))
    for (const child of element.children) {
      if (child.name !== 'attribute') continue
      const id = attributeOf(child, 'id')
      if (id === undefined) continue
      const title = attributeOf(child, 'title') ?? id
      const name = names.has(title) ? id : title
      names.add(name)
      const type = gexfTypes[(attributeOf(child, 'type') ?? 'string').trim()] ?? 'string'
      const fallbackElement = child.children.find((item) => item.name === 'default')
      let fallback: AttributeValue | undefined
      if (fallbackElement !== undefined) {
        fallback = parseTyped(type, fallbackElement.text)
        if (fallback === undefined) {
          this.builder.invalid(kind, name, fallbackElement.text, fallbackElement.offset)
          fallback = fallbackElement.text
        }
      }
      this.declared[kind].set(id, { name, type, fallback })
      this.schema[kind].push(
        fallback === undefined ? { name, type } : { name, type, default: fallback },
      )
    }
  }

  moment(kind: Kind, name: string, text: string, offset: number): number | undefined {
    const value = parseTimeText(text, true)
    if (value === undefined) this.builder.invalid(kind, name, text, offset)
    return value
  }

  interval(
    kind: Kind,
    element: XmlElement,
    start: string | undefined,
    end: string | undefined,
  ): FileTime | undefined {
    if (start === undefined && end === undefined) return undefined
    const first =
      start === undefined ? undefined : this.moment(kind, 'start', start, element.offset)
    const last = end === undefined ? undefined : this.moment(kind, 'end', end, element.offset)
    if (first !== undefined && first === last) return first
    const span: { start?: number; end?: number } = {}
    if (first !== undefined) span.start = first
    if (last !== undefined) span.end = last
    return span
  }

  spellOf(kind: Kind, element: XmlElement): FileTime | undefined {
    const timestamp = attributeOf(element, 'timestamp')
    if (timestamp !== undefined) return this.moment(kind, 'timestamp', timestamp, element.offset)
    return this.interval(
      kind,
      element,
      attributeOf(element, 'start') ?? attributeOf(element, 'startopen'),
      attributeOf(element, 'end') ?? attributeOf(element, 'endopen'),
    )
  }

  timeOf(kind: Kind, element: XmlElement, draft: NodeDraft | EdgeDraft): void {
    const spells: FileTime[] = []
    const spellsElement = element.children.find((child) => child.name === 'spells')
    if (spellsElement !== undefined) {
      for (const spell of spellsElement.children) {
        if (spell.name !== 'spell') continue
        const time = this.spellOf(kind, spell)
        if (time !== undefined) spells.push(time)
      }
    } else {
      const timestamps = attributeOf(element, 'timestamps')
      const intervals = attributeOf(element, 'intervals')
      if (timestamps !== undefined) {
        for (const item of timestamps.replace(/^\s*<?\s*\[?|\]?\s*>?\s*$/g, '').split(',')) {
          if (item.trim() === '') continue
          const time = this.moment(kind, 'timestamps', item, element.offset)
          if (time !== undefined) spells.push(time)
        }
      } else if (intervals !== undefined) {
        for (const item of intervals.replace(/^\s*<|>\s*$/g, '').split(';')) {
          const bounds = item
            .trim()
            .replace(/^\[|\]$/g, '')
            .split(',')
          if (bounds.length < 2) continue
          const time = this.interval(
            kind,
            element,
            (bounds[0] as string).trim(),
            (bounds[1] as string).trim(),
          )
          if (time !== undefined) spells.push(time)
        }
      } else {
        const time = this.spellOf(kind, element)
        if (time !== undefined) spells.push(time)
      }
    }
    if (spells.length === 0) return
    draft.time = spanOf(spells)
    if (spells.length > 1) draft.spells = spells
  }

  values(kind: Kind, element: XmlElement, target: Record<string, AttributeValue>): void {
    const declared = this.declared[kind]
    const seen = new Set<string>()
    for (const group of element.children) {
      if (group.name !== 'attvalues') continue
      for (const value of group.children) {
        if (value.name !== 'attvalue') continue
        const id = attributeOf(value, 'for') ?? attributeOf(value, 'id')
        const text = attributeOf(value, 'value')
        if (id === undefined || text === undefined) continue
        if (seen.has(id)) {
          this.builder.unsupported('dynamic-attribute', value.offset)
          continue
        }
        seen.add(id)
        const declaration = declared.get(id)
        if (declaration === undefined) {
          this.builder.unknown(kind, id, value.offset)
          assign(target, id, text)
          continue
        }
        const parsed = parseTyped(declaration.type, text)
        if (parsed === undefined) this.builder.invalid(kind, declaration.name, text, value.offset)
        assign(target, declaration.name, parsed ?? text)
      }
    }
    for (const declaration of declared.values()) {
      if (declaration.fallback !== undefined && !Object.hasOwn(target, declaration.name)) {
        assign(target, declaration.name, declaration.fallback)
      }
    }
  }

  number(kind: Kind, name: string, element: XmlElement, attribute: string): number | undefined {
    const text = attributeOf(element, attribute)
    if (text === undefined) return undefined
    const value = parseDecimal(text)
    if (value === undefined || !Number.isFinite(value)) {
      this.builder.invalid(kind, name, text, element.offset)
      return undefined
    }
    return value
  }

  node(element: XmlElement, parent: string | undefined): void {
    const id = attributeOf(element, 'id')
    if (id === undefined) {
      this.builder.missingId(element.offset)
      return
    }
    const draft: NodeDraft = { id, attributes: {} }
    const label = attributeOf(element, 'label')
    if (label !== undefined) draft.label = label
    const pid = parent ?? attributeOf(element, 'pid')
    if (pid !== undefined) draft.parent = pid
    this.values('nodes', element, draft.attributes)
    this.timeOf('nodes', element, draft)
    const inner: XmlElement[] = []
    for (const child of element.children) {
      switch (child.name) {
        case 'color': {
          const color = colorOf(child)
          if (color === undefined) this.builder.invalid('nodes', 'color', '', child.offset)
          else draft.color = color
          break
        }
        case 'position': {
          const x = this.number('nodes', 'x', child, 'x')
          const y = this.number('nodes', 'y', child, 'y')
          if (x !== undefined && y !== undefined) {
            draft.x = x
            draft.y = y
          }
          break
        }
        case 'size': {
          const size = this.number('nodes', 'size', child, 'value')
          if (size !== undefined) draft.size = size
          break
        }
        case 'shape': {
          const value = attributeOf(child, 'value')?.trim() ?? 'disc'
          const uri = attributeOf(child, 'uri')
          if (value === 'image' && uri !== undefined && uri !== '') draft.image = uri
          else if (nodeShapes[value] !== undefined) draft.shape = nodeShapes[value]
          else this.builder.unsupported('node-shape', child.offset)
          break
        }
        case 'parents':
          this.builder.unsupported('phylogeny', child.offset)
          break
        case 'nodes':
        case 'edges':
          inner.push(child)
          break
      }
    }
    this.builder.addNode(draft, element.offset)
    for (const child of inner) {
      if (child.name === 'nodes') this.nodes(child, id)
      else this.edges(child)
    }
  }

  nodes(element: XmlElement, parent: string | undefined): void {
    for (const child of element.children) if (child.name === 'node') this.node(child, parent)
  }

  edge(element: XmlElement): void {
    const source = attributeOf(element, 'source')
    const target = attributeOf(element, 'target')
    const id = attributeOf(element, 'id')
    if (source === undefined || target === undefined) {
      this.builder.missingEnd(id, element.offset)
      return
    }
    const type = attributeOf(element, 'type')?.trim()
    const draft: EdgeDraft = {
      source,
      target,
      directed: type === undefined ? this.directed : type === 'directed',
      attributes: {},
    }
    if (id !== undefined) draft.id = id
    const label = attributeOf(element, 'label')
    if (label !== undefined) draft.label = label
    const kind = attributeOf(element, 'kind')
    if (kind !== undefined) draft.type = kind
    const weight = this.number('edges', 'weight', element, 'weight')
    if (weight !== undefined) draft.weight = weight
    this.values('edges', element, draft.attributes)
    this.timeOf('edges', element, draft)
    for (const child of element.children) {
      switch (child.name) {
        case 'color': {
          const color = colorOf(child)
          if (color === undefined) this.builder.invalid('edges', 'color', '', child.offset)
          else draft.color = color
          break
        }
        case 'thickness': {
          const width = this.number('edges', 'width', child, 'value')
          if (width !== undefined) draft.width = width
          break
        }
        case 'shape': {
          const value = attributeOf(child, 'value')?.trim() ?? 'solid'
          if (value === 'solid' || value === 'dashed' || value === 'dotted') draft.dash = value
          else this.builder.unsupported('edge-shape', child.offset)
          break
        }
      }
    }
    this.builder.addEdge(draft, element.offset)
  }

  edges(element: XmlElement): void {
    for (const child of element.children) if (child.name === 'edge') this.edge(child)
  }
}

/**
 * Read a GEXF document, version 1.2 or 1.3. The `viz` module gives position, size, color, shape and
 * image; dynamic data gives `time`, and `spells` when an element exists more than once.
 */
export function readGexf<N extends object = FileAttributes, E extends object = FileAttributes>(
  text: string,
): GraphFile<N, E> {
  const root = parseXml('gexf', text)
  if (root.name !== 'gexf') {
    throw new FormatError('gexf', `the root element is <${root.name}>, expected <gexf>`)
  }
  const graphElement = root.children.find((child) => child.name === 'graph')
  if (graphElement === undefined) throw new FormatError('gexf', 'the document has no <graph>')
  const reader = new GexfReader(text)
  const edgeType = attributeOf(graphElement, 'defaultedgetype')?.trim()
  reader.directed = edgeType === 'directed'
  const attributes: Record<string, AttributeValue> = {}
  const meta = root.children.find((child) => child.name === 'meta')
  if (meta !== undefined) {
    const modified = attributeOf(meta, 'lastmodifieddate')
    if (modified !== undefined) setField(attributes, 'lastmodifieddate', modified)
    for (const child of meta.children) {
      if (child.name === 'creator' || child.name === 'keywords' || child.name === 'description') {
        setField(attributes, child.name, child.text)
      }
    }
  }
  const graph: { -readonly [K in keyof FileGraph]: FileGraph[K] } = {
    directed: reader.directed,
    attributes,
  }
  const timeFormat = attributeOf(graphElement, 'timeformat')?.trim()
  if (timeFormat !== undefined && timeFormats.has(timeFormat)) {
    graph.timeFormat = timeFormat as TimeFormat
  }
  if (attributeOf(graphElement, 'timezone') !== undefined) {
    reader.builder.unsupported('time-zone', graphElement.offset)
  }
  for (const child of graphElement.children) if (child.name === 'attributes') reader.declare(child)
  for (const child of graphElement.children) {
    if (child.name === 'nodes') reader.nodes(child, undefined)
  }
  for (const child of graphElement.children) if (child.name === 'edges') reader.edges(child)
  return reader.builder.finish<N, E>(graph, { ...reader.schema, graph: [] })
}

const typeNames13: Readonly<Record<AttributeType, string>> = {
  string: 'string',
  boolean: 'boolean',
  integer: 'integer',
  long: 'long',
  float: 'float',
  double: 'double',
  'string[]': 'liststring',
  'boolean[]': 'listboolean',
  'integer[]': 'listinteger',
  'long[]': 'listlong',
  'float[]': 'listfloat',
  'double[]': 'listdouble',
}

function typeName(version: '1.2' | '1.3', type: AttributeType): string {
  if (version === '1.2' && isListType(type)) return 'liststring'
  return typeNames13[type]
}

function listItem(value: AttributeValue): string {
  if (typeof value !== 'string') return formatScalar(value)
  if (value !== '' && !/[,[\]"']|^\s|\s$/.test(value)) return value
  return value.includes('"') ? `'${value}'` : `"${value}"`
}

function valueText(version: '1.2' | '1.3', value: AttributeValue): string {
  if (!Array.isArray(value)) return formatScalar(value)
  const items = value as readonly AttributeValue[]
  if (version === '1.2') return items.map((item) => formatScalar(item)).join('|')
  return `[${items.map(listItem).join(', ')}]`
}

function parseColor(value: string): [number, number, number, number] | undefined {
  const text = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)
  if (hex !== null) {
    let digits = hex[1] as string
    if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join('')
    const parts = [0, 2, 4, 6].map((at) => Number.parseInt(digits.slice(at, at + 2) || 'ff', 16))
    return [parts[0] as number, parts[1] as number, parts[2] as number, (parts[3] as number) / 255]
  }
  const functional = /^rgba?\(([^)]*)\)$/.exec(text)
  if (functional === null) return undefined
  const parts = (functional[1] as string).split(/\s*[,/]\s*|\s+/).filter((part) => part !== '')
  if (parts.length < 3 || parts.length > 4) return undefined
  const channels = parts
    .slice(0, 3)
    .map((part) => (part.endsWith('%') ? (Number(part.slice(0, -1)) * 255) / 100 : Number(part)))
  const alphaText = parts[3]
  const alpha =
    alphaText === undefined
      ? 1
      : alphaText.endsWith('%')
        ? Number(alphaText.slice(0, -1)) / 100
        : Number(alphaText)
  if (channels.some((part) => !Number.isFinite(part)) || !Number.isFinite(alpha)) return undefined
  const [r, g, b] = channels.map((part) => Math.min(255, Math.max(0, Math.round(part))))
  return [r as number, g as number, b as number, Math.min(1, Math.max(0, alpha))]
}

function colorTag(value: string | undefined, indent: string): string {
  if (value === undefined) return ''
  const color = parseColor(value)
  if (color === undefined) return ''
  const [r, g, b, a] = color
  const alpha = a < 1 ? ` a="${formatNumber(a)}"` : ''
  return `${indent}<viz:color r="${r}" g="${g}" b="${b}"${alpha}/>\n`
}

const shapeNames: Readonly<Partial<Record<NodeShape, string>>> = {
  circle: 'disc',
  square: 'square',
  diamond: 'diamond',
}

/**
 * Write a graph as GEXF 1.3, or 1.2 with `version: '1.2'`. Position, size, color, shape and image
 * go to the `viz` module, `parent` to `pid`, edge `type` to `kind`, `time` and `spells` to
 * dynamic data.
 */
export function writeGexf<N, E>(
  input: GraphInput<N, E>,
  options: GexfWriteOptions<N, E> = {},
): string {
  const version = options.version ?? '1.3'
  const prepared = prepare('gexf', input, options)
  const { graph, nodes, edges } = prepared
  for (const node of nodes) {
    const kept = new Set(node.attributes.map(([name]) => name))
    const extra: Entries = []
    if (node.color !== undefined && parseColor(node.color) === undefined && !kept.has('color')) {
      extra.push(['color', node.color])
    }
    if (node.shape === 'box' && node.image === undefined && !kept.has('shape')) {
      extra.push(['shape', node.shape])
    }
    if (extra.length > 0) node.attributes = [...extra, ...node.attributes]
  }
  for (const edge of edges) {
    if (
      edge.color !== undefined &&
      parseColor(edge.color) === undefined &&
      !edge.attributes.some(([name]) => name === 'color')
    ) {
      edge.attributes = [['color', edge.color], ...edge.attributes]
    }
  }
  const nodeColumns = columnsOf(
    nodes.map((node) => node.attributes),
    prepared.declared.nodes,
    prepared.types.nodes,
    true,
  )
  const edgeColumns = columnsOf(
    edges.map((edge) => edge.attributes),
    prepared.declared.edges,
    prepared.types.edges,
    true,
  )

  const moments: number[] = []
  const collect = (time: FileTime | undefined) => {
    if (typeof time === 'number') moments.push(time)
    else if (time !== undefined) {
      if (time.start !== undefined) moments.push(time.start)
      if (time.end !== undefined) moments.push(time.end)
    }
  }
  for (const item of [...nodes, ...edges]) {
    collect(item.time)
    for (const spell of item.spells ?? []) collect(spell)
  }
  let timeFormat: TimeFormat = options.timeFormat ?? graph.timeFormat ?? 'double'
  if (timeFormat === 'date' && moments.some((moment) => moment % 86400000 !== 0)) {
    timeFormat = 'dateTime'
  }
  if (timeFormat === 'integer' && moments.some((moment) => !Number.isInteger(moment))) {
    timeFormat = 'double'
  }
  const timeText = (moment: number) => {
    if (timeFormat === 'date' || timeFormat === 'dateTime') {
      const iso = new Date(moment).toISOString()
      return timeFormat === 'date' ? iso.slice(0, 10) : iso
    }
    return formatNumber(moment)
  }
  const bounds = (time: FileTime) => {
    const start = typeof time === 'number' ? time : time.start
    const end = typeof time === 'number' ? time : time.end
    return (
      (start === undefined ? '' : ` start="${timeText(start)}"`) +
      (end === undefined ? '' : ` end="${timeText(end)}"`)
    )
  }
  const timeAttributes = (time: FileTime | undefined, spells: readonly FileTime[] | undefined) =>
    spells === undefined && time !== undefined ? bounds(time) : ''
  const spellTags = (spells: readonly FileTime[] | undefined, indent: string) =>
    spells === undefined
      ? ''
      : `${indent}<spells>\n${spells.map((spell) => `${indent}  <spell${bounds(spell)}/>\n`).join('')}${indent}</spells>\n`
  const attvalues = (
    entries: Entries,
    columns: ReadonlyMap<string, [string, Column]>,
    indent: string,
  ) => {
    let out = ''
    for (const [name, value] of entries) {
      if (value === null) continue
      const [id, column] = columns.get(name) as [string, Column]
      if (isDefault(column, value)) continue
      out += `${indent}  <attvalue for="${id}" value="${escapeAttribute(xmlSafe(valueText(version, value)))}"/>\n`
    }
    return out === '' ? '' : `${indent}<attvalues>\n${out}${indent}</attvalues>\n`
  }
  const declarations = (kind: string, columns: readonly Column[]) => {
    if (columns.length === 0) return ''
    let out = `    <attributes class="${kind}">\n`
    columns.forEach((column, index) => {
      const head = `      <attribute id="${index}" title="${escapeAttribute(xmlSafe(column.name))}" type="${typeName(version, column.type)}"`
      out +=
        column.default === undefined
          ? `${head}/>\n`
          : `${head}>\n        <default>${escapeText(xmlSafe(valueText(version, column.default)))}</default>\n      </attribute>\n`
    })
    return `${out}    </attributes>\n`
  }
  const byName = (columns: readonly Column[]) =>
    new Map(
      columns.map((column, index) => [column.name, [String(index), column] as [string, Column]]),
    )
  const nodeIds = byName(nodeColumns)
  const edgeIds = byName(edgeColumns)

  const namespace = version === '1.3' ? 'http://gexf.net/1.3' : 'http://www.gexf.net/1.2draft'
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n'
  out += `<gexf xmlns="${namespace}" xmlns:viz="${namespace}/viz" version="${version}">\n`
  const meta = new Map(graph.attributes)
  const metaText = (['creator', 'keywords', 'description'] as const)
    .filter((name) => typeof meta.get(name) === 'string')
    .map((name) => `    <${name}>${escapeText(xmlSafe(meta.get(name) as string))}</${name}>\n`)
    .join('')
  const modified = meta.get('lastmodifieddate')
  if (metaText !== '' || typeof modified === 'string') {
    const date =
      typeof modified === 'string'
        ? ` lastmodifieddate="${escapeAttribute(xmlSafe(modified))}"`
        : ''
    out += metaText === '' ? `  <meta${date}/>\n` : `  <meta${date}>\n${metaText}  </meta>\n`
  }
  const dynamic = moments.length > 0
  out += `  <graph defaultedgetype="${graph.directed ? 'directed' : 'undirected'}"${dynamic ? ` mode="dynamic" timeformat="${timeFormat}"` : ''}>\n`
  out += declarations('node', nodeColumns)
  out += declarations('edge', edgeColumns)
  out += '    <nodes>\n'
  for (const node of nodes as WriteNode[]) {
    let head = `      <node id="${escapeAttribute(xmlSafe(node.id))}"`
    if (node.label !== undefined) head += ` label="${escapeAttribute(xmlSafe(node.label))}"`
    if (node.parent !== undefined && node.parent !== node.id) {
      head += ` pid="${escapeAttribute(xmlSafe(node.parent))}"`
    }
    head += timeAttributes(node.time, node.spells)
    let body = attvalues(node.attributes, nodeIds, '        ')
    body += spellTags(node.spells, '        ')
    body += colorTag(node.color, '        ')
    if (node.x !== undefined && node.y !== undefined) {
      body += `        <viz:position x="${formatNumber(node.x)}" y="${formatNumber(node.y)}"${version === '1.2' ? ' z="0"' : ''}/>\n`
    }
    if (node.size !== undefined && node.size >= 0) {
      body += `        <viz:size value="${formatNumber(node.size)}"/>\n`
    }
    if (node.image !== undefined) {
      body += `        <viz:shape value="image" uri="${escapeAttribute(xmlSafe(node.image))}"/>\n`
    } else if (node.shape !== undefined && shapeNames[node.shape] !== undefined) {
      body += `        <viz:shape value="${shapeNames[node.shape]}"/>\n`
    }
    out += body === '' ? `${head}/>\n` : `${head}>\n${body}      </node>\n`
  }
  out += '    </nodes>\n    <edges>\n'
  for (const edge of edges) {
    let head = '      <edge'
    if (edge.id !== undefined) head += ` id="${escapeAttribute(xmlSafe(edge.id))}"`
    head += ` source="${escapeAttribute(xmlSafe(edge.source))}" target="${escapeAttribute(xmlSafe(edge.target))}"`
    if (edge.directed !== graph.directed)
      head += ` type="${edge.directed ? 'directed' : 'undirected'}"`
    if (edge.label !== undefined) head += ` label="${escapeAttribute(xmlSafe(edge.label))}"`
    if (edge.weight !== undefined) head += ` weight="${formatNumber(edge.weight)}"`
    if (edge.type !== undefined) head += ` kind="${escapeAttribute(xmlSafe(edge.type))}"`
    head += timeAttributes(edge.time, edge.spells)
    let body = attvalues(edge.attributes, edgeIds, '        ')
    body += spellTags(edge.spells, '        ')
    body += colorTag(edge.color, '        ')
    if (edge.width !== undefined && edge.width >= 0) {
      body += `        <viz:thickness value="${formatNumber(edge.width)}"/>\n`
    }
    if (edge.dash !== undefined) body += `        <viz:shape value="${edge.dash}"/>\n`
    out += body === '' ? `${head}/>\n` : `${head}>\n${body}      </edge>\n`
  }
  out += '    </edges>\n  </graph>\n</gexf>\n'
  return out
}
