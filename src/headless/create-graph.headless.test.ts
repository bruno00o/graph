import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { grid } from '../layouts'
import { force } from '../layouts/force'
import { edges, nodes } from '../marks'
import { createGraph } from './index'

interface Item {
  readonly id: string
  readonly label: string
  readonly kind: string
}

interface Link {
  readonly id: string
  readonly source: string
  readonly target: string
}

function sample(count: number): { items: Item[]; links: Link[] } {
  const items = Array.from({ length: count }, (_, at) => ({
    id: `n${at}`,
    label: `Node ${at}`,
    kind: at % 3 === 0 ? 'a' : 'b',
  }))
  const links = items.slice(1).map((item, at) => ({
    id: `e${at}`,
    source: `n${Math.floor(at / 2)}`,
    target: item.id,
  }))
  return { items, links }
}

function definitionOf(count: number, layout = force()) {
  const { items, links } = sample(count)
  return defineGraph({
    marks: [
      nodes(items, { label: (item) => item.label, color: (item) => item.kind }),
      edges(links, { source: (link) => link.source, target: (link) => link.target }),
    ],
    layout,
  })
}

describe('createGraph', () => {
  it('lays out, settles and answers without a page', async () => {
    const graph = createGraph({ definition: definitionOf(60) })
    await graph.settled()
    expect(graph.count()).toMatchObject({ nodes: 60, edges: 59 })
    expect(graph.store.state.layout.running).toBe(false)
    expect(graph.store.state.surface).toBe('none')
    const point = graph.positions.get('n5')
    expect(point && Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
    const placed = graph.positions.snapshot()
    expect(placed.size).toBe(60)
    expect(new Set([...placed.values()].map(({ x, y }) => `${x},${y}`)).size).toBe(60)
    graph.destroy()
  })

  it('works on the size it is given', async () => {
    const graph = createGraph({
      definition: definitionOf(20, grid()),
      size: { width: 400, height: 300 },
    })
    await graph.settled()
    expect(graph.store.state).toMatchObject({ width: 400, height: 300 })
    const center = graph.positions.get('n0')
    if (!center) throw new Error('n0 has no position')
    const screen = graph.view.toScreen(center)
    expect(graph.pick(screen)).toMatchObject({ kind: 'node', key: 'n0' })
    graph.update({ size: { width: 800, height: 600 } })
    expect(graph.store.state).toMatchObject({ width: 800, height: 600 })
    expect(() => graph.update({ size: { width: 0, height: 600 } })).toThrow(RangeError)
    expect(() =>
      createGraph({ definition: definitionOf(2), size: { width: 10, height: Number.NaN } }),
    ).toThrow(RangeError)
    graph.destroy()
  })

  it('fits the view to the graph on its size', async () => {
    const graph = createGraph({
      definition: definitionOf(40, grid()),
      size: { width: 500, height: 500 },
    })
    await graph.settled()
    const { view } = graph.store.state
    for (const point of graph.positions.snapshot().values()) {
      const at = graph.view.toScreen(point)
      expect(at.x).toBeGreaterThanOrEqual(0)
      expect(at.x).toBeLessThanOrEqual(500)
      expect(at.y).toBeGreaterThanOrEqual(0)
      expect(at.y).toBeLessThanOrEqual(500)
    }
    graph.view.set({ x: view.x + 10, y: view.y, zoom: view.zoom }, { duration: 300 })
    expect(graph.store.state.view.x).toBe(view.x + 10)
    graph.destroy()
  })

  it('selects, sets states and reads paths', async () => {
    const graph = createGraph({ definition: definitionOf(10) })
    graph.selection.set({ nodes: ['n1'] })
    expect(graph.selection.get().nodes).toEqual(['n1'])
    expect(graph.neighbors('n1').sort()).toEqual(['n0', 'n3', 'n4'])
    expect(graph.paths.shortest('n3', 'n4')?.nodes).toEqual(['n3', 'n1', 'n4'])
    await graph.settled()
    graph.destroy()
  })

  it('rejects settled once destroyed, also while it waits', async () => {
    const graph = createGraph({ definition: definitionOf(400) })
    const waiting = graph.settled()
    graph.destroy()
    await expect(waiting).rejects.toThrow('graph: the graph was destroyed')
    await expect(graph.settled()).rejects.toThrow('graph: the graph was destroyed')
    expect(graph.destroyed).toBe(true)
    expect(graph.count().nodes).toBe(0)
    expect(graph.pick({ x: 0, y: 0 })).toBeNull()
  })

  it('comes back destroyed for a signal already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('stop'))
    const graph = createGraph({ definition: definitionOf(4), signal: controller.signal })
    expect(graph.destroyed).toBe(true)
    await expect(graph.settled()).rejects.toThrow('stop')
  })
})
