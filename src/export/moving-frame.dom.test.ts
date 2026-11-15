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

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

let dom: FakeDom
let graph: GraphInstance | null = null
const frames: RenderFrame[] = []
const inputs: RenderInput[] = []
let loaded: (() => void) | null = null

beforeEach(() => {
  dom = installDom()
  frames.length = 0
  inputs.length = 0
  loaded = null
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

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  let made = 0
  graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          nodes<Item>(
            [
              { id: 'a', x: 0, y: 0 },
              { id: 'b', x: 400, y: 0 },
            ],
            { image: () => 'icon.svg' },
          ),
        ],
        layout: null,
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
        },
        ready: () =>
          new Promise<void>((resolve) => {
            loaded = resolve
          }),
        render: (frame) => {
          frames.push(frame)
          return -1
        },
      }
    },
  )
  dom.flushFrames()
  return graph
}

describe('export of the graph region while nodes move', () => {
  it('keeps every node it draws inside the image', async () => {
    const shown = mount()
    shown.positions.set([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 400, y: 0 }],
    ])
    dom.flushFrames()
    const done = exportPng(shown, { region: 'graph', zoom: 1, pixelRatio: 1, labels: 'none' })
    await vi.waitFor(() => expect(loaded).not.toBeNull())
    shown.positions.set([['b', { x: 2000, y: 0 }]])
    dom.flushFrames()
    loaded?.()
    await done
    const frame = frames[0]
    const input = inputs[inputs.length - 1]
    expect(frame && input).toBeTruthy()
    if (!frame || !input) return
    const right = frame.view.x + frame.width / 2 / frame.view.zoom
    expect(input.positions.x(1)).toBeLessThanOrEqual(right)
    expect(input.positions.x(1)).toBe(400)
    expect(shown.positions.get('b')?.x).toBe(2000)
  })

  it('frames the nodes where they stand when nothing moves', async () => {
    const shown = mount()
    shown.positions.set([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 400, y: 0 }],
    ])
    dom.flushFrames()
    const done = exportPng(shown, { region: 'graph', zoom: 1, pixelRatio: 1, labels: 'none' })
    await vi.waitFor(() => expect(loaded).not.toBeNull())
    loaded?.()
    await done
    const frame = frames[0]
    const input = inputs[inputs.length - 1]
    if (!frame || !input) throw new Error('nothing drawn')
    const right = frame.view.x + frame.width / 2 / frame.view.zoom
    expect(input.positions.x(1)).toBe(400)
    expect(right).toBeGreaterThan(400)
  })

  it('writes the SVG from the positions it framed', async () => {
    const shown = mount()
    shown.positions.set([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 400, y: 0 }],
    ])
    dom.flushFrames()
    const decoding: { done: (() => void) | null } = { done: null }
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          decoding.done = resolve
        }),
    )
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(10)
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(10)
    const done = exportSvg(shown, { region: 'graph', zoom: 1, labels: 'none', embedImages: false })
    await vi.waitFor(() => expect(decoding.done).not.toBeNull())
    shown.positions.set([['b', { x: 2000, y: 0 }]])
    dom.flushFrames()
    decoding.done?.()
    const svg = await done
    const width = Number(/width="([\d.]+)"/.exec(svg)?.[1])
    const body = svg.slice(svg.indexOf('</defs>'))
    const xs = [...body.matchAll(/<circle cx="(-?[\d.]+)"/g)].map((match) => Number(match[1]))
    expect(new Set(xs).size).toBe(2)
    expect(width).toBeLessThan(600)
    for (const x of xs) expect(x).toBeLessThanOrEqual(width)
  })
})
