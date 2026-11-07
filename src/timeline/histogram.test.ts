import { describe, expect, it } from 'vitest'
import { EdgeColumns, NodeColumns } from '../core/columns'
import { mergeSorted, readEdgeSpan, SpanCounts } from './histogram'

function naive(spans: ReadonlyArray<readonly [number, number] | null>, from: number, to: number) {
  return spans.filter((span) => {
    if (!span) return false
    const [start, end] = span
    return start === end ? start >= from && start < to : start < to && end > from
  }).length
}

function counts(spans: ReadonlyArray<readonly [number, number] | null>): SpanCounts {
  const result = new SpanCounts()
  result.update(spans.length, (index, out) => {
    const span = spans[index]
    out[0] = span ? span[0] : Number.NaN
    out[1] = span ? span[1] : Number.NaN
  })
  return result
}

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

describe('SpanCounts', () => {
  it('counts intervals and instants that meet a bin like the time window does', () => {
    const next = random(3)
    const spans = Array.from({ length: 400 }, (): readonly [number, number] | null => {
      const roll = next()
      if (roll < 0.1) return null
      const start = Math.floor(next() * 100)
      if (roll < 0.3) return [start, start]
      if (roll < 0.35) return [Number.NEGATIVE_INFINITY, start]
      if (roll < 0.4) return [start, Number.POSITIVE_INFINITY]
      return [start, start + Math.floor(next() * 30)]
    })
    const table = counts(spans)
    for (let from = -5; from < 110; from += 7) {
      for (const width of [1, 5, 20]) {
        expect(table.count(from, from + width)).toBe(naive(spans, from, from + width))
      }
    }
  })

  it('follows changes, merging small ones and sorting again large ones', () => {
    const spans: Array<readonly [number, number] | null> = Array.from({ length: 200 }, (_, i) => [
      i,
      i + 10,
    ])
    const table = counts(spans)
    const update = () =>
      table.update(spans.length, (index, out) => {
        const span = spans[index]
        out[0] = span ? span[0] : Number.NaN
        out[1] = span ? span[1] : Number.NaN
      })
    expect(update()).toBe(false)
    spans[5] = [500, 500]
    spans[6] = null
    spans.push([42, 43])
    expect(update()).toBe(true)
    for (const [from, to] of [
      [0, 10],
      [40, 45],
      [500, 501],
      [199, 300],
    ] as const) {
      expect(table.count(from, to)).toBe(naive(spans, from, to))
    }
    for (let index = 0; index < 150; index++) spans[index] = [index * 2, index * 2 + 1]
    expect(update()).toBe(true)
    expect(table.count(0, 50)).toBe(naive(spans, 0, 50))
    expect(table.first()).toBe(0)
    expect(table.last()).toBe(299)
  })

  it('merges sorted values', () => {
    const merged = mergeSorted(
      Float64Array.of(1, 2, 2, 5, 9),
      Float64Array.of(2, 9),
      Float64Array.of(0, 3, 10),
    )
    expect([...merged]).toEqual([0, 1, 2, 3, 5, 10])
  })
})

describe('readEdgeSpan', () => {
  it('counts an edge over the time it and both its ends exist', () => {
    const nodes = new NodeColumns()
    const edges = new EdgeColumns()
    nodes.reserve(3)
    edges.reserve(3)
    nodes.alive.fill(1, 0, 3)
    edges.alive.fill(1, 0, 3)
    nodes.time.write(0, [0, 50])
    nodes.time.write(1, [20, 100])
    nodes.time.write(2, [80, 90])
    edges.source.set([0, 0, 2])
    edges.target.set([1, 2, 1])
    edges.time.write(0, [10, 40])
    const out = new Float64Array(2)
    readEdgeSpan(nodes, edges, 0, out)
    expect([...out]).toEqual([20, 40])
    readEdgeSpan(nodes, edges, 1, out)
    expect(Number.isNaN(out[0])).toBe(true)
    readEdgeSpan(nodes, edges, 2, out)
    expect([...out]).toEqual([80, 90])
  })
})
