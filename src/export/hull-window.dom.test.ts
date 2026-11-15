import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { hull } from '../hulls'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { exportSvg } from '.'

vi.mock('@mapbox/tiny-sdf', () => ({
  default: class {
    draw() {
      return {
        data: new Uint8ClampedArray(30 * 34),
        width: 30,
        height: 34,
        glyphWidth: 24,
        glyphHeight: 28,
        glyphTop: 20,
        glyphLeft: 0,
        glyphAdvance: 12,
      }
    }
  },
}))

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly at: number
  readonly from?: number
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0, at: 10 },
  { id: 'b', x: 400, y: 0, at: 1000 },
]

let dom: FakeDom
let graph: GraphInstance | null = null

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  graph?.destroy()
  graph = null
  vi.restoreAllMocks()
  dom.restore()
})

function mount(shown: readonly Item[] = items): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          nodes<Item>([...shown], {
            x: 'x',
            y: 'y',
            time: 'at',
            minZoom: (item) => item.from ?? null,
          }),
        ],
        hulls: [hull({ nodes: ['a', 'b'], padding: 8 })],
        layout: null,
      }),
      ariaLabel: 'graph',
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph
}

function hullXs(svg: string): number[] {
  const path = /<path d="(M[^"]*Z)"/.exec(svg)?.[1] ?? ''
  return [...path.matchAll(/[ML](-?[\d.]+) /g)].map((match) => Number(match[1]))
}

describe('export of hulls with a sight of its own', () => {
  it('wraps the nodes the export shows', async () => {
    const shown = mount()
    shown.time.set({ start: 0, end: 100 })
    dom.flushFrames()
    const svg = await exportSvg(shown, {
      region: 'graph',
      zoom: 1,
      padding: 0,
      labels: 'none',
      window: null,
    })
    const circles = [...svg.matchAll(/<circle cx="(-?[\d.]+)"/g)].map((match) => Number(match[1]))
    expect(new Set(circles).size).toBe(2)
    const xs = hullXs(svg)
    expect(xs.length).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(Math.max(...circles))
  })

  it('keeps the hulls of the screen with its window', async () => {
    const shown = mount()
    shown.time.set({ start: 0, end: 100 })
    dom.flushFrames()
    const svg = await exportSvg(shown, { region: 'graph', zoom: 1, padding: 0, labels: 'none' })
    const circles = [...svg.matchAll(/<circle cx="(-?[\d.]+)"/g)].map((match) => Number(match[1]))
    expect(new Set(circles).size).toBe(1)
    const xs = hullXs(svg)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(60)
  })

  it('wraps the nodes its zoom shows', async () => {
    const shown = mount([
      { id: 'a', x: 0, y: 0, at: 10 },
      { id: 'b', x: 400, y: 0, at: 10, from: 2 },
    ])
    shown.view.set({ x: 200, y: 0, zoom: 1 })
    dom.flushFrames()
    const svg = await exportSvg(shown, { region: 'graph', zoom: 4, padding: 0, labels: 'none' })
    const circles = [...svg.matchAll(/<circle cx="(-?[\d.]+)"/g)].map((match) => Number(match[1]))
    expect(new Set(circles).size).toBe(2)
    const xs = hullXs(svg)
    expect(Math.max(...xs)).toBeGreaterThan(Math.max(...circles))
  })
})
