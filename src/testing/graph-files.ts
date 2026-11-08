import type { AttributeValue, FileEdge, FileNode } from '../formats'

export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const pieces = [
  'a',
  'node',
  ' ',
  '&',
  '<',
  '>',
  '"',
  "'",
  ',',
  ';',
  '|',
  '\n',
  '\r\n',
  '\t',
  '[',
  ']',
  'é',
  '漢',
  '😀',
  '#',
  '->',
  '=',
  ']]>',
  '&amp;',
]

export interface GeneratedOptions {
  readonly tricky?: boolean
  readonly lists?: boolean
  readonly parents?: boolean
  readonly spells?: boolean
}

export interface GeneratedGraph {
  readonly nodes: FileNode[]
  readonly edges: FileEdge[]
}

export function generateGraph(
  seed: number,
  nodeCount: number,
  edgeCount: number,
  options: GeneratedOptions = {},
): GeneratedGraph {
  const next = seeded(seed)
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T
  const text = () => {
    if (!options.tricky) return `v${Math.floor(next() * 1000)}`
    let value = ''
    const length = Math.floor(next() * 5)
    for (let index = 0; index < length; index++) value += pick(pieces)
    return value
  }
  const nodes: FileNode[] = []
  for (let index = 0; index < nodeCount; index++) {
    const attributes: {
      rank: number
      score: number
      active: boolean
      group: string
      note?: string
      tags?: AttributeValue[]
    } = {
      rank: Math.floor(next() * 100),
      score: Math.round(next() * 1e6) / 1000 - 300,
      active: next() < 0.5,
      group: `g${Math.floor(next() * 7)}`,
    }
    if (next() < 0.7) attributes.note = text()
    if (options.lists && next() < 0.5) {
      attributes.tags = Array.from({ length: Math.floor(next() * 4) }, () =>
        options.tricky ? text().replace(/["']/g, '') : `t${Math.floor(next() * 9)}`,
      )
    }
    const node: { -readonly [K in keyof FileNode]: FileNode[K] } = {
      id: options.tricky && next() < 0.3 ? `${index}${text()}` : `n${index}`,
      attributes,
    }
    if (next() < 0.8) node.label = options.tricky ? text() : `Node ${index}`
    if (next() < 0.9) {
      node.x = Math.round(next() * 2e5) / 100 - 1000
      node.y = Math.round(next() * 2e5) / 100 - 1000
    }
    if (next() < 0.5) node.size = Math.round(next() * 400) / 10
    if (next() < 0.5) {
      const channel = () =>
        Math.floor(next() * 256)
          .toString(16)
          .padStart(2, '0')
      node.color = `#${channel()}${channel()}${channel()}`
    }
    if (next() < 0.3) node.shape = pick(['circle', 'square', 'diamond'] as const)
    if (next() < 0.3) {
      const start = Math.floor(next() * 1000)
      node.time = next() < 0.5 ? start : { start, end: start + 1 + Math.floor(next() * 100) }
    }
    if (options.spells && next() < 0.2) {
      const start = Math.floor(next() * 1000)
      node.spells = [start, { start: start + 10, end: start + 20 }]
      node.time = { start, end: start + 20 }
    }
    if (options.parents && index > 0 && next() < 0.2) {
      node.parent = (nodes[Math.floor(next() * index)] as FileNode).id
    }
    nodes.push(node)
  }
  const edges: FileEdge[] = []
  for (let index = 0; index < edgeCount; index++) {
    const source = pick(nodes).id
    const target = next() < 0.05 ? source : pick(nodes).id
    const directed = next() < 0.7
    const edge: { -readonly [K in keyof FileEdge]: FileEdge[K] } = {
      id: `e${index}`,
      source,
      target,
      directed,
      attributes: { strength: Math.round(next() * 1000) / 100 },
    }
    if (next() < 0.5) edge.weight = Math.round(next() * 1000) / 100
    if (next() < 0.3) edge.label = text()
    if (next() < 0.3) edge.type = pick(['knows', 'links', 'cites'])
    if (next() < 0.3) edge.width = 1 + Math.floor(next() * 4)
    if (next() < 0.2) edge.dash = pick(['solid', 'dashed', 'dotted'] as const)
    edges.push(edge)
  }
  if (nodes.length > 1 && edges.length > 0) {
    const first = edges[0] as FileEdge
    edges.push({ ...first, id: 'parallel' })
  }
  return { nodes, edges }
}
