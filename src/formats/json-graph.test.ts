import { describe, expect, it } from 'vitest'
import { FormatError, readJsonGraph, readJsonGraphs, writeJsonGraph, writeJsonGraphs } from '.'

const single = {
  graph: {
    id: 'sample',
    label: 'Sample',
    type: 'network',
    directed: false,
    metadata: { source: 'hand written', version: 2 },
    nodes: {
      a: {
        label: 'A',
        metadata: { x: 10, y: 20, color: '#336699', tags: ['p', 'q'], extra: null },
      },
      b: {
        metadata: { parent: 'a', time: { start: 5, end: 9 }, spells: [5, { start: 7, end: 9 }] },
      },
      c: {},
    },
    edges: [
      { id: 'ab', source: 'a', target: 'b', relation: 'contains', label: 'has', directed: true },
      { source: 'b', target: 'c', metadata: { weight: 3, width: 2, dash: 'dotted', note: 'x' } },
      { source: 'c', target: 'missing' },
    ],
  },
}

describe('readJsonGraph', () => {
  it('reads a single graph from text or from a parsed value', () => {
    const file = readJsonGraph(JSON.stringify(single))
    expect(readJsonGraph(single)).toEqual(file)
    expect(file.graph).toEqual({
      id: 'sample',
      label: 'Sample',
      type: 'network',
      directed: false,
      attributes: { source: 'hand written', version: 2 },
    })
    expect(file.nodes).toEqual([
      {
        id: 'a',
        label: 'A',
        x: 10,
        y: 20,
        color: '#336699',
        attributes: { tags: ['p', 'q'], extra: null },
      },
      {
        id: 'b',
        parent: 'a',
        time: { start: 5, end: 9 },
        spells: [5, { start: 7, end: 9 }],
        attributes: {},
      },
      { id: 'c', attributes: {} },
    ])
    expect(file.edges).toEqual([
      {
        id: 'ab',
        source: 'a',
        target: 'b',
        type: 'contains',
        label: 'has',
        directed: true,
        attributes: {},
      },
      {
        id: 'b--c',
        source: 'b',
        target: 'c',
        directed: false,
        weight: 3,
        width: 2,
        dash: 'dotted',
        attributes: { note: 'x' },
      },
      { id: 'c--missing', source: 'c', target: 'missing', directed: false, attributes: {} },
    ])
    expect(file.issues).toEqual([
      { type: 'missing-node', kind: 'edges', id: 'c--missing', node: 'missing' },
    ])
  })

  it('picks one graph of several by index or id, or reads them all', () => {
    const document = {
      graphs: [
        { id: 'one', nodes: { a: {} } },
        { id: 'two', nodes: { b: {} }, edges: [{ source: 'b', target: 'b' }] },
      ],
    }
    expect(readJsonGraph(document).nodes).toEqual([{ id: 'a', attributes: {} }])
    expect(readJsonGraph(document, { graph: 1 }).edges[0]?.id).toBe('b->b')
    expect(readJsonGraph(document, { graph: 'two' }).nodes).toEqual([{ id: 'b', attributes: {} }])
    expect(readJsonGraphs(document).map((file) => file.graph.id)).toEqual(['one', 'two'])
    expect(() => readJsonGraph(document, { graph: 'three' })).toThrow('no graph "three"')
  })

  it('accepts nodes as a list with ids, and reports what it skips', () => {
    const file = readJsonGraph({
      graph: {
        nodes: [{ id: 'a' }, { id: 1 }, { label: 'no id' }, { id: 'a' }],
        edges: [{ source: 'a' }, 'nope', { source: 'a', target: 1, metadata: { label: 'L' } }],
        hyperedges: [{ nodes: ['a', '1'] }],
      },
    })
    expect(file.nodes.map((node) => node.id)).toEqual(['a', '1'])
    expect(file.edges).toEqual([
      { id: 'a->1', source: 'a', target: '1', directed: true, label: 'L', attributes: {} },
    ])
    expect(file.issues).toEqual([
      { type: 'missing-id', kind: 'nodes' },
      { type: 'duplicate-id', kind: 'nodes', id: 'a' },
      { type: 'missing-end', kind: 'edges' },
      { type: 'missing-end', kind: 'edges' },
      { type: 'unsupported', feature: 'hyperedge', count: 1 },
    ])
  })

  it('keeps metadata as attributes when asked not to read fields', () => {
    const file = readJsonGraph(single, { fields: false })
    expect(file.nodes[0]).toEqual({
      id: 'a',
      label: 'A',
      attributes: { x: 10, y: 20, color: '#336699', tags: ['p', 'q'], extra: null },
    })
  })

  it('throws on text that is not JSON Graph Format', () => {
    expect(() => readJsonGraph('{"graph":')).toThrow(FormatError)
    expect(() => readJsonGraph('[1]')).toThrow('json-graph: the document is not an object')
    expect(() => readJsonGraph('{"nodes":{}}')).toThrow('no "graph" object and no "graphs" list')
    expect(() => readJsonGraph({ graphs: [3] })).toThrow('graph 0 is not an object')
  })
})

describe('writeJsonGraph', () => {
  it('writes a version 2 document that reads back the same', () => {
    const file = readJsonGraph(single)
    const text = writeJsonGraph(file)
    const document = JSON.parse(text)
    expect(document.graph.nodes.a).toEqual({
      label: 'A',
      metadata: { x: 10, y: 20, color: '#336699', tags: ['p', 'q'], extra: null },
    })
    expect(document.graph.edges[0]).toEqual({
      id: 'ab',
      source: 'a',
      target: 'b',
      relation: 'contains',
      directed: true,
      label: 'has',
    })
    expect(readJsonGraph(text)).toEqual(file)
    expect(writeJsonGraph(file, { indent: 0 })).not.toContain('\n')
    expect(() => writeJsonGraph(file, { indent: -1 })).toThrow(RangeError)
  })

  it('writes several graphs', () => {
    const text = writeJsonGraphs([
      { graph: { id: 'one' }, nodes: [{ id: 'a' }] },
      {
        graph: { id: 'two', directed: false },
        nodes: [{ id: 'b' }],
        edges: [{ source: 'b', target: 'b' }],
      },
    ])
    const files = readJsonGraphs(text)
    expect(files.map((file) => [file.graph.id, file.graph.directed, file.nodes.length])).toEqual([
      ['one', true, 1],
      ['two', false, 1],
    ])
  })

  it('writes a node whose id is __proto__', () => {
    const attributes = JSON.parse('{"__proto__":1}')
    const text = writeJsonGraph({ nodes: [{ id: '__proto__', attributes }] })
    expect(readJsonGraph(text).nodes).toEqual([{ id: '__proto__', attributes }])
  })
})
