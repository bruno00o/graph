import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mapSurface } from '../map'
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

describe('the devtools when the graph moves to a map and back', () => {
  it('shows the current surface and keeps the history of the graph', () => {
    const fake = fakeMap()
    const graph = mount()
    const element = document.createElement('div')
    document.body.append(element)
    core = new GraphDevtoolsCore()
    core.mount(element, {})
    for (let frame = 0; frame < 5; frame++) {
      graph.view.set({ x: frame, y: 0, zoom: 1 })
      dom.flushFrames()
    }
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Surface')).toBe('Canvas')
    const before = graphReports()[0]?.performance.frames.length ?? 0
    expect(before).toBeGreaterThan(0)
    const surface = mapSurface(fake.map)
    graph.update({ surface })
    fake.render()
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Surface')).toBe('Map')
    expect(graphReports()).toHaveLength(1)
    expect(graphReports()[0]?.surface).toBe('map')
    expect(graphReports()[0]?.performance.frames.length).toBeGreaterThanOrEqual(before)
    surface.release()
    dom.flushFrames()
    vi.advanceTimersByTime(1100)
    expect(value(element, 'Surface')).toBe('Canvas')
    graph.destroy()
    vi.advanceTimersByTime(1100)
    expect(graphReports()).toHaveLength(0)
  })

  it('takes the names of the surfaces from the messages', () => {
    const graph = mount()
    const element = document.createElement('div')
    document.body.append(element)
    core = new GraphDevtoolsCore()
    core.mount(element, {
      messages: { surface: 'Surface de dessin', surfaceName: (name) => `[${name}]` },
    })
    expect(value(element, 'Surface de dessin')).toBe('[canvas]')
    graph.destroy()
  })
})
