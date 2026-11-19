import { describe, expect, it } from 'vitest'
import { densityBundling } from '../bundling'
import { defineGraph } from '../define-graph'
import { exportDrawio } from '../export'
import { internalsOf } from '../host/internals'
import { hull } from '../hulls'
import { grid, layers } from '../layouts'
import { force } from '../layouts/force'
import { createLegend } from '../legend'
import { edges, nodes } from '../marks'
import { orthogonalRouting } from '../routing'
import { shapes } from '../shapes'
import { createTimeline } from '../timeline'
import { createGraph } from './index'

declare const process: { getActiveResourcesInfo(): string[] }

interface Item {
  readonly id: string
  readonly kind: string
  readonly time: number
}

interface Link {
  readonly id: string
  readonly source: string
  readonly target: string
}

const day = 86_400_000

function sample(count: number): { items: Item[]; links: Link[] } {
  const items = Array.from({ length: count }, (_, at) => ({
    id: `n${at}`,
    kind: ['a', 'b', 'c'][at % 3] ?? 'a',
    time: at * day,
  }))
  const links: Link[] = []
  for (let at = 1; at < count; at++) {
    links.push({ id: `t${at}`, source: `n${Math.floor((at - 1) / 3)}`, target: `n${at}` })
    if (at % 4 === 0) links.push({ id: `x${at}`, source: `n${at}`, target: `n${(at * 7) % count}` })
  }
  return { items, links }
}

function marksOf(count: number) {
  const { items, links } = sample(count)
  return [
    nodes(items, {
      label: (item) => item.id,
      color: (item) => item.kind,
      time: (item) => item.time,
    }),
    edges(links, { source: (link) => link.source, target: (link) => link.target }),
  ] as const
}

function timers(): number {
  return process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length
}

describe('settled', () => {
  it('waits for the edge bundling after the layout', async () => {
    const graph = createGraph({
      definition: defineGraph({
        marks: marksOf(300),
        layout: force(),
        bundling: densityBundling(),
      }),
    })
    await graph.settled()
    expect(graph.store.state.layout.running).toBe(false)
    expect(graph.store.state.bundling.running).toBe(false)
    const drawio = await exportDrawio(graph)
    expect(drawio.match(/<mxPoint /g)?.length ?? 0).toBeGreaterThan(300)
    graph.destroy()
  })

  it('waits for the edge routing and its bridges', async () => {
    const graph = createGraph({
      definition: defineGraph({
        marks: marksOf(120),
        layout: layers(),
        routing: orthogonalRouting(),
        bridges: true,
      }),
    })
    await graph.settled()
    expect(graph.store.state.routing.running).toBe(false)
    const drawio = await exportDrawio(graph)
    expect(drawio.match(/<mxPoint /g)?.length ?? 0).toBeGreaterThan(50)
    graph.destroy()
  })

  it('waits for the fills of large shapes and for hulls', async () => {
    const ring = (cx: number, count: number) =>
      Array.from({ length: count }, (_, at) => {
        const angle = (at / count) * Math.PI * 2
        const radius = 100 + (at % 2) * 8
        return { x: cx + Math.cos(angle) * radius, y: Math.sin(angle) * radius }
      })
    const zones = [0, 1, 2].map((at) => ({
      id: `z${at}`,
      geometry: { rings: [ring(at * 400, 40_000)] },
    }))
    const graph = createGraph({
      definition: defineGraph({
        marks: [shapes(zones), ...marksOf(30)],
        layout: grid(),
        hulls: [hull({ nodes: ['n1', 'n2', 'n3'] })],
      }),
    })
    const internals = internalsOf(graph, 'test')
    await graph.settled()
    expect(internals.scene.shapes.filling).toBe(false)
    expect(graph.count()).toMatchObject({ shapes: 3, nodes: 30 })
    graph.destroy()
  })

  it('leaves no timer behind after 20 graphs', async () => {
    const before = timers()
    for (let round = 0; round < 20; round++) {
      const graph = createGraph({
        definition: defineGraph({
          marks: marksOf(80),
          layout: force(),
          bundling: densityBundling(),
        }),
      })
      if (round % 2 === 0) await graph.settled()
      graph.destroy()
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(timers()).toBeLessThanOrEqual(before)
  })
})

describe('companions without a page', () => {
  it('reads a legend and plays a timeline', async () => {
    const graph = createGraph({ definition: defineGraph({ marks: marksOf(30), layout: grid() }) })
    await graph.settled()
    const legend = createLegend(graph)
    const color = legend.store.state.color
    expect(color?.type === 'categories' && color.items.map((item) => item.value)).toEqual([
      'a',
      'b',
      'c',
    ])
    const timeline = createTimeline(graph)
    expect(timeline.store.state.extent).toMatchObject({ start: 0 })
    timeline.set({ start: 0, end: 5 * day })
    timeline.play()
    await new Promise((resolve) => setTimeout(resolve, 60))
    timeline.pause()
    expect(graph.time.get()?.start).toBeGreaterThan(0)
    timeline.destroy()
    legend.destroy()
    graph.destroy()
  })

  it('exports a diagram whose label bounds follow the text measure', async () => {
    const definition = defineGraph({ marks: marksOf(12), layout: grid() })
    const drawioOf = async (measureText?: (text: string) => number) => {
      const graph = createGraph({ definition, ...(measureText ? { measureText } : {}) })
      await graph.settled()
      const drawio = await exportDrawio(graph, { region: 'graph' })
      graph.destroy()
      return drawio
    }
    const narrow = await drawioOf((text) => text.length * 0.1)
    const wide = await drawioOf((text) => text.length * 4)
    const widthOf = (xml: string) => Number(/pageWidth="([\d.]+)"/.exec(xml)?.[1])
    expect(widthOf(wide)).toBeGreaterThan(widthOf(narrow))
    expect(await drawioOf()).toContain('Arial')
  })
})
