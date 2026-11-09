import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { fakeRenderer, installDom } from '../testing/dom'
import type { View } from '../types'
import { progress } from './frame-cost'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly x?: number
  readonly y?: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]
const origin: View = { x: 0, y: 0, zoom: 1 }
const target: View = { x: 400, y: -200, zoom: 2 }

let clock = 0
let frames: FrameRequestCallback[] = []
let gpuBusy = false
let restore: () => void = () => {}

function definition() {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { x: 'x', y: 'y' }),
    ],
    layout: null,
  })
}

function busyRenderer() {
  return { ...fakeRenderer(), busy: () => gpuBusy }
}

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(), ariaLabel: 'graph', initialView: origin },
    busyRenderer,
  )
  graph.positions.set(
    [
      ['a', { x: -50, y: 0 }],
      ['b', { x: 50, y: 0 }],
      ['c', { x: 0, y: 50 }],
    ],
    { duration: 0 },
  )
  return graph
}

function frame(): void {
  for (const callback of frames.splice(0)) callback(clock)
}

function drawSlowly(ms: number): void {
  gpuBusy = true
  frame()
  vi.advanceTimersByTime(0)
  clock += ms
  gpuBusy = false
  vi.advanceTimersByTime(16)
}

function views(graph: GraphInstance): View[] {
  const seen: View[] = []
  graph.on('viewchange', ({ view }) => {
    seen.push(view)
  })
  return seen
}

beforeEach(() => {
  restore = installDom().restore
  clock = 1000
  frames = []
  gpuBusy = false
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  restore()
})

describe('progress', () => {
  it('ends an animation at the frame after which the next one would come too late', () => {
    expect(progress(100, 100, 500, 0)).toBe(0)
    expect(progress(350, 100, 500, 100)).toBe(0.5)
    expect(progress(500, 100, 500, 100)).toBe(1)
    expect(progress(100, 100, 500, 800)).toBe(1)
  })
})

describe('slow frames', () => {
  it('jumps a view animation to its end when frames take longer than it', () => {
    const graph = mount()
    drawSlowly(900)
    graph.view.set({ x: 10, y: 0, zoom: 1 })
    drawSlowly(900)
    const seen = views(graph)
    graph.view.set(target, { duration: 500 })
    frame()
    expect(seen).toEqual([target])
    expect(frames).toHaveLength(0)
  })

  it('draws the steps of a view animation when frames are quick', () => {
    const graph = mount()
    drawSlowly(5)
    graph.view.set({ x: 10, y: 0, zoom: 1 })
    drawSlowly(5)
    const seen = views(graph)
    graph.view.set(target, { duration: 500 })
    for (let step = 0; step < 40 && frames.length > 0; step++) {
      frame()
      clock += 16
    }
    expect(seen.length).toBeGreaterThan(20)
    expect(seen.at(-1)).toEqual(target)
  })

  it('ignores one slow frame among quick ones', () => {
    const graph = mount()
    drawSlowly(900)
    graph.view.set({ x: 10, y: 0, zoom: 1 })
    drawSlowly(5)
    const seen = views(graph)
    graph.view.set(target, { duration: 500 })
    frame()
    expect(seen).toHaveLength(1)
    expect(seen[0]).not.toEqual(target)
  })

  it('measures frames that follow each other faster than the GPU answers', () => {
    const graph = mount()
    drawSlowly(900)
    graph.view.set({ x: 10, y: 0, zoom: 1 })
    drawSlowly(900)
    gpuBusy = true
    for (let step = 0; step < 3; step++) {
      graph.view.set({ x: 20 + step, y: 0, zoom: 1 })
      frame()
      vi.advanceTimersByTime(0)
      clock += 16
    }
    const seen = views(graph)
    graph.view.set(target, { duration: 500 })
    for (let step = 0; step < 40 && frames.length > 0; step++) {
      frame()
      clock += 16
    }
    expect(seen.length).toBeGreaterThan(20)
    expect(seen.at(-1)).toEqual(target)
  })

  it('moves nodes to their end at once when frames take longer than the move', () => {
    const graph = mount()
    drawSlowly(900)
    graph.view.set({ x: 10, y: 0, zoom: 1 })
    drawSlowly(900)
    graph.positions.set([['a', { x: 300, y: 300 }]], { duration: 400 })
    frame()
    expect(graph.positions.get('a')).toEqual({ x: 300, y: 300 })
  })
})
