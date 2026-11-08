import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { createPathFinder } from '../paths'
import { createSupportFinder } from '../support'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createGraphHost } from './mount-graph'

interface Place {
  readonly id: string
  readonly group?: string | undefined
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly over?: readonly string[] | undefined
}

const places: Place[] = [{ id: 'a', group: 'g' }, { id: 'b', group: 'g' }, { id: 'c' }, { id: 'g' }]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c', over: ['ab'] },
]

const wrong: readonly unknown[] = [undefined, null, {}, [], Number.NaN, true, Symbol('key'), 12n]

function marks() {
  return [
    edges(links, { source: 'from', target: 'to', supportedBy: 'over' }),
    nodes(places, { parent: 'group' }),
  ]
}

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({ marks: marks(), states: { mark: {} } }),
      ariaLabel: 'graph',
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph
}

describe('reads by a key that is not a key', () => {
  it('answers like an unknown key on a mounted graph', () => {
    const graph = mount()
    const unknown = 'nope'
    for (const key of wrong) {
      const bad = key as never
      expect(graph.neighbors(bad)).toEqual(graph.neighbors(unknown))
      expect(graph.edgesOf(bad)).toEqual(graph.edgesOf(unknown))
      expect(graph.endpoints(bad)).toBeUndefined()
      expect(graph.datumOf({ kind: 'node', key: bad })).toBeUndefined()
      expect(graph.datumOf({ kind: 'edge', key: bad })).toBeUndefined()
      expect(graph.positions.get(bad)).toBeUndefined()
      expect(graph.paths.reach(bad).nodes).toEqual([])
      expect(graph.paths.shortest(bad, 'a')).toBeNull()
      expect(graph.paths.shortest('a', bad)).toBeNull()
      expect(graph.support.carriers(bad).nodes).toEqual([])
      expect(graph.support.carried(bad).nodes).toEqual([])
      expect(graph.groups.isFolded(bad)).toBe(false)
      expect(graph.groups.parent(bad)).toBeUndefined()
      expect(graph.groups.children(bad)).toEqual([])
      expect(() => graph.focus.set({ kind: 'node', key: bad })).not.toThrow()
      expect(graph.focus.get()).toBeNull()
      expect(() => graph.groups.toggle(bad)).not.toThrow()
      expect(() => graph.groups.fold([bad])).not.toThrow()
      expect(() => graph.groups.unfold([bad])).not.toThrow()
      expect(() => graph.groups.set([bad])).not.toThrow()
      expect(() => graph.states.set('mark', { nodes: [bad], edges: [bad] })).not.toThrow()
      expect(() => graph.states.add('mark', { nodes: [bad] })).not.toThrow()
      expect(() => graph.states.remove('mark', { nodes: [bad] })).not.toThrow()
      expect(graph.states.has('mark', { kind: 'node', key: bad })).toBe(false)
      expect(() => graph.selection.set({ nodes: [bad], edges: [bad] })).not.toThrow()
      expect(() => graph.positions.set([[bad, { x: 1, y: 1 }]])).not.toThrow()
      expect(() => graph.view.fit({ nodes: [bad], edges: [bad] })).not.toThrow()
      const anchored = document.createElement('div')
      expect(() => graph.anchors.set(anchored, { node: bad })).not.toThrow()
      expect(() => graph.anchors.set(anchored, { nodes: [bad] })).not.toThrow()
      expect(() => graph.anchors.set(anchored, { edge: bad })).not.toThrow()
      dom.flushFrames()
      graph.anchors.remove(anchored)
      graph.groups.set([])
      graph.states.clear()
      graph.selection.clear()
    }
    expect(graph.selection.get()).toEqual({ nodes: [], edges: [] })
    graph.destroy()
  })

  it('answers like an unknown key on a path finder', () => {
    const finder = createPathFinder({ marks: marks() })
    for (const key of wrong) {
      const bad = key as never
      expect(finder.reach(bad).nodes).toEqual([])
      expect(finder.shortest(bad, 'a')).toBeNull()
      expect(finder.shortest('a', bad)).toBeNull()
    }
    finder.destroy()
  })

  it('answers like an unknown key on a support finder', () => {
    const finder = createSupportFinder({ marks: marks() })
    for (const key of wrong) {
      const bad = key as never
      expect(finder.carriers(bad).nodes).toEqual([])
      expect(finder.carried(bad).nodes).toEqual([])
    }
    finder.destroy()
  })
})
