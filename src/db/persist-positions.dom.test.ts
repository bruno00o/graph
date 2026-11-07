import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Key } from '../types'
import { persistPositions } from './index'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Place {
  readonly id: string
  readonly x: number
  readonly y: number
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
]

let dom: FakeDom
let serial = 0

function itemCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: `items-${serial++}`,
      getKey: (item: Item) => item.id,
      initialData: items,
    }),
  )
}

function mount(collection: ReturnType<typeof itemCollection>) {
  const container = document.createElement('div')
  document.body.append(container)
  return createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes(collection, { x: 'x', y: 'y' })],
        states: { saving: { opacity: 0.5 } },
      }),
      ariaLabel: 'graphe',
    },
    fakeRenderer,
  )
}

function saving(graph: GraphInstance<'saving'>): readonly Key[] {
  return graph.states.get('saving').nodes
}

async function ready(graph: GraphInstance<'saving'>): Promise<void> {
  await vi.waitFor(() => {
    dom.flushFrames()
    expect(graph.positions.get('a')).toBeDefined()
  })
}

function drag(graph: GraphInstance<'saving'>, key: string, dx: number): void {
  const canvas = graph.element.querySelector('canvas')
  const position = graph.positions.get(key)
  if (!canvas || !position) throw new Error('nothing to drag')
  const start = graph.view.toScreen(position)
  const event = (type: string, x: number) =>
    new PointerEvent(type, { clientX: x, clientY: start.y, button: 0, pointerId: 1 })
  canvas.dispatchEvent(event('pointerdown', start.x))
  canvas.dispatchEvent(event('pointermove', start.x + dx / 2))
  canvas.dispatchEvent(event('pointermove', start.x + dx))
  canvas.dispatchEvent(event('pointerup', start.x + dx))
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('persistPositions', () => {
  it('writes dragged positions into the collection at a steady pace', async () => {
    const collection = itemCollection()
    const graph = mount(collection)
    await ready(graph)
    const stop = persistPositions(graph, { collection })
    drag(graph, 'a', 40)
    const dropped = graph.positions.get('a')
    await vi.waitFor(() => expect(collection.get('a')).toMatchObject({ ...dropped }))
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual(dropped)
    stop()
  })

  it('writes the last move when stopped before the pace allows it', async () => {
    const collection = itemCollection()
    const graph = mount(collection)
    await ready(graph)
    const stop = persistPositions(graph, { collection })
    graph.positions.set([['a', { x: 1, y: 2 }]])
    graph.positions.set([['a', { x: 3, y: 4 }]])
    expect(collection.get('a')).toMatchObject({ x: 1, y: 2 })
    stop()
    expect(collection.get('a')).toMatchObject({ x: 3, y: 4 })
  })

  it('persists through paced mutations when given a mutationFn', async () => {
    const collection = itemCollection()
    const graph = mount(collection)
    await ready(graph)
    const mutationFn = vi.fn(async ({ transaction }) => {
      collection.utils.acceptMutations(transaction)
    })
    persistPositions(graph, { collection, mutationFn })
    graph.positions.set([['b', { x: 7, y: 8 }]])
    expect(collection.get('b')).toMatchObject({ x: 7, y: 8 })
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    const [{ transaction }] = mutationFn.mock.calls[0] ?? []
    expect(transaction.mutations[0]).toMatchObject({ type: 'update', key: 'b' })
    expect(transaction.mutations[0].changes).toMatchObject({ x: 7, y: 8 })
  })

  it('inserts rows into a separate positions collection', async () => {
    const graph = mount(itemCollection())
    await ready(graph)
    const places = createCollection(
      localOnlyCollectionOptions({ id: `places-${serial++}`, getKey: (place: Place) => place.id }),
    )
    const stop = persistPositions(graph, {
      collection: places,
      key: String,
      create: (key, point) => ({ id: String(key), ...point }),
    })
    graph.positions.set([['a', { x: 5, y: 6 }]])
    stop()
    expect(places.get('a')).toMatchObject({ id: 'a', x: 5, y: 6 })
  })

  it('holds moved nodes in a state until their paced write is done', async () => {
    const collection = itemCollection()
    const graph = mount(collection)
    await ready(graph)
    const stop = persistPositions(graph, { collection, pendingState: 'saving' })
    graph.positions.set([['a', { x: 1, y: 2 }]])
    graph.positions.set([['b', { x: 3, y: 4 }]])
    expect(saving(graph)).toEqual(['a', 'b'])
    await vi.waitFor(() => expect(saving(graph)).toEqual(['b']))
    stop()
    await vi.waitFor(() => expect(saving(graph)).toEqual([]))
    expect(collection.get('b')).toMatchObject({ x: 3, y: 4 })
  })

  it('holds moved nodes until the mutation is done or has failed', async () => {
    const collection = itemCollection()
    const graph = mount(collection)
    await ready(graph)
    let finish: (failed: boolean) => void = () => {}
    const mutationFn = vi.fn(
      ({ transaction }) =>
        new Promise<void>((resolve, reject) => {
          finish = (failed) => {
            if (failed) reject(new Error('refused'))
            else {
              collection.utils.acceptMutations(transaction)
              resolve()
            }
          }
        }),
    )
    persistPositions(graph, { collection, mutationFn, pendingState: 'saving' })
    graph.positions.set([['a', { x: 7, y: 8 }]])
    expect(saving(graph)).toEqual(['a'])
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    expect(saving(graph)).toEqual(['a'])
    finish(false)
    await vi.waitFor(() => expect(saving(graph)).toEqual([]))
    graph.positions.set([['b', { x: 9, y: 9 }]])
    expect(saving(graph)).toEqual(['b'])
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(2))
    finish(true)
    await vi.waitFor(() => expect(saving(graph)).toEqual([]))
    expect(collection.get('b')).toMatchObject({ x: 100, y: 0 })
  })

  it('refuses a pending state the definition does not declare', async () => {
    const collection = itemCollection()
    const graph = mount(collection)
    const loose: GraphInstance = graph
    expect(() => persistPositions(loose, { collection, pendingState: 'other' })).toThrow(
      'pendingState "other"',
    )
    // @ts-expect-error
    expect(() => persistPositions(graph, { collection, pendingState: 'other' })).toThrow()
  })
})
