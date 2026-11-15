import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Layout } from '../types'
import { createGraphHost } from './mount-graph'

const gate = vi.hoisted(() => {
  let open: () => void = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open: () => open() }
})

vi.mock('../layouts/scopes', async (importOriginal) => {
  await gate.opened
  return importOriginal()
})

interface Item {
  readonly id: string
  readonly parent?: string
}

let started = 0

const own: Layout = {
  name: 'own',
  options: {},
  start(graph, listener) {
    started++
    queueMicrotask(() => listener.end(Float32Array.from(graph.xy)))
    return { pin: () => {}, stop: () => {} }
  },
}

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('layout.compute while the engine of group layouts loads', () => {
  it('rejects with the reason of graph.signal when the graph is destroyed meanwhile', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [
            nodes<Item>([{ id: 'g' }, { id: 'a', parent: 'g' }, { id: 'b', parent: 'g' }], {
              parent: 'parent',
              container: { layout: own },
            }),
          ],
          transitions: { layout: 0 },
        }),
        ariaLabel: 'graphe',
      },
      fakeRenderer,
    )
    dom.flushFrames()
    let outcome = 'pending'
    const computed = graph.layout.compute(own).then(
      () => {
        outcome = 'resolved'
      },
      (reason: unknown) => {
        outcome = reason === graph.signal.reason ? 'rejected with the signal' : 'rejected'
      },
    )
    graph.destroy()
    gate.open()
    await Promise.race([computed, new Promise((resolve) => setTimeout(resolve, 200))])
    expect(outcome).toBe('rejected with the signal')
    expect(started).toBe(0)
  })
})
