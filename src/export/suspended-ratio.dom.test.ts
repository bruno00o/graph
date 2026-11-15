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
  vi.stubGlobal('devicePixelRatio', 2)
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
  vi.unstubAllGlobals()
  dom.restore()
})

function mount(suspended: boolean): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes([{ id: 'a', x: 0, y: 0 }], { x: 'x', y: 'y' })],
        layout: null,
      }),
      ariaLabel: 'graph',
      suspended,
    },
    (): Renderer => ({
      ...fakeRenderer(),
      limits: () => ({ drawingBuffer: 8192, pathPoints: 8192 * 1024, software: true }),
      render: (frame) => {
        exported.push(frame)
        return -1
      },
    }),
  )
  dom.flushFrames()
  return graph
}

describe('default pixel ratio of a PNG export in software', () => {
  it('draws one pixel per CSS pixel for a graph mounted suspended', async () => {
    const shown = mount(true)
    exported.length = 0
    await exportPng(shown, { region: 'view' })
    expect(exported.length).toBeGreaterThan(0)
    expect(exported[0]?.pixelRatio).toBe(1)
  })

  it('draws one pixel per CSS pixel for a graph drawn on screen', async () => {
    const shown = mount(false)
    exported.length = 0
    await exportPng(shown, { region: 'view' })
    expect(exported[0]?.pixelRatio).toBe(1)
  })

  it('keeps one pixel per CSS pixel once a drawn graph is suspended', async () => {
    const shown = mount(false)
    shown.suspend()
    dom.flushFrames()
    exported.length = 0
    await exportPng(shown, { region: 'view' })
    expect(exported[0]?.pixelRatio).toBe(1)
  })

  it('keeps the ratio a call asks for', async () => {
    const shown = mount(true)
    exported.length = 0
    await exportPng(shown, { region: 'view', pixelRatio: 3 })
    expect(exported[0]?.pixelRatio).toBe(3)
  })
})
