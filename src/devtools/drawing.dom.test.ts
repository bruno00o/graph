import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
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

function definitionOf(economy?: boolean) {
  return defineGraph({ marks: [nodes(data, { x: 'x', y: 'y' })], economy })
}

function mount(software: boolean | null, economy?: boolean): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definitionOf(economy), ariaLabel: 'graph' },
    () => ({
      ...fakeRenderer(),
      ...(software === null
        ? {}
        : { limits: () => ({ drawingBuffer: 8192, pathPoints: 8192 * 1024, software }) }),
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
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  core?.unmount()
  core = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  dom.restore()
  document.body.innerHTML = ''
})

describe('the devtools and software rendering', () => {
  it('shows where WebGL draws and whether the economy is on', () => {
    const graph = mount(true)
    const element = open()
    expect(value(element, 'Drawing')).toBe('Software')
    expect(value(element, 'Economy')).toBe('On')
    expect(graphReports()[0]).toMatchObject({ drawing: 'software', economy: true })
    graph.update({ definition: definitionOf(false) })
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Economy')).toBe('Off')
    graph.destroy()
  })

  it('reports a GPU, and an unknown renderer', () => {
    const gpu = mount(false)
    open()
    expect(graphReports()[0]).toMatchObject({ drawing: 'gpu', economy: false })
    gpu.destroy()
    const unknown = mount(null, true)
    expect(graphReports()[0]).toMatchObject({ drawing: 'unknown', economy: true })
    unknown.destroy()
  })

  it('reports the economy off on a map, where the map sets the pixel ratio', () => {
    const graph = mountMapGraph(fakeMap().map, {
      definition: definitionOf(true),
      ariaLabel: 'graph',
    })
    dom.flushFrames()
    open()
    expect(graphReports()[0]).toMatchObject({ economy: false })
    graph.destroy()
  })

  it('takes the texts from the messages', () => {
    const graph = mount(true)
    const element = open({
      drawing: 'Rendu',
      drawingName: (drawing: string) => `[${drawing}]`,
      economy: 'Sobriété',
      economyName: (on: boolean) => (on ? 'oui' : 'non'),
    })
    expect(value(element, 'Rendu')).toBe('[software]')
    expect(value(element, 'Sobriété')).toBe('oui')
    graph.destroy()
  })
})
