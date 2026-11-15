import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { arcPolyline } from '../core/geo-arc'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { edges, nodes } from '../marks'
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
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 1000, y: 0 },
]
const links: Link[] = [
  { id: 'ab1', from: 'a', to: 'b' },
  { id: 'ab2', from: 'a', to: 'b' },
  { id: 'ab3', from: 'a', to: 'b' },
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

function mount(
  shown: readonly Item[] = items,
  linked: readonly Link[] = links,
  geodesic = false,
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          edges<Link>([...linked], { source: 'from', target: 'to', geodesic }),
          nodes<Item>([...shown], { x: 'x', y: 'y' }),
        ],
        layout: null,
      }),
      ariaLabel: 'graph',
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph
}

function curveYs(svg: string): number[] {
  const ys: number[] = []
  for (const match of svg.matchAll(/d="M[^"]*C([^"]*)"/g)) {
    const numbers = (match[1] ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    for (let at = 1; at < numbers.length; at += 2) ys.push(numbers[at] ?? 0)
  }
  return ys
}

function heightOf(svg: string): number {
  return Number(/height="([\d.]+)"/.exec(svg)?.[1])
}

describe('export of the graph region with curved edges', () => {
  it('frames the curves of parallel edges', async () => {
    const shown = mount()
    const svg = await exportSvg(shown, { region: 'graph', zoom: 1, padding: 0, labels: 'none' })
    const height = heightOf(svg)
    const ys = curveYs(svg)
    expect(ys.length).toBeGreaterThan(0)
    const top = Math.min(...ys)
    const bottom = Math.max(...ys)
    const peak = (bottom - top) * 0.75
    expect(height).toBeGreaterThanOrEqual(peak)
  })

  it('frames the great circle arcs of geodesic edges', async () => {
    const ends: Item[] = [
      { id: 'a', x: 100, y: 120 },
      { id: 'b', x: 400, y: 120 },
    ]
    const shown = mount(ends, [{ id: 'ab', from: 'a', to: 'b' }], true)
    const svg = await exportSvg(shown, { region: 'graph', zoom: 1, padding: 0, labels: 'none' })
    const arc = new Float64Array(34)
    const count = arcPolyline(100, 120, 400, 120, 0, true, arc)
    let top = 120
    for (let k = 0; k < count; k++) top = Math.min(top, arc[k * 2 + 1] ?? 0)
    expect(120 - top).toBeGreaterThan(20)
    expect(heightOf(svg)).toBeGreaterThanOrEqual(120 - top)
  })

  it('keeps the frame of straight edges to their nodes', async () => {
    const shown = mount(items, [{ id: 'ab', from: 'a', to: 'b' }])
    const svg = await exportSvg(shown, { region: 'graph', zoom: 1, padding: 0, labels: 'none' })
    expect(heightOf(svg)).toBeLessThan(20)
  })
})
