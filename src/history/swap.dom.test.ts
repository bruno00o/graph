import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { HistoryValues } from '../types'
import { historyFrom } from '.'

type Item = { id: string; x: number; y: number }
type Entry = { key: string; time: number; present?: boolean; values?: HistoryValues<Item> }

const items: Item[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 10, y: 0 },
]

let dom: FakeDom

function mount(entries: Entry[]) {
  const container = document.createElement('div')
  document.body.append(container)
  const definitionOf = (journal: Entry[]) =>
    defineGraph({
      marks: [
        nodes(items, {
          x: 'x',
          y: 'y',
          history: historyFrom(journal, { values: 'values', present: 'present' }),
        }),
      ],
    })
  const graph = createGraphHost(
    container,
    { definition: definitionOf(entries), ariaLabel: 'graph', initialTime: { start: 0, end: 50 } },
    () => fakeRenderer(),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return { graph, definitionOf }
}

describe('a history replaced by a new historyFrom', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('hides a node whose new journal makes it appear only after the window', () => {
    const { graph, definitionOf } = mount([])
    expect(graph.isShown({ kind: 'node', key: 'b' })).toBe(true)
    graph.update({ definition: definitionOf([{ key: 'b', time: 100, present: true }]) })
    dom.flushFrames()
    expect(graph.isShown({ kind: 'node', key: 'b' })).toBe(false)
    graph.destroy()
  })

  it('hides that node when a history is added to a mark that had none', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({ marks: [nodes(items, { x: 'x', y: 'y' })] }),
        ariaLabel: 'graph',
        initialTime: { start: 0, end: 50 },
      },
      () => fakeRenderer(),
    ) as unknown as GraphInstance
    dom.flushFrames()
    const entries: Entry[] = [{ key: 'b', time: 100, present: true }]
    const journal = historyFrom(entries, { values: 'values', present: 'present' })
    graph.update({
      definition: defineGraph({ marks: [nodes(items, { x: 'x', y: 'y', history: journal })] }),
    })
    dom.flushFrames()
    expect(graph.isShown({ kind: 'node', key: 'b' })).toBe(false)
    graph.destroy()
  })

  it('hides the same node when the journal is given at mount', () => {
    const { graph } = mount([{ key: 'b', time: 100, present: true }])
    expect(graph.isShown({ kind: 'node', key: 'b' })).toBe(false)
    graph.destroy()
  })
})
