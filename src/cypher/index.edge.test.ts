import { describe, expect, it } from 'vitest'
import { type CypherInput, cypherGraph } from './index'

function parts(value: bigint): { low: number; high: number } {
  return { low: Number(BigInt.asIntN(32, value)), high: Number(BigInt.asIntN(32, value >> 32n)) }
}

function field(properties: object, name: string): unknown {
  return (properties as Record<string, unknown>)[name]
}

function node(id: string, labels: readonly string[], properties: object) {
  return { elementId: id, labels, properties }
}

function rel(id: string, type: string, source: string, target: string, properties: object) {
  return { elementId: id, type, startNodeElementId: source, endNodeElementId: target, properties }
}

function row(map: Record<string, unknown>) {
  return {
    keys: Object.keys(map),
    get: (key: string): unknown => (map as Record<string, unknown>)[key],
  }
}

function serialized(value: unknown): CypherInput {
  return JSON.parse(JSON.stringify(value)) as CypherInput
}

const values = [
  0n,
  1n,
  -1n,
  2147483647n,
  2147483648n,
  -2147483648n,
  -2147483649n,
  4294967296n,
  9007199254740991n,
  9007199254740992n,
  9007199254740993n,
  -9007199254740991n,
  -9007199254740992n,
  9223372036854775807n,
  -9223372036854775808n,
]

describe('cypherGraph edges', () => {
  it('converts packed integers at every boundary in every mode', () => {
    const properties: Record<string, unknown> = {}
    values.forEach((value, index) => {
      properties[`i${index}`] = parts(value)
    })
    const holder = node('n', ['N'], properties)
    const byId = (mode: Parameters<typeof cypherGraph>[1]) =>
      cypherGraph(holder, mode).nodes[0]?.properties
    const safe = byId(undefined)
    values.forEach((value, index) => {
      const inside = value <= 9007199254740991n && value >= -9007199254740991n
      expect(safe?.[`i${index}`]).toBe(inside ? Number(value) : value.toString())
    })
    const numbers = byId({ integers: 'number' })
    values.forEach((value, index) => {
      expect(numbers?.[`i${index}`]).toBe(Number(value))
    })
    const text = byId({ integers: 'string' })
    values.forEach((value, index) => {
      expect(text?.[`i${index}`]).toBe(value.toString())
    })
    const big = byId({ integers: 'bigint' })
    values.forEach((value, index) => {
      expect(big?.[`i${index}`]).toBe(value)
    })
    const kept = byId({ integers: 'keep' })
    values.forEach((value, index) => {
      expect(kept?.[`i${index}`]).toEqual(parts(value))
    })
    const mapped = byId({ integers: (value: bigint) => `${value}!` })
    values.forEach((value, index) => {
      expect(mapped?.[`i${index}`]).toBe(`${value}!`)
    })
  })

  it('agrees with the JSON form of the same numbers and shapes', () => {
    const properties: Record<string, unknown> = {}
    values.forEach((value, index) => {
      properties[`i${index}`] = parts(value)
    })
    const holder = node('n', ['N'], properties)
    for (const mode of [undefined, { integers: 'number' }, { integers: 'string' }] as const) {
      expect(cypherGraph(serialized(holder), mode).nodes[0]?.properties).toEqual(
        cypherGraph(holder, mode).nodes[0]?.properties,
      )
    }
  })

  it('converts native big integers and leaves packed keep values alone', () => {
    const holder = node('n', ['N'], { a: 5n, b: 9007199254740993n, c: -9223372036854775808n })
    const properties = cypherGraph(holder).nodes[0]?.properties
    expect(properties).toEqual({ a: 5, b: '9007199254740993', c: '-9223372036854775808' })
    const big = cypherGraph(holder, { integers: 'bigint' }).nodes[0]?.properties
    expect(big).toEqual({ a: 5n, b: 9007199254740993n, c: -9223372036854775808n })
  })

  it('reads integers through their toNumber-like shape', () => {
    const holder = {
      elementId: 'n',
      labels: ['N'],
      properties: { v: { low: 1, high: 0, toNumber: () => 1 } },
    }
    expect(cypherGraph(holder).nodes[0]?.properties).toEqual({ v: 1 })
  })

  it('formats temporal, duration and point maps, json alike', () => {
    const properties = {
      d: { year: 2024, month: 3, day: 9 },
      big: { year: 12024, month: 3, day: 9 },
      old: { year: -44, month: 3, day: 9 },
      dt: { year: 2024, month: 3, day: 9, hour: 7, minute: 5, second: 3, nanosecond: 456 },
      offset: {
        year: 2024,
        month: 3,
        day: 9,
        hour: 7,
        minute: 5,
        second: 3,
        nanosecond: 0,
        timeZoneOffsetSeconds: 3599,
      },
      zone: {
        year: 2024,
        month: 3,
        day: 9,
        hour: 7,
        minute: 5,
        second: 3,
        nanosecond: 0,
        timeZoneId: 'Europe/Paris',
      },
      both: {
        year: 2024,
        month: 3,
        day: 9,
        hour: 7,
        minute: 5,
        second: 3,
        nanosecond: 0,
        timeZoneOffsetSeconds: 3600,
        timeZoneId: 'Europe/Paris',
      },
      t: { hour: 1, minute: 2, second: 3, nanosecond: 0 },
      backwards: { hour: 1, minute: 2, second: 3, nanosecond: 0, timeZoneOffsetSeconds: -3661 },
      utc: { hour: 7, minute: 5, second: 3, nanosecond: 1, timeZoneOffsetSeconds: 0 },
      partialDate: { year: 2024, month: 3 },
      partialTime: { hour: 7, minute: 5, second: 3 },
      dur: { months: -1, days: -2, seconds: -3, nanoseconds: -4 },
      durInt: {
        months: parts(-1n),
        days: parts(2n),
        seconds: parts(100n),
        nanoseconds: parts(500n),
      },
      p2: { srid: 4326, x: 1.5, y: 2.5 },
      p3: { srid: parts(4979n), x: 1.5, y: 2.5, z: 3.5 },
      pText: { srid: '4326', x: 1.5, y: 2.5 },
      pMissing: { x: 1.5, y: 2.5 },
    }
    const holder = node('n', ['N'], properties)
    const read = cypherGraph(holder).nodes[0]?.properties ?? {}
    expect(field(read, 'd')).toBe('2024-03-09')
    expect(field(read, 'big')).toBe('+012024-03-09')
    expect(field(read, 'old')).toBe('-000044-03-09')
    expect(field(read, 'dt')).toBe('2024-03-09T07:05:03.000000456')
    expect(field(read, 'offset')).toBe('2024-03-09T07:05:03+00:59:59')
    expect(field(read, 'zone')).toBe('2024-03-09T07:05:03[Europe/Paris]')
    expect(field(read, 'both')).toBe('2024-03-09T07:05:03+01:00[Europe/Paris]')
    expect(field(read, 't')).toBe('01:02:03')
    expect(field(read, 'backwards')).toBe('01:02:03-01:01:01')
    expect(field(read, 'utc')).toBe('07:05:03.000000001Z')
    expect(field(read, 'partialDate')).toEqual({ year: 2024, month: 3 })
    expect(field(read, 'partialTime')).toEqual({ hour: 7, minute: 5, second: 3 })
    expect(field(read, 'dur')).toEqual({ months: -1, days: -2, seconds: -3, nanoseconds: -4 })
    expect(field(read, 'durInt')).toEqual({ months: -1, days: 2, seconds: 100, nanoseconds: 500 })
    expect(field(read, 'p2')).toEqual({ srid: 4326, x: 1.5, y: 2.5 })
    expect(field(read, 'p3')).toEqual({ srid: 4979, x: 1.5, y: 2.5, z: 3.5 })
    expect(field(read, 'pText')).toEqual({ srid: '4326', x: 1.5, y: 2.5 })
    expect(field(read, 'pMissing')).toEqual({ x: 1.5, y: 2.5 })
    expect(cypherGraph(serialized(holder)).nodes[0]?.properties).toEqual(read)
    const bigSrid = cypherGraph(holder, { integers: 'bigint' }).nodes[0]?.properties ?? {}
    expect(field(bigSrid, 'p2')).toEqual({ srid: 4326n, x: 1.5, y: 2.5 })
    const textSrid = cypherGraph(holder, { integers: 'string' }).nodes[0]?.properties ?? {}
    expect(field(textSrid, 'p2')).toEqual({ srid: '4326', x: 1.5, y: 2.5 })
  })

  it('walks nested paths and survives cycles', () => {
    const a = node('a', ['A'], { x: 1 })
    const b = node('b', ['B'], { x: 2 })
    const c = node('c', ['C'], { x: 3 })
    const ab = rel('ab', 'KNOWS', 'a', 'b', {})
    const bc = rel('bc', 'KNOWS', 'b', 'c', {})
    const first = { start: a, end: b, segments: [{ start: a, relationship: ab, end: b }] }
    const second = { start: b, end: c, segments: [{ start: b, relationship: bc, end: c }] }
    const nested = {
      records: [row({ deep: { list: [first] }, other: second })],
    }
    const graph = cypherGraph(nested)
    expect(graph.nodes.map((each) => each.id)).toEqual(['a', 'b', 'c'])
    expect(graph.edges.map((each) => each.id)).toEqual(['ab', 'bc'])
    const cycle: Record<string, unknown> = { node: a }
    Object.assign(cycle, { me: { deeper: [cycle, second] } })
    const looped = cypherGraph(cycle)
    expect(looped.nodes.map((each) => each.id)).toEqual(['a', 'b', 'c'])
    expect(looped.edges.map((each) => each.id)).toEqual(['bc'])
    const path: Record<string, unknown> = { start: a, end: b, segments: [] }
    Object.assign(path, { segments: [{ start: a, relationship: ab, end: b, rest: [path, cycle] }] })
    const repeated = cypherGraph(path)
    expect(repeated.nodes.map((each) => each.id)).toEqual(['a', 'b'])
    expect(repeated.edges.map((each) => each.id)).toEqual(['ab'])
  })

  it('keeps the first of a duplicate and ids apart by kind', () => {
    const first = node('x', ['A'], { v: 1 })
    const second = node('x', ['B'], { v: 2 })
    const graph = cypherGraph({ records: [row({ a: first, b: second })] })
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0]?.labels).toEqual(['A'])
    expect(graph.nodes[0]?.properties).toEqual({ v: 1 })
    const numeric = node('1', ['N'], {})
    const edge = rel('1', 'T', '1', '1', {})
    expect(cypherGraph({ records: [row({ n: numeric, e: edge })] }).nodes).toHaveLength(1)
    expect(cypherGraph({ records: [row({ n: numeric, e: edge })] }).edges).toHaveLength(1)
    const legacy = { identity: parts(4n), labels: ['N'], properties: {} }
    expect(cypherGraph(legacy).nodes[0]?.id).toBe('4')
    const negative = { identity: parts(-9223372036854775808n), labels: ['N'], properties: {} }
    expect(cypherGraph(negative).nodes[0]?.id).toBe('-9223372036854775808')
    const both = { elementId: 'e', identity: parts(9n), labels: ['N'], properties: {} }
    expect(cypherGraph(both).nodes[0]?.id).toBe('e')
  })

  it('drops half-ended relationships and reads legacy ends', () => {
    const a = node('a', ['A'], {})
    const ok = rel('ok', 'T', 'a', 'b', {})
    const noEnd = {
      elementId: 'noEnd',
      type: 'T',
      startNodeElementId: 'a',
      properties: {},
    }
    const legacy = {
      elementId: 'legacy',
      type: 'T',
      start: parts(5n),
      end: parts(6n),
      properties: {},
    }
    const half = {
      elementId: 'half',
      type: 'T',
      startNodeElementId: 'a',
      end: parts(7n),
      properties: {},
    }
    const graph = cypherGraph({ records: [row({ a, ok, noEnd, legacy, half })] })
    const plain = cypherGraph({ inside: [a, ok, legacy, half] })
    expect(graph.edges).toEqual([
      { id: 'ok', type: 'T', source: 'a', target: 'b', properties: {} },
      { id: 'legacy', type: 'T', source: '5', target: '6', properties: {} },
      { id: 'half', type: 'T', source: 'a', target: '7', properties: {} },
    ])
    expect(graph.edges.filter((each) => each.id !== 'half')).toEqual(
      cypherGraph(serialized({ inside: [a, ok, legacy] })).edges,
    )
    expect(plain.edges.filter((each) => each.id !== 'half')).toEqual(
      graph.edges.filter((each) => each.id !== 'half'),
    )
  })
})
