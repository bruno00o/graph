import { describe, expect, it } from 'vitest'
import { FormatError, readCsv, writeCsv } from '.'

describe('readCsv', () => {
  it('reads a node table and an edge table, typing columns from their values', () => {
    const file = readCsv({
      nodes:
        'id,label,x,y,rank,ratio,active,code,note\r\na,Alpha,1.5,-2,3,0.25,true,007,"x"\r\nb,Beta,0,0,10,1,false,12,\r\n',
      edges: 'source,target,weight,kind\r\na,b,2,link\r\nb,a,,\r\n',
    })
    expect(file.nodes).toEqual([
      {
        id: 'a',
        label: 'Alpha',
        x: 1.5,
        y: -2,
        attributes: { rank: 3, ratio: 0.25, active: true, code: '007', note: 'x' },
      },
      {
        id: 'b',
        label: 'Beta',
        x: 0,
        y: 0,
        attributes: { rank: 10, ratio: 1, active: false, code: '12' },
      },
    ])
    expect(file.edges).toEqual([
      {
        id: 'a->b',
        source: 'a',
        target: 'b',
        directed: true,
        weight: 2,
        attributes: { kind: 'link' },
      },
      { id: 'b->a', source: 'b', target: 'a', directed: true, attributes: {} },
    ])
    expect(file.schema.nodes).toEqual([
      { name: 'label', type: 'string' },
      { name: 'x', type: 'double' },
      { name: 'y', type: 'integer' },
      { name: 'rank', type: 'integer' },
      { name: 'ratio', type: 'double' },
      { name: 'active', type: 'boolean' },
      { name: 'code', type: 'string' },
      { name: 'note', type: 'string' },
    ])
    expect(file.issues).toEqual([])
  })

  it('follows RFC 4180: quotes, doubled quotes, line breaks in fields, CRLF and a BOM', () => {
    const file = readCsv({
      nodes: '﻿"id","text"\r\n"a","say ""hi"", then\r\nleave"\r\n"b",""\r\nc,\r\n',
    })
    expect(file.nodes).toEqual([
      { id: 'a', attributes: { text: 'say "hi", then\r\nleave' } },
      { id: 'b', attributes: { text: '' } },
      { id: 'c', attributes: {} },
    ])
  })

  it('takes another separator, lone LF or CR line breaks, and column names in any case', () => {
    const file = readCsv('Source;Target;Directed\nx;y;false\ry;z;true', { separator: ';' })
    expect(file.nodes.map((node) => node.id)).toEqual(['x', 'y', 'z'])
    expect(file.edges.map((edge) => [edge.id, edge.directed])).toEqual([
      ['x--y', false],
      ['y->z', true],
    ])
  })

  it('reads explicit column types, and other column names', () => {
    const file = readCsv(
      { edges: 'from,to,id,code,tags\na,b,e1,007,"[""p"",""q""]"\n' },
      {
        source: 'from',
        target: 'to',
        directed: false,
        types: { edges: { code: 'integer', tags: 'string[]' } },
      },
    )
    expect(file.edges).toEqual([
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        directed: false,
        attributes: { code: 7, tags: ['p', 'q'] },
      },
    ])
  })

  it('reads time columns, as numbers or ISO dates', () => {
    const file = readCsv({ nodes: 'id,start,end,time\na,2020-01-01,2020-02-01,\nb,,,5\n' })
    expect(file.nodes).toEqual([
      { id: 'a', time: { start: Date.UTC(2020, 0, 1), end: Date.UTC(2020, 1, 1) }, attributes: {} },
      { id: 'b', time: 5, attributes: {} },
    ])
  })

  it('reports rows of the wrong length, missing ids and ends, and dangling edges', () => {
    const file = readCsv({
      nodes: 'id,label\na,A\nb\n,C\nc,C,extra\n',
      edges: 'source,target\na,b\na,\nb,zz\n',
    })
    expect(file.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c'])
    expect(file.issues).toEqual([
      { type: 'malformed-row', kind: 'nodes', expected: 2, found: 1, line: 3 },
      { type: 'missing-id', kind: 'nodes', line: 4 },
      { type: 'malformed-row', kind: 'nodes', expected: 2, found: 3, line: 5 },
      { type: 'missing-end', kind: 'edges', line: 3 },
      { type: 'missing-node', kind: 'edges', id: 'b->zz', node: 'zz' },
    ])
  })

  it('throws when a table cannot be read', () => {
    expect(() => readCsv({ nodes: 'name\na\n' })).toThrow('csv: the node table has no "id" column')
    expect(() => readCsv('a,b\n1,2\n')).toThrow('csv: the edge table needs "source" and "target"')
    expect(() => readCsv({ nodes: 'id\n"a\n' })).toThrow(FormatError)
    expect(() => readCsv({ nodes: 'id\n"a\n' })).toThrow('unterminated quoted field at line 2')
    expect(() => readCsv('', { separator: ';;' })).toThrow(RangeError)
  })
})

describe('writeCsv', () => {
  it('writes two tables, quoting only what needs it', () => {
    const tables = writeCsv({
      nodes: [
        {
          id: 'a',
          label: 'A, the first',
          attributes: { code: '007', rank: 1, ok: true, empty: '' },
        },
        { id: 'b', label: 'say "hi"', attributes: { rank: 2.5 } },
      ],
      edges: [
        { source: 'a', target: 'b', directed: false, attributes: { note: 'two\nlines' } },
        { id: 'x', source: 'b', target: 'a', directed: true, attributes: {} },
      ],
    })
    expect(tables.nodes).toBe(
      'id,label,code,rank,ok,empty\r\na,"A, the first",007,1,true,""\r\nb,"say ""hi""",,2.5,,\r\n',
    )
    expect(tables.edges).toBe(
      'id,source,target,directed,note\r\n,a,b,false,"two\nlines"\r\nx,b,a,true,\r\n',
    )
    const file = readCsv(tables)
    expect(file.nodes).toEqual([
      { id: 'a', label: 'A, the first', attributes: { code: '007', rank: 1, ok: true, empty: '' } },
      { id: 'b', label: 'say "hi"', attributes: { rank: 2.5 } },
    ])
  })

  it('takes a separator, a line break and a byte order mark', () => {
    const tables = writeCsv(
      { nodes: [{ id: 'a;b', attributes: {} }], edges: [] },
      { separator: ';', lineBreak: '\n', bom: true },
    )
    expect(tables.nodes).toBe('﻿id\n"a;b"\n')
    expect(tables.edges).toBe('﻿source;target\n')
    expect(readCsv(tables, { separator: ';' }).nodes).toEqual([{ id: 'a;b', attributes: {} }])
  })
})
