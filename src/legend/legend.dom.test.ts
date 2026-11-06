import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { ColorScale } from '../types'
import { createLegend, mountLegend } from './index'

interface Item {
  readonly id: string
  readonly group: string
  readonly weight: number
  readonly kind?: 'square'
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly group: string
}

const items: Item[] = [
  { id: 'a', group: 'north', weight: 1 },
  { id: 'b', group: 'south', weight: 5 },
  { id: 'c', group: 'north', weight: 9, kind: 'square' },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b', group: 'south' }]

const define = (data: readonly Item[], color?: ColorScale) =>
  defineGraph({
    marks: [
      edges<Link, 'links'>(links, { source: 'from', target: 'to', color: 'group', name: 'links' }),
      nodes<Item, 'items'>(data, {
        color: (item) =>
          typeof color === 'object' && color.type === 'sequential' ? item.weight : item.group,
        size: 'weight',
        shape: (item) => item.kind ?? 'circle',
        name: 'items',
      }),
    ],
    scales: color ? { color } : {},
    states: { match: {}, faded: {} },
  })

let dom: FakeDom

function mount(
  data: readonly Item[] = items,
  color?: ColorScale,
): GraphInstance<'match' | 'faded'> {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: define(data, color), ariaLabel: 'graph' },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance<'match' | 'faded'>
}

describe('createLegend', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('reads categories, sizes and looks from the graph', () => {
    const graph = mount()
    const legend = createLegend(graph)
    const state = legend.store.state
    expect(state.color?.type).toBe('categories')
    const categories = state.color?.type === 'categories' ? state.color.items : []
    expect(categories.map((item) => [item.value, item.color, item.nodes, item.edges])).toEqual([
      ['north', 'var(--graph-cat-1)', 2, 0],
      ['south', 'var(--graph-cat-2)', 1, 1],
    ])
    expect(state.size?.domain).toEqual([1, 9])
    expect(state.size?.items.map((item) => item.value)).toEqual([1, 5, 9])
    expect(state.width).toBeNull()
    expect(state.looks.map((look) => [look.kind, look.mark, look.count])).toEqual([
      ['nodes', 'items', 2],
      ['nodes', 'items', 1],
      ['edges', 'links', 1],
    ])
  })

  it('reads a ramp from a sequential scale', () => {
    const graph = mount(items, { type: 'sequential' })
    const legend = createLegend(graph)
    expect(legend.store.state.color).toEqual({
      type: 'ramp',
      domain: [1, 9],
      stops: ['var(--graph-cat-5)', 'var(--graph-cat-1)'],
    })
  })

  it('highlights and switches off the elements of an item through states', () => {
    const graph = mount()
    const legend = createLegend(graph, { highlight: 'match', hidden: 'faded' })
    const south = 'c:string:south'
    legend.hover(south)
    expect(graph.store.state.states.match).toEqual({ nodes: ['b'], edges: ['ab'] })
    legend.hover(null)
    expect(graph.store.state.states.match).toEqual({ nodes: [], edges: [] })
    legend.toggle(south)
    expect(legend.store.state.off).toEqual([south])
    expect(graph.store.state.states.faded).toEqual({ nodes: ['b'], edges: ['ab'] })
    const square = legend.store.state.looks.find(
      (look) => look.kind === 'nodes' && look.shape === 'square',
    )
    expect(legend.keys(square?.id ?? '')).toEqual({ nodes: ['c'], edges: [] })
    legend.reset()
    expect(graph.store.state.states.faded).toEqual({ nodes: [], edges: [] })
    legend.toggle(south, true)
    legend.destroy()
    expect(graph.store.state.states.faded).toEqual({ nodes: [], edges: [] })
  })

  it('follows the data and keeps the switched off items', () => {
    const graph = mount()
    const legend = createLegend(graph, { hidden: 'faded' })
    legend.toggle('c:string:north')
    graph.update({ definition: define([...items, { id: 'd', group: 'north', weight: 2 }]) })
    dom.flushFrames()
    vi.runOnlyPendingTimers()
    const color = legend.store.state.color
    const north = color?.type === 'categories' ? color.items[0] : undefined
    expect(north?.nodes).toBe(3)
    expect(north?.off).toBe(true)
    expect(graph.store.state.states.faded.nodes).toEqual(['a', 'c', 'd'])
  })

  it('renders toggle buttons that highlight on hover', () => {
    const graph = mount()
    const legend = createLegend(graph, { highlight: 'match' })
    const view = mountLegend(legend, { titles: { color: 'Group' }, ariaLabel: 'Legend' })
    document.body.append(view.element)
    expect(view.element.getAttribute('aria-label')).toBe('Legend')
    const buttons = [...view.element.querySelectorAll('button')]
    expect(buttons.map((button) => button.textContent)).toEqual([
      'north',
      'south',
      'items',
      'items',
    ])
    expect(view.element.textContent).toContain('Group')
    expect(view.element.querySelector('[data-section="size"]')?.textContent).toBe('159')
    const south = buttons[1] as HTMLButtonElement
    south.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    expect(legend.store.state.hovered).toBe('c:string:south')
    south.click()
    expect(south.getAttribute('aria-pressed')).toBe('false')
    expect(view.element.querySelectorAll('button')[1]).toBe(south)
    view.element.dispatchEvent(new PointerEvent('pointerleave'))
    expect(legend.store.state.hovered).toBeNull()
    view.update({ toggle: false })
    expect(view.element.querySelectorAll('button')).toHaveLength(0)
    view.destroy()
    expect(view.element.isConnected).toBe(false)
  })
})
