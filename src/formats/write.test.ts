import { describe, expect, expectTypeOf, it } from 'vitest'
import { edges, nodes } from '../marks'
import {
  detectFormat,
  type FileEdge,
  type FileNode,
  type GraphFile,
  readCsv,
  readGraphml,
  readJsonGraph,
  writeCsv,
  writeGexf,
  writeGraphml,
  writeJsonGraph,
} from '.'

interface Person {
  readonly key: number
  readonly name: string
  readonly team: string
  readonly age: number
  readonly secret?: string
}

interface Tie {
  readonly from: number
  readonly to: number
  readonly since: number
}

const people: Person[] = [
  { key: 1, name: 'Ann', team: 'red', age: 31, secret: 'x' },
  { key: 2, name: 'Bo', team: 'blue', age: 27 },
]
const ties: Tie[] = [{ from: 1, to: 2, since: 2019 }]

describe('writers', () => {
  it('read any objects through field names and functions, like the marks', () => {
    const text = writeJsonGraph(
      { nodes: people, edges: ties },
      {
        nodes: { key: 'key', label: 'name', attributes: ['team', 'age'] },
        edges: {
          key: null,
          source: 'from',
          target: 'to',
          attributes: (tie) => ({ since: tie.since }),
        },
      },
    )
    const file = readJsonGraph(text)
    expect(file.nodes).toEqual([
      { id: '1', label: 'Ann', attributes: { team: 'red', age: 31 } },
      { id: '2', label: 'Bo', attributes: { team: 'blue', age: 27 } },
    ])
    expect(file.edges).toEqual([
      { id: '1->2', source: '1', target: '2', directed: true, attributes: { since: 2019 } },
    ])
  })

  it('write the fields that no option reads when there is no attributes object', () => {
    const file = readJsonGraph(
      writeJsonGraph(
        { nodes: people, edges: ties },
        { nodes: { key: 'key', label: 'name' }, edges: { source: 'from', target: 'to' } },
      ),
    )
    expect(file.nodes[0]?.attributes).toEqual({ team: 'red', age: 31, secret: 'x' })
    expect(file.edges[0]?.attributes).toEqual({ since: 2019 })
  })

  it('take positions from a snapshot before the x and y fields, and skip a part set to null', () => {
    const positions = new Map([[1, { x: 5, y: 6 }]])
    const file = readGraphml(
      writeGraphml(
        {
          nodes: [
            { id: 1, x: 0, y: 0, label: 'one', attributes: {} },
            { id: 2, x: 3, y: 4, attributes: {} },
          ],
        },
        { positions, nodes: { label: null } },
      ),
    )
    expect(file.nodes).toEqual([
      { id: '1', x: 5, y: 6, attributes: {} },
      { id: '2', x: 3, y: 4, attributes: {} },
    ])
  })

  it('take explicit attribute types, and fall back on the values when the schema does not fit', () => {
    const graph = {
      nodes: [{ id: 'a', attributes: { count: 3, flag: 'yes' } }],
      schema: { nodes: [{ name: 'flag', type: 'boolean' as const }] },
    }
    const text = writeGraphml(graph, { nodes: { types: { count: 'double' } } })
    expect(text).toContain('attr.name="count" attr.type="double"')
    expect(text).toContain('attr.name="flag" attr.type="string"')
  })

  it('quote CSV strings that would read back as numbers or booleans', () => {
    const tables = writeCsv({
      nodes: [{ id: 'a', attributes: { code: '42', word: 'true', n: 42 } }],
    })
    expect(tables.nodes).toBe('id,code,word,n\r\na,"42","true",42\r\n')
    expect(readCsv(tables).nodes[0]?.attributes).toEqual({ code: '42', word: 'true', n: 42 })
  })

  it('throw on a node without key or an edge without ends', () => {
    expect(() => writeGexf({ nodes: [{ name: 'x' }] })).toThrow('gexf: node 0 has no key')
    expect(() => writeCsv({ nodes: [], edges: [{ source: 'a' }] })).toThrow(
      'csv: edge 0 has no source or no target',
    )
  })

  it('accept dates as time and write them as numbers', () => {
    const file = readJsonGraph(
      writeJsonGraph({
        nodes: [
          { id: 'a', time: new Date(Date.UTC(2020, 0, 1)) },
          { id: 'b', time: { start: new Date(Date.UTC(2020, 0, 1)), end: null } },
        ],
      }),
    )
    expect(file.nodes.map((node) => node.time)).toEqual([
      Date.UTC(2020, 0, 1),
      { start: Date.UTC(2020, 0, 1) },
    ])
  })
})

describe('detectFormat', () => {
  it('tells the formats apart from their first characters', () => {
    expect(detectFormat('<?xml version="1.0"?>\n<!-- c --><graphml/>')).toBe('graphml')
    expect(detectFormat('﻿<gexf xmlns="http://gexf.net/1.3" version="1.3"/>')).toBe('gexf')
    expect(detectFormat('<ns:gexf/>')).toBe('gexf')
    expect(detectFormat('  {"graph":{}}')).toBe('json-graph')
    expect(detectFormat('source,target\na,b')).toBe('csv')
    expect(detectFormat('<svg/>')).toBeNull()
    expect(detectFormat('  \n')).toBeNull()
  })
})

describe('types', () => {
  it('give nodes and edges ready for the marks', () => {
    const file: GraphFile<{ readonly rank: number }> = readGraphml('<graphml/>')
    nodes(file.nodes, { size: (node) => node.attributes.rank, x: 'x', y: 'y', parent: 'parent' })
    edges(file.edges, { source: 'source', target: 'target', label: 'label', time: 'time' })
    expectTypeOf(file.nodes).toEqualTypeOf<readonly FileNode<{ readonly rank: number }>[]>()
    expectTypeOf(file.edges).toEqualTypeOf<readonly FileEdge[]>()
  })

  it('check field names against the data of the writer', () => {
    const check = () => {
      writeGraphml({ nodes: people }, { nodes: { key: 'key', label: 'name' } })
      // @ts-expect-error
      writeGraphml({ nodes: people }, { nodes: { key: 'secret' } })
      // @ts-expect-error
      writeGraphml({ nodes: people }, { nodes: { key: 'key', label: 'age' } })
    }
    expectTypeOf(check).toBeFunction()
  })
})
