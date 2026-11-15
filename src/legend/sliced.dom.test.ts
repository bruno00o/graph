import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createLegend } from '.'

type Item = { id: number; kind: string; x: number }

const items: Item[] = Array.from({ length: 4_000 }, (_, id) => ({
  id,
  kind: id % 4 === 0 ? 'a' : 'b',
  x: id,
}))

let dom: FakeDom

function slow(test: (item: Item) => boolean) {
  return (datum: unknown) => {
    const end = performance.now() + 0.01
    while (performance.now() < end) {}
    return test(datum as Item)
  }
}

function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({ marks: [nodes(items, { x: 'x', y: () => 0 })] }),
      ariaLabel: 'graph',
    },
    () => fakeRenderer(),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
}

describe('a legend read in slices', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('leaves no timer when destroyed in the middle of a read', () => {
    const graph = mount()
    const legend = createLegend(graph)
    legend.update({
      entries: [
        {
          entries: [
            { id: 'a', label: 'a', swatch: { kind: 'nodes' }, nodes: slow((d) => d.kind === 'a') },
          ],
        },
      ],
    })
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    legend.destroy()
    expect(vi.getTimerCount()).toBe(0)
    graph.destroy()
  })

  it('counts the entries given while an earlier read was still going', () => {
    const graph = mount()
    const legend = createLegend(graph)
    legend.update({
      entries: [
        {
          entries: [
            { id: 'a', label: 'a', swatch: { kind: 'nodes' }, nodes: slow((d) => d.kind === 'a') },
          ],
        },
      ],
    })
    legend.update({
      entries: [
        {
          entries: [
            { id: 'b', label: 'b', swatch: { kind: 'nodes' }, nodes: slow((d) => d.kind === 'b') },
          ],
        },
      ],
    })
    for (let round = 0; round < 200 && vi.getTimerCount() > 0; round++) vi.runOnlyPendingTimers()
    const counted = legend.store.state.entries.flatMap((section) =>
      section.items.map((item) => [item.id, item.nodes]),
    )
    expect(counted).toEqual([['a:b', 3_000]])
    legend.destroy()
    graph.destroy()
  })
})
