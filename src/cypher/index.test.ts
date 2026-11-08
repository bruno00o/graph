import { QueryClient } from '@tanstack/query-core'
import neo4j, {
  Record as DriverRecord,
  type EagerResult,
  Node,
  Path,
  PathSegment,
  type QueryResult,
  Relationship,
} from 'neo4j-driver'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createGraphModel } from '../core/graph-model'
import { edges, nodes } from '../marks'
import { createExploration } from '../query'
import {
  type CypherEdge,
  type CypherGraph,
  type CypherInput,
  type CypherNode,
  type CypherProperties,
  cypherGraph,
} from './index'

const int = neo4j.int

function node(id: number, labels: string[], properties: Record<string, unknown> = {}) {
  return new Node(int(id), labels, properties, `n${id}`)
}

function relation(
  id: number,
  from: Node,
  to: Node,
  type: string,
  properties: Record<string, unknown> = {},
) {
  return new Relationship(
    int(id),
    int(from.identity),
    int(to.identity),
    type,
    properties,
    `r${id}`,
    from.elementId,
    to.elementId,
  )
}

function row(entries: Record<string, unknown>) {
  return new DriverRecord(Object.keys(entries), Object.values(entries))
}

function field(properties: CypherProperties | undefined, name: string): unknown {
  return properties?.[name]
}

function serialized<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const ada = node(1, ['Person', 'Admin'], { name: 'Ada', born: int(1815), tags: ['x', 'y'] })
const bob = node(2, ['Person'], { name: 'Bob' })
const acme = node(3, ['Company'], { name: 'Acme' })
const knows = relation(10, ada, bob, 'KNOWS', { since: int(2020) })
const works = relation(11, bob, acme, 'WORKS_AT')

describe('cypherGraph', () => {
  it('reads the rows of a driver result', () => {
    const result = {
      records: [row({ a: ada, r: knows, b: bob }), row({ a: bob, r: works, b: acme })],
      summary: { query: { text: 'MATCH' } },
    } as unknown as QueryResult
    const graph = cypherGraph(result)
    expect(graph.nodes.map((item) => item.id)).toEqual(['n1', 'n2', 'n3'])
    expect(graph.nodes[0]).toEqual({
      id: 'n1',
      labels: ['Person', 'Admin'],
      properties: { name: 'Ada', born: 1815, tags: ['x', 'y'] },
    })
    expect(graph.edges).toEqual([
      { id: 'r10', type: 'KNOWS', source: 'n1', target: 'n2', properties: { since: 2020 } },
      { id: 'r11', type: 'WORKS_AT', source: 'n2', target: 'n3', properties: {} },
    ])
  })

  it('reads the same rows serialized as JSON', () => {
    const records = [row({ a: ada, r: knows, b: bob }), row({ a: bob, r: works, b: acme })]
    expect(cypherGraph(serialized(records))).toEqual(cypherGraph(records))
    expect(cypherGraph(serialized({ records }))).toEqual(cypherGraph({ records }))
  })

  it('reads rows converted to objects', () => {
    const rows = [row({ a: ada, r: knows, b: bob })].map((record) => record.toObject())
    expect(cypherGraph(rows).nodes).toHaveLength(2)
    expect(cypherGraph(rows).edges).toHaveLength(1)
  })

  it('finds values nested in lists and maps', () => {
    const record = row({
      list: [ada, [bob]],
      map: { deep: { rel: knows, again: [{ node: acme }] } },
      plain: 3,
      nothing: null,
    })
    const graph = cypherGraph(record)
    expect(graph.nodes.map((item) => item.id)).toEqual(['n1', 'n2', 'n3'])
    expect(graph.edges.map((item) => item.id)).toEqual(['r10'])
    expect(cypherGraph(serialized(record))).toEqual(graph)
  })

  it('reads a single node, relationship or path', () => {
    expect(cypherGraph(ada).nodes).toHaveLength(1)
    expect(cypherGraph(knows).edges).toHaveLength(1)
    expect(cypherGraph(knows).nodes).toHaveLength(0)
  })

  it('reads the nodes and relationships of a path in order', () => {
    const back = relation(12, acme, bob, 'OWNED_BY')
    const path = new Path(ada, acme, [
      new PathSegment(ada, knows, bob),
      new PathSegment(bob, back, acme),
    ])
    const graph = cypherGraph(row({ p: path }))
    expect(graph.nodes.map((item) => item.id)).toEqual(['n1', 'n2', 'n3'])
    expect(graph.edges.map((item) => [item.id, item.source, item.target])).toEqual([
      ['r10', 'n1', 'n2'],
      ['r12', 'n3', 'n2'],
    ])
    expect(cypherGraph(serialized(row({ p: path })))).toEqual(graph)
  })

  it('reads a path of length zero', () => {
    const graph = cypherGraph(row({ p: new Path(ada, ada, []) }))
    expect(graph.nodes.map((item) => item.id)).toEqual(['n1'])
    expect(graph.edges).toEqual([])
  })

  it('deduplicates by element id, the first occurrence winning', () => {
    const twin = node(1, ['Other'], { name: 'Twin' })
    const graph = cypherGraph([
      row({ a: ada }),
      row({ a: twin }),
      row({ r: knows }),
      row({ r: knows }),
    ])
    expect(graph.nodes).toHaveLength(1)
    expect(field(graph.nodes[0]?.properties, 'name')).toBe('Ada')
    expect(graph.edges).toHaveLength(1)
  })

  it('merges several results', () => {
    const first = { records: [row({ n: ada })] }
    const second = { records: [row({ n: ada }), row({ n: bob })] }
    expect(cypherGraph([first, second]).nodes.map((item) => item.id)).toEqual(['n1', 'n2'])
  })

  it('keeps a relationship whose end node is missing', () => {
    const graph = cypherGraph(row({ r: knows }))
    expect(graph.nodes).toEqual([])
    expect(graph.edges.map((item) => [item.source, item.target])).toEqual([['n1', 'n2']])
    const model = createGraphModel()
    model.setMarks([nodes(graph.nodes), edges(graph.edges, { source: 'source', target: 'target' })])
    model.flush()
    expect(model.pendingEdges()).toEqual(['r10'])
    model.setMarks([
      nodes(cypherGraph([row({ a: ada }), row({ b: bob }), row({ r: knows })]).nodes),
      edges(graph.edges, { source: 'source', target: 'target' }),
    ])
    model.flush()
    expect(model.pendingEdges()).toEqual([])
  })

  it('ignores the summary of a result and cycles', () => {
    const loop: { node: Node; self?: unknown } = { node: ada }
    loop.self = loop
    const result = { records: [row({ loop })], summary: { plan: { node: bob } } }
    expect(cypherGraph(result).nodes.map((item) => item.id)).toEqual(['n1'])
  })

  it('reads an eager result and any iterable of rows', () => {
    const eager = { records: [row({ a: ada })], summary: {}, keys: ['a'] } as unknown as EagerResult
    expect(cypherGraph(eager).nodes).toHaveLength(1)
    function* generate() {
      yield row({ a: ada })
      yield row({ a: bob })
    }
    expect(cypherGraph(generate()).nodes).toHaveLength(2)
    expect(cypherGraph(new Set([ada, bob])).nodes).toHaveLength(2)
  })

  it('falls back on the legacy identity when there is no element id', () => {
    const legacy = {
      identity: { low: 7, high: 0 },
      labels: ['Old'],
      properties: {},
    }
    const link = {
      identity: { low: 9, high: 0 },
      start: { low: 7, high: 0 },
      end: { low: 8, high: 0 },
      type: 'TO',
      properties: {},
    }
    const graph = cypherGraph([legacy, link])
    expect(graph.nodes[0]?.id).toBe('7')
    expect(graph.edges[0]).toMatchObject({ id: '9', source: '7', target: '8' })
  })

  it('skips a relationship without ends', () => {
    expect(cypherGraph({ elementId: 'r', type: 'TO', properties: {} }).edges).toEqual([])
  })

  it('yields nothing from values that hold no graph element', () => {
    expect(cypherGraph([])).toEqual({ nodes: [], edges: [] })
    expect(cypherGraph(row({ n: 1, s: 'text', d: new Date(0), b: new Uint8Array(2) }))).toEqual({
      nodes: [],
      edges: [],
    })
  })
})

describe('integers', () => {
  const big = int('9007199254740993')
  const negative = int('-9007199254740993')
  const small = int(42)
  const holder = node(5, ['N'], { small, big, negative, list: [int(1), big], native: 7 })

  it('gives a number when exact and a string otherwise by default', () => {
    const properties = cypherGraph(holder).nodes[0]?.properties
    expect(properties).toEqual({
      small: 42,
      big: '9007199254740993',
      negative: '-9007199254740993',
      list: [1, '9007199254740993'],
      native: 7,
    })
  })

  it('applies the same defaults to JSON', () => {
    expect(cypherGraph(serialized(holder)).nodes[0]?.properties).toEqual(
      cypherGraph(holder).nodes[0]?.properties,
    )
  })

  it('offers number, string, bigint, keep and a function', () => {
    const read = (integers: Parameters<typeof cypherGraph>[1]) =>
      cypherGraph(holder, integers).nodes[0]?.properties
    expect(field(read({ integers: 'number' }), 'small')).toBe(42)
    expect(field(read({ integers: 'number' }), 'big')).toBe(9007199254740992)
    expect(field(read({ integers: 'string' }), 'small')).toBe('42')
    expect(field(read({ integers: 'bigint' }), 'small')).toBe(42n)
    expect(field(read({ integers: 'bigint' }), 'big')).toBe(9007199254740993n)
    expect(field(read({ integers: 'keep' }), 'small')).toBe(small)
    expect(field(read({ integers: (value) => `#${value}` }), 'small')).toBe('#42')
  })

  it('converts native bigint values and keeps plain numbers', () => {
    const native = new Node(1n, ['N'], { a: 5n, b: 2 ** 60 }, 'x')
    expect(cypherGraph(native).nodes[0]?.properties).toEqual({ a: 5, b: 2 ** 60 })
    expect(field(cypherGraph(native, { integers: 'string' }).nodes[0]?.properties, 'a')).toBe('5')
  })

  it('does not mistake a map with other keys for an integer', () => {
    const map = node(6, ['N'], { range: { low: 1, high: 10, step: 2 } })
    expect(field(cypherGraph(map).nodes[0]?.properties, 'range')).toEqual({
      low: 1,
      high: 10,
      step: 2,
    })
  })
})

describe('temporal and spatial values', () => {
  const values = {
    date: new neo4j.Date(int(2024), int(3), int(9)),
    early: new neo4j.Date(int(-12), int(3), int(9)),
    far: new neo4j.Date(int(12345), int(3), int(9)),
    localTime: new neo4j.LocalTime(int(7), int(5), int(3), int(0)),
    fraction: new neo4j.LocalTime(int(7), int(5), int(3), int(120000000)),
    nano: new neo4j.LocalTime(int(7), int(5), int(3), int(5)),
    utcTime: new neo4j.Time(int(7), int(5), int(3), int(0), int(0)),
    offsetTime: new neo4j.Time(int(7), int(5), int(3), int(500000000), int(3600)),
    westTime: new neo4j.Time(int(7), int(5), int(3), int(0), int(-19800)),
    secondsTime: new neo4j.Time(int(7), int(5), int(3), int(0), int(3661)),
    localDateTime: new neo4j.LocalDateTime(
      int(2024),
      int(3),
      int(9),
      int(7),
      int(5),
      int(3),
      int(0),
    ),
    utc: new neo4j.DateTime(int(2024), int(3), int(9), int(7), int(5), int(3), int(0), int(0)),
    offset: new neo4j.DateTime(
      int(2024),
      int(3),
      int(9),
      int(7),
      int(5),
      int(3),
      int(1000),
      int(7200),
    ),
    zoned: new neo4j.DateTime(
      int(2024),
      int(3),
      int(9),
      int(7),
      int(5),
      int(3),
      int(0),
      undefined,
      'Europe/Paris',
    ),
    both: new neo4j.DateTime(
      int(2024),
      int(3),
      int(9),
      int(7),
      int(5),
      int(3),
      int(0),
      int(3600),
      'Europe/Paris',
    ),
  }

  it('turns dates and times into the ISO 8601 text of the driver', () => {
    const properties = cypherGraph(node(1, ['N'], values)).nodes[0]?.properties
    expect(properties).toEqual(
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
    )
    expect(field(properties, 'date')).toBe('2024-03-09')
    expect(field(properties, 'both')).toBe('2024-03-09T07:05:03+01:00[Europe/Paris]')
  })

  it('does the same for JSON and for numbers instead of integers', () => {
    const expected = cypherGraph(node(1, ['N'], values)).nodes[0]?.properties
    expect(cypherGraph(serialized(node(1, ['N'], values))).nodes[0]?.properties).toEqual(expected)
    const plain = neo4j.DateTime.fromStandardDate(
      new globalThis.Date(Date.UTC(2020, 4, 6, 7, 8, 9)),
    )
    expect(field(cypherGraph(node(1, ['N'], { plain })).nodes[0]?.properties, 'plain')).toBe(
      String(plain),
    )
  })

  it('keeps durations as a map of numbers', () => {
    const duration = new neo4j.Duration(int(14), int(3), int(100), int(500))
    const expected = { months: 14, days: 3, seconds: 100, nanoseconds: 500 }
    const source = node(1, ['N'], { duration })
    expect(field(cypherGraph(source).nodes[0]?.properties, 'duration')).toEqual(expected)
    expect(field(cypherGraph(serialized(source)).nodes[0]?.properties, 'duration')).toEqual(
      expected,
    )
  })

  it('turns points into a map with srid, x, y and z', () => {
    const flat = new neo4j.Point(int(4326), 2.35, 48.85)
    const high = new neo4j.Point(int(4979), 2.35, 48.85, 30)
    const properties = cypherGraph(node(1, ['N'], { flat, high })).nodes[0]?.properties
    expect(field(properties, 'flat')).toEqual({ srid: 4326, x: 2.35, y: 48.85 })
    expect(field(properties, 'high')).toEqual({ srid: 4979, x: 2.35, y: 48.85, z: 30 })
    expect(cypherGraph(serialized(node(1, ['N'], { flat, high }))).nodes[0]?.properties).toEqual(
      properties,
    )
    const text = cypherGraph(node(1, ['N'], { flat }), { integers: 'string' }).nodes[0]
    expect(field(text?.properties, 'flat')).toEqual({ srid: '4326', x: 2.35, y: 48.85 })
  })

  it('leaves other maps and lists alone', () => {
    const properties = { when: { year: 2020, label: 'x' }, list: [{ hour: 1 }, [2]] }
    expect(cypherGraph(node(1, ['N'], properties)).nodes[0]?.properties).toEqual(properties)
  })
})

describe('marks', () => {
  it('feeds nodes() and edges() with few options', () => {
    const graph = cypherGraph([row({ a: ada, r: knows, b: bob })])
    const model = createGraphModel()
    model.setMarks([nodes(graph.nodes), edges(graph.edges, { source: 'source', target: 'target' })])
    const changes = model.flush()
    expect(changes.nodes.added).toHaveLength(2)
    expect(changes.edges.added).toHaveLength(1)
    expect(model.pendingEdges()).toEqual([])
  })

  it('feeds an exploration', async () => {
    const world = [ada, bob, acme]
    const links = [knows, works]
    const query = (key: string) => {
      const around = links.filter(
        (link) => link.startNodeElementId === key || link.endNodeElementId === key,
      )
      return cypherGraph([
        ...around.map((link) => row({ r: link })),
        ...world.filter((item) => item.elementId === key).map((item) => row({ n: item })),
        ...around.flatMap((link) =>
          world
            .filter(
              (item) =>
                item.elementId === link.startNodeElementId ||
                item.elementId === link.endNodeElementId,
            )
            .map((item) => row({ n: item })),
        ),
      ])
    }
    const exploration = createExploration(new QueryClient(), {
      roots: ['n2'],
      neighbors: (key) => ({ queryKey: ['around', key], queryFn: () => query(String(key)) }),
    })
    const seen = new Set<string | number>()
    const subscription = exploration.nodes.subscribeChanges(
      (changes) => {
        for (const change of changes) {
          if (change.type === 'delete') seen.delete(change.key)
          else seen.add(change.key)
        }
      },
      { includeInitialState: true },
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect([...seen].sort()).toEqual(['n1', 'n2', 'n3'])
    subscription.unsubscribe()
    exploration.destroy()
  })
})

describe('types', () => {
  it('accepts the types of the official driver', () => {
    expectTypeOf<QueryResult>().toExtend<CypherInput>()
    expectTypeOf<EagerResult>().toExtend<CypherInput>()
    expectTypeOf<DriverRecord>().toExtend<CypherInput>()
    expectTypeOf<Node>().toExtend<CypherInput>()
    expectTypeOf<Relationship>().toExtend<CypherInput>()
    expectTypeOf<Path>().toExtend<CypherInput>()
    expectTypeOf<DriverRecord[]>().toExtend<CypherInput>()
  })

  it('types the result for the marks', () => {
    interface Person {
      readonly name: string
    }
    const graph = cypherGraph<Person, { since: number }>({} as QueryResult)
    expectTypeOf(graph).toEqualTypeOf<CypherGraph<Person, { since: number }>>()
    expectTypeOf(graph.nodes[0]).toEqualTypeOf<CypherNode<Person> | undefined>()
    expectTypeOf(graph.edges[0]).toEqualTypeOf<CypherEdge<{ since: number }> | undefined>()
    nodes(graph.nodes, { label: (item) => item.properties.name, color: (item) => item.labels[0] })
    edges(graph.edges, { source: 'source', target: 'target', label: 'type' })
    // @ts-expect-error
    cypherGraph(1)
    // @ts-expect-error
    cypherGraph({}, { integers: 'float' })
  })
})
