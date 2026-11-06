import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition } from '../types'
import { type GraphProbe, type InspectedGraph, watchGraphs } from './inspect'
import { createGraphHost, type GraphInstance, type RendererFactory } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 100, y: 0 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'ax', from: 'a', to: 'x' },
]

function definition(data: readonly Item[] = items): GraphDefinition {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(data, { x: 'x', y: 'y' }),
    ],
  })
}

let dom: FakeDom
const mounted: GraphInstance[] = []

function mount(createRenderer: RendererFactory = fakeRenderer): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(), ariaLabel: 'graphe' },
    createRenderer,
  )
  mounted.push(graph)
  dom.flushFrames()
  return graph
}

function inspected(graph: GraphInstance): InspectedGraph {
  let found: InspectedGraph | undefined
  const stop = watchGraphs({
    added: (entry) => {
      if (entry.graph === graph) found = entry
    },
    removed: () => {},
  })
  stop()
  if (!found) throw new Error('graph not registered')
  return found
}

function recorder() {
  const frames: number[][] = []
  const flushes: Parameters<GraphProbe['flushed']>[] = []
  const probe: GraphProbe = {
    framed: (...values) => frames.push(values),
    flushed: (...values) => flushes.push(values),
  }
  return { probe, frames, flushes }
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  for (const graph of mounted.splice(0)) graph.destroy()
  vi.restoreAllMocks()
  dom.restore()
})

describe('graph inspection', () => {
  it('lists mounted graphs to watchers and forgets destroyed ones', () => {
    const first = mount()
    const added: GraphInstance[] = []
    const removed: GraphInstance[] = []
    const stop = watchGraphs({
      added: (entry) => added.push(entry.graph),
      removed: (entry) => removed.push(entry.graph),
    })
    const second = mount()
    expect(added).toEqual([first, second])
    first.destroy()
    expect(removed).toEqual([first])
    stop()
    second.destroy()
    expect(removed).toEqual([first])
  })

  it('reads no clock in a frame while no probe is attached', () => {
    const graph = mount()
    const now = vi.spyOn(performance, 'now')
    graph.view.set({ x: 10, y: 0, zoom: 1 })
    dom.flushFrames()
    expect(now).toHaveBeenCalledTimes(1)
  })

  it('times each frame once a probe is attached, and stops when it is removed', () => {
    const graph = mount()
    const entry = inspected(graph)
    const { probe, frames } = recorder()
    entry.probe(probe)
    graph.view.set({ x: 10, y: 0, zoom: 1 })
    dom.flushFrames()
    expect(frames).toHaveLength(1)
    const [start, total, sync, render] = frames[0] ?? []
    expect(start).toBeGreaterThan(0)
    for (const value of [total, sync, render]) expect(value).toBeGreaterThanOrEqual(0)
    entry.probe(null)
    graph.view.set({ x: 20, y: 0, zoom: 1 })
    dom.flushFrames()
    expect(frames).toHaveLength(1)
  })

  it('reports flush and scene timings with the issues of each flush', () => {
    const graph = mount()
    const { probe, flushes } = recorder()
    inspected(graph).probe(probe)
    graph.update({ definition: definition([...items, { id: 'a', x: 5, y: 5 }]) })
    dom.flushFrames()
    expect(flushes).toHaveLength(1)
    const [flush, apply, issues] = flushes[0] ?? []
    expect(flush).toBeGreaterThanOrEqual(0)
    expect(apply).toBeGreaterThanOrEqual(0)
    expect(issues).toEqual([{ type: 'duplicate-key', kind: 'nodes', key: 'a' }])
  })

  it('counts nodes, edges and pending edges, and reads the renderer statistics', () => {
    const stats = { nodeLabels: 3, edgeLabels: 1, labelTime: 0.5, textureBytes: 4096 }
    const plain = inspected(mount())
    expect(plain.inspect()).toEqual({
      nodes: 2,
      edges: 1,
      pendingEdges: 1,
      layout: null,
      renderer: null,
    })
    const measured = inspected(mount(() => ({ ...fakeRenderer(), stats: () => stats })))
    expect(measured.inspect().renderer).toEqual(stats)
  })
})
