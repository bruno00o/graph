import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { GraphDevtoolsCore } from './core'
import { graphReports } from './inspector'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

let dom: FakeDom
let core: GraphDevtoolsCore | null = null

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const data = [
    { id: 'a', x: 250, y: 250 },
    { id: 'b', x: 260, y: 250 },
  ]
  const graph = createGraphHost(
    container,
    { definition: defineGraph({ marks: [nodes(data, { x: 'x', y: 'y' })] }), ariaLabel: 'graph' },
    () => fakeRenderer(),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
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

describe('the devtools when the graph is suspended', () => {
  function open(messages?: object): HTMLElement {
    const element = document.createElement('div')
    document.body.append(element)
    core = new GraphDevtoolsCore()
    core.mount(element, messages ? { messages } : {})
    return element
  }

  it('shows whether the graph draws, is suspended or lost its context', () => {
    const graph = mount()
    const element = open()
    expect(value(element, 'Rendering')).toBe('Active')
    graph.suspend()
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Rendering')).toBe('Suspended')
    expect(graphReports()[0]?.rendering).toBe('suspended')
    graph.resume()
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Rendering')).toBe('Active')
    const canvas = graph.element.querySelector('canvas') as HTMLCanvasElement
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Rendering')).toBe('Context lost')
    expect(graphReports()[0]?.rendering).toBe('lost')
    graph.suspend()
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Rendering')).toBe('Suspended')
    graph.destroy()
  })

  it('shows a graph that has no WebGL2', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      { definition: defineGraph({ marks: [nodes([{ id: 'a' }])] }), ariaLabel: 'graph' },
      () => {
        throw new DOMException('graph: WebGL2 is not available', 'NotSupportedError')
      },
    )
    dom.flushFrames()
    const element = open()
    expect(value(element, 'Rendering')).toBe('No WebGL2')
    expect(graphReports()[0]?.rendering).toBe('unavailable')
    graph.suspend()
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Rendering')).toBe('No WebGL2')
    graph.destroy()
  })

  it('takes the texts from the messages', () => {
    const graph = mount()
    const element = open({
      rendering: 'Dessin',
      renderingName: (state: string) => `[${state}]`,
    })
    graph.suspend()
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Dessin')).toBe('[suspended]')
    graph.destroy()
  })
})
