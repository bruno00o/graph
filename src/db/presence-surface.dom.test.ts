import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mapSurface } from '../map'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
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
  readonly surface?: string
}

const items: Item[] = [
  { id: 'a', x: 250, y: 250 },
  { id: 'b', x: 260, y: 250 },
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
      id: `surface-people-${serial++}`,
      getKey: (row: Row) => row.id,
      initialData,
    }),
  )
}

function mount(): GraphInstance<string> {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes(items, { x: 'x', y: 'y' })],
        states: { presence1: { opacity: 0.5 }, presence2: { opacity: 0.5 } },
      }),
      ariaLabel: 'graph',
      initialView: { x: 255, y: 250, zoom: 1 },
    },
    fakeRenderer,
  ) as unknown as GraphInstance<string>
  dom.flushFrames()
  return graph
}

const create = (me: string, presence: PresenceValues): Row => ({ id: me, ...presence })

function row(id: string, patch: Partial<Row> = {}): Row {
  return { id, pointer: null, selection: null, time: Date.now(), ...patch }
}

function who(graph: GraphInstance<string>): string[] {
  return [...graph.element.querySelectorAll<HTMLElement>('[data-who]')]
    .map((element) => element.getAttribute('data-who') ?? '')
    .sort()
}

function members(graph: GraphInstance<string>, name: string): Key[] {
  return [...graph.states.get(name).nodes]
}

const cursor = ({ id }: { id: string }) => {
  const element = document.createElement('span')
  element.setAttribute('data-who', id)
  return element
}

beforeEach(() => {
  vi.useFakeTimers()
  dom = installDom()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  dom.restore()
  document.body.innerHTML = ''
})

describe('presence when the graph moves to a map and back', () => {
  it('writes the surface, and forgets the pointer of the surface it left', () => {
    const collection = people()
    const fake = fakeMap()
    const graph = mount()
    showPresence(graph, { collection, me: 'me', create })
    expect(collection.get('me')?.surface).toBe('canvas')
    graph.element.querySelector('canvas')?.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 410,
        clientY: 300,
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
      }),
    )
    dom.flushFrames()
    vi.advanceTimersByTime(60)
    expect(collection.get('me')?.pointer).toEqual({ x: 265, y: 250 })
    graph.update({ surface: mapSurface(fake.map) })
    fake.render()
    vi.advanceTimersByTime(60)
    expect(collection.get('me')).toMatchObject({ surface: 'map', pointer: null })
    graph.update({ surface: null })
    vi.advanceTimersByTime(60)
    expect(collection.get('me')?.surface).toBe('canvas')
    graph.destroy()
  })

  it('shows the cursors of the participants on the same surface, and every selection', () => {
    const collection = people([
      row('ana', { pointer: { x: 250, y: 250 }, surface: 'canvas', selection: { nodes: ['a'] } }),
      row('bo', { pointer: { x: 256, y: 256 }, surface: 'map', selection: { nodes: ['b'] } }),
      row('cy', { pointer: { x: 255, y: 255 } }),
    ])
    const fake = fakeMap()
    const graph = mount()
    showPresence(graph, { collection, me: 'me', create, cursor })
    dom.flushFrames()
    expect(who(graph)).toEqual(['ana', 'cy'])
    expect(members(graph, 'presence1')).toEqual(['a'])
    expect(members(graph, 'presence2')).toEqual(['b'])
    const surface = mapSurface(fake.map)
    graph.update({ surface })
    fake.render()
    expect(who(graph)).toEqual(['bo', 'cy'])
    expect(members(graph, 'presence1')).toEqual(['a'])
    expect(members(graph, 'presence2')).toEqual(['b'])
    collection.update('ana', (draft) => {
      draft.surface = 'map'
    })
    dom.flushFrames()
    expect(who(graph)).toEqual(['ana', 'bo', 'cy'])
    surface.release()
    dom.flushFrames()
    expect(who(graph)).toEqual(['cy'])
    graph.update({ surface })
    fake.render()
    fake.map.remove()
    dom.flushFrames()
    expect(graph.store.state.surface).toBe('canvas')
    expect(who(graph)).toEqual(['cy'])
    graph.destroy()
    expect(collection.has('me')).toBe(false)
  })

  it('leaves out the surface of a row that the app made without it', () => {
    const collection = people()
    const fake = fakeMap()
    const graph = mount()
    showPresence(graph, {
      collection,
      me: 'me',
      create: (me, { pointer, selection, time }) => ({ id: me, pointer, selection, time }),
    })
    graph.update({ surface: mapSurface(fake.map) })
    fake.render()
    vi.advanceTimersByTime(60)
    expect(collection.get('me')).not.toHaveProperty('surface')
    graph.destroy()
  })
})
