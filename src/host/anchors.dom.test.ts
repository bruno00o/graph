import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { hull } from '../hulls'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { BackgroundOptions, Hull } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { GridInput, HullInput, RenderInput } from './renderer'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]

interface Extra {
  readonly background?: BackgroundOptions
  readonly hulls?: readonly Hull<never>[]
}

const define = (data: readonly Item[] = items, extra: Extra = {}) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(data, { x: 'x', y: 'y' }),
    ],
    states: { muted: {} },
    ...extra,
  })

let dom: FakeDom
let inputs: RenderInput[]

function mount(definition = define()): GraphInstance<'muted'> {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition, ariaLabel: 'graph', initialView: { x: 0, y: 0, zoom: 1 } },
    () => ({ ...fakeRenderer(), sync: (input) => inputs.push(input) }),
  ) as GraphInstance<'muted'>
  dom.flushFrames()
  return graph
}

function element(width: number, height: number): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('data-width', String(width))
  element.setAttribute('data-height', String(height))
  return element
}

const wrapper = (element: HTMLElement) => element.parentElement as HTMLElement

beforeEach(() => {
  dom = installDom()
  inputs = []
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return Number(this.firstElementChild?.getAttribute('data-width') ?? 0)
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return Number(this.firstElementChild?.getAttribute('data-height') ?? 0)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('graph.anchors', () => {
  it('pins an element beside a node and follows the view and the node', () => {
    const graph = mount()
    const tip = element(40, 20)
    graph.anchors.set(tip, { node: 'a', side: 'right' })
    dom.flushFrames()
    expect(wrapper(tip).parentElement?.parentElement).toBe(graph.element)
    expect(wrapper(tip).style.transform).toBe('translate(312px,290px)')
    expect(wrapper(tip).style.visibility).toBe('')
    expect(wrapper(tip).style.pointerEvents).toBe('none')
    graph.view.set({ x: 0, y: 0, zoom: 2 })
    dom.flushFrames()
    expect(wrapper(tip).style.transform).toBe('translate(220px,290px)')
    graph.positions.set([['a', { x: -50, y: 10 }]])
    dom.flushFrames()
    expect(wrapper(tip).style.transform).toBe('translate(320px,310px)')
  })

  it('aligns on a side, adds the offset, and scales with the zoom on request', () => {
    const graph = mount()
    const top = element(40, 20)
    const point = element(10, 10)
    graph.anchors.set(top, { node: 'b', side: 'top', align: 'start', offset: { x: 1, y: -2 } })
    graph.anchors.set(point, { point: { x: 10, y: 10 }, scale: true })
    graph.view.set({ x: 0, y: 0, zoom: 2 })
    dom.flushFrames()
    expect(wrapper(top).style.transform).toBe('translate(585px,258px)')
    expect(wrapper(point).style.transform).toBe('translate(410px,310px) scale(2)')
  })

  it('places an element on the bounding box of several nodes, or of a state', () => {
    const graph = mount()
    const group = element(20, 10)
    const selected = element(20, 10)
    graph.anchors.set(group, { nodes: ['a', 'c', 'missing'], side: 'bottom' })
    graph.anchors.set(selected, { state: 'selected' })
    dom.flushFrames()
    expect(wrapper(group).style.transform).toBe('translate(340px,412px)')
    expect(wrapper(selected).style.visibility).toBe('hidden')
    graph.selection.set({ nodes: ['a', 'b'] })
    dom.flushFrames()
    expect(wrapper(selected).style.visibility).toBe('')
    expect(wrapper(selected).style.transform).toBe('translate(390px,295px)')
  })

  it('shows an element only while its target is in a state', () => {
    const graph = mount()
    const menu = element(10, 10)
    graph.anchors.set(menu, { node: 'a', when: 'muted' })
    dom.flushFrames()
    expect(wrapper(menu).style.visibility).toBe('hidden')
    graph.states.set('muted', { nodes: ['a'] })
    dom.flushFrames()
    expect(wrapper(menu).style.visibility).toBe('')
    expect(() => graph.anchors.set(menu, { node: 'a', when: 'unknown' as 'muted' })).toThrow(
      /unknown state/,
    )
  })

  it('follows an edge at the anchor of its label', () => {
    const graph = mount()
    const tag = element(20, 10)
    graph.anchors.set(tag, { edge: 'ab' })
    dom.flushFrames()
    expect(wrapper(tag).style.transform).toBe('translate(390px,295px)')
  })

  it('hides an element whose node is removed or off screen', () => {
    const graph = mount()
    const tip = element(10, 10)
    graph.anchors.set(tip, { node: 'c' })
    dom.flushFrames()
    expect(wrapper(tip).style.visibility).toBe('')
    graph.view.set({ x: 0, y: -1000, zoom: 1 })
    dom.flushFrames()
    expect(wrapper(tip).style.visibility).toBe('hidden')
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    graph.update({ definition: define(items.slice(0, 2)) })
    dom.flushFrames()
    expect(wrapper(tip).style.visibility).toBe('hidden')
  })

  it('lets interactive elements take the pointer and passes the wheel to the graph', () => {
    const graph = mount()
    const bar = element(40, 20)
    const button = document.createElement('button')
    bar.append(button)
    graph.anchors.set(bar, { node: 'a', interactive: true })
    dom.flushFrames()
    expect(wrapper(bar).style.pointerEvents).toBe('auto')
    const zoom = graph.view.get().zoom
    button.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, clientX: 300, clientY: 300, bubbles: true }),
    )
    dom.flushFrames()
    expect(graph.view.get().zoom).toBeGreaterThan(zoom)
  })

  it('removes elements on request and on destroy', () => {
    const graph = mount()
    const first = element(10, 10)
    const second = element(10, 10)
    const remove = graph.anchors.set(first, { node: 'a' })
    graph.anchors.set(second, { node: 'b' })
    remove()
    expect(first.isConnected).toBe(false)
    expect(second.isConnected).toBe(true)
    graph.destroy()
    expect(second.isConnected).toBe(false)
  })
})

describe('background and hulls', () => {
  it('hands the grid and the packed hulls to the renderer', () => {
    const graph = mount(define(items, { background: { grid: 'dots', spacing: 20 } }))
    const grid = inputs.at(-1)?.grid as GridInput
    expect(grid).toMatchObject({ pattern: 'dots', spacing: 20 })
    graph.update({ definition: define(items, { hulls: [hull({ nodes: ['a', 'b', 'c'] })] }) })
    dom.flushFrames()
    const last = inputs.at(-1)
    expect(last?.grid).toBeNull()
    const hulls = last?.hulls as HullInput
    expect(hulls.count).toBeGreaterThan(3)
    const version = hulls.version
    graph.positions.set([['c', { x: 0, y: 300 }]])
    dom.flushFrames()
    expect(inputs.at(-1)?.hulls?.version).toBeGreaterThan(version)
  })
})
