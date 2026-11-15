import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { enableScopes } from '../layouts/scopes'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Key, Layout, LayoutGraph, LayoutListener } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly parent?: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface FakeRun {
  readonly name: string
  readonly graph: LayoutGraph
  readonly listener: LayoutListener
  stopped: boolean
}

const runs: FakeRun[] = []

function fake(name: string): Layout {
  return {
    name,
    options: {},
    start(graph, listener) {
      const run: FakeRun = { name, graph, listener, stopped: false }
      runs.push(run)
      return {
        pin: () => {},
        stop: () => {
          run.stopped = true
        },
      }
    },
  }
}

function finish(run: FakeRun | undefined, step = 40): void {
  if (!run) throw new Error('no run')
  const xy = Float32Array.from(run.graph.xy)
  let at = 0
  for (let index = 0; index < run.graph.capacity; index++) {
    if (run.graph.movable[index] !== 1) continue
    xy[index * 2] = at * step
    xy[index * 2 + 1] = at * step
    at++
  }
  run.listener.end(xy)
}

function scopeOf(run: FakeRun | undefined): Key | null {
  return run?.graph.container?.key ?? null
}

const items: Item[] = [
  { id: 'g' },
  { id: 'h' },
  { id: 'a', parent: 'g' },
  { id: 'b', parent: 'g' },
  { id: 'c', parent: 'h' },
  { id: 'd', parent: 'h' },
]

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'ac', from: 'a', to: 'c' },
]

function definition(data: readonly Item[], top: string) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(data, { parent: 'parent', container: { layout: () => fake('inner') } }),
    ],
    layout: fake(top),
    transitions: { layout: 0 },
  })
}

let dom: FakeDom

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(items, 'top'), ariaLabel: 'graphe' },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function gap(graph: GraphInstance, a: Key, b: Key): readonly [number, number] {
  const from = graph.positions.get(a)
  const to = graph.positions.get(b)
  return [(to?.x ?? 0) - (from?.x ?? 0), (to?.y ?? 0) - (from?.y ?? 0)]
}

beforeAll(() => {
  enableScopes()
})

beforeEach(() => {
  runs.length = 0
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('groups that did not change', () => {
  it('keep their arrangement when the graph lays itself out again with a new top layout', () => {
    const graph = mount()
    finish(runs[0], 30)
    finish(runs[1], 50)
    finish(runs[2], 400)
    dom.flushFrames()
    const inside = gap(graph, 'a', 'b')
    runs.length = 0
    graph.update({ definition: { ...definition(items, 'other'), relayout: true } })
    dom.flushFrames()
    expect(runs.map((run) => run.name)).toEqual(['other'])
    finish(runs[0], 900)
    dom.flushFrames()
    expect(gap(graph, 'a', 'b')).toEqual(inside)
    graph.destroy()
  })

  it('keep the groups finished before a run is replaced by an arrival', () => {
    const graph = mount()
    finish(runs[0], 30)
    expect(runs.map(scopeOf)).toEqual(['g', 'h'])
    runs.length = 0
    graph.update({ definition: definition([...items, { id: 'e', parent: 'h' }], 'top') })
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['h'])
    graph.layout.run()
    expect(runs.map(scopeOf)).toEqual(['h', 'g', 'h'])
    graph.destroy()
  })
})
