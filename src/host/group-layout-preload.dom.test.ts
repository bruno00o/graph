import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scopeEngine } from '../core/layout-scopes'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Layout } from '../types'
import { createGraphHost } from './mount-graph'

interface Item {
  readonly id: string
  readonly parent?: string
}

let started = 0

const own: Layout = {
  name: 'own',
  options: {},
  start() {
    started++
    return { pin: () => {}, stop: () => {} }
  },
}

let dom: FakeDom

beforeEach(() => {
  started = 0
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('a graph whose groups declare a layout', () => {
  it('loads the engine of group layouts while every group is still folded', async () => {
    expect(scopeEngine()).toBeNull()
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [
            nodes<Item>([{ id: 'g' }, { id: 'a', parent: 'g' }, { id: 'e' }], {
              parent: 'parent',
              container: { layout: own },
            }),
          ],
          transitions: { layout: 0 },
        }),
        ariaLabel: 'graphe',
        initialFolded: ['g'],
      },
      fakeRenderer,
    )
    dom.flushFrames()
    await vi.waitFor(() => {
      expect(scopeEngine()).not.toBeNull()
    })
    dom.flushFrames()
    expect(started).toBe(0)
    graph.destroy()
  })
})
