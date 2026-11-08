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
import { FormatError, failAt } from './errors'
import {
  columnsOf,
  type Entries,
  edgeFieldEntries,
  merged,
  nodeFieldEntries,
  prepare,
} from './prepare'
import type {
  AttributeDeclaration,
  AttributeType,
  AttributeValue,
  CsvFiles,
  CsvReadOptions,
  CsvTables,
  CsvWriteOptions,
  FileAttributes,
  GraphFile,
  GraphInput,
} from './types'
import { elementType, isListType, parseScalar, TypeGuess } from './values'

interface Table {
  readonly header: readonly string[]
  readonly rows: (string | undefined)[][]
  readonly lines: number[]
  readonly quoted: boolean[]
}

function separatorOf(given: string | undefined): number {
  const separator = given ?? ','
  if (separator.length !== 1 || separator === '"' || separator === '\r' || separator === '\n') {
    throw new RangeError('csv: the separator must be one character, not a quote or a line break')
  }
  return separator.charCodeAt(0)
}

function parseTable(text: string, separator: number): Table {
  const rows: (string | undefined)[][] = []
  const lines: number[] = []
  const quoted: boolean[] = []
  const length = text.length
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0
  let line = 1
  let row: (string | undefined)[] = []
  let rowLine = 1
  while (index <= length) {
    const code = text.charCodeAt(index)
    let cell: string | undefined
    if (code === 34) {
      const start = index
      let value = ''
      let from = index + 1
      for (;;) {
        const close = text.indexOf('"', from)
        if (close === -1) failAt('csv', text, start, 'unterminated quoted field')
        value += text.slice(from, close)
        if (text.charCodeAt(close + 1) === 34) {
          value += '"'
          from = close + 2
        } else {
          index = close + 1
          break
        }
      }
      for (let at = value.indexOf('\n'); at !== -1; at = value.indexOf('\n', at + 1)) line++
      const tail = index
      while (
        index < length &&
        text.charCodeAt(index) !== separator &&
        text.charCodeAt(index) !== 10 &&
        text.charCodeAt(index) !== 13
      ) {
        index++
      }
      if (index > tail) value += text.slice(tail, index)
      cell = value
      if (rows.length > 0) quoted[row.length] = true
    } else {
      const start = index
      while (index < length) {
        const next = text.charCodeAt(index)
        if (next === separator || next === 10 || next === 13) break
        index++
      }
      cell = index > start ? text.slice(start, index) : undefined
    }
    row.push(cell)
    const next = text.charCodeAt(index)
    if (next === separator) {
      index++
      continue
    }
    if (next === 13 && text.charCodeAt(index + 1) === 10) index += 2
    else index++
    if (!(row.length === 1 && row[0] === undefined && code !== 34)) {
      rows.push(row)
      lines.push(rowLine)
    }
    line++
    rowLine = line
    row = []
    if (index >= length) break
  }
  const header = (rows.shift() ?? []).map((cell) => cell ?? '')
  lines.shift()
  return { header, rows, lines, quoted }
}

function columnIndex(header: readonly string[], name: string): number {
  const lower = name.toLowerCase()
  return header.findIndex((cell) => cell.trim().toLowerCase() === lower)
}

const canonicalNumber = (cell: string) => String(Number(cell)) === cell

function inferType(table: Table, column: number): AttributeType {
  if (table.quoted[column] === true) return 'string'
  let booleans = true
  let numbers = true
  const guess = new TypeGuess()
  let seen = false
  for (const row of table.rows) {
    const cell = row[column]
    if (cell === undefined) continue
    seen = true
    if (booleans && cell !== 'true' && cell !== 'false') booleans = false
    if (numbers) {
      if (canonicalNumber(cell)) guess.add(Number(cell))
      else numbers = false
    }
    if (!booleans && !numbers) return 'string'
  }
  if (!seen) return 'string'
  if (booleans) return 'boolean'
  return numbers ? guess.type() : 'string'
}

function cellValue(type: AttributeType, cell: string): AttributeValue | undefined {
  if (!isListType(type)) {
    if (type === 'string') return cell
    if ((type === 'double' || type === 'float') && canonicalNumber(cell)) return Number(cell)
    return parseScalar(elementType(type), cell)
  }
  try {
    const value = JSON.parse(cell) as unknown
    return Array.isArray(value) ? (value as AttributeValue[]) : undefined
  } catch {
    return undefined
  }
}

interface Attribute {
  readonly column: number
  readonly name: string
  readonly type: AttributeType
  readonly field: string | undefined
}

function attributesOf(
  table: Table,
  skip: readonly number[],
  types: Readonly<Record<string, AttributeType>> | undefined,
  field: (name: string) => string | undefined,
): Attribute[] {
  const result: Attribute[] = []
  table.header.forEach((name, column) => {
    if (skip.includes(column)) return
    const type = types?.[name] ?? inferType(table, column)
    result.push({ column, name, type, field: field(name.toLowerCase()) })
  })
  return result
}

/**
 * Read a graph from CSV tables (RFC 4180): one table of nodes and one of edges, each with a header
 * row. A single string is the edge table. Columns that are not ids, sources or targets become
 * attributes.
 */
export function readCsv<N extends object = FileAttributes, E extends object = FileAttributes>(
  tables: CsvTables | string,
  options: CsvReadOptions = {},
): GraphFile<N, E> {
  const separator = separatorOf(options.separator)
  const given: CsvTables = typeof tables === 'string' ? { edges: tables } : tables
  const fields = options.fields ?? true
  const directed = options.directed ?? true
  const idName = options.id ?? 'id'
  const builder = new FileBuilder(null)
  const schema: { nodes: AttributeDeclaration[]; edges: AttributeDeclaration[] } = {
    nodes: [],
    edges: [],
  }
  const row = (kind: 'nodes' | 'edges', table: Table, index: number): (string | undefined)[] => {
    const cells = table.rows[index] as (string | undefined)[]
    if (cells.length !== table.header.length) {
      builder.issues.push({
        type: 'malformed-row',
        kind,
        expected: table.header.length,
        found: cells.length,
        line: table.lines[index] as number,
      })
    }
    return cells
  }
  const fill = (
    attributes: readonly Attribute[],
    cells: readonly (string | undefined)[],
    kind: 'nodes' | 'edges',
    line: number,
    target: NodeDraft | EdgeDraft,
  ) => {
    for (const attribute of attributes) {
      const cell = cells[attribute.column]
      if (cell === undefined) continue
      let value = cellValue(attribute.type, cell)
      if (value === undefined) {
        builder.issues.push({
          type: 'invalid-value',
          kind,
          name: attribute.name,
          value: cell,
          line,
        })
        value = cell
      }
      const lifted =
        attribute.field !== undefined &&
        (kind === 'nodes'
          ? liftNode(target as NodeDraft, attribute.field as NodeField, value)
          : liftEdge(target as EdgeDraft, attribute.field as EdgeField, value))
      if (!lifted) assign(target.attributes, attribute.name, value)
    }
  }

  if (given.nodes !== undefined) {
    const table = parseTable(given.nodes, separator)
    const idColumn = columnIndex(table.header, idName)
    if (idColumn === -1) throw new FormatError('csv', `the node table has no "${idName}" column`)
    const attributes = attributesOf(table, [idColumn], options.types?.nodes, (name) =>
      fields ? nodeFieldOf(name, []) : undefined,
    )
    for (const attribute of attributes)
      schema.nodes.push({ name: attribute.name, type: attribute.type })
    for (let index = 0; index < table.rows.length; index++) {
      const cells = row('nodes', table, index)
      const line = table.lines[index] as number
      const id = cells[idColumn]
      if (id === undefined) {
        builder.issues.push({ type: 'missing-id', kind: 'nodes', line })
        continue
      }
      const draft: NodeDraft = { id, attributes: {} }
      fill(attributes, cells, 'nodes', line, draft)
      builder.addNode(draft)
    }
  }

  if (given.edges !== undefined) {
    const table = parseTable(given.edges, separator)
    const sourceName = options.source ?? 'source'
    const targetName = options.target ?? 'target'
    const sourceColumn = columnIndex(table.header, sourceName)
    const targetColumn = columnIndex(table.header, targetName)
    if (sourceColumn === -1 || targetColumn === -1) {
      throw new FormatError(
        'csv',
        `the edge table needs "${sourceName}" and "${targetName}" columns`,
      )
    }
    const idColumn = columnIndex(table.header, idName)
    const structural = [sourceColumn, targetColumn, idColumn].filter((column) => column !== -1)
    const attributes = attributesOf(table, structural, options.types?.edges, (name) =>
      fields ? edgeFieldOf(name, []) : undefined,
    )
    for (const attribute of attributes) {
      if (attribute.field !== 'directed')
        schema.edges.push({ name: attribute.name, type: attribute.type })
    }
    const derived = given.nodes === undefined
    for (let index = 0; index < table.rows.length; index++) {
      const cells = row('edges', table, index)
      const line = table.lines[index] as number
      const id = idColumn === -1 ? undefined : cells[idColumn]
      const source = cells[sourceColumn]
      const target = cells[targetColumn]
      if (source === undefined || target === undefined) {
        builder.issues.push(
          id === undefined
            ? { type: 'missing-end', kind: 'edges', line }
            : { type: 'missing-end', kind: 'edges', id, line },
        )
        continue
      }
      const draft: EdgeDraft = { source, target, directed, attributes: {} }
      if (id !== undefined) draft.id = id
      fill(attributes, cells, 'edges', line, draft)
      if (derived) {
        if (!builder.hasNode(source)) builder.addNode({ id: source, attributes: {} })
        if (!builder.hasNode(target)) builder.addNode({ id: target, attributes: {} })
      }
      builder.addEdge(draft)
    }
  }
  return builder.finish<N, E>({ directed, attributes: {} }, { ...schema, graph: [] })
}

function looksTyped(value: string): boolean {
  return value === 'true' || value === 'false' || canonicalNumber(value)
}

function cellText(value: AttributeValue | undefined, separator: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (
    text === '' ||
    looksTyped(text) ||
    text.includes(separator) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function tableText(
  header: readonly string[],
  rows: readonly (readonly (AttributeValue | undefined)[])[],
  separator: string,
  lineBreak: string,
  bom: boolean,
): string {
  let out = bom ? '﻿' : ''
  out += header.map((name) => cellText(name, separator)).join(separator) + lineBreak
  for (const row of rows)
    out += row.map((value) => cellText(value, separator)).join(separator) + lineBreak
  return out
}

function lookup(entries: Entries): Map<string, AttributeValue> {
  return new Map(entries)
}

/**
 * Write a graph as two CSV tables (RFC 4180), one of nodes and one of edges. Strings that would
 * read back as numbers or booleans are quoted, so that a round trip keeps their type.
 */
export function writeCsv<N, E>(
  input: GraphInput<N, E>,
  options: CsvWriteOptions<N, E> = {},
): CsvFiles {
  const separator = String.fromCharCode(separatorOf(options.separator))
  const lineBreak = options.lineBreak ?? '\r\n'
  const bom = options.bom ?? false
  const prepared = prepare('csv', input, options)
  const { nodes, edges } = prepared
  const nodeRows = nodes.map((node) =>
    merged(nodeFieldEntries(node, true, 'columns'), node.attributes),
  )
  const nodeColumns = columnsOf(nodeRows, prepared.declared.nodes, prepared.types.nodes, false)
  const nodeTable = tableText(
    ['id', ...nodeColumns.map((column) => column.name)],
    nodes.map((node, index) => {
      const values = lookup(nodeRows[index] as Entries)
      return [node.id, ...nodeColumns.map((column) => values.get(column.name))]
    }),
    separator,
    lineBreak,
    bom,
  )
  const edgeRows = edges.map((edge) =>
    merged(edgeFieldEntries(edge, 'columns', true), edge.attributes),
  )
  const edgeColumns = columnsOf(edgeRows, prepared.declared.edges, prepared.types.edges, false)
  const withIds = edges.some((edge) => edge.id !== undefined)
  const withDirection = edges.some((edge) => !edge.directed)
  const header = [
    ...(withIds ? ['id'] : []),
    'source',
    'target',
    ...(withDirection ? ['directed'] : []),
    ...edgeColumns.map((column) => column.name),
  ]
  const edgeTable = tableText(
    header,
    edges.map((edge, index) => {
      const values = lookup(edgeRows[index] as Entries)
      return [
        ...(withIds ? [edge.id] : []),
        edge.source,
        edge.target,
        ...(withDirection ? [edge.directed] : []),
        ...edgeColumns.map((column) => values.get(column.name)),
      ]
    }),
    separator,
    lineBreak,
    bom,
  )
  return { nodes: nodeTable, edges: edgeTable }
}
