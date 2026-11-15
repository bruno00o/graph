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

describe('the engine of group layouts', () => {
  it('loads on its own for a layout of your own, without any built-in layout', async () => {
    expect(scopeEngine()).toBeNull()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
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
      },
      fakeRenderer,
    )
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    expect(graph.store.get().layout.running).toBe(false)
    await vi.waitFor(() => {
      dom.flushFrames()
      expect(runs).toHaveLength(1)
    })
    expect(scopeEngine()).not.toBeNull()
    expect(runs[0]?.graph.container?.key).toBe('g')
    expect(warn).not.toHaveBeenCalled()
    const done = graph.layout.run()
    runs.at(-1)?.listener.end(Float32Array.from(runs.at(-1)?.graph.xy ?? []))
    dom.flushFrames()
    expect(await done).toBe(true)
    graph.destroy()
    warn.mockRestore()
  })
})
