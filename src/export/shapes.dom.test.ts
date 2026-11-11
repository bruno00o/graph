import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShapeStore } from '../core/shape-store'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import type { Renderer, RenderInput } from '../host/renderer'
import { nodes } from '../marks'
import { shapes } from '../shapes'
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
  { id: 'b', x: 200, y: 0 },
]

const zones = [
  { id: 'disc', geometry: { center: { x: 0, y: 100 }, radius: 40 } },
  {
    id: 'line',
    geometry: {
      points: [
        { x: -50, y: -50 },
        { x: 250, y: -50 },
      ],
    },
  },
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
const exported: ShapeStore[] = []

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

function mount(withShapes: boolean): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  let made = 0
  const marks = withShapes
    ? [shapes(zones), nodes(items, { x: 'x', y: 'y' })]
    : [nodes(items, { x: 'x', y: 'y' })]
  const created = createGraphHost(
    container,
    { definition: defineGraph({ marks, layout: null }), ariaLabel: 'graph' },
    (): Renderer => {
      made++
      if (made === 1) return fakeRenderer()
      return {
        ...fakeRenderer(),
        sync: (input: RenderInput) => {
          exported.push(input.scene.shapes)
        },
      }
    },
  )
  dom.flushFrames()
  graph = created
  return created
}

describe('exports with shapes', () => {
  it('hands the shapes and the engine that draws them to the PNG renderer', async () => {
    await exportPng(mount(true), { pixelRatio: 1 })
    const store = exported[0]
    expect(store?.any).toBe(true)
    expect(store?.count).toBe(2)
    expect(typeof store?.engine?.layer).toBe('function')
  })

  it('gives the PNG renderer no shape engine without a shape mark', async () => {
    await exportPng(mount(false), { pixelRatio: 1 })
    expect(exported[0]?.any).toBe(false)
    expect(exported[0]?.engine).toBeNull()
  })

  it('writes the shapes into the SVG, under the nodes', async () => {
    const svg = await exportSvg(mount(true))
    const disc = svg.indexOf('fill-rule="evenodd"')
    const line = svg.indexOf('fill="none"')
    expect(disc).toBeGreaterThan(0)
    expect(line).toBeGreaterThan(disc)
    expect(svg.indexOf('<circle')).toBeGreaterThan(line)
  })

  it('writes the states of the shapes into the SVG, the raised ones last, the hidden ones never', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const created = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [shapes(zones, { layer: 'ground' })],
          states: { gone: { hide: true }, lit: { shapes: { strokeWidth: 7 } } },
        }),
        ariaLabel: 'graph',
      },
      () => fakeRenderer(),
    )
    graph = created
    dom.flushFrames()
    created.selection.set({ shapes: ['disc'] })
    created.states.set('lit', { shapes: ['line'] })
    const lit = await exportSvg(created)
    const line = lit.indexOf('stroke-width="7"')
    expect(line).toBeGreaterThan(0)
    expect(lit.indexOf('fill-rule="evenodd"')).toBeGreaterThan(line)
    expect(lit).toContain('stroke-width="2"')
    created.states.set('gone', { shapes: ['disc'] })
    const hidden = await exportSvg(created)
    expect(hidden).not.toContain('fill-rule="evenodd"')
    expect(hidden).toContain('stroke-width="7"')
    created.layers.hide(['ground'])
    const empty = await exportSvg(created)
    expect(empty).not.toContain('stroke-width="7"')
  })

  it('writes no shape without a shape mark', async () => {
    const svg = await exportSvg(mount(false))
    expect(svg).not.toContain('fill-rule="evenodd"')
  })
})
