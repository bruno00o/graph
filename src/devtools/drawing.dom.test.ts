import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type { PixelRatioOption } from '../types'
import { GraphDevtoolsCore } from './core'
import { graphReports } from './inspector'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

let dom: FakeDom
let core: GraphDevtoolsCore | null = null

const data = [
  { id: 'a', x: 250, y: 250 },
  { id: 'b', x: 260, y: 250 },
]

function definitionOf(pixelRatio?: PixelRatioOption) {
  return defineGraph({ marks: [nodes(data, { x: 'x', y: 'y' })], pixelRatio })
}

function mount(
  software: boolean | null,
  pixelRatio?: PixelRatioOption,
  drawingBuffer = 8192,
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definitionOf(pixelRatio), ariaLabel: 'graph' },
    () => ({
      ...fakeRenderer(),
      ...(software === null
        ? {}
        : { limits: () => ({ drawingBuffer, pathPoints: 8192 * 1024, software }) }),
    }),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
}

function open(messages?: object): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  core = new GraphDevtoolsCore()
  core.mount(element, messages ? { messages } : {})
  return element
}

function value(element: HTMLElement, term: string): string | null | undefined {
  const row = [...element.querySelectorAll('.gd-row')].find(
    (candidate) => candidate.querySelector('dt')?.textContent === term,
  )
  return row?.querySelector('dd')?.textContent
}

beforeEach(() => {
  dom = installDom()
  vi.stubGlobal('devicePixelRatio', 2)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  core?.unmount()
  core = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  dom.restore()
  document.body.innerHTML = ''
})

describe('the devtools and the pixel ratio', () => {
  it('shows where WebGL draws, the pixel ratio drawn and why', () => {
    const graph = mount(true)
    const element = open()
    expect(value(element, 'Drawing')).toBe('Software')
    expect(value(element, 'Pixel ratio')).toBe('1 (software)')
    expect(graphReports()[0]).toMatchObject({
      drawing: 'software',
      pixelRatio: 1,
      pixelRatioReason: 'software',
    })
    graph.update({ definition: definitionOf('device') })
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Pixel ratio')).toBe('2 (screen)')
    graph.update({ definition: definitionOf(1.5) })
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Pixel ratio')).toBe('1.5 (definition)')
    graph.destroy()
  })

  it('reports a GPU, an unknown renderer, and a ratio lowered for the drawing buffer', () => {
    const gpu = mount(false)
    open()
    expect(graphReports()[0]).toMatchObject({
      drawing: 'gpu',
      pixelRatio: 2,
      pixelRatioReason: 'device',
    })
    gpu.destroy()
    const unknown = mount(null)
    expect(graphReports()[0]).toMatchObject({ drawing: 'unknown', pixelRatioReason: 'device' })
    unknown.destroy()
    const capped = mount(false, 'device', 1000)
    expect(graphReports()[0]).toMatchObject({ pixelRatio: 1.25, pixelRatioReason: 'limit' })
    capped.destroy()
  })

  it('reports the ratio of the map on a map', () => {
    const graph = mountMapGraph(fakeMap().map, {
      definition: definitionOf(1),
      ariaLabel: 'graph',
    })
    dom.flushFrames()
    open()
    expect(graphReports()[0]).toMatchObject({ pixelRatioReason: 'map' })
    graph.destroy()
  })

  it('takes the texts from the messages', () => {
    const graph = mount(true)
    const element = open({
      drawing: 'Rendu',
      drawingName: (drawing: string) => `[${drawing}]`,
      pixelRatio: 'Densité',
      pixelRatioName: (ratio: number, reason: string) => `${ratio}/${reason}`,
    })
    expect(value(element, 'Rendu')).toBe('[software]')
    expect(value(element, 'Densité')).toBe('1/software')
    graph.destroy()
  })
})
