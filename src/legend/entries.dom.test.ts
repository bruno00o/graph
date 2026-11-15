import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { EdgeMark, NodeMark } from '../types'
import {
  createLegend,
  type LegendEntry,
  type LegendEntryGroup,
  type LegendOptions,
  mountLegend,
} from './index'

interface Item {
  readonly id: string
  readonly weight: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly weight: number
}

type Marks = NodeMark<Item, 'items'> | EdgeMark<Link, 'links'>

const items: Item[] = [
  { id: 'a', weight: 1 },
  { id: 'b', weight: 5 },
  { id: 'c', weight: 9 },
  { id: 'd', weight: 12 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b', weight: 2 },
  { id: 'bc', from: 'b', to: 'c', weight: 11 },
]

const define = (data: readonly Item[]) =>
  defineGraph({
    marks: [
      edges<Link, 'links'>(links, { source: 'from', target: 'to', name: 'links' }),
      nodes<Item, 'items'>(data, { size: 'weight', name: 'items' }),
    ],
    states: { match: {}, faded: {} },
  })

let dom: FakeDom

function mount(data: readonly Item[] = items): GraphInstance<'match' | 'faded', Marks> {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, { definition: define(data), ariaLabel: 'graph' }, () =>
    fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance<'match' | 'faded', Marks>
}

const heavy: LegendEntry<Marks> = {
  id: 'heavy',
  label: 'Heavy',
  swatch: { kind: 'nodes', fill: 'red' },
  nodes: (item) => item.weight > 8,
  edges: (link) => link.weight > 10,
}

const light: LegendEntry<Marks> = {
  id: 'light',
  label: 'Light',
  swatch: { kind: 'nodes', fill: 'blue', shape: 'square' },
  nodes: (item) => item.weight <= 8,
}

const note: LegendEntry<Marks> = {
  id: 'note',
  label: 'Note',
  swatch: { kind: 'edges', dash: 'dashed', color: 'green', width: 3 },
}

const groups: readonly LegendEntryGroup<Marks>[] = [
  { title: 'Weight', entries: [heavy, light] },
  { entries: [note] },
]

describe('legend entries declared by the application', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('reads sections, counts and interactivity', () => {
    const legend = createLegend(mount(), { entries: groups })
    const state = legend.store.state
    expect(state.entries.map((section) => section.title)).toEqual(['Weight', undefined])
    expect(
      state.entries.flatMap((section) =>
        section.items.map((item) => [
          item.id,
          item.label,
          item.interactive,
          item.nodes,
          item.edges,
          item.shapes,
        ]),
      ),
    ).toEqual([
      ['a:heavy', 'Heavy', true, 2, 1, 0],
      ['a:light', 'Light', true, 2, 0, 0],
      ['a:note', 'Note', false, 0, 0, 0],
    ])
    expect(state.entries[0]?.items[0]?.swatch).toBe(heavy.swatch)
    expect(state.color).toBeNull()
    legend.destroy()
  })

  it('leaves the state unchanged without entries', () => {
    const legend = createLegend(mount())
    expect(legend.store.state.entries).toEqual([])
    legend.destroy()
  })

  it('highlights, switches off and isolates the elements of an entry through states', () => {
    const graph = mount()
    const legend = createLegend(graph, { highlight: 'match', hidden: 'faded', entries: groups })
    legend.hover('a:heavy')
    expect(graph.store.state.states.match).toEqual({ nodes: ['c', 'd'], edges: ['bc'] })
    legend.hover(null)
    expect(graph.store.state.states.match).toEqual({ nodes: [], edges: [] })
    legend.toggle('a:light')
    expect(legend.store.state.off).toEqual(['a:light'])
    expect(graph.store.state.states.faded).toEqual({ nodes: ['a', 'b'], edges: [] })
    expect(legend.store.state.entries[0]?.items.map((item) => item.off)).toEqual([false, true])
    legend.toggle('a:note')
    expect(legend.store.state.off).toEqual(['a:light'])
    legend.reset()
    expect(graph.store.state.states.faded).toEqual({ nodes: [], edges: [] })
    legend.only('a:heavy')
    expect(legend.store.state.off).toEqual(['a:light'])
    legend.only('a:light')
    expect(legend.store.state.off).toEqual(['a:heavy'])
    expect(legend.keys('a:heavy')).toEqual({ nodes: ['c', 'd'], edges: ['bc'] })
    expect(legend.keys('a:note')).toEqual({ nodes: [], edges: [] })
    legend.destroy()
  })

  it('follows the data and keeps the switched off entries', () => {
    const graph = mount()
    const legend = createLegend(graph, { hidden: 'faded', entries: groups })
    legend.toggle('a:heavy')
    graph.update({ definition: define([...items, { id: 'e', weight: 30 }]) })
    dom.flushFrames()
    vi.runOnlyPendingTimers()
    expect(legend.store.state.entries[0]?.items[0]?.nodes).toBe(3)
    expect(graph.store.state.states.faded.nodes).toEqual(['c', 'd', 'e'])
    legend.destroy()
  })

  it('evaluates a rule once per item, again only for items that change', () => {
    const graph = mount()
    const test = vi.fn((item: Item) => item.weight > 8)
    const legend = createLegend(graph, {
      entries: [
        { entries: [{ id: 'rule', label: 'Rule', swatch: { kind: 'nodes' }, nodes: test }] },
      ],
    })
    expect(test).toHaveBeenCalledTimes(4)
    legend.hover('a:rule')
    legend.hover(null)
    legend.keys('a:rule')
    expect(test).toHaveBeenCalledTimes(4)
    const changed = items.map((item) => (item.id === 'a' ? { ...item, weight: 20 } : item))
    graph.update({ definition: define(changed) })
    dom.flushFrames()
    vi.runOnlyPendingTimers()
    expect(test).toHaveBeenCalledTimes(5)
    expect(legend.store.state.entries[0]?.items[0]?.nodes).toBe(3)
    legend.destroy()
  })

  it('reads again when the rules change and drops the state of removed entries', () => {
    const graph = mount()
    const legend = createLegend(graph, { hidden: 'faded', entries: groups })
    legend.toggle('a:light')
    const next: readonly LegendEntryGroup<Marks>[] = [
      {
        title: 'Weight',
        entries: [
          { ...heavy, label: 'Very heavy', nodes: (item) => item.weight > 10 },
          { ...note, label: 'Kept' },
        ],
      },
    ]
    legend.update({ entries: next })
    const section = legend.store.state.entries[0]
    expect(section?.items.map((item) => [item.label, item.nodes])).toEqual([
      ['Very heavy', 1],
      ['Kept', 0],
    ])
    expect(legend.store.state.off).toEqual([])
    expect(graph.store.state.states.faded).toEqual({ nodes: [], edges: [] })
    legend.update({ entries: undefined })
    expect(legend.store.state.entries).toEqual([])
    legend.destroy()
  })

  it('does not read again for an update that repeats the entries', () => {
    const graph = mount()
    const test = vi.fn((item: Item) => item.weight > 8)
    const entry: LegendEntry<Marks> = { ...heavy, nodes: test }
    const legend = createLegend(graph, { entries: [{ entries: [entry] }] })
    const before = legend.store.state
    legend.update({ entries: [{ entries: [{ ...entry }] }] })
    expect(legend.store.state).toBe(before)
    expect(test).toHaveBeenCalledTimes(4)
    legend.update({ entries: [{ entries: [{ ...entry, label: 'Other' }] }] })
    expect(legend.store.state.entries[0]?.items[0]?.label).toBe('Other')
    expect(test).toHaveBeenCalledTimes(4)
    legend.destroy()
  })

  it('leaves out the entries without elements with empty hide, unless switched off', () => {
    const graph = mount()
    const none: LegendEntry<Marks> = {
      id: 'none',
      label: 'None',
      swatch: { kind: 'nodes' },
      nodes: (item) => item.weight > 100,
    }
    const legend = createLegend(graph, {
      empty: 'hide',
      entries: [{ entries: [heavy, none, note] }],
    })
    expect(legend.store.state.entries[0]?.items.map((item) => item.id)).toEqual([
      'a:heavy',
      'a:note',
    ])
    legend.update({ empty: 'show' })
    vi.runOnlyPendingTimers()
    expect(legend.store.state.entries[0]?.items.map((item) => item.id)).toEqual([
      'a:heavy',
      'a:none',
      'a:note',
    ])
    legend.toggle('a:none')
    legend.update({ empty: 'hide' })
    vi.runOnlyPendingTimers()
    expect(legend.store.state.entries[0]?.items.map((item) => item.id)).toContain('a:none')
    legend.destroy()
  })

  it('ignores a repeated id and survives a rule that throws', () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: LegendEntry<Marks> = {
      id: 'broken',
      label: 'Broken',
      swatch: { kind: 'nodes' },
      nodes: () => {
        throw new Error('rule')
      },
    }
    const legend = createLegend(mount(), {
      entries: [{ entries: [heavy, { ...light, id: 'heavy' }, broken] }],
    })
    expect(legend.store.state.entries[0]?.items.map((item) => item.label)).toEqual([
      'Heavy',
      'Broken',
    ])
    expect(legend.store.state.entries[0]?.items[1]?.nodes).toBe(0)
    expect(reported).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalled()
    legend.destroy()
    warn.mockRestore()
    vi.unstubAllGlobals()
  })

  it('splits a long first reading into slices and publishes once it is complete', () => {
    const many = Array.from({ length: 3000 }, (_, index) => ({ id: `n${index}`, weight: index }))
    const graph = mount(many.slice(0, 1))
    const legend = createLegend(graph, { entries: [{ entries: [heavy] }] })
    let clock = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => {
      clock += 4
      return clock
    })
    graph.update({ definition: define(many) })
    dom.flushFrames()
    legend.update({ entries: [{ entries: [{ ...heavy }, { ...light }] }] })
    expect(legend.store.state.entries[0]?.items).toHaveLength(1)
    now.mockRestore()
    vi.runAllTimers()
    const state = legend.store.state.entries[0]?.items
    expect(state?.map((item) => item.nodes)).toEqual([2991, 9])
    legend.destroy()
  })

  it('types the item of each predicate from the marks of the graph', () => {
    const graph = mount()
    const legend = createLegend(graph, {
      entries: [
        {
          entries: [
            {
              id: 'typed',
              label: 'Typed',
              swatch: { kind: 'nodes' },
              nodes: (item, key) => {
                expectTypeOf(item).toEqualTypeOf<Item>()
                expectTypeOf(key).toEqualTypeOf<string | number>()
                return item.weight > 0
              },
              edges: (link) => {
                expectTypeOf(link).toEqualTypeOf<Link>()
                return true
              },
            },
          ],
        },
      ],
    })
    expectTypeOf<LegendOptions<'match', Marks>['entries']>().toEqualTypeOf<
      readonly LegendEntryGroup<Marks>[] | undefined
    >()
    legend.destroy()
  })

  it('renders sections with their titles, swatches and toggle buttons', () => {
    const graph = mount()
    const legend = createLegend(graph, { highlight: 'match', entries: groups })
    const view = mountLegend(legend)
    document.body.append(view.element)
    const blocks = [...view.element.querySelectorAll('[data-section="entries"]')]
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.textContent).toBe('WeightHeavyLight')
    expect(blocks[1]?.textContent).toBe('Note')
    const buttons = [...view.element.querySelectorAll('button')]
    expect(buttons.map((button) => button.getAttribute('data-item'))).toEqual([
      'a:heavy',
      'a:light',
    ])
    expect(view.element.querySelector('[data-item="a:note"]')).toBeNull()
    const swatch = buttons[0]?.firstElementChild?.firstElementChild as HTMLElement
    expect(swatch.style.background).toContain('red')
    const line = blocks[1]?.querySelector('span span') as HTMLElement
    expect(line.style.borderTop).toContain('3px dashed')
    expect(line.style.borderTop).toContain('green')
    buttons[0]?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    expect(graph.store.state.states.match.nodes).toEqual(['c', 'd'])
    buttons[0]?.click()
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('false')
    expect(legend.store.state.off).toEqual(['a:heavy'])
    view.destroy()
    legend.destroy()
  })

  it('places the entries among the other sections, or alone', () => {
    const graph = mount()
    const legend = createLegend(graph, { entries: groups })
    const view = mountLegend(legend, { sections: ['entries'] })
    document.body.append(view.element)
    expect(view.element.querySelectorAll('[data-section]')).toHaveLength(2)
    view.update({ sections: ['entries', 'size'] })
    expect(
      [...view.element.querySelectorAll('[data-section]')].map((node) =>
        node.getAttribute('data-section'),
      ),
    ).toEqual(['entries', 'entries', 'size'])
    view.update({ sections: undefined })
    expect(
      [...view.element.querySelectorAll('[data-section]')].map((node) =>
        node.getAttribute('data-section'),
      ),
    ).toEqual(['size', 'entries', 'entries'])
    view.update({ sections: ['color'] })
    expect(view.element.querySelectorAll('[data-section]')).toHaveLength(0)
    view.update({ sections: undefined })
    expect(view.element.querySelectorAll('[data-section="entries"]')).toHaveLength(2)
    view.destroy()
    legend.destroy()
  })

  it('draws the swatch of an edge or a shape entry', () => {
    const graph = mount()
    const legend = createLegend(graph, {
      entries: [
        {
          entries: [
            {
              id: 'area',
              label: 'Area',
              swatch: { kind: 'shapes', fill: 'orange', stroke: null, dash: 'dotted' },
            },
            {
              id: 'path',
              label: 'Path',
              swatch: { kind: 'shapes', geometry: 'line', stroke: 'navy' },
            },
          ],
        },
      ],
    })
    const view = mountLegend(legend)
    document.body.append(view.element)
    const spans = view.element.querySelectorAll(
      '[data-section="entries"] li > div > span:first-child > span',
    )
    expect((spans[0] as HTMLElement).style.background).toContain('orange')
    expect((spans[1] as HTMLElement).style.borderTop).toContain('navy')
    view.destroy()
    legend.destroy()
  })
})
