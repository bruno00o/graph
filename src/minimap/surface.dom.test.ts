import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { defineGraph } from '../define-graph'
import type { GraphSurface } from '../host/graph-instance'
import { internalsOf } from '../host/internals'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mapSurface } from '../map/index'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import { MinimapPainter } from './painter'
import type { DrawRequest } from './protocol'

interface Place {
  readonly id: string
  readonly x: number
  readonly y: number
}

const paris = geoToWorld({ longitude: 2.35, latitude: 48.86 })
const berlin = geoToWorld({ longitude: 13.4, latitude: 52.52 })

const places: Place[] = [
  { id: 'a', x: paris.x, y: paris.y },
  { id: 'b', x: berlin.x, y: berlin.y },
]

const made = vi.hoisted(() => ({ workers: 0 }))

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

const { mountMinimap } = await import('./index')

let dom: FakeDom
let container: HTMLElement

function mount(surface: GraphSurface | null = null): GraphInstance {
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({ marks: [nodes<Place>(places, { x: 'x', y: 'y' })] }),
      ariaLabel: 'graph',
      initialView: { x: paris.x, y: paris.y, zoom: 1 },
      surface,
    },
    () => fakeRenderer(),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
}

function drawn(spy: { mock: { calls: unknown[][] } }): DrawRequest[] {
  return spy.mock.calls.map(([request]) => request as DrawRequest)
}

function tick(): void {
  dom.flushFrames()
  vi.runOnlyPendingTimers()
  dom.flushFrames()
  vi.runOnlyPendingTimers()
}

beforeEach(() => {
  dom = installDom(400, 200)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  made.workers = 0
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  dom.restore()
  document.body.innerHTML = ''
})

describe('a minimap when the graph moves to a map and back', () => {
  it('empties on the map, and draws the positions of the canvas again on return', () => {
    const draw = vi.spyOn(MinimapPainter.prototype, 'draw')
    const { map, render } = fakeMap()
    const graph = mount()
    const minimap = mountMinimap(graph)
    tick()
    expect(draw).toHaveBeenCalled()
    const frame = minimap.element.querySelector('[data-view]') as HTMLElement
    const framed = frame.style.transform
    const surface = mapSurface(map)
    graph.update({ surface })
    render()
    tick()
    expect(minimap.element.isConnected).toBe(false)
    expect(minimap.element.childElementCount).toBe(0)
    expect(minimap.element.style.cssText).toBe('')
    draw.mockClear()
    graph.positions.set([['a', { x: 0, y: 0 }]])
    render()
    tick()
    expect(draw).not.toHaveBeenCalled()
    minimap.update({ width: 120 })
    expect(minimap.element.isConnected).toBe(false)
    graph.update({ surface: null })
    tick()
    expect(minimap.element.parentElement).toBe(graph.element)
    expect(minimap.element.style.width).toBe('120px')
    expect(minimap.element.querySelector('[data-view]')).toBe(frame)
    const requests = drawn(draw)
    expect(requests.length).toBeGreaterThan(0)
    const last = requests.findLast((request) => request.xy !== undefined)
    expect(last?.xy).toBe(internalsOf(graph, 'test').positions.xy)
    expect(last?.xy?.[0]).toBeCloseTo(paris.x - internalsOf(graph, 'test').positions.originX)
    expect(frame.style.visibility).toBe('visible')
    expect(frame.style.transform).not.toBe('')
    expect(framed).not.toBe('')
    graph.destroy()
    expect(minimap.element.isConnected).toBe(false)
  })

  it('created on a map, starts its worker on the first visit of the canvas', () => {
    class FakeWorker {
      onmessage: unknown = null
      onerror: unknown = null
      constructor() {
        made.workers++
      }
      postMessage(): void {}
      terminate(): void {}
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('ImageBitmapRenderingContext', class {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { map, render } = fakeMap()
    const graph = mount(mapSurface(map))
    render()
    const minimap = mountMinimap(graph, { corner: 'topLeft' })
    tick()
    expect(made.workers).toBe(0)
    expect(minimap.element.childElementCount).toBe(0)
    expect(warn.mock.calls.filter(([text]) => /minimap/.test(String(text)))).toHaveLength(1)
    graph.update({ surface: null })
    tick()
    expect(made.workers).toBe(1)
    expect(minimap.element.parentElement).toBe(graph.element)
    expect(minimap.element.style.top).toBe('12px')
    expect(minimap.element.querySelector('canvas')).not.toBeNull()
    graph.update({ surface: mapSurface(map) })
    graph.update({ surface: null })
    expect(made.workers).toBe(1)
    minimap.destroy()
    graph.destroy()
  })

  it('wakes when the surface is released or the map removed, and goes with the graph', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first = fakeMap()
    const graph = mount()
    const minimap = mountMinimap(graph)
    tick()
    const surface = mapSurface(first.map)
    graph.update({ surface })
    first.render()
    expect(minimap.element.isConnected).toBe(false)
    surface.release()
    tick()
    expect(minimap.element.parentElement).toBe(graph.element)
    const second = fakeMap()
    graph.update({ surface: mapSurface(second.map) })
    second.render()
    expect(minimap.element.isConnected).toBe(false)
    second.map.remove()
    tick()
    expect(graph.store.state.surface).toBe('canvas')
    expect(minimap.element.parentElement).toBe(graph.element)
    graph.update({ surface: mapSurface(first.map) })
    first.render()
    graph.destroy()
    expect(minimap.element.isConnected).toBe(false)
    expect(() => minimap.update({ width: 10 })).not.toThrow()
    expect(warn.mock.calls.filter(([text]) => /minimap/.test(String(text)))).toEqual([])
  })
})
