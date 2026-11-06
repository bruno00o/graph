import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { EdgeOptions } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { RenderFrame } from './renderer'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly speed?: number
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

let dom: FakeDom
let frames: RenderFrame[] = []

function mount(options: Pick<EdgeOptions<Link>, 'flow'> = {}, data: readonly Link[] = links) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          edges<Link>(data, { source: 'from', target: 'to', ...options }),
          nodes<Item>(items, { x: 'x', y: 'y' }),
        ],
        states: { path: { flow: true }, still: { flow: false } },
      }),
      ariaLabel: 'graphe',
    },
    () => ({
      ...fakeRenderer(),
      render: (frame) => {
        frames.push(frame)
        return -1
      },
    }),
  )
  dom.flushFrames()
  return graph as GraphInstance<'path' | 'still'>
}

function step(): void {
  const before = frames.length
  dom.flushFrames()
  expect(frames.length).toBeGreaterThan(before)
}

function settle(): void {
  for (let round = 0; round < 3; round++) dom.flushFrames()
}

beforeEach(() => {
  dom = installDom()
  frames = []
})

afterEach(() => {
  dom.restore()
})

describe('flows', () => {
  it('requests no frame while no edge flows', () => {
    const graph = mount()
    expect(dom.pendingFrames()).toBe(0)
    graph.states.set('still', { edges: ['ab'] })
    settle()
    expect(dom.pendingFrames()).toBe(0)
    graph.destroy()
  })

  it('draws frames while a flowing edge is on screen, with a growing time', () => {
    const graph = mount({ flow: (link) => link.speed ?? true })
    expect(dom.pendingFrames()).toBe(1)
    const before = frames.length
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 500)
    step()
    vi.restoreAllMocks()
    expect(frames.length - before).toBeGreaterThan(1)
    const times = frames.map((frame) => frame.time ?? 0)
    expect(times[times.length - 1]).toBeGreaterThan(0)
    graph.destroy()
  })

  it('follows the flow of states, which wins over the data', () => {
    const graph = mount()
    graph.states.set('path', { edges: ['ab'] })
    dom.flushFrames()
    expect(dom.pendingFrames()).toBe(1)
    graph.states.clear('path')
    settle()
    expect(dom.pendingFrames()).toBe(0)
    graph.destroy()
    frames = []
    const flowing = mount({ flow: true })
    flowing.states.set('still', { edges: ['ab', 'bc'] })
    settle()
    expect(dom.pendingFrames()).toBe(0)
    flowing.states.remove('still', { edges: ['bc'] })
    dom.flushFrames()
    expect(dom.pendingFrames()).toBe(1)
    flowing.destroy()
  })

  it('stops when the flowing edges leave the screen, and starts again on return', () => {
    const graph = mount({ flow: true })
    graph.view.set({ x: 100_000, y: 0, zoom: 1 })
    settle()
    expect(dom.pendingFrames()).toBe(0)
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    dom.flushFrames()
    expect(dom.pendingFrames()).toBe(1)
    graph.destroy()
  })

  it('stops in a hidden page and starts again when it shows', () => {
    let state: DocumentVisibilityState = 'hidden'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state)
    const graph = mount({ flow: true })
    settle()
    expect(dom.pendingFrames()).toBe(0)
    state = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    dom.flushFrames()
    expect(dom.pendingFrames()).toBe(1)
    graph.destroy()
    vi.restoreAllMocks()
  })

  it('stands still with reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const graph = mount({ flow: true })
    settle()
    expect(dom.pendingFrames()).toBe(0)
    expect(frames.every((frame) => frame.time === 0)).toBe(true)
    graph.destroy()
  })

  it('stops after the flowing edges are removed', () => {
    const graph = mount({ flow: (link) => link.speed ?? 0 }, [
      ...links,
      { id: 'ca', from: 'c', to: 'a', speed: 30 },
    ])
    expect(dom.pendingFrames()).toBe(1)
    graph.update({
      definition: defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to', flow: (link) => link.speed ?? 0 }),
          nodes<Item>(items, { x: 'x', y: 'y' }),
        ],
      }),
    })
    settle()
    expect(dom.pendingFrames()).toBe(0)
    graph.destroy()
  })
})
