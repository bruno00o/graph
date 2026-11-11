import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mountMapGraph } from '../map/index'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'

interface Place {
  readonly id: string
  readonly longitude: number
  readonly latitude: number
}

const places: Place[] = [
  { id: 'a', longitude: 2.35, latitude: 48.86 },
  { id: 'b', longitude: 13.4, latitude: 52.52 },
]

const made = vi.hoisted(() => ({ workers: 0 }))

class FakeWorker {
  onmessage: unknown = null
  onerror: unknown = null

  constructor() {
    made.workers++
  }

  postMessage(): void {}

  terminate(): void {}
}

vi.mock('./worker?worker&inline', () => ({ default: FakeWorker }))

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

const { createMinimap } = await import('./index')

let dom: FakeDom

function definition() {
  return defineGraph({
    marks: [nodes<Place>(places, { longitude: 'longitude', latitude: 'latitude' })],
    layout: null,
  })
}

describe('createMinimap on a map', () => {
  beforeEach(() => {
    dom = installDom(400, 200)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    made.workers = 0
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('ImageBitmapRenderingContext', class {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    dom.restore()
  })

  it('warns once, starts no worker and draws nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { map } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'map' })
    const first = createMinimap(graph)
    const second = createMinimap(graph, { corner: null })
    vi.runOnlyPendingTimers()
    dom.flushFrames()
    expect(made.workers).toBe(0)
    expect(warn.mock.calls.filter(([message]) => /minimap/.test(String(message)))).toEqual([
      ['graph: the minimap does not work on a map'],
    ])
    for (const minimap of [first, second]) {
      expect(minimap.element.isConnected).toBe(false)
      expect(minimap.element.childElementCount).toBe(0)
    }
    expect(graph.element.querySelector('[data-graph-minimap]')).toBeNull()
    first.update({ width: 300, corner: 'topLeft' })
    expect(first.element.isConnected).toBe(false)
    expect(first.element.style.cssText).toBe('')
    first.destroy()
    first.destroy()
    graph.destroy()
    expect(() => second.update({ width: 10 })).not.toThrow()
  })

  it('leaves the element of a minimap placed by the application empty until destroyed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { map } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'map' })
    const minimap = createMinimap(graph, { corner: null })
    document.body.append(minimap.element)
    dom.flushFrames()
    expect(minimap.element.childElementCount).toBe(0)
    graph.destroy()
    expect(minimap.element.isConnected).toBe(false)
  })

  it('still draws off a map', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(container, { definition: definition(), ariaLabel: 'graph' }, () =>
      fakeRenderer(),
    ) as unknown as GraphInstance
    dom.flushFrames()
    const warn = vi.spyOn(console, 'warn')
    const minimap = createMinimap(graph)
    expect(made.workers).toBe(1)
    expect(minimap.element.parentElement).toBe(graph.element)
    expect(warn).not.toHaveBeenCalled()
    graph.destroy()
  })
})
