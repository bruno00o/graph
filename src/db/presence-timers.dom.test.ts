import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Point } from '../types'
import { type PresenceSelection, type PresenceValues, showPresence } from './index'

interface Row {
  readonly id: string
  readonly pointer: Point | null
  readonly selection: PresenceSelection | null
  readonly time: number
}

let dom: FakeDom

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

function mount(): GraphInstance<string> {
  const container = document.createElement('div')
  document.body.append(container)
  return createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes([{ id: 'a', x: 0, y: 0 }], { x: 'x', y: 'y' })],
        states: { presence1: { opacity: 0.5 } },
      }),
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    fakeRenderer,
  ) as unknown as GraphInstance<string>
}

const create = (me: string, presence: PresenceValues): Row => ({ id: me, ...presence })

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('showPresence with a long expiry', () => {
  it('keeps its heartbeat within the longest delay a timer can wait', () => {
    const collection = createCollection(
      localOnlyCollectionOptions({ id: 'people-long', getKey: (row: Row) => row.id }),
    )
    const graph = mount()
    const spy = vi.spyOn(globalThis, 'setInterval')
    const { stop } = showPresence(graph, {
      collection,
      me: 'me',
      create,
      expire: Number.MAX_SAFE_INTEGER,
    })
    const delays = spy.mock.calls.map((call) => call[1] ?? 0)
    stop()
    graph.destroy()
    expect(delays.length).toBeGreaterThan(0)
    for (const delay of delays) expect(delay).toBeLessThanOrEqual(2 ** 31 - 1)
  })
})

describe('showPresence when the clock of the system steps back', () => {
  it('keeps writing the pointer of the local person', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'))
    const collection = createCollection(
      localOnlyCollectionOptions({ id: 'people-clock', getKey: (row: Row) => row.id }),
    )
    const graph = mount()
    dom.flushFrames()
    const { stop } = showPresence(graph, { collection, me: 'me', create })
    const move = (x: number) => {
      graph.element.querySelector('canvas')?.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: x + 400,
          clientY: 300,
          pointerId: 1,
          pointerType: 'mouse',
          bubbles: true,
        }),
      )
      dom.flushFrames()
    }
    move(10)
    vi.advanceTimersByTime(100)
    expect(collection.get('me')?.pointer).toEqual({ x: 10, y: 0 })
    vi.setSystemTime(Date.now() - 60 * 60 * 1000)
    move(20)
    vi.advanceTimersByTime(1000)
    const pointer = collection.get('me')?.pointer
    stop()
    graph.destroy()
    vi.useRealTimers()
    expect(pointer).toEqual({ x: 20, y: 0 })
  })
})
