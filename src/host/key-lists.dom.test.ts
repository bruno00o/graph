import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { grid } from '../layouts'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Key } from '../types'
import type { MountGraphOptions } from './graph-instance'
import { createGraphHost } from './mount-graph'

interface Item {
  readonly id: string
  readonly parent: string | null
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'g1', parent: null, x: 0, y: 0 },
  { id: 'a', parent: 'g1', x: -100, y: 0 },
  { id: 'b', parent: 'g1', x: 100, y: 0 },
  { id: 'c', parent: null, x: 0, y: 200 },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to', layer: 'base' }),
    nodes(items, { x: 'x', y: 'y', parent: 'parent', layer: 'base' }),
  ],
  states: { near: {} },
  layout: null,
})

type Options = Partial<MountGraphOptions<'near', (typeof definition.marks)[number]>>

let dom: FakeDom
let warn: MockInstance<typeof console.warn>

function mount(options: Options = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, { definition, ariaLabel: 'graph', ...options }, () =>
    fakeRenderer(),
  )
  dom.flushFrames()
  return graph
}

function warnings(): string[] {
  return warn.mock.calls.map(([message]) => String(message)).filter((m) => m.includes('list'))
}

const bare = (value: string) => value as unknown as Key[]

describe('a string where a list of keys is expected', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    dom.restore()
  })

  it('warns once per method and keeps the behavior', () => {
    const graph = mount()
    graph.groups.fold(bare('g1'))
    expect(graph.groups.folded()).toEqual(['g', '1'])
    graph.groups.fold(bare('g1'))
    graph.groups.unfold(bare('g'))
    expect(graph.groups.folded()).toEqual(['1'])
    graph.groups.set(bare('g1'))
    graph.layers.hide(bare('base') as never)
    expect(graph.layers.hidden()).toEqual(['b', 'a', 's', 'e'])
    graph.layers.show(bare('ba') as never)
    graph.layers.set(bare('base') as never)
    graph.selection.set({ nodes: bare('ab') })
    expect(graph.selection.get().nodes).toEqual(['a', 'b'])
    graph.states.set('near', { edges: bare('ab') })
    graph.states.add('near', { nodes: bare('c') })
    graph.states.remove('near', { nodes: bare('c') })
    graph.view.fit({ nodes: bare('ab') })
    void graph.layout.run(grid(), { keys: bare('ab'), fit: { edges: bare('ab') } })
    graph.anchors.set(document.createElement('div'), { nodes: bare('ab') })
    expect(warnings()).toEqual(
      [
        'groups.fold',
        'groups.unfold',
        'groups.set',
        'layers.hide',
        'layers.show',
        'layers.set',
        'selection.set({ nodes })',
        'states.set(name, { edges })',
        'states.add(name, { nodes })',
        'states.remove(name, { nodes })',
        'view.fit({ nodes })',
        'layout.run({ keys })',
        'layout.run({ fit: { edges } })',
        'anchors.set(element, { nodes })',
      ].map((method) => `graph: ${method} takes a list of keys, not a string`),
    )
    graph.destroy()
  })

  it('warns for the options of the mount and of update', () => {
    const graph = mount({
      initialFolded: bare('g1'),
      initialHiddenLayers: bare('base') as never,
      selection: { edges: bare('ab') },
    })
    expect(graph.groups.folded()).toEqual(['g', '1'])
    expect(graph.selection.get().edges).toEqual(['a', 'b'])
    graph.update({ selection: { nodes: bare('ab') } })
    expect(warnings()).toEqual(
      [
        'the initialFolded option',
        'the initialHiddenLayers option',
        'the selection.edges option',
        'update({ selection: { nodes } })',
      ].map((method) => `graph: ${method} takes a list of keys, not a string`),
    )
    graph.destroy()
    warn.mockClear()
    const controlled = mount({ folded: bare('g1'), hiddenLayers: bare('base') as never })
    controlled.update({ folded: bare('g1'), hiddenLayers: bare('base') as never })
    expect(controlled.groups.folded()).toEqual(['g', '1'])
    expect(warnings()).toEqual(
      [
        'the folded option',
        'the hiddenLayers option',
        'update({ folded })',
        'update({ hiddenLayers })',
      ].map((method) => `graph: ${method} takes a list of keys, not a string`),
    )
    controlled.destroy()
  })

  it('stays silent for lists and on a destroyed graph', () => {
    const graph = mount({ initialFolded: new Set(['g1']), initialHiddenLayers: [] })
    graph.groups.unfold(['g1'])
    graph.groups.fold(new Map([['g1', 1]]).keys())
    graph.groups.set(
      (function* () {
        yield 'g1'
      })(),
    )
    graph.layers.hide(['base'])
    graph.layers.show()
    graph.selection.set({ nodes: ['a'], edges: new Set(['ab']) })
    graph.states.set('near', { nodes: ['a'] })
    graph.view.fit({ nodes: ['a'] })
    graph.view.fit()
    void graph.layout.run(grid(), { keys: ['a'], fit: true })
    graph.destroy()
    expect(() => {
      graph.groups.fold(bare('g1'))
      graph.layers.hide(bare('base') as never)
      graph.selection.set({ nodes: bare('ab') })
      graph.states.set('near', { nodes: bare('ab') })
      graph.view.fit({ nodes: bare('ab') })
      graph.update({ selection: { nodes: bare('ab') } })
    }).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })
})
