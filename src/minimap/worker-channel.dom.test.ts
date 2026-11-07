import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { DrawnMessage, DrawRequest } from './protocol'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

const workers: FakeWorker[] = []

class FakeWorker {
  onmessage: ((event: MessageEvent<DrawnMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly requests: DrawRequest[] = []
  terminated = false

  constructor() {
    workers.push(this)
  }

  postMessage(request: DrawRequest): void {
    this.requests.push(request)
  }

  answer(): ImageBitmap {
    const { width, height } = this.requests.at(-1)?.paint ?? { width: 1, height: 1 }
    const frame = { width: Math.round(width), height: Math.round(height) } as ImageBitmap
    const fit = { minX: 0, minY: 0, scale: 1, offsetX: 0, offsetY: 0 }
    this.onmessage?.(new MessageEvent('message', { data: { type: 'drawn', fit, frame } }))
    return frame
  }

  fail(): void {
    this.onerror?.(new ErrorEvent('error', { cancelable: true }))
  }

  terminate(): void {
    this.terminated = true
  }
}

vi.mock('./worker?worker&inline', () => ({ default: FakeWorker }))

const { createMinimap } = await import('./index')

let dom: FakeDom
let shown: ImageBitmap[]
let transferred: number

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          nodes<Item>(
            [
              { id: 'a', x: -200, y: -100 },
              { id: 'b', x: 200, y: 100 },
            ],
            { x: 'x', y: 'y' },
          ),
        ],
      }),
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance
}

describe('the minimap worker', () => {
  beforeEach(() => {
    dom = installDom(400, 200)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    workers.length = 0
    shown = []
    transferred = 0
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('ImageBitmapRenderingContext', class {})
    const original = HTMLCanvasElement.prototype.getContext
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      kind: string,
    ) {
      if (kind === 'bitmaprenderer') {
        return { transferFromImageBitmap: (frame: ImageBitmap) => shown.push(frame) }
      }
      return original.call(this, kind as '2d')
    } as typeof HTMLCanvasElement.prototype.getContext)
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {
      configurable: true,
      value: () => {
        transferred++
        return {}
      },
    })
  })

  afterEach(() => {
    delete (HTMLCanvasElement.prototype as { transferControlToOffscreen?: unknown })
      .transferControlToOffscreen
    vi.restoreAllMocks()
    vi.useRealTimers()
    dom.restore()
  })

  it('shows each frame the worker draws without handing it the canvas', () => {
    const graph = mount()
    const minimap = createMinimap(graph, { width: 100, height: 60 })
    vi.runOnlyPendingTimers()
    const [worker] = workers
    expect(worker?.requests).toHaveLength(1)
    const frame = worker?.answer()
    const canvas = minimap.element.querySelector('canvas') as HTMLCanvasElement
    expect(shown).toEqual([frame])
    expect(canvas.width).toBe(frame?.width)
    expect(canvas.height).toBe(frame?.height)
    expect(transferred).toBe(0)
    graph.positions.set([['a', { x: -400, y: -100 }]])
    dom.flushFrames()
    vi.runOnlyPendingTimers()
    expect(worker?.requests).toHaveLength(2)
    worker?.answer()
    expect(shown).toHaveLength(2)
  })

  it('draws on the page with a new canvas when the worker fails', () => {
    const graph = mount()
    const minimap = createMinimap(graph)
    vi.runOnlyPendingTimers()
    const before = minimap.element.querySelector('canvas')
    workers[0]?.fail()
    expect(workers[0]?.terminated).toBe(true)
    const after = minimap.element.querySelector('canvas')
    expect(after).not.toBe(before)
    vi.runOnlyPendingTimers()
    expect(workers[0]?.requests).toHaveLength(1)
  })
})
