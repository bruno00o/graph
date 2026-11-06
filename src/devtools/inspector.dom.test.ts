import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition, Layout, LayoutListener } from '../types'
import { graphReports, inspectGraphs } from './inspector'

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
  { id: 'c', x: 0, y: 100 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'cx', from: 'c', to: 'x' },
]

function definition(data: readonly Item[] = items, layout: Layout | null = null): GraphDefinition {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(data, { x: 'x', y: 'y' }),
    ],
    states: { muted: { opacity: 0.2 } },
    layout,
  })
}

const stats = { nodeLabels: 2, edgeLabels: 0, labelTime: 0.25, textureBytes: 65_536 }
let dom: FakeDom
const mounted: GraphInstance[] = []
const stops: (() => void)[] = []

function mount(label = 'graphe', graphDefinition = definition()): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: graphDefinition, ariaLabel: label },
    () => ({ ...fakeRenderer(), stats: () => stats }),
  )
  mounted.push(graph)
  dom.flushFrames()
  return graph
}

function watch(listener: () => void = () => {}): () => void {
  const stop = inspectGraphs(listener)
  stops.push(stop)
  return stop
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  for (const graph of mounted.splice(0)) graph.destroy()
  dom.restore()
})

describe('inspectGraphs', () => {
  it('reports every mounted graph, the ones mounted later included', () => {
    const first = mount('premier')
    watch()
    mount('second')
    const reports = graphReports()
    expect(reports.map((report) => report.label)).toEqual(['premier', 'second'])
    expect(new Set(reports.map((report) => report.id)).size).toBe(2)
    first.destroy()
    expect(graphReports().map((report) => report.label)).toEqual(['second'])
  })

  it('reads elements, view and interaction from the graph', () => {
    const graph = mount()
    watch()
    graph.selection.set({ nodes: ['a', 'b'] })
    graph.states.set('muted', { nodes: ['c'], edges: ['ab'] })
    graph.view.set({ x: 12, y: -4, zoom: 2 })
    dom.flushFrames()
    const [report] = graphReports()
    expect(report).toMatchObject({
      nodes: 3,
      edges: 1,
      pendingEdges: 1,
      width: 800,
      height: 600,
      view: { x: 12, y: -4, zoom: 2 },
      selection: { nodes: ['a', 'b'], edges: [] },
      hovered: null,
      focused: null,
      states: [{ name: 'muted', nodes: 1, edges: 1 }],
    })
  })

  it('keeps the issues of each flush', () => {
    const graph = mount()
    watch()
    graph.update({ definition: definition([...items, { id: 'a', x: 1, y: 1 }]) })
    dom.flushFrames()
    const [report] = graphReports()
    expect(report?.issueCount).toBe(1)
    expect(report?.issues).toEqual([{ type: 'duplicate-key', kind: 'nodes', key: 'a' }])
  })

  it('times frames and reads the renderer', () => {
    const graph = mount()
    const listener = vi.fn()
    watch(listener)
    expect(graphReports()[0]?.performance.frames).toEqual([])
    graph.update({ definition: definition(items.slice(0, 2)) })
    dom.flushFrames()
    expect(listener).toHaveBeenCalled()
    const performance = graphReports()[0]?.performance
    expect(performance?.frames).toHaveLength(1)
    expect(performance?.frameRate).toBe(1)
    for (const value of [performance?.flush, performance?.apply, performance?.sync]) {
      expect(value).toBeGreaterThanOrEqual(0)
    }
    expect(performance).toMatchObject({
      labelTime: 0.25,
      nodeLabels: 2,
      edgeLabels: 0,
      textureBytes: 65_536,
    })
  })

  it('records layout runs with their duration', async () => {
    const listeners: LayoutListener[] = []
    const layout: Layout = {
      name: 'fake',
      options: {},
      start(_graph, next) {
        listeners.push(next)
        return { pin: () => {}, stop: () => {} }
      },
    }
    const graph = mount('graphe', defineGraph({ marks: [nodes([{ id: 'a' }, { id: 'b' }])] }))
    watch()
    const run = graph.layout.run(layout, { duration: 0 })
    expect(graphReports()[0]?.layout).toMatchObject({ name: 'fake', running: true })
    listeners[0]?.end(new Float32Array(16))
    await run
    expect(graphReports()[0]?.layout).toMatchObject({
      running: false,
      runs: [{ name: 'fake', completed: true }],
    })
    expect(graphReports()[0]?.layout.runs[0]?.duration).toBeGreaterThanOrEqual(0)
  })

  it('stops measuring with the last listener and keeps the history for the next one', () => {
    const graph = mount()
    const stop = watch()
    graph.view.set({ x: 5, y: 0, zoom: 1 })
    dom.flushFrames()
    const id = graphReports()[0]?.id
    stop()
    expect(graphReports()).toEqual([])
    graph.view.set({ x: 6, y: 0, zoom: 1 })
    dom.flushFrames()
    watch()
    const [report] = graphReports()
    expect(report?.id).toBe(id)
    expect(report?.performance.frames).toHaveLength(1)
  })
})
