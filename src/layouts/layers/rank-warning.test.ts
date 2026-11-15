import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Key, LayoutGraph } from '../../types'
import { layers } from '.'

interface Row {
  readonly id: string
  readonly score: number
}

function graphOf(count: number, ranks: number): LayoutGraph<Row> {
  const data: Row[] = []
  const keys: Key[] = []
  for (let index = 0; index < count; index++) {
    keys.push(`n${index}`)
    data.push({ id: `n${index}`, score: Math.floor((index * ranks) / count) })
  }
  const pairs: number[] = []
  for (let from = 0; from < count / 4; from++) {
    for (let to = 0; to < 3; to++) pairs.push(from, count - 1 - to - from)
  }
  return {
    capacity: count,
    alive: new Uint8Array(count).fill(1),
    movable: new Uint8Array(count).fill(1),
    xy: new Float32Array(count * 2),
    radius: new Float32Array(count).fill(5),
    edges: Uint32Array.from(pairs),
    keys,
    datum: (index) => data[index] as Row,
  }
}

function run(graph: LayoutGraph<Row>): Promise<void> {
  return new Promise<void>((resolve) => {
    layers<Row>({ rank: 'score' }).start(graph, { progress: () => {}, end: () => resolve() })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('layers with a rank', () => {
  it('warns in development when the ranks make edges cross very many layers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await run(graphOf(1200, 1200))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('rank')
  })

  it('stays quiet with a few distinct ranks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await run(graphOf(1200, 10))
    expect(warn).not.toHaveBeenCalled()
  })
})
