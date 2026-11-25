import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import type { GraphInstance } from '../host/graph-instance'
import { createGraphHost } from '../host/mount-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createGraphAgent } from './index'
import type { AgentActResult, AgentNode, GraphAgent } from './types'

interface Item {
  readonly id: string
  readonly name: string
  readonly x: number
  readonly y: number
}

const items: Item[] = [
  { id: 'a', name: 'Anchor', x: 0, y: 0 },
  { id: 'b', name: 'Bridge', x: 120, y: 0 },
  { id: 'c', name: 'Corner', x: 0, y: 120 },
  { id: 'd', name: 'Distant', x: 4000, y: 4000 },
]

const links = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'cd', from: 'c', to: 'd' },
]

let dom: FakeDom

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          nodes(items, { x: 'x', y: 'y', label: (item) => item.name, size: 20 }),
          edges(links, { source: 'from', target: 'to', label: (link) => link.id }),
        ],
        states: { marked: { fill: '#0072b2', raise: true } },
      }),
      ariaLabel: 'Sample graph',
      view: undefined,
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph
}

async function acted(agent: GraphAgent, run: Promise<AgentActResult>): Promise<AgentActResult> {
  for (let turn = 0; turn < 50; turn++) {
    const done = await Promise.race([
      run,
      new Promise<null>((wake) => setTimeout(() => wake(null), 1)),
    ])
    if (done) return done
    dom.flushFrames()
  }
  void agent
  throw new Error('act did not end')
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('createGraphAgent on a page', () => {
  it('reads the label, the focus and the raised elements first', async () => {
    const graph = mount()
    const agent = createGraphAgent(graph)
    graph.view.set({ x: 60, y: 60, zoom: 1 }, { duration: 0 })
    dom.flushFrames()
    graph.states.set('marked', { nodes: ['c'] })
    graph.focus.set({ kind: 'node', key: 'b' })
    dom.flushFrames()
    const shot = agent.snapshot()
    expect(shot.graph).toMatchObject({ label: 'Sample graph', surface: 'canvas', size: [800, 600] })
    expect(shot.focus).toBe('b')
    expect(shot.states).toEqual({ marked: { nodes: 1, edges: 0 } })
    const first = shot.elements.slice(0, 2).map((each) => ('key' in each ? each.key : null))
    expect(first.sort()).toEqual(['b', 'c'])
    const corner = shot.elements.find((each) => 'key' in each && each.key === 'c') as AgentNode
    expect(corner.states).toEqual(['marked'])
    expect(corner.look.fill).toMatch(/^#[0-9a-f]{6}$/)
    expect(shot.view.onScreen).toEqual({ nodes: 3, edges: 3 })
    expect(shot.elements.at(-1)).toEqual(
      shot.elements.find((each) => 'key' in each && each.key === 'cd'),
    )
    graph.destroy()
  })

  it('focuses a node and fits it with the origin agent', async () => {
    const graph = mount()
    const agent = createGraphAgent(graph)
    const origins: string[] = []
    graph.on('viewchange', ({ origin }) => origins.push(origin))
    const result = await acted(
      agent,
      agent.act({
        steps: [
          { action: 'focus', target: 'Distant' },
          { action: 'fit', target: 'd' },
        ],
      }),
    )
    expect(result).toMatchObject({ ok: true, settled: true })
    expect(graph.focus.get()).toMatchObject({ kind: 'node', key: 'd' })
    expect(result.changed.view).toEqual({ zoom: 2, center: [4000, 4000] })
    expect(origins.at(-1)).toBe('agent')
    graph.destroy()
  })

  it('stays quiet once the graph is destroyed', async () => {
    const graph = mount()
    const agent = createGraphAgent(graph)
    const seen: string[] = []
    agent.subscribe((change) => seen.push(change.type))
    graph.destroy()
    const shot = agent.snapshot()
    expect(shot.elements).toEqual([])
    const result = await agent.act({ steps: [{ action: 'select', target: 'a' }] })
    expect(result.settled).toBe(false)
    agent.destroy()
    expect(seen).toEqual([])
  })
})
