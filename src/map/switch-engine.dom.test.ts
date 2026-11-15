import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scopeEngine } from '../core/layout-scopes'
import { defineGraph } from '../define-graph'
import { createGraphHost } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type { Layout, LayoutGraph, LayoutListener } from '../types'
import { mapSurface } from '.'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

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

describe('coming back from a map before the engine of group layouts is in', () => {
  it('holds the group layouts, then runs them once the engine has loaded', async () => {
    expect(scopeEngine()).toBeNull()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { map } = fakeMap()
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
        surface: mapSurface(map),
      },
      fakeRenderer,
    )
    dom.flushFrames()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scopeEngine()).toBeNull()
    expect(runs).toHaveLength(0)
    graph.update({ surface: null })
    dom.flushFrames()
    expect(scopeEngine()).toBeNull()
    expect(runs).toHaveLength(0)
    await vi.waitFor(() => {
      dom.flushFrames()
      expect(runs).toHaveLength(1)
    })
    expect(runs[0]?.graph.container?.key).toBe('g')
    graph.destroy()
    warn.mockRestore()
  })
})
