import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPointBudget } from '../core/edge-paths'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { Renderer, RendererLimits, RenderFrame, RenderInput } from './renderer'

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
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]

interface Made {
  readonly syncs: RenderInput[]
  readonly frames: RenderFrame[]
  palettes: number
  themes: number
  destroyed: boolean
}

let dom: FakeDom
let made: Made[] = []

function mount(limits?: RendererLimits, failing: () => boolean = () => false) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to' }),
          nodes<Item>(items, { x: 'x', y: 'y' }),
        ],
      }),
      ariaLabel: 'graphe',
    },
    (): Renderer => {
      if (failing()) throw new Error('graph: shader compilation failed')
      const record: Made = { syncs: [], frames: [], palettes: 0, themes: 0, destroyed: false }
      made.push(record)
      return {
        ...fakeRenderer(),
        sync: (input) => {
          record.syncs.push(input)
        },
        setPalette: () => {
          record.palettes++
        },
        setTheme: () => {
          record.themes++
        },
        render: (frame) => {
          record.frames.push(frame)
          return -1
        },
        destroy: () => {
          record.destroyed = true
        },
        ...(limits ? { limits: () => limits } : {}),
      }
    },
  )
  dom.flushFrames()
  return graph as GraphInstance
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function lose(canvas: HTMLCanvasElement): Event {
  const event = new Event('webglcontextlost', { cancelable: true })
  canvas.dispatchEvent(event)
  return event
}

beforeEach(() => {
  dom = installDom(800, 600)
  made = []
  vi.stubGlobal('devicePixelRatio', 2)
})

afterEach(() => {
  dom.restore()
})

describe('context loss', () => {
  it('stops drawing while the context is lost and rebuilds everything once restored', () => {
    const graph = mount()
    const first = made[0] as Made
    expect(first.frames.length).toBeGreaterThan(0)
    const canvas = canvasOf(graph)
    const event = lose(canvas)
    expect(event.defaultPrevented).toBe(true)
    expect(first.destroyed).toBe(true)
    const drawn = first.frames.length
    graph.view.set({ x: 10, y: 0, zoom: 2 })
    dom.flushFrames()
    expect(first.frames.length).toBe(drawn)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    dom.flushFrames()
    const second = made[1] as Made
    expect(second).toBeDefined()
    expect(second.syncs[0]?.full).toBe(true)
    expect(second.syncs[0]?.scene.nodes.capacity).toBeGreaterThanOrEqual(2)
    expect(second.palettes).toBeGreaterThan(0)
    expect(second.themes).toBeGreaterThan(0)
    expect(second.frames.at(-1)?.view).toEqual({ x: 10, y: 0, zoom: 2 })
    graph.destroy()
    expect(second.destroyed).toBe(true)
  })

  it('waits for the next restore when the renderer cannot be rebuilt', () => {
    let failing = false
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount(undefined, () => failing)
    const canvas = canvasOf(graph)
    lose(canvas)
    failing = true
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    dom.flushFrames()
    expect(made.length).toBe(1)
    failing = false
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    dom.flushFrames()
    expect(made.length).toBe(2)
    expect(made[1]?.frames.length).toBeGreaterThan(0)
    warn.mockRestore()
    graph.destroy()
  })

  it('ignores a restore after destroy', () => {
    const graph = mount()
    const canvas = canvasOf(graph)
    lose(canvas)
    graph.destroy()
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made.length).toBe(1)
  })
})

describe('renderer limits', () => {
  it('keeps the drawing buffer within the largest size the renderer accepts', () => {
    const graph = mount({ drawingBuffer: 1000, pathPoints: 2048 * 1024, software: false })
    const canvas = canvasOf(graph)
    expect(canvas.width).toBe(1000)
    expect(canvas.height).toBe(750)
    const frame = made[0]?.frames.at(-1)
    expect(frame?.pixelRatio).toBeCloseTo(1.25)
    expect(frame?.width).toBe(800)
    graph.destroy()
  })

  it('uses the device pixel ratio when the buffer fits', () => {
    const graph = mount({ drawingBuffer: 4096, pathPoints: 4096 * 1024, software: false })
    const canvas = canvasOf(graph)
    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(1200)
    expect(made[0]?.frames.at(-1)?.pixelRatio).toBe(2)
    graph.destroy()
  })

  it('draws at one pixel per CSS pixel with a software renderer', () => {
    const graph = mount({ drawingBuffer: 8192, pathPoints: 8192 * 1024, software: true })
    const canvas = canvasOf(graph)
    expect(canvas.width).toBe(800)
    expect(made[0]?.frames.at(-1)?.pixelRatio).toBe(1)
    graph.destroy()
  })

  it('bounds the points of edge paths by the texture size', () => {
    const graph = mount({ drawingBuffer: 4096, pathPoints: 2048 * 1024, software: false })
    const paths = made[0]?.syncs.at(-1)?.bundles
    expect(paths?.pointBudget).toBe(2048 * 1024)
    graph.destroy()
    made = []
    const roomy = mount({ drawingBuffer: 16384, pathPoints: 16384 * 1024, software: false })
    expect(made[0]?.syncs.at(-1)?.bundles?.pointBudget).toBe(defaultPointBudget)
    roomy.destroy()
  })
})

describe('resizing', () => {
  it('draws the resized canvas in the same task, so the cleared buffer is never shown', () => {
    const graph = mount()
    const record = made[0] as Made
    const canvas = canvasOf(graph)
    for (let step = 0; step < 20; step++) {
      const before = record.frames.length
      dom.resize(400 + step * 10, 300)
      expect(record.frames.length).toBe(before + 1)
      expect(record.frames.at(-1)?.width).toBe(400 + step * 10)
      expect(canvas.width).toBe((400 + step * 10) * 2)
    }
    const before = record.frames.length
    dom.resize(590, 300)
    expect(record.frames.length).toBe(before)
    graph.destroy()
  })

  it('redraws sharp when the device pixel ratio changes without a resize', () => {
    const queries: { query: string; listener: (() => void) | null }[] = []
    vi.stubGlobal('matchMedia', (query: string) => {
      const entry: { query: string; listener: (() => void) | null } = { query, listener: null }
      queries.push(entry)
      return {
        matches: false,
        addEventListener: (_: string, listener: () => void) => {
          entry.listener = listener
        },
        removeEventListener: () => {
          entry.listener = null
        },
      }
    })
    const graph = mount()
    const canvas = canvasOf(graph)
    expect(canvas.width).toBe(1600)
    const watching = queries.find((entry) => entry.query === '(resolution: 2dppx)')
    vi.stubGlobal('devicePixelRatio', 3)
    watching?.listener?.()
    expect(canvas.width).toBe(2400)
    expect(made[0]?.frames.at(-1)?.pixelRatio).toBe(3)
    expect(queries.at(-1)?.query).toBe('(resolution: 3dppx)')
    expect(watching?.listener).toBeNull()
    graph.destroy()
    expect(queries.at(-1)?.listener).toBeNull()
  })

  it('follows the device pixel ratio on the next resize', () => {
    const graph = mount()
    const canvas = canvasOf(graph)
    for (const ratio of [1, 3, 1.5]) {
      vi.stubGlobal('devicePixelRatio', ratio)
      dom.resize(500, 200)
      dom.resize(501, 200)
      expect(canvas.width).toBe(Math.round(501 * ratio))
      expect(canvas.height).toBe(Math.round(200 * ratio))
      expect(made[0]?.frames.at(-1)?.pixelRatio).toBe(ratio)
    }
    graph.destroy()
  })
})
