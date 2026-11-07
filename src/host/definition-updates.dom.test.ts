import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { LiveSource, SourceChange } from '../types'
import { createGraphHost } from './mount-graph'

interface Place {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly far: number
}

const rows: Place[] = [
  { id: 'a', x: 0, y: 0, far: 500 },
  { id: 'b', x: 100, y: 0, far: 600 },
]

function live(items: readonly Place[]): LiveSource<Place> {
  return {
    subscribeChanges(callback, options) {
      if (options?.includeInitialState) {
        callback(
          items.map((value): SourceChange<Place> => ({ type: 'insert', key: value.id, value })),
        )
      }
      return { unsubscribe() {} }
    },
  }
}

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
  document.body.replaceChildren()
})

function mount(definition: Parameters<typeof createGraphHost>[1]['definition']) {
  const container = document.createElement('div')
  document.body.append(container)
  return createGraphHost(container, { definition, ariaLabel: 'graph' }, () => fakeRenderer())
}

describe('definition updates', () => {
  it('moves nodes to the channel of the last of two updates within one frame', () => {
    const graph = mount(defineGraph({ marks: [nodes(live(rows), { x: 'x', y: 'y' })] }))
    dom.flushFrames()
    expect(graph.positions.get('a')?.x).toBe(0)
    const next = live(rows)
    graph.update({ definition: defineGraph({ marks: [nodes(next, { x: 'x', y: 'y' })] }) })
    graph.update({ definition: defineGraph({ marks: [nodes(next, { x: 'far', y: 'y' })] }) })
    dom.flushFrames()
    expect(graph.positions.get('a')?.x).toBe(500)
    expect(graph.positions.get('b')?.x).toBe(600)
    graph.destroy()
  })

  it('moves the focus with the keyboard right after a mark leaves', () => {
    const first = nodes([{ id: 'a', x: 0, y: 0 }], { x: 'x', y: 'y' })
    const second = nodes([{ id: 'b', x: 100, y: 0 }], { x: 'x', y: 'y' })
    const graph = mount(defineGraph({ marks: [first, second] }))
    dom.flushFrames()
    graph.focus.set({ kind: 'node', key: 'a' })
    graph.update({ definition: defineGraph({ marks: [first] }) })
    const key = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    expect(() => graph.element.dispatchEvent(key)).not.toThrow()
    graph.destroy()
  })
})
