import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scopeEngine } from '../core/layout-scopes'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Layout, LayoutGraph, LayoutListener } from '../types'
import { createGraphHost } from './mount-graph'

interface Item {
  readonly id: string
  readonly parent?: string
}

interface FakeRun {
  readonly graph: LayoutGraph
  readonly listener: LayoutListener
}

const runs: FakeRun[] = []

const own: Layout = {
  name: 'own',
  options: {},
  start(graph, listener) {
    runs.push({ graph, listener })
    return { pin: () => {}, stop: () => {} }
  },
}

let dom: FakeDom

beforeEach(() => {
  runs.length = 0
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('an unfold that comes before the engine of group layouts', () => {
  it('lets the members out as a plain group, then arranges them once the engine is in', async () => {
    expect(scopeEngine()).toBeNull()
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [
            nodes<Item>(
              [{ id: 'g' }, { id: 'a', parent: 'g' }, { id: 'b', parent: 'g' }, { id: 'e' }],
              { parent: 'parent', container: { layout: own } },
            ),
          ],
          transitions: { layout: 0 },
        }),
        ariaLabel: 'graphe',
        initialFolded: ['g'],
      },
      fakeRenderer,
    )
    dom.flushFrames()
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(scopeEngine()).toBeNull()
    expect(runs).toHaveLength(0)
    const a = graph.positions.get('a')
    const b = graph.positions.get('b')
    expect(Number.isFinite(a?.x)).toBe(true)
    expect(Number.isFinite(b?.x)).toBe(true)
    await vi.waitFor(() => {
      dom.flushFrames()
      expect(runs).toHaveLength(1)
    })
    const run = runs[0] as FakeRun
    expect(run.graph.container?.key).toBe('g')
    const keys = run.graph.keys
    const movable = [...run.graph.movable.keys()]
      .filter((index) => run.graph.movable[index] === 1)
      .map((index) => keys[index])
    expect(movable.sort()).toEqual(['a', 'b'])
    const xy = Float32Array.from(run.graph.xy)
    const at = keys.indexOf('a')
    const bt = keys.indexOf('b')
    xy[at * 2] = (xy[bt * 2] ?? 0) + 40
    xy[at * 2 + 1] = xy[bt * 2 + 1] ?? 0
    run.listener.end(xy)
    dom.flushFrames()
    expect(graph.store.get().layout.running).toBe(false)
    const placedA = graph.positions.get('a')
    const placedB = graph.positions.get('b')
    expect((placedA?.x ?? 0) - (placedB?.x ?? 0)).toBeCloseTo(40, 3)
    expect((placedA?.y ?? 0) - (placedB?.y ?? 0)).toBeCloseTo(0, 3)
    graph.destroy()
  })
})
