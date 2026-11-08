import { describe, expect, it } from 'vitest'
import { FormatError, readGraphml, writeGraphml } from '.'

const head =
  '<?xml version="1.0" encoding="UTF-8"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns">'

describe('readGraphml', () => {
  it('reads nodes and edges, with the direction of the graph and of each edge', () => {
    const file = readGraphml(`${head}
  <graph id="G" edgedefault="undirected">
    <node id="a"/>
    <node id="b"/>
    <edge id="e1" source="a" target="b"/>
    <edge source="b" target="a" directed="true"/>
  </graph>
</graphml>`)
    expect(file.graph).toEqual({ id: 'G', directed: false, attributes: {} })
    expect(file.nodes).toEqual([
      { id: 'a', attributes: {} },
      { id: 'b', attributes: {} },
    ])
    expect(file.edges).toEqual([
      { id: 'e1', source: 'a', target: 'b', directed: false, attributes: {} },
      { id: 'b->a', source: 'b', target: 'a', directed: true, attributes: {} },
    ])
    expect(file.issues).toEqual([])
  })

  it('types data from the keys, applies defaults and lifts label and position', () => {
    const file = readGraphml(`${head}
  <key id="k0" for="node" attr.name="label" attr.type="string"/>
  <key id="k1" for="node" attr.name="x" attr.type="double"/>
  <key id="k2" for="node" attr.name="y" attr.type="float"/>
  <key id="k3" for="node" attr.name="visits" attr.type="int"><default>0</default></key>
  <key id="k4" for="all" attr.name="checked" attr.type="boolean"/>
  <key id="k5" for="edge" attr.name="weight" attr.type="double"/>
  <key id="k6" for="node" attr.name="big" attr.type="long"/>
  <key id="k7" for="graph" attr.name="title" attr.type="string"/>
  <key id="k8" for="node" attr.name="note"/>
  <graph edgedefault="directed">
    <data key="k7">Sample</data>
    <node id="a">
      <data key="k0">First &amp; one</data>
      <data key="k1">1.5</data>
      <data key="k2">-2</data>
      <data key="k3">7</data>
      <data key="k4">true</data>
      <data key="k6">9007199254740993</data>
      <data key="k8"> kept as is </data>
    </node>
    <node id="b"><data key="k4">0</data></node>
    <edge source="a" target="b"><data key="k5">2.5</data><data key="k4">1</data></edge>
  </graph>
</graphml>`)
    expect(file.graph.attributes).toEqual({ title: 'Sample' })
    expect(file.nodes).toEqual([
      {
        id: 'a',
        label: 'First & one',
        x: 1.5,
        y: -2,
        attributes: {
          visits: 7,
          checked: true,
          big: '9007199254740993',
          note: ' kept as is ',
        },
      },
      { id: 'b', attributes: { visits: 0, checked: false } },
    ])
    expect(file.edges).toEqual([
      {
        id: 'a->b',
        source: 'a',
        target: 'b',
        directed: true,
        weight: 2.5,
        attributes: { checked: true },
      },
    ])
    expect(file.schema.nodes).toEqual([
      { name: 'label', type: 'string' },
      { name: 'x', type: 'double' },
      { name: 'y', type: 'float' },
      { name: 'visits', type: 'integer', default: 0 },
      { name: 'checked', type: 'boolean' },
      { name: 'big', type: 'long' },
      { name: 'note', type: 'string' },
    ])
    expect(file.schema.edges).toEqual([
      { name: 'checked', type: 'boolean' },
      { name: 'weight', type: 'double' },
    ])
    expect(file.schema.graph).toEqual([
      { name: 'checked', type: 'boolean' },
      { name: 'title', type: 'string' },
    ])
  })

  it('keeps attributes as such when asked not to read fields', () => {
    const file = readGraphml(
      `${head}<key id="k0" for="node" attr.name="label"/><graph edgedefault="directed"><node id="a"><data key="k0">A</data></node></graph></graphml>`,
      { fields: false },
    )
    expect(file.nodes).toEqual([{ id: 'a', attributes: { label: 'A' } }])
  })

  it('gives the nodes of nested graphs a parent', () => {
    const file = readGraphml(`${head}
  <graph edgedefault="directed">
    <node id="outer">
      <graph id="outer:" edgedefault="undirected">
        <node id="inner">
          <graph edgedefault="directed"><node id="deep"/></graph>
        </node>
        <edge source="inner" target="outer"/>
      </graph>
    </node>
  </graph>
</graphml>`)
    expect(file.nodes).toEqual([
      { id: 'outer', attributes: {} },
      { id: 'inner', parent: 'outer', attributes: {} },
      { id: 'deep', parent: 'inner', attributes: {} },
    ])
    expect(file.edges).toEqual([
      { id: 'inner--outer', source: 'inner', target: 'outer', directed: false, attributes: {} },
    ])
  })

  it('makes stable and unique ids for edges without one: parallel edges and self loops', () => {
    const file = readGraphml(`${head}
  <graph edgedefault="directed">
    <node id="a"/><node id="b"/>
    <edge source="a" target="b"/>
    <edge source="a" target="b"/>
    <edge id="a-&gt;b#3" source="b" target="b"/>
    <edge source="a" target="b"/>
    <edge source="a" target="a"/>
    <edge source="a" target="a" directed="false"/>
  </graph>
</graphml>`)
    expect(file.edges.map((edge) => edge.id)).toEqual([
      'a->b',
      'a->b#2',
      'a->b#3',
      'a->b#4',
      'a->a',
      'a--a',
    ])
  })

  it('reports problems instead of throwing', () => {
    const file = readGraphml(`${head}
  <key id="n" for="node" attr.name="count" attr.type="int"/>
  <graph edgedefault="directed">
    <node id="a"><data key="n">many</data><data key="unknown">x</data></node>
    <node id="a"/>
    <node/>
    <node id="p"><port name="left"/></node>
    <edge source="a" target="missing"/>
    <edge source="a"/>
    <edge id="dup" source="a" target="a"/>
    <edge id="dup" source="a" target="a"/>
    <edge source="a" target="p" sourceport="left"/>
    <hyperedge><endpoint node="a"/><endpoint node="p"/></hyperedge>
    <hyperedge><endpoint node="a"/></hyperedge>
    <node id="s"><data key="n"><nested/></data></node>
  </graph>
</graphml>`)
    expect(file.nodes.map((node) => node.id)).toEqual(['a', 'p', 's'])
    expect(file.nodes[0]?.attributes).toEqual({ count: 'many', unknown: 'x' })
    expect(file.edges.map((edge) => edge.id)).toEqual(['a->missing', 'dup', 'a->p'])
    expect(file.issues).toEqual([
      { type: 'invalid-value', kind: 'nodes', name: 'count', value: 'many', line: 5 },
      { type: 'unknown-attribute', kind: 'nodes', name: 'unknown', line: 5 },
      { type: 'duplicate-id', kind: 'nodes', id: 'a', line: 6 },
      { type: 'missing-id', kind: 'nodes', line: 7 },
      { type: 'missing-end', kind: 'edges', line: 10 },
      { type: 'missing-node', kind: 'edges', id: 'a->missing', node: 'missing', line: 9 },
      { type: 'duplicate-id', kind: 'edges', id: 'dup', line: 12 },
      { type: 'unsupported', feature: 'port', count: 2, line: 8 },
      { type: 'unsupported', feature: 'hyperedge', count: 2, line: 14 },
      { type: 'unsupported', feature: 'structured-data', count: 1, line: 16 },
    ])
  })

  it('throws on a file that is not GraphML or not XML', () => {
    expect(() => readGraphml('<gexf/>')).toThrow(FormatError)
    expect(() => readGraphml('<gexf/>')).toThrow('expected <graphml>')
    expect(() => readGraphml('{"graph":{}}')).toThrow(/graphml: text outside the root element/)
  })
})

describe('writeGraphml', () => {
  it('writes keys, data, nested graphs and the direction of edges', () => {
    const text = writeGraphml(
      {
        nodes: [
          { id: 'a', label: 'A', x: 1, attributes: { rank: 2, tags: ['x', 'y'] } },
          { id: 'b', parent: 'a', attributes: { rank: 3 } },
        ],
        edges: [
          { source: 'a', target: 'b', directed: false, attributes: {} },
          { id: 'e', source: 'b', target: 'a', directed: true, weight: 0.5, attributes: {} },
        ],
      },
      { directed: true },
    )
    expect(text).toContain('<key id="n0" for="node" attr.name="label" attr.type="string"/>')
    expect(text).toContain('<key id="n2" for="node" attr.name="rank" attr.type="int"/>')
    expect(text).toContain('<key id="n3" for="node" attr.name="tags" attr.type="string"/>')
    expect(text).toContain('<data key="n3">["x","y"]</data>')
    expect(text).toContain('<graph id="a:" edgedefault="directed">')
    expect(text).toContain('<edge source="a" target="b" directed="false"/>')
    const read = readGraphml(text)
    expect(read.nodes).toEqual([
      { id: 'a', label: 'A', x: 1, attributes: { rank: 2, tags: '["x","y"]' } },
      { id: 'b', parent: 'a', attributes: { rank: 3 } },
    ])
    expect(read.edges[1]).toEqual({
      id: 'e',
      source: 'b',
      target: 'a',
      directed: true,
      weight: 0.5,
      attributes: {},
    })
  })

  it('writes defaults once and omits the values that equal them', () => {
    const file = readGraphml(`${head}
  <key id="d" for="node" attr.name="state" attr.type="string"><default>idle</default></key>
  <graph edgedefault="directed"><node id="a"/><node id="b"><data key="d">busy</data></node></graph>
</graphml>`)
    const text = writeGraphml(file)
    expect(text.match(/<data /g)).toHaveLength(1)
    expect(readGraphml(text).nodes).toEqual(file.nodes)
  })

  it('reads its own output to the same data, entities and characters included', () => {
    const value = 'a & <b> "c" \'d\'\n\te\r\n]]> \u{1F600}'
    const file = readGraphml(
      writeGraphml({
        graph: { id: value, directed: false, attributes: { title: value } },
        nodes: [{ id: value, label: value, attributes: { text: value, empty: '' } }],
        edges: [{ id: value, source: value, target: value, directed: false, attributes: {} }],
      }),
    )
    expect(file.graph).toEqual({ id: value, directed: false, attributes: { title: value } })
    expect(file.nodes).toEqual([
      { id: value, label: value, attributes: { text: value, empty: '' } },
    ])
    expect(file.edges[0]?.id).toBe(value)
  })
})
