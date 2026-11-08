import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { raw } from '../core/raw'
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

  it('keeps one item of a section on with only', () => {
    const graph = mount()
    const legend = createLegend(graph, { hidden: 'faded' })
    legend.only('c:string:south')
    expect(legend.store.state.off).toEqual(['c:string:north'])
    expect(graph.store.state.states.faded.nodes).toEqual(['a', 'c'])
    const looks = legend.store.state.looks
    const circle = looks.find((look) => look.kind === 'nodes' && look.shape === 'circle')
    const square = looks.find((look) => look.kind === 'nodes' && look.shape === 'square')
    legend.only(square?.id ?? '')
    expect(legend.store.state.off).toEqual(['c:string:north', circle?.id])
    legend.only('c:string:north')
    expect(legend.store.state.off).toEqual([circle?.id, 'c:string:south'])
    legend.only('unknown')
    expect(legend.store.state.off).toHaveLength(2)
    legend.reset()
    expect(legend.store.state.off).toEqual([])
    expect(graph.store.state.states.faded).toEqual({ nodes: [], edges: [] })
  })

  it('keeps one layer shown with only', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [
            nodes(items.slice(0, 1), { layer: 'one' }),
            nodes(items.slice(1), { layer: 'two' }),
          ],
        }),
        ariaLabel: 'graph',
      },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    const legend = createLegend(graph)
    legend.only('l:two')
    expect(graph.layers.hidden()).toEqual(['one'])
    legend.only('l:one')
    expect(graph.layers.hidden()).toEqual(['two'])
    legend.reset()
    expect(graph.layers.hidden()).toEqual([])
    graph.destroy()
  })

  it('keeps the layer buttons in step when focus moves while the legend rebuilds', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [
            edges([links[0] as Link], { source: 'from', target: 'to', layer: 'one' }),
            edges([{ id: 'bc', from: 'b', to: 'c', group: 'south' }], {
              source: 'from',
              target: 'to',
              layer: 'two',
              dash: 'dashed',
            }),
            nodes(items, { layer: 'one' }),
          ],
        }),
        ariaLabel: 'graph',
      },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    const legend = createLegend(graph)
    const view = mountLegend(legend, { sections: ['layers'] })
    document.body.append(view.element)
    const pressed = () =>
      [...view.element.querySelectorAll('button')].map((button) =>
        button.getAttribute('aria-pressed'),
      )
    const focus = HTMLElement.prototype.focus
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
      this.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      focus.call(this)
      this.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    const click = (name: string) => {
      const button = view.element.querySelector(`[data-item="l:${name}"]`) as HTMLButtonElement
      button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
      button.focus()
      button.click()
      dom.flushFrames()
      vi.advanceTimersByTime(500)
      dom.flushFrames()
    }
    for (let round = 0; round < 3; round++) {
      click('one')
      expect(graph.layers.hidden()).toEqual(['one'])
      expect(pressed()).toEqual(['false', 'true'])
      click('one')
      expect(graph.layers.hidden()).toEqual([])
      expect(pressed()).toEqual(['true', 'true'])
    }
    vi.restoreAllMocks()
    graph.destroy()
  })

  it('keeps the options left out of update and resets those set to undefined', () => {
    const graph = mount()
    const legend = createLegend(graph, { highlight: 'match', hidden: 'faded' })
    legend.toggle('c:string:south')
    legend.update({})
    legend.hover('c:string:north')
    expect(graph.store.state.states.match.nodes).toEqual(['a', 'c'])
    expect(graph.store.state.states.faded.nodes).toEqual(['b'])
    legend.update({ hidden: undefined })
    expect(graph.store.state.states.faded.nodes).toEqual([])
    expect(graph.store.state.states.match.nodes).toEqual(['a', 'c'])
  })

  it('counts each end of an edge under its own category', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [
            edges<Link>(links, {
              source: 'from',
              target: 'to',
              color: 'group',
              ends: { target: { color: () => 'east' } },
            }),
            nodes<Item>(items, { color: 'group' }),
          ],
          states: { match: {} },
        }),
        ariaLabel: 'graph',
      },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    const legend = createLegend(graph as unknown as GraphInstance<'match'>, { highlight: 'match' })
    const state = legend.store.state
    const categories = state.color?.type === 'categories' ? state.color.items : []
    expect(categories.map((item) => [item.value, item.nodes, item.edges])).toEqual([
      ['north', 2, 0],
      ['south', 1, 1],
      ['east', 0, 1],
    ])
    expect(legend.keys('c:string:east')).toEqual({ nodes: [], edges: ['ab'] })
    legend.destroy()
    graph.destroy()
  })

  it('reads one section per scale, with the own scales of each mark apart', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [
            edges<Link, 'links'>(links, {
              source: 'from',
              target: 'to',
              name: 'links',
              color: 'group',
              width: 3,
              scales: { color: { domain: ['south', 'east'], range: ['red', 'blue'] } },
            }),
            nodes<Item, 'items'>(items, {
              name: 'items',
              color: 'group',
              size: raw((item) => item.weight * 4),
            }),
            nodes<Item, 'extra'>([{ id: 'x', group: 'north', weight: 3 }], {
              name: 'extra',
              color: raw(() => '#123456'),
              size: 'weight',
              scales: { size: { range: [10, 20] } },
            }),
          ],
          states: { match: {}, faded: {} },
        }),
        ariaLabel: 'graph',
      },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    const legend = createLegend(graph as unknown as GraphInstance<'match' | 'faded'>, {
      highlight: 'match',
      hidden: 'faded',
    })
    const state = legend.store.state
    const shared = state.color?.type === 'categories' ? state.color.items : []
    expect(shared.map((item) => [item.id, item.nodes, item.edges])).toEqual([
      ['c:string:north', 2, 0],
      ['c:string:south', 1, 0],
    ])
    expect(state.size).toBeNull()
    expect(state.width).toBeNull()
    expect(state.marks.map((mark) => [mark.id, mark.kind, mark.mark])).toEqual([
      ['n1', 'nodes', 'extra'],
      ['e0', 'edges', 'links'],
    ])
    expect(state.marks[0]?.size?.items).toEqual([{ value: 3, size: 10 }])
    expect(state.marks[0]?.color).toBeNull()
    const own = state.marks[1]?.color
    expect(own?.type === 'categories' ? own.items : []).toEqual([
      {
        id: 'c:e0:string:south',
        kind: 'category',
        value: 'south',
        color: 'red',
        nodes: 0,
        edges: 1,
        off: false,
      },
      {
        id: 'c:e0:string:east',
        kind: 'category',
        value: 'east',
        color: 'blue',
        nodes: 0,
        edges: 0,
        off: false,
      },
    ])
    expect(legend.keys('c:e0:string:south')).toEqual({ nodes: [], edges: ['ab'] })
    expect(legend.keys('c:string:south')).toEqual({ nodes: ['b'], edges: [] })
    legend.only('c:e0:string:south')
    expect(legend.store.state.off).toEqual(['c:e0:string:east'])
    legend.reset()
    legend.toggle('c:e0:string:south')
    const after = legend.store.state.marks[1]?.color
    expect(after?.type === 'categories' ? after.items[0]?.off : undefined).toBe(true)
    expect(graph.store.state.states.faded).toEqual({ nodes: [], edges: ['ab'] })
    const view = mountLegend(legend, {
      titles: { color: 'Group' },
      markTitle: (mark, section) => `${mark.mark} ${section}`,
    })
    const blocks = [...view.element.querySelectorAll('section')].map((block) => [
      block.getAttribute('data-section'),
      block.getAttribute('data-mark'),
    ])
    expect(blocks).toEqual([
      ['color', null],
      ['color', 'e0'],
      ['size', 'n1'],
      ['looks', null],
    ])
    expect(view.element.textContent).toContain('links color')
    view.destroy()
    legend.destroy()
    graph.destroy()
  })

  it('refuses a state missing from the definition', () => {
    const graph = mount()
    expect(() => createLegend(graph, { highlight: 'missing' as 'match' })).toThrow(/unknown state/)
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
    view.update({ ariaLabel: 'Key' })
    expect(view.element.getAttribute('aria-label')).toBe('Key')
    expect(view.element.querySelectorAll('button')).toHaveLength(0)
    view.update({ toggle: undefined })
    expect(view.element.querySelectorAll('button')).toHaveLength(4)
    view.destroy()
    expect(view.element.isConnected).toBe(false)
  })
})

describe('createLegend with groups and merged edges', () => {
  interface Member {
    readonly id: string
    readonly kind: string
    readonly parent?: string
  }

  interface Kinded {
    readonly id: string
    readonly from: string
    readonly to: string
    readonly kind: string
  }

  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  function mountWith(members: Member[], kinded: Kinded[], merge: boolean) {
    const container = document.createElement('div')
    document.body.append(container)
    const definition = defineGraph({
      marks: [
        nodes<Member>(members, { color: 'kind', parent: 'parent' }),
        edges<Kinded>(kinded, { source: 'from', target: 'to', color: 'kind', merge }),
      ],
      states: { off: { hide: true } },
    })
    const graph = createGraphHost(container, { definition, ariaLabel: 'graph' }, () =>
      fakeRenderer(),
    ) as unknown as GraphInstance<'off'>
    dom.flushFrames()
    return graph
  }

  it('switches off a merged edge whose category is switched off', () => {
    const graph = mountWith(
      [
        { id: 'a', kind: 'n' },
        { id: 'b', kind: 'n' },
        { id: 'c', kind: 'n' },
      ],
      [
        { id: 'ab1', from: 'a', to: 'b', kind: 'x' },
        { id: 'ab2', from: 'a', to: 'b', kind: 'x' },
        { id: 'bc', from: 'b', to: 'c', kind: 'y' },
      ],
      true,
    )
    expect(graph.count().shown.edges).toBe(2)
    const legend = createLegend(graph, { hidden: 'off' })
    expect(legend.keys('c:string:x').edges).toEqual(['ab1', 'ab2'])
    legend.toggle('c:string:x')
    dom.flushFrames()
    expect(graph.count().shown.edges).toBe(1)
  })

  it('hides the nodes of a switched off category as soon as their group unfolds', () => {
    const graph = mountWith(
      [
        { id: 'g', kind: 'box' },
        { id: 'a', kind: 'x', parent: 'g' },
        { id: 'b', kind: 'y', parent: 'g' },
      ],
      [],
      false,
    )
    const legend = createLegend(graph, { hidden: 'off' })
    legend.toggle('c:string:x')
    dom.flushFrames()
    expect(graph.states.get('off').nodes).toEqual(['a'])
    graph.groups.fold(['g'])
    dom.flushFrames()
    vi.advanceTimersByTime(1000)
    expect(graph.states.get('off').nodes).toEqual([])
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(graph.states.get('off').nodes).toContain('a')
    expect(graph.count().shown.nodes).toBe(2)
  })
})
