import type { EdgeDash, NodeShape } from '../types'
import { LineCounter } from './errors'
import type {
  AttributeValue,
  FileEdge,
  FileGraph,
  FileNode,
  FileSchema,
  FileTime,
  FormatIssue,
  GraphFile,
  UnsupportedFeature,
} from './types'
import { parseDecimal, setField } from './values'

export interface NodeDraft {
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
  attributes: Record<string, AttributeValue>
}

export interface EdgeDraft {
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
  attributes: Record<string, AttributeValue>
}

type Kind = 'nodes' | 'edges' | 'graph'

export class FileBuilder {
  readonly issues: FormatIssue[] = []
  readonly #nodes: NodeDraft[] = []
  readonly #nodeIds = new Set<string>()
  readonly #edges: EdgeDraft[] = []
  readonly #edgeOffsets: number[] = []
  readonly #lines: LineCounter | null
  readonly #unsupported = new Map<UnsupportedFeature, { count: number; line?: number }>()
  readonly #unknown = new Set<string>()

  constructor(text: string | null) {
    this.#lines = text === null ? null : new LineCounter(text)
  }

  line(offset: number | undefined): number | undefined {
    return offset === undefined || offset < 0 || this.#lines === null
      ? undefined
      : this.#lines.at(offset)
  }

  #push(issue: FormatIssue, offset: number | undefined): void {
    const line = this.line(offset)
    this.issues.push(line === undefined ? issue : { ...issue, line })
  }

  hasNode(id: string): boolean {
    return this.#nodeIds.has(id)
  }

  addNode(node: NodeDraft, offset?: number): void {
    if (this.#nodeIds.has(node.id)) {
      this.#push({ type: 'duplicate-id', kind: 'nodes', id: node.id }, offset)
      return
    }
    this.#nodeIds.add(node.id)
    this.#nodes.push(node)
  }

  addEdge(edge: EdgeDraft, offset?: number): void {
    this.#edges.push(edge)
    this.#edgeOffsets.push(offset ?? -1)
  }

  missingId(offset?: number): void {
    this.#push({ type: 'missing-id', kind: 'nodes' }, offset)
  }

  missingEnd(id: string | undefined, offset?: number): void {
    this.#push(
      id === undefined
        ? { type: 'missing-end', kind: 'edges' }
        : { type: 'missing-end', kind: 'edges', id },
      offset,
    )
  }

  invalid(kind: Kind, name: string, value: string, offset?: number): void {
    this.#push({ type: 'invalid-value', kind, name, value }, offset)
  }

  unknown(kind: Kind, name: string, offset?: number): void {
    const id = `${kind}\n${name}`
    if (this.#unknown.has(id)) return
    this.#unknown.add(id)
    this.#push({ type: 'unknown-attribute', kind, name }, offset)
  }

  unsupported(feature: UnsupportedFeature, offset?: number): void {
    const known = this.#unsupported.get(feature)
    if (known !== undefined) {
      known.count += 1
      return
    }
    const line = this.line(offset)
    this.#unsupported.set(feature, line === undefined ? { count: 1 } : { count: 1, line })
  }

  finish<N extends object, E extends object>(
    graph: FileGraph,
    schema: FileSchema,
    endpoints = true,
  ): GraphFile<N, E> {
    const edges = this.#edges
    const explicit = new Set<string>()
    for (const edge of edges) if (edge.id !== undefined) explicit.add(edge.id)
    const taken = new Set<string>()
    const counts = new Map<string, number>()
    const kept: EdgeDraft[] = []
    for (let index = 0; index < edges.length; index++) {
      const edge = edges[index] as EdgeDraft
      const offset = this.#edgeOffsets[index]
      if (edge.id !== undefined) {
        if (taken.has(edge.id)) {
          this.#push({ type: 'duplicate-id', kind: 'edges', id: edge.id }, offset)
          continue
        }
      } else {
        const base = `${edge.source}${edge.directed ? '->' : '--'}${edge.target}`
        let count = counts.get(base) ?? 0
        let id: string
        do {
          count += 1
          id = count === 1 ? base : `${base}#${count}`
        } while (explicit.has(id) || taken.has(id))
        counts.set(base, count)
        edge.id = id
      }
      taken.add(edge.id)
      kept.push(edge)
      if (endpoints) {
        if (!this.#nodeIds.has(edge.source)) {
          this.#push(
            { type: 'missing-node', kind: 'edges', id: edge.id, node: edge.source },
            offset,
          )
        }
        if (edge.target !== edge.source && !this.#nodeIds.has(edge.target)) {
          this.#push(
            { type: 'missing-node', kind: 'edges', id: edge.id, node: edge.target },
            offset,
          )
        }
      }
    }
    for (const [feature, { count, line }] of this.#unsupported) {
      this.issues.push(
        line === undefined
          ? { type: 'unsupported', feature, count }
          : { type: 'unsupported', feature, count, line },
      )
    }
    return {
      graph,
      nodes: this.#nodes as unknown as FileNode<N>[],
      edges: kept as unknown as FileEdge<E>[],
      schema,
      issues: this.issues,
    }
  }
}

const nodeShapes: ReadonlySet<string> = new Set(['circle', 'square', 'diamond', 'box'])
const edgeDashes: ReadonlySet<string> = new Set(['solid', 'dashed', 'dotted'])

export type NodeField =
  | 'label'
  | 'parent'
  | 'x'
  | 'y'
  | 'size'
  | 'color'
  | 'shape'
  | 'image'
  | 'time'
  | 'start'
  | 'end'
  | 'spells'

export type EdgeField =
  | 'label'
  | 'type'
  | 'weight'
  | 'color'
  | 'width'
  | 'dash'
  | 'time'
  | 'start'
  | 'end'
  | 'spells'
  | 'directed'

const nodeFields: ReadonlySet<string> = new Set<NodeField>([
  'label',
  'parent',
  'x',
  'y',
  'size',
  'color',
  'shape',
  'image',
  'time',
  'start',
  'end',
  'spells',
])

const edgeFields: ReadonlySet<string> = new Set<EdgeField>([
  'label',
  'type',
  'weight',
  'color',
  'width',
  'dash',
  'time',
  'start',
  'end',
  'spells',
  'directed',
])

export function nodeFieldOf(name: string, except: readonly string[]): NodeField | undefined {
  return nodeFields.has(name) && !except.includes(name) ? (name as NodeField) : undefined
}

export function edgeFieldOf(name: string, except: readonly string[]): EdgeField | undefined {
  return edgeFields.has(name) && !except.includes(name) ? (name as EdgeField) : undefined
}

function numberOf(value: AttributeValue): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const parsed = parseDecimal(value)
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined
}

const isoDate = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

export function parseTimeText(text: string, dates: boolean): number | undefined {
  const trimmed = text.trim()
  const number = parseDecimal(trimmed)
  if (number !== undefined) return Number.isFinite(number) ? number : undefined
  if (!dates || !isoDate.test(trimmed)) return undefined
  const zoned =
    trimmed.length > 10 && !/(Z|[+-]\d{2}:?\d{2})$/.test(trimmed) ? `${trimmed}Z` : trimmed
  const time = Date.parse(zoned)
  return Number.isNaN(time) ? undefined : time
}

function momentOf(value: AttributeValue): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  return typeof value === 'string' ? parseTimeText(value, true) : undefined
}

export function timeOf(value: AttributeValue): FileTime | undefined {
  const moment = momentOf(value)
  if (moment !== undefined) return moment
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const span = value as { readonly [name: string]: AttributeValue }
  const keys = Object.keys(span)
  if (keys.some((key) => key !== 'start' && key !== 'end')) return undefined
  const result: { start?: number; end?: number } = {}
  for (const key of keys) {
    const bound = span[key] as AttributeValue
    if (bound === null) continue
    const moment = momentOf(bound)
    if (moment === undefined) return undefined
    result[key as 'start' | 'end'] = moment
  }
  return result
}

function spellsOf(value: AttributeValue): FileTime[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const spells: FileTime[] = []
  for (const item of value as readonly AttributeValue[]) {
    const time = timeOf(item)
    if (time === undefined) return undefined
    spells.push(time)
  }
  return spells
}

function withBound(time: FileTime | undefined, bound: 'start' | 'end', value: number): FileTime {
  const span = typeof time === 'object' ? time : {}
  return { ...span, [bound]: value }
}

type Shared = 'label' | 'color' | 'time' | 'start' | 'end' | 'spells'

function liftShared(draft: NodeDraft | EdgeDraft, field: Shared, value: AttributeValue): boolean {
  switch (field) {
    case 'label':
      if (draft.label !== undefined) return false
      if (typeof value === 'string') draft.label = value
      else if (typeof value === 'number' && Number.isFinite(value)) draft.label = String(value)
      else return false
      return true
    case 'color':
      if (draft.color !== undefined || typeof value !== 'string' || value === '') return false
      draft.color = value
      return true
    case 'time': {
      if (draft.time !== undefined) return false
      const time = timeOf(value)
      if (time === undefined) return false
      draft.time = time
      return true
    }
    case 'start':
    case 'end': {
      if (typeof draft.time === 'number') return false
      const moment = momentOf(value)
      if (moment === undefined) return false
      draft.time = withBound(draft.time, field, moment)
      return true
    }
    case 'spells': {
      if (draft.spells !== undefined) return false
      const spells = spellsOf(value)
      if (spells === undefined) return false
      draft.spells = spells
      return true
    }
  }
}

export function liftNode(draft: NodeDraft, field: NodeField, value: AttributeValue): boolean {
  switch (field) {
    case 'parent':
      if (draft.parent !== undefined) return false
      if (typeof value === 'string' && value !== '') draft.parent = value
      else if (typeof value === 'number' && Number.isFinite(value)) draft.parent = String(value)
      else return false
      return true
    case 'x':
    case 'y':
    case 'size': {
      const number = numberOf(value)
      if (draft[field] !== undefined || number === undefined) return false
      draft[field] = number
      return true
    }
    case 'shape':
      if (draft.shape !== undefined || typeof value !== 'string' || !nodeShapes.has(value)) {
        return false
      }
      draft.shape = value as NodeShape
      return true
    case 'image':
      if (draft.image !== undefined || typeof value !== 'string' || value === '') return false
      draft.image = value
      return true
    default:
      return liftShared(draft, field, value)
  }
}

export function liftEdge(draft: EdgeDraft, field: EdgeField, value: AttributeValue): boolean {
  switch (field) {
    case 'type':
      if (draft.type !== undefined || typeof value !== 'string') return false
      draft.type = value
      return true
    case 'weight':
    case 'width': {
      const number = numberOf(value)
      if (draft[field] !== undefined || number === undefined) return false
      draft[field] = number
      return true
    }
    case 'dash':
      if (draft.dash !== undefined || typeof value !== 'string' || !edgeDashes.has(value)) {
        return false
      }
      draft.dash = value as EdgeDash
      return true
    case 'directed':
      if (typeof value === 'boolean') draft.directed = value
      else if (typeof value === 'string' && /^(true|directed)$/i.test(value.trim())) {
        draft.directed = true
      } else if (typeof value === 'string' && /^(false|undirected)$/i.test(value.trim())) {
        draft.directed = false
      } else return false
      return true
    default:
      return liftShared(draft, field, value)
  }
}

export function assign(
  target: Record<string, AttributeValue>,
  name: string,
  value: AttributeValue,
): void {
  setField(target, name, value)
}

export function spanOf(spells: readonly FileTime[]): FileTime {
  if (spells.length === 1) return spells[0] as FileTime
  let start: number | undefined = Number.POSITIVE_INFINITY
  let end: number | undefined = Number.NEGATIVE_INFINITY
  for (const spell of spells) {
    const first = typeof spell === 'number' ? spell : spell.start
    const last = typeof spell === 'number' ? spell : spell.end
    if (first === undefined) start = undefined
    else if (start !== undefined) start = Math.min(start, first)
    if (last === undefined) end = undefined
    else if (end !== undefined) end = Math.max(end, last)
  }
  const span: { start?: number; end?: number } = {}
  if (start !== undefined) span.start = start
  if (end !== undefined) span.end = end
  return span
}
