import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { grid } from '../layouts'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { LoadingSource } from '../testing/loading-source'
import type { GraphDefinition } from '../types'
import { createGraphHost } from './mount-graph'

interface Item {
  readonly id: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

let dom: FakeDom

function mount(definition: GraphDefinition) {
  const container = document.createElement('div')
  document.body.append(container)
  return createGraphHost(container, { definition, ariaLabel: 'graph' }, () => fakeRenderer())
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('settled on a mounted graph', () => {
  it('resolves once the layout and its glide are done', async () => {
    const graph = mount(
      defineGraph({
        marks: [nodes(items), edges(links, { source: 'from', target: 'to' })],
        layout: grid(),
      }),
    )
    let done = false
    const settled = graph.settled().then(() => {
      done = true
    })
    for (let frame = 0; frame < 60 && !done; frame++) {
      dom.flushFrames()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await settled
    expect(graph.store.state.layout.running).toBe(false)
    const point = graph.positions.get('a')
    expect(Number.isFinite(point?.x)).toBe(true)
    graph.destroy()
  })

  it('waits for a live source to load', async () => {
    const source = new LoadingSource<Item>()
    const graph = mount(defineGraph({ marks: [nodes(source)] }))
    let done = false
    void graph.settled().then(() => {
      done = true
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(done).toBe(false)
    source.add(...items)
    source.set('ready')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(done).toBe(true)
    expect(graph.count().nodes).toBe(3)
    graph.destroy()
  })

  it('rejects with the reason of the signal once destroyed', async () => {
    const graph = mount(defineGraph({ marks: [nodes(items)], layout: grid() }))
    const waiting = graph.settled()
    graph.destroy()
    await expect(waiting).rejects.toThrow('graph: the graph was destroyed')
    await expect(graph.settled()).rejects.toThrow('graph: the graph was destroyed')
  })
})
