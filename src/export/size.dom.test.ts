import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import type { Renderer, RenderFrame, RenderInput } from '../host/renderer'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { exportPng, exportSvg } from '.'

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

const items = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 400, y: 100 },
]

function fakeGl(canvas: HTMLCanvasElement): object {
  return {
    MAX_VIEWPORT_DIMS: 1,
    MAX_RENDERBUFFER_SIZE: 2,
    getParameter: (name: number) => (name === 1 ? new Int32Array([8192, 8192]) : 8192),
    get drawingBufferWidth() {
      return canvas.width
    },
    get drawingBufferHeight() {
      return canvas.height
    },
    readPixels: () => {},
    isContextLost: () => false,
  }
}

let dom: FakeDom
let graph: GraphInstance | null = null
const frames: RenderFrame[] = []
const inputs: RenderInput[] = []

beforeEach(() => {
  dom = installDom(800, 600)
  frames.length = 0
  inputs.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    return (kind === 'webgl2' ? fakeGl(this) : null) as RenderingContext | null
  } as HTMLCanvasElement['getContext'])
})

afterEach(() => {
  graph?.destroy()
  graph = null
  vi.restoreAllMocks()
  dom.restore()
})

function mount(background = false, data = items): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  let made = 0
  const created = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes(data, { x: 'x', y: 'y', size: 10, units: 'screen' })],
        layout: null,
        ...(background ? { background: { grid: 'lines' as const } } : {}),
      }),
      ariaLabel: 'graph',
    },
    (): Renderer => {
      made++
      if (made === 1) return fakeRenderer()
      return {
        ...fakeRenderer(),
        sync: (input) => {
          inputs.push(input)
          return fakeRenderer().sync(input)
        },
        render: (frame) => {
          frames.push(frame)
          return -1
        },
      }
    },
  )
  dom.flushFrames()
  graph = created
  return created
}

function attributes(svg: string): { width: number; height: number; viewBox: string } {
  const width = Number(/<svg[^>]* width="([\d.]+)"/.exec(svg)?.[1])
  const height = Number(/<svg[^>]* height="([\d.]+)"/.exec(svg)?.[1])
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? ''
  return { width, height, viewBox }
}

describe('export size', () => {
  it('exports a suspended graph without resuming it', async () => {
    const shown = mount()
    shown.suspend()
    await exportPng(shown, { size: { width: 400, height: 300 }, pixelRatio: 1, labels: 'none' })
    expect(frames).toHaveLength(1)
    expect(frames[0]?.width).toBe(400)
    expect(shown.store.state.suspended).toBe(true)
    expect(attributes(await exportSvg(shown)).width).toBe(800)
  })

  it('draws a PNG of the exact size with the region fitted inside', async () => {
    const shown = mount()
    await exportPng(shown, { region: 'graph', size: { width: 500, height: 500 }, labels: 'none' })
    const frame = frames[0]
    expect(frame?.width).toBeCloseTo(500 / (frame?.pixelRatio ?? 1), 6)
    expect(frame?.height).toBeCloseTo(500 / (frame?.pixelRatio ?? 1), 6)
    const ratio = frame?.pixelRatio ?? 1
    const zoom = frame?.view.zoom ?? 0
    expect(zoom).toBeCloseTo((500 / ratio - 10 - 64) / 400, 3)
    expect(frame?.view.x).toBeCloseTo(200, 3)
    expect(frame?.view.y).toBeCloseTo(50, 3)
  })

  it('keeps the aspect and the padding of the region', async () => {
    const shown = mount()
    await exportPng(shown, {
      region: 'graph',
      size: { width: 1000, height: 1000 },
      pixelRatio: 1,
      padding: 10,
      labels: 'none',
    })
    const frame = frames[0]
    expect(frame?.width).toBe(1000)
    expect(frame?.height).toBe(1000)
    expect(frame?.view.zoom).toBeCloseTo((1000 - 10 - 20) / 400, 3)
  })

  it('derives the other side from the region when only one is given', async () => {
    const shown = mount()
    await exportPng(shown, {
      region: 'graph',
      size: { width: 474 },
      pixelRatio: 1,
      labels: 'none',
    })
    const frame = frames[0]
    expect(frame?.width).toBe(474)
    expect(frame?.view.zoom).toBeCloseTo(1, 3)
    expect(frame?.height).toBe(Math.ceil(100 * (frame?.view.zoom ?? 0) + 74))
  })

  it('takes pixelRatio as image pixels per CSS pixel', async () => {
    const shown = mount()
    await exportPng(shown, {
      region: 'graph',
      size: { width: 800, height: 400 },
      pixelRatio: 2,
      labels: 'none',
    })
    const frame = frames[0]
    expect(frame?.pixelRatio).toBe(2)
    expect(frame?.width).toBe(400)
    expect(frame?.height).toBe(200)
    expect(frame?.view.zoom).toBeCloseTo((400 - 10 - 64) / 400, 3)
  })

  it('fits the view region whole inside the size', async () => {
    const shown = mount()
    const start = shown.view.get().zoom
    await exportPng(shown, { region: 'view', size: { width: 400, height: 600 }, pixelRatio: 1 })
    const frame = frames[0]
    expect(frame?.width).toBe(400)
    expect(frame?.height).toBe(600)
    expect(frame?.view.zoom).toBeCloseTo(start * 0.5, 6)
  })

  it('writes an SVG with the exact width and height', async () => {
    const shown = mount()
    const svg = await exportSvg(shown, {
      region: 'graph',
      size: { width: 300, height: 200 },
      labels: 'none',
    })
    expect(attributes(svg)).toEqual({ width: 300, height: 200, viewBox: '0 0 300 200' })
  })

  it('rejects a size that is not made of finite pixels', async () => {
    const shown = mount()
    for (const size of [{}, { width: 0 }, { height: -4 }, { width: Number.NaN }]) {
      await expect(exportSvg(shown, { size })).rejects.toThrow(RangeError)
      await expect(exportPng(shown, { size, pixelRatio: 1 })).rejects.toThrow(RangeError)
    }
    await expect(exportSvg(shown, { size: { width: 100 }, zoom: 1 })).rejects.toThrow(
      'graph: the export takes a size or a zoom, not both',
    )
    expect(frames).toHaveLength(0)
  })

  it('fits a graph of one node and an empty one', async () => {
    const lone = mount(false, [{ id: 'a', x: 5, y: 7 }])
    await exportPng(lone, { region: 'graph', size: { width: 200, height: 100 }, pixelRatio: 1 })
    expect(frames[0]?.width).toBe(200)
    expect(frames[0]?.height).toBe(100)
    expect(Number.isFinite(frames[0]?.view.zoom)).toBe(true)
    lone.destroy()
    const none = mount(false, [])
    await exportPng(none, { region: 'graph', size: { width: 200, height: 100 }, pixelRatio: 1 })
    expect(frames[1]?.width).toBe(200)
    expect(frames[1]?.height).toBe(100)
  })

  it('changes nothing without a size', async () => {
    const shown = mount()
    await exportPng(shown, { region: 'graph', pixelRatio: 1, labels: 'none' })
    expect(frames[0]?.width).toBeCloseTo(400 * (frames[0]?.view.zoom ?? 0) + 74, 6)
  })
})

describe('export grid and badges', () => {
  it('leaves the grid out of a PNG on request', async () => {
    const shown = mount(true)
    await exportPng(shown, { pixelRatio: 1 })
    expect(inputs.at(-1)?.grid).not.toBeNull()
    inputs.length = 0
    await exportPng(shown, { pixelRatio: 1, grid: false })
    expect(inputs.every((input) => input.grid === null)).toBe(true)
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('leaves the grid out of an SVG on request', async () => {
    const shown = mount(true)
    expect(await exportSvg(shown)).toContain('<pattern')
    expect(await exportSvg(shown, { grid: false })).not.toContain('<pattern')
  })

  it('passes the badge choice to the renderer', async () => {
    const shown = mount()
    await exportPng(shown, { pixelRatio: 1 })
    expect(frames.at(-1)?.badges).toBe(true)
    await exportPng(shown, { pixelRatio: 1, badges: false })
    expect(frames.at(-1)?.badges).toBe(false)
  })
})
