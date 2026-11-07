import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import type { Renderer, RenderFrame } from '../host/renderer'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { exportPng } from '.'

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
}

const items: Item[] = [{ id: 'a', x: 0, y: 0, at: 10 }]
const others: Item[] = [{ id: 'b', x: 400, y: 0, at: 1000 }]

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
const exported: RenderFrame[] = []

beforeEach(() => {
  dom = installDom()
  exported.length = 0
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
  const created = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          nodes(items, {
            name: 'front',
            layer: 'front',
            x: 'x',
            y: 'y',
            label: 'id',
            time: 'at',
          }),
          nodes(others, {
            name: 'back',
            layer: 'back',
            x: 'x',
            y: 'y',
            label: 'id',
            time: 'at',
          }),
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
        render: (frame) => {
          exported.push(frame)
          return -1
        },
      }
    },
  )
  dom.flushFrames()
  graph = created
  return created
}

describe('exportPng of the graph region with labels', () => {
  it('draws with the hidden layers of the graph', async () => {
    const shown = mount()
    shown.layers.hide(['back'])
    dom.flushFrames()
    await exportPng(shown, { region: 'graph', pixelRatio: 1 })
    expect(exported.length).toBeGreaterThan(0)
    expect(exported[0]?.layers).not.toBeNull()
    expect(exported[0]?.labels?.width).toBeLessThan(200)
  })

  it('draws with the time window of the graph', async () => {
    const shown = mount()
    shown.time.set({ start: 0, end: 100 })
    dom.flushFrames()
    await exportPng(shown, { region: 'graph', pixelRatio: 1 })
    expect(exported[0]?.window).not.toBeNull()
    expect(exported[0]?.labels?.width).toBeLessThan(200)
  })
})
