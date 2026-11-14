import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Key, Point } from '../types'
import { type PresenceSelection, type PresenceValues, showPresence } from './index'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Row {
  readonly id: string
  readonly pointer: Point | null
  readonly selection: PresenceSelection | null
  readonly time: number
  readonly name: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]

let dom: FakeDom
let serial = 0

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

function people(initialData: Row[] = []) {
  return createCollection(
    localOnlyCollectionOptions({
      id: `people-${serial++}`,
      getKey: (row: Row) => row.id,
      initialData,
    }),
  )
}

function mount(slots = 3): GraphInstance<string> {
  const container = document.createElement('div')
  document.body.append(container)
  const states: Record<string, object> = {}
  for (let index = 1; index <= slots; index++) states[`presence${index}`] = { opacity: 0.5 }
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes(items, { x: 'x', y: 'y' })],
        states,
      }),
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    fakeRenderer,
  ) as unknown as GraphInstance<string>
  dom.flushFrames()
  return graph
}

const create = (me: string, presence: PresenceValues): Row => ({
  id: me,
  name: me,
  ...presence,
})

function row(id: string, patch: Partial<Row> = {}): Row {
  return { id, name: id, pointer: null, selection: null, time: Date.now(), ...patch }
}

function hover(graph: GraphInstance<string>, x: number, y: number): void {
  const canvas = graph.element.querySelector('canvas')
  canvas?.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: x + 400,
      clientY: y + 300,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
    }),
  )
  dom.flushFrames()
}

const cursors = (graph: GraphInstance<string>) =>
  [...graph.element.querySelectorAll<HTMLElement>('[data-graph-presence]')].map(
    (element) => element.parentElement as HTMLElement,
  )

function members(graph: GraphInstance<string>, name: string): Key[] {
  return [...graph.states.get(name).nodes]
}

beforeEach(() => {
  vi.useFakeTimers()
  dom = installDom()
})

afterEach(() => {
  vi.useRealTimers()
  dom.restore()
})

describe('showPresence', () => {
  it('writes the row of the local participant, at most every 50 milliseconds', () => {
    const collection = people()
    const graph = mount()
    const { stop } = showPresence(graph, { collection, me: 'me', create })
    expect(collection.get('me')).toMatchObject({ id: 'me', pointer: null, selection: null })
    hover(graph, 50, 20)
    hover(graph, 60, 20)
    hover(graph, 70, 20)
    expect(collection.get('me')?.pointer).toBeNull()
    vi.advanceTimersByTime(49)
    expect(collection.get('me')?.pointer).toBeNull()
    vi.advanceTimersByTime(2)
    expect(collection.get('me')?.pointer).toEqual({ x: 70, y: 20 })
    graph.selection.set({ nodes: ['a', 'b'] })
    vi.advanceTimersByTime(50)
    expect(collection.get('me')?.selection).toEqual({ nodes: ['a', 'b'], edges: [], shapes: [] })
    expect(collection.get('me')?.time).toBeGreaterThan(Date.now() - 5)
    stop()
    graph.destroy()
  })

  it('cuts a large selection and writes null when it is empty', () => {
    const collection = people()
    const graph = mount()
    showPresence(graph, { collection, me: 'me', create, maxSelection: 2 })
    graph.selection.set({ nodes: ['a', 'b', 'c'] })
    vi.advanceTimersByTime(60)
    expect(collection.get('me')?.selection?.nodes).toEqual(['a', 'b'])
    graph.selection.clear()
    vi.advanceTimersByTime(60)
    expect(collection.get('me')?.selection).toBeNull()
    graph.destroy()
  })

  it('writes null when the pointer leaves the graph', () => {
    const collection = people()
    const graph = mount()
    showPresence(graph, { collection, me: 'me', create })
    hover(graph, 10, 10)
    vi.advanceTimersByTime(60)
    graph.element.dispatchEvent(new PointerEvent('pointerleave'))
    vi.advanceTimersByTime(60)
    expect(collection.get('me')?.pointer).toBeNull()
    graph.destroy()
  })

  it('follows the cursor of another participant, in world units', () => {
    const collection = people([row('ana', { pointer: { x: 20, y: 30 } })])
    const graph = mount()
    const { store } = showPresence(graph, { collection, me: 'me', create })
    dom.flushFrames()
    expect(store.state).toEqual([{ id: 'ana', slot: 0, state: 'presence1' }])
    const [cursor] = cursors(graph)
    expect(cursor?.style.transform).toBe('translate(420px,330px)')
    graph.view.set({ x: 20, y: 30, zoom: 2 })
    dom.flushFrames()
    expect(cursor?.style.transform).toBe('translate(400px,300px)')
    collection.update('ana', (draft) => {
      draft.pointer = { x: 120, y: 30 }
    })
    dom.flushFrames()
    expect(cursor?.style.transform).toBe('translate(600px,300px)')
    collection.update('ana', (draft) => {
      draft.pointer = null
    })
    dom.flushFrames()
    expect(cursors(graph)).toEqual([])
    graph.destroy()
  })

  it('uses the element the app makes, once for each participant', () => {
    const collection = people([row('ana', { pointer: { x: 0, y: 0 } })])
    const graph = mount()
    const cursor = vi.fn(({ id, slot }: { id: string; slot: number }) => {
      const element = document.createElement('span')
      element.setAttribute('data-who', `${id}:${slot}`)
      return element
    })
    showPresence(graph, { collection, me: 'me', create, cursor })
    collection.update('ana', (draft) => {
      draft.pointer = { x: 5, y: 5 }
    })
    dom.flushFrames()
    expect(cursor).toHaveBeenCalledTimes(1)
    expect(graph.element.querySelector('[data-who="ana:0"]')).not.toBeNull()
    graph.destroy()
  })

  it('shows no cursor with cursor false', () => {
    const collection = people([row('ana', { pointer: { x: 0, y: 0 } })])
    const graph = mount()
    showPresence(graph, { collection, me: 'me', create, cursor: false })
    dom.flushFrames()
    expect(cursors(graph)).toEqual([])
    graph.destroy()
  })

  it('shows the selection of each participant in its own state, and clears it on leaving', () => {
    const collection = people([
      row('ana', { selection: { nodes: ['a'] } }),
      row('bo', { selection: { nodes: ['b', 'c'] } }),
    ])
    const graph = mount()
    const { store } = showPresence(graph, { collection, me: 'me', create })
    expect(store.state.map((one) => one.state)).toEqual(['presence1', 'presence2'])
    expect(members(graph, 'presence1')).toEqual(['a'])
    expect(members(graph, 'presence2')).toEqual(['b', 'c'])
    collection.update('ana', (draft) => {
      draft.selection = { nodes: ['c'] }
    })
    expect(members(graph, 'presence1')).toEqual(['c'])
    collection.delete('bo')
    expect(members(graph, 'presence2')).toEqual([])
    expect(store.state.map((one) => one.id)).toEqual(['ana'])
    graph.destroy()
  })

  it('gives slots in the order of the keys at first, and keeps them', () => {
    const collection = people([row('zed'), row('ana'), row('bo')])
    const graph = mount()
    const { store } = showPresence(graph, { collection, me: 'me', create })
    expect(store.state.map((one) => [one.id, one.slot])).toEqual([
      ['ana', 0],
      ['bo', 1],
      ['zed', 2],
    ])
    collection.delete('ana')
    collection.insert(row('cy'))
    expect(store.state.map((one) => [one.id, one.slot])).toEqual([
      ['cy', 0],
      ['bo', 1],
      ['zed', 2],
    ])
    graph.destroy()
  })

  it('shares the states beyond their number, and keeps the keys of the others', () => {
    const collection = people([
      row('a1', { selection: { nodes: ['a'] } }),
      row('b1', { selection: { nodes: ['b'] } }),
      row('c1', { selection: { nodes: ['c'] } }),
      row('d1', { selection: { nodes: ['a', 'b'] } }),
    ])
    const graph = mount(3)
    const { store } = showPresence(graph, { collection, me: 'me', create })
    expect(store.state.map((one) => one.slot)).toEqual([0, 0, 1, 2])
    expect(members(graph, 'presence1').sort()).toEqual(['a', 'b'])
    collection.update('a1', (draft) => {
      draft.selection = null
    })
    expect(members(graph, 'presence1').sort()).toEqual(['a', 'b'])
    collection.delete('d1')
    expect(members(graph, 'presence1')).toEqual([])
    graph.destroy()
  })

  it('uses the listed states, and throws for one the graph does not declare', () => {
    const collection = people([row('ana', { selection: { nodes: ['a'] } })])
    const graph = mount(3)
    expect(() => showPresence(graph, { collection, me: 'me', create, states: ['nope'] })).toThrow(
      'presence state "nope" is not a free state',
    )
    showPresence(graph, { collection, me: 'me', create, states: ['presence3'] })
    expect(members(graph, 'presence3')).toEqual(['a'])
    expect(members(graph, 'presence1')).toEqual([])
    graph.destroy()
  })

  it('shows only cursors when the graph declares no presence state', () => {
    const collection = people([
      row('ana', { pointer: { x: 1, y: 1 }, selection: { nodes: ['a'] } }),
    ])
    const graph = mount(0)
    const { store } = showPresence(graph, { collection, me: 'me', create })
    dom.flushFrames()
    expect(store.state).toEqual([{ id: 'ana', slot: 0, state: null }])
    expect(cursors(graph)).toHaveLength(1)
    graph.destroy()
  })

  it('ignores the old rows, and drops a row that grows old', () => {
    const collection = people([
      row('old', { time: Date.now() - 31_000, selection: { nodes: ['a'] } }),
      row('new', { selection: { nodes: ['b'] } }),
    ])
    const graph = mount()
    const { store } = showPresence(graph, { collection, me: 'me', create })
    expect(store.state.map((one) => one.id)).toEqual(['new'])
    expect(members(graph, 'presence1')).toEqual(['b'])
    vi.advanceTimersByTime(30_100)
    expect(store.state).toEqual([])
    expect(members(graph, 'presence1')).toEqual([])
    collection.update('old', (draft) => {
      draft.time = Date.now()
    })
    expect(store.state.map((one) => one.id)).toEqual(['old'])
    expect(members(graph, 'presence1')).toEqual(['a'])
    graph.destroy()
  })

  it('drops the oldest row first, whatever the order they arrive in', () => {
    const collection = people([
      row('late', { time: Date.now() - 1_000 }),
      row('early', { time: Date.now() - 25_000 }),
    ])
    const graph = mount()
    const { store } = showPresence(graph, { collection, me: 'me', create })
    expect(store.state).toHaveLength(2)
    vi.advanceTimersByTime(5_100)
    expect(store.state.map((one) => one.id)).toEqual(['late'])
    vi.advanceTimersByTime(25_000)
    expect(store.state).toEqual([])
    graph.destroy()
  })

  it('keeps a participant that writes again', () => {
    const collection = people([row('ana', { selection: { nodes: ['a'] } })])
    const graph = mount()
    const { store } = showPresence(graph, { collection, me: 'me', create })
    vi.advanceTimersByTime(20_000)
    collection.update('ana', (draft) => {
      draft.time = Date.now()
    })
    vi.advanceTimersByTime(20_000)
    expect(store.state).toHaveLength(1)
    expect(members(graph, 'presence1')).toEqual(['a'])
    graph.destroy()
  })

  it('rewrites the row of the local participant while it is idle', () => {
    const collection = people()
    const graph = mount()
    showPresence(graph, { collection, me: 'me', create })
    const first = collection.get('me')?.time ?? 0
    vi.advanceTimersByTime(10_100)
    expect((collection.get('me')?.time ?? 0) - first).toBeGreaterThanOrEqual(10_000)
    graph.destroy()
  })

  it('removes its row, cursors and states on stop, and does nothing after', () => {
    const collection = people([
      row('ana', { pointer: { x: 0, y: 0 }, selection: { nodes: ['a'] } }),
    ])
    const graph = mount()
    const presence = showPresence(graph, { collection, me: 'me', create })
    dom.flushFrames()
    expect(collection.has('me')).toBe(true)
    presence.stop()
    expect(collection.has('me')).toBe(false)
    expect(cursors(graph)).toEqual([])
    expect(members(graph, 'presence1')).toEqual([])
    collection.insert(row('bo', { selection: { nodes: ['b'] } }))
    hover(graph, 1, 1)
    vi.advanceTimersByTime(100)
    expect(members(graph, 'presence1')).toEqual([])
    expect(collection.has('me')).toBe(false)
    presence.stop()
    graph.destroy()
  })

  it('stops with the graph, and shows nothing on a destroyed graph', () => {
    const collection = people([row('ana', { selection: { nodes: ['a'] } })])
    const graph = mount()
    showPresence(graph, { collection, me: 'me', create })
    expect(collection.has('me')).toBe(true)
    graph.destroy()
    expect(collection.has('me')).toBe(false)
    const late = showPresence(graph, { collection, me: 'me', create })
    expect(collection.has('me')).toBe(false)
    expect(late.store.state).toEqual([])
    late.stop()
  })

  it('reads and writes the fields it is told to', () => {
    interface Other {
      readonly who: string
      readonly at: Point | null
      readonly picked: PresenceSelection | null
      readonly seen: number
    }
    const seed: Other[] = [
      { who: 'ana', at: { x: 3, y: 4 }, picked: { nodes: ['c'] }, seen: Date.now() },
    ]
    const collection = createCollection(
      localOnlyCollectionOptions({
        id: `others-${serial++}`,
        getKey: (one: Other) => one.who,
        initialData: seed,
      }),
    )
    const graph = mount()
    showPresence(graph, {
      collection,
      me: 'me',
      fields: { pointer: 'at', selection: 'picked', time: 'seen' },
      create: (me, presence) => ({
        who: me,
        at: presence.pointer,
        picked: presence.selection,
        seen: presence.time,
      }),
    })
    dom.flushFrames()
    expect(members(graph, 'presence1')).toEqual(['c'])
    hover(graph, 9, 9)
    vi.advanceTimersByTime(60)
    expect(collection.get('me')?.at).toEqual({ x: 9, y: 9 })
    graph.destroy()
  })

  it('rejects numbers that cannot be a delay', () => {
    const collection = people()
    const graph = mount()
    expect(() => showPresence(graph, { collection, me: 'me', create, wait: -1 })).toThrow(
      RangeError,
    )
    expect(() => showPresence(graph, { collection, me: 'me', create, expire: 0 })).toThrow(
      RangeError,
    )
    expect(() =>
      showPresence(graph, { collection, me: 'me', create, maxSelection: Number.NaN }),
    ).toThrow(RangeError)
    graph.destroy()
  })
})
