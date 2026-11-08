import { describe, expect, it } from 'vitest'
import { readGexf, writeGexf } from '.'

const open13 =
  '<?xml version="1.0" encoding="UTF-8"?>\n<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz" version="1.3">'
const open12 =
  '<?xml version="1.0" encoding="UTF-8"?>\n<gexf xmlns="http://www.gexf.net/1.2draft" xmlns:v="http://www.gexf.net/1.2draft/viz" version="1.2">'

describe('readGexf', () => {
  it('reads meta, nodes, edges, weights, kinds and the default direction', () => {
    const file = readGexf(`${open13}
  <meta lastmodifieddate="2026-01-01"><creator>Someone</creator><description>A sample</description></meta>
  <graph defaultedgetype="directed">
    <nodes>
      <node id="0" label="Zero"/>
      <node id="1" label="One"/>
    </nodes>
    <edges>
      <edge id="a" source="0" target="1" weight="2.5" kind="link" label="first"/>
      <edge source="1" target="0" type="undirected"/>
      <edge source="1" target="1" type="mutual"/>
    </edges>
  </graph>
</gexf>`)
    expect(file.graph).toEqual({
      directed: true,
      attributes: { lastmodifieddate: '2026-01-01', creator: 'Someone', description: 'A sample' },
    })
    expect(file.nodes).toEqual([
      { id: '0', label: 'Zero', attributes: {} },
      { id: '1', label: 'One', attributes: {} },
    ])
    expect(file.edges).toEqual([
      {
        id: 'a',
        source: '0',
        target: '1',
        directed: true,
        weight: 2.5,
        type: 'link',
        label: 'first',
        attributes: {},
      },
      { id: '1--0', source: '1', target: '0', directed: false, attributes: {} },
      { id: '1--1', source: '1', target: '1', directed: false, attributes: {} },
    ])
  })

  it('treats edges as undirected when the graph does not say', () => {
    const file = readGexf(
      `${open13}<graph><nodes><node id="a"/></nodes><edges><edge source="a" target="a"/></edges></graph></gexf>`,
    )
    expect(file.graph.directed).toBe(false)
    expect(file.edges[0]?.directed).toBe(false)
  })

  it('types attribute values, lists included, and applies defaults', () => {
    const file = readGexf(`${open13}
  <graph>
    <attributes class="node">
      <attribute id="0" title="url" type="anyURI"/>
      <attribute id="1" title="frog" type="boolean"><default>true</default></attribute>
      <attribute id="2" title="degree" type="float"/>
      <attribute id="3" title="count" type="long"/>
      <attribute id="4" title="tags" type="liststring"/>
      <attribute id="5" title="sizes" type="listinteger"/>
      <attribute id="6" title="huge" type="biginteger"/>
      <attribute id="7" title="odd" type="something"/>
    </attributes>
    <attributes class="edge">
      <attribute id="0" title="strength" type="double"/>
    </attributes>
    <nodes>
      <node id="a">
        <attvalues>
          <attvalue for="0" value="https://example.org"/>
          <attvalue for="2" value="1.5"/>
          <attvalue for="3" value="12"/>
          <attvalue for="4" value="[one, 'two, three', &quot;four&quot;]"/>
          <attvalue for="5" value="[1, 2, 3]"/>
          <attvalue for="6" value="123456789012345678901234567890"/>
          <attvalue for="7" value="raw"/>
        </attvalues>
      </node>
      <node id="b">
        <attvalues>
          <attvalue for="1" value="false"/>
          <attvalue for="4" value="[]"/>
        </attvalues>
      </node>
    </nodes>
    <edges>
      <edge source="a" target="b"><attvalues><attvalue for="0" value="0.25"/></attvalues></edge>
    </edges>
  </graph>
</gexf>`)
    expect(file.nodes).toEqual([
      {
        id: 'a',
        attributes: {
          url: 'https://example.org',
          frog: true,
          degree: 1.5,
          count: 12,
          tags: ['one', 'two, three', 'four'],
          sizes: [1, 2, 3],
          huge: '123456789012345678901234567890',
          odd: 'raw',
        },
      },
      { id: 'b', attributes: { frog: false, tags: [] } },
    ])
    expect(file.edges[0]?.attributes).toEqual({ strength: 0.25 })
    expect(file.schema.nodes).toEqual([
      { name: 'url', type: 'string' },
      { name: 'frog', type: 'boolean', default: true },
      { name: 'degree', type: 'float' },
      { name: 'count', type: 'long' },
      { name: 'tags', type: 'string[]' },
      { name: 'sizes', type: 'integer[]' },
      { name: 'huge', type: 'long' },
      { name: 'odd', type: 'string' },
    ])
    expect(file.issues).toEqual([])
  })

  it('reads lists of GEXF 1.2, separated by bars', () => {
    const file = readGexf(`${open12}
  <graph>
    <attributes class="node"><attribute id="t" title="tags" type="liststring"/></attributes>
    <nodes><node id="a"><attvalues><attvalue for="t" value="red|green|blue"/></attvalues></node></nodes>
    <edges/>
  </graph>
</gexf>`)
    expect(file.nodes[0]?.attributes).toEqual({ tags: ['red', 'green', 'blue'] })
  })

  it('reads the viz module: color, position, size, shape and image, under any prefix', () => {
    const file = readGexf(`${open12}
  <graph defaultedgetype="directed">
    <nodes>
      <node id="a">
        <v:color r="239" g="173" b="66"/>
        <v:position x="15.78" y="-40.1" z="0.0"/>
        <v:size value="2.5"/>
        <v:shape value="diamond"/>
      </node>
      <node id="b">
        <v:color r="0" g="0" b="255" a="0.5"/>
        <v:shape value="image" uri="https://example.org/b.png"/>
      </node>
      <node id="c"><v:shape value="triangle"/><v:color hex="#00FF00"/></node>
    </nodes>
    <edges>
      <edge source="a" target="b"><v:color r="1" g="2" b="3"/><v:thickness value="4"/><v:shape value="dashed"/></edge>
      <edge source="b" target="c"><v:shape value="double"/></edge>
    </edges>
  </graph>
</gexf>`)
    expect(file.nodes).toEqual([
      {
        id: 'a',
        color: '#efad42',
        x: 15.78,
        y: -40.1,
        size: 2.5,
        shape: 'diamond',
        attributes: {},
      },
      {
        id: 'b',
        color: 'rgba(0, 0, 255, 0.5)',
        image: 'https://example.org/b.png',
        attributes: {},
      },
      { id: 'c', color: '#00ff00', attributes: {} },
    ])
    expect(file.edges[0]).toEqual({
      id: 'a->b',
      source: 'a',
      target: 'b',
      directed: true,
      color: '#010203',
      width: 4,
      dash: 'dashed',
      attributes: {},
    })
    expect(file.issues).toEqual([
      { type: 'unsupported', feature: 'node-shape', count: 1, line: 15 },
      { type: 'unsupported', feature: 'edge-shape', count: 1, line: 19 },
    ])
  })

  it('reads dynamic data into time and spells', () => {
    const file = readGexf(`${open13}
  <graph mode="dynamic" defaultedgetype="directed" timeformat="date">
    <nodes>
      <node id="a" start="2009-03-01"/>
      <node id="b" end="2009-03-10"/>
      <node id="c" start="2009-03-01" end="2009-03-01"/>
      <node id="d">
        <spells>
          <spell start="2009-01-01" end="2009-01-15"/>
          <spell start="2009-01-30" end="2009-02-01"/>
        </spells>
      </node>
      <node id="e" timestamps="&lt;[2019-03-20, 2019-03-21]&gt;"/>
      <node id="f" intervals="&lt;[2019-01-01, 2019-01-02]; [2019-01-05, 2019-01-06]&gt;"/>
      <node id="g" timestamp="2012-09-12T15:04:01"/>
      <node id="h" start="2012-11-04T11:00:01+03:00"/>
    </nodes>
    <edges>
      <edge source="a" target="b" start="2009-03-01" end="2009-03-10"/>
    </edges>
  </graph>
</gexf>`)
    const day = (text: string) => Date.parse(`${text}T00:00:00Z`)
    expect(file.graph.timeFormat).toBe('date')
    expect(file.nodes.map((node) => [node.id, node.time, node.spells])).toEqual([
      ['a', { start: day('2009-03-01') }, undefined],
      ['b', { end: day('2009-03-10') }, undefined],
      ['c', day('2009-03-01'), undefined],
      [
        'd',
        { start: day('2009-01-01'), end: day('2009-02-01') },
        [
          { start: day('2009-01-01'), end: day('2009-01-15') },
          { start: day('2009-01-30'), end: day('2009-02-01') },
        ],
      ],
      [
        'e',
        { start: day('2019-03-20'), end: day('2019-03-21') },
        [day('2019-03-20'), day('2019-03-21')],
      ],
      [
        'f',
        { start: day('2019-01-01'), end: day('2019-01-06') },
        [
          { start: day('2019-01-01'), end: day('2019-01-02') },
          { start: day('2019-01-05'), end: day('2019-01-06') },
        ],
      ],
      ['g', Date.parse('2012-09-12T15:04:01Z'), undefined],
      ['h', { start: Date.parse('2012-11-04T08:00:01Z') }, undefined],
    ])
    expect(file.edges[0]?.time).toEqual({ start: day('2009-03-01'), end: day('2009-03-10') })
  })

  it('keeps the first value of a dynamic attribute and reports the others', () => {
    const file = readGexf(`${open13}
  <graph mode="dynamic" timezone="Europe/Paris">
    <attributes class="node" mode="dynamic"><attribute id="0" title="degree" type="integer"/></attributes>
    <nodes>
      <node id="a">
        <attvalues>
          <attvalue for="0" value="1" start="1"/>
          <attvalue for="0" value="2" start="2"/>
          <attvalue for="0" value="3" start="3"/>
        </attvalues>
      </node>
    </nodes>
  </graph>
</gexf>`)
    expect(file.nodes[0]?.attributes).toEqual({ degree: 1 })
    expect(file.issues).toEqual([
      { type: 'unsupported', feature: 'time-zone', count: 1, line: 3 },
      { type: 'unsupported', feature: 'dynamic-attribute', count: 2, line: 9 },
    ])
  })

  it('reads hierarchies, nested or by pid, and reports phylogenies', () => {
    const file = readGexf(`${open13}
  <graph>
    <nodes>
      <node id="a">
        <nodes>
          <node id="b"/>
        </nodes>
        <edges><edge source="b" target="c"/></edges>
      </node>
      <node id="c" pid="a"/>
      <node id="d"><parents><parent for="a"/><parent for="c"/></parents></node>
    </nodes>
  </graph>
</gexf>`)
    expect(file.nodes.map((node) => [node.id, node.parent])).toEqual([
      ['a', undefined],
      ['b', 'a'],
      ['c', 'a'],
      ['d', undefined],
    ])
    expect(file.edges.map((edge) => edge.id)).toEqual(['b--c'])
    expect(file.issues).toEqual([{ type: 'unsupported', feature: 'phylogeny', count: 1, line: 12 }])
  })

  it('throws without a graph', () => {
    expect(() => readGexf(`${open13}</gexf>`)).toThrow('gexf: the document has no <graph>')
  })
})

describe('writeGexf', () => {
  it('writes 1.3 with viz, kinds, pids, dynamic data and typed attributes', () => {
    const text = writeGexf(
      {
        nodes: [
          {
            id: 'a',
            label: 'A',
            x: 1,
            y: 2,
            size: 3,
            color: 'rgb(10 20 30 / 50%)',
            shape: 'square',
            time: Date.UTC(2020, 0, 1),
            attributes: { tags: ['x', 'y z'], weight: 2 },
          },
          { id: 'b', parent: 'a', color: 'teal', shape: 'box', attributes: {} },
        ],
        edges: [
          { source: 'a', target: 'b', directed: true, type: 'link', width: 2, attributes: {} },
        ],
      },
      { timeFormat: 'date' },
    )
    expect(text).toContain(
      '<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz" version="1.3">',
    )
    expect(text).toContain('mode="dynamic" timeformat="date"')
    expect(text).toContain('<node id="a" label="A" start="2020-01-01" end="2020-01-01">')
    expect(text).toContain('<viz:color r="10" g="20" b="30" a="0.5"/>')
    expect(text).toContain('<attvalue for="0" value="[x, y z]"/>')
    expect(text).toContain('<node id="b" pid="a">')
    expect(text).toContain('kind="link"')
    const file = readGexf(text)
    expect(file.nodes).toEqual([
      {
        id: 'a',
        label: 'A',
        x: 1,
        y: 2,
        size: 3,
        color: 'rgba(10, 20, 30, 0.5)',
        shape: 'square',
        time: Date.UTC(2020, 0, 1),
        attributes: { tags: ['x', 'y z'], weight: 2 },
      },
      { id: 'b', parent: 'a', attributes: { color: 'teal', shape: 'box' } },
    ])
    expect(file.edges[0]).toMatchObject({ directed: true, type: 'link', width: 2 })
  })

  it('switches to dateTime when a moment is not midnight UTC', () => {
    const text = writeGexf(
      { nodes: [{ id: 'a', time: Date.UTC(2020, 0, 1, 12), attributes: {} }], edges: [] },
      { timeFormat: 'date' },
    )
    expect(text).toContain('timeformat="dateTime"')
    expect(readGexf(text).nodes[0]?.time).toBe(Date.UTC(2020, 0, 1, 12))
  })

  it('writes 1.2 with a z position and lists as bar-separated strings', () => {
    const text = writeGexf(
      { nodes: [{ id: 'a', x: 1, y: 2, attributes: { tags: ['p', 'q'] } }], edges: [] },
      { version: '1.2' },
    )
    expect(text).toContain('xmlns="http://www.gexf.net/1.2draft"')
    expect(text).toContain('<viz:position x="1" y="2" z="0"/>')
    expect(text).toContain('type="liststring"')
    expect(text).toContain('value="p|q"')
    expect(readGexf(text).nodes[0]).toEqual({
      id: 'a',
      x: 1,
      y: 2,
      attributes: { tags: ['p', 'q'] },
    })
  })
})
