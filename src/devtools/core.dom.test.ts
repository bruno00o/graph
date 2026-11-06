import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { GraphDevtoolsCore } from './core'
import { graphReports } from './inspector'
import { graphDevtoolsPlugin } from './plugin'

let dom: FakeDom
const mounted: GraphInstance[] = []
const panels: GraphDevtoolsCore[] = []

function mount(label: string, count = 3): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const data = Array.from({ length: count }, (_, index) => ({ id: `n${index}`, x: index, y: 0 }))
  const graph = createGraphHost(
    container,
    { definition: defineGraph({ marks: [nodes(data, { x: 'x', y: 'y' })] }), ariaLabel: label },
    fakeRenderer,
  )
  mounted.push(graph)
  dom.flushFrames()
  return graph
}

function host(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

function open(element: HTMLElement, props: Parameters<GraphDevtoolsCore['mount']>[1] = {}) {
  const core = new GraphDevtoolsCore()
  core.mount(element, props)
  panels.push(core)
  return core
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
  for (const panel of panels.splice(0)) panel.unmount()
  for (const graph of mounted.splice(0)) graph.destroy()
  vi.useRealTimers()
  dom.restore()
})

describe('GraphDevtoolsCore', () => {
  it('says when no graph is mounted', () => {
    const element = host()
    open(element)
    const empty = element.querySelector<HTMLElement>('.gd-empty')
    expect(empty?.hidden).toBe(false)
    expect(empty?.textContent).toBe('No graph is mounted on this page.')
  })

  it('shows the counts and the view of a graph, and follows its changes', () => {
    const graph = mount('Graphe de trois nœuds')
    const element = host()
    open(element, { theme: 'light', devtoolsOpen: true })
    const root = element.querySelector<HTMLElement>('.graph-devtools')
    expect(root?.getAttribute('data-theme')).toBe('light')
    expect(element.querySelector('.gd-name')?.textContent).toBe('#1 Graphe de trois nœuds')
    expect(value(element, 'Nodes')).toBe('3')
    expect(value(element, 'Selection')).toBe('0 nodes, 0 edges')
    graph.selection.set({ nodes: ['n0'] })
    graph.view.set({ x: 1.5, y: -2, zoom: 2 })
    dom.flushFrames()
    vi.advanceTimersByTime(300)
    expect(value(element, 'Selection')).toBe('1 node, 0 edges')
    expect(value(element, 'Center')).toBe('1.5, -2')
    expect(value(element, 'Zoom')).toBe('2')
    expect(value(element, 'Frame rate')).toMatch(/fps$/)
    expect(element.querySelectorAll('.gd-chart rect[height]')).toHaveLength(120)
  })

  it('switches between mounted graphs', () => {
    mount('premier')
    mount('second', 5)
    const element = host()
    open(element)
    const choice = element.querySelector('select')
    expect(choice?.closest('label')?.hidden).toBe(false)
    expect(choice?.options).toHaveLength(2)
    expect(value(element, 'Nodes')).toBe('3')
    if (!choice) throw new Error('no picker')
    choice.value = choice.options[1]?.value ?? ''
    choice.dispatchEvent(new Event('change'))
    expect(value(element, 'Nodes')).toBe('5')
    expect(element.querySelector('.gd-name')?.textContent).toMatch(/second$/)
  })

  it('takes its text from the messages', () => {
    mount('graphe')
    const element = host()
    open(element, { messages: { nodes: 'Nœuds', number: (amount) => `${amount} !` } })
    expect(value(element, 'Nœuds')).toBe('3 !')
  })

  it('measures only while open and mounted', () => {
    mount('graphe')
    const element = host()
    const closed = open(element, { devtoolsOpen: false })
    expect(graphReports()).toEqual([])
    closed.unmount()
    const panel = open(element)
    expect(graphReports()).toHaveLength(1)
    panel.unmount()
    expect(element.querySelector('.graph-devtools')).toBeNull()
    expect(graphReports()).toEqual([])
  })

  it('stops measuring by itself once its element leaves the page', () => {
    const graph = mount('graphe')
    const element = host()
    open(element)
    element.remove()
    graph.view.set({ x: 3, y: 0, zoom: 1 })
    dom.flushFrames()
    vi.advanceTimersByTime(300)
    expect(graphReports()).toEqual([])
  })
})

describe('graphDevtoolsPlugin', () => {
  it('mounts the panel, remounts it on a theme change and cleans up', () => {
    mount('graphe')
    const plugin = graphDevtoolsPlugin({ defaultOpen: true })
    expect(plugin).toMatchObject({ id: 'bruno00o-graph', name: 'Graph', defaultOpen: true })
    const element = host()
    plugin.render(element as HTMLDivElement, { theme: 'dark', devtoolsOpen: true })
    const first = element.querySelector('.graph-devtools')
    plugin.render(element as HTMLDivElement, { theme: 'dark', devtoolsOpen: true })
    expect(element.querySelector('.graph-devtools')).toBe(first)
    plugin.render(element as HTMLDivElement, { theme: 'light', devtoolsOpen: true })
    expect(element.querySelectorAll('.graph-devtools')).toHaveLength(1)
    expect(element.querySelector('.graph-devtools')?.getAttribute('data-theme')).toBe('light')
    plugin.destroy?.('bruno00o-graph')
    expect(element.querySelector('.graph-devtools')).toBeNull()
    expect(graphReports()).toEqual([])
  })

  it('names itself from the messages', () => {
    expect(graphDevtoolsPlugin({ messages: { title: 'Graphe' } }).name).toBe('Graphe')
  })
})
