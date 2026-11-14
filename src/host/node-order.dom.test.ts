import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { exportSvg } from '../export/index'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createGraphHost } from './mount-graph'

interface Place {
  readonly id: string
  readonly size: number
  readonly rank?: number
}

const places: Place[] = [
  { id: 'big', size: 60, rank: 0 },
  { id: 'mid', size: 40, rank: 1 },
  { id: 'small', size: 20, rank: 2 },
]

function define(rank: (place: Place) => number | undefined) {
  return defineGraph({
    marks: [nodes(places, { x: () => 0, y: () => 0, size: 'size', label: 'id', order: rank })],
    states: { lifted: { raise: true } },
  })
}

let dom: FakeDom

function mount(rank: (place: Place) => number | undefined) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, { definition: define(rank), ariaLabel: 'graph' }, () =>
    fakeRenderer(),
  )
  graph.view.set({ x: 0, y: 0, zoom: 1 })
  dom.flushFrames()
  return graph
}

const center = (graph: ReturnType<typeof mount>) => graph.view.toScreen({ x: 0, y: 0 })

describe('node order', () => {
  beforeEach(() => {
    dom = installDom()
  })

  afterEach(() => {
    dom.restore()
  })

  it('picks the node drawn on top', () => {
    const graph = mount((place) => place.rank)
    expect(graph.pick(center(graph))?.key).toBe('small')
    graph.update({ definition: define((place) => -(place.rank ?? 0)) })
    dom.flushFrames()
    expect(graph.pick(center(graph))?.key).toBe('big')
    graph.destroy()
  })

  it('keeps the index order without a value', () => {
    const graph = mount(() => undefined)
    expect(graph.pick(center(graph))?.key).toBe('small')
    graph.update({ definition: define((place) => (place.id === 'big' ? 1 : undefined)) })
    dom.flushFrames()
    expect(graph.pick(center(graph))?.key).toBe('big')
    graph.destroy()
  })

  it('orders raised nodes by their rank', () => {
    const graph = mount((place) => -(place.rank ?? 0))
    expect(graph.pick(center(graph))?.key).toBe('big')
    graph.states.set('lifted', { nodes: ['small', 'mid'] })
    dom.flushFrames()
    expect(graph.pick(center(graph))?.key).toBe('mid')
    graph.destroy()
  })

  it('writes the SVG in the drawing order', async () => {
    const radii = async (graph: ReturnType<typeof mount>) => {
      const svg = await exportSvg(graph, { labels: 'none' })
      const found = [...svg.matchAll(/<circle[^>]* r="([\d.]+)"/g)].map((match) => Number(match[1]))
      return found.filter((_, at) => at % 2 === 0)
    }
    const graph = mount((place) => -(place.rank ?? 0))
    const smallFirst = await radii(graph)
    expect(smallFirst).toEqual([...smallFirst].sort((a, b) => a - b))
    graph.update({ definition: define((place) => place.rank) })
    dom.flushFrames()
    const bigFirst = await radii(graph)
    expect(bigFirst).toEqual([...smallFirst].reverse())
    graph.destroy()
  })
})
