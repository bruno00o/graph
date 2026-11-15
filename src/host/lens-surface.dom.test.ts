import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { mapSurface } from '../map/index'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type { GraphLensEvent } from './events'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 40, y: 20 },
]

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

let dom: FakeDom

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes<Item>(items, { x: 'x', y: 'y' })],
        interaction: { lens: true },
      }),
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    () => fakeRenderer(),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
  document.body.innerHTML = ''
})

describe('the lens when the graph moves to a map and back', () => {
  it('hides on the map and shows again on return', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { map, render } = fakeMap()
    const graph = mount()
    graph.lens.set({ at: { x: 100, y: 50 }, radius: 80, zoom: 2 })
    const shown = graph.lens.get()
    expect(shown).not.toBeNull()
    const seen: GraphLensEvent[] = []
    graph.on('lenschange', (event) => seen.push(event))
    graph.update({ surface: mapSurface(map) })
    render()
    expect(graph.lens.get()).toBeNull()
    expect(graph.store.state.lens).toBeNull()
    expect(seen).toEqual([{ lens: null }])
    graph.lens.set({ radius: 60 })
    expect(graph.lens.get()).toBeNull()
    expect(warn).toHaveBeenCalledWith('graph: the lens does not work on a map')
    graph.update({ surface: null })
    dom.flushFrames()
    expect(graph.lens.get()).toEqual({ ...shown, radius: 60 })
    expect(seen.at(-1)?.lens).toEqual({ ...shown, radius: 60 })
    graph.update({ surface: mapSurface(map) })
    graph.lens.set(null)
    graph.update({ surface: null })
    expect(graph.lens.get()).toBeNull()
    graph.destroy()
  })

  it('shows again when the surface is released or the map removed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    graph.lens.set({ at: { x: 100, y: 50 } })
    const first = fakeMap()
    const surface = mapSurface(first.map)
    graph.update({ surface })
    first.render()
    expect(graph.lens.get()).toBeNull()
    surface.release()
    expect(graph.lens.get()?.at).toEqual({ x: 100, y: 50 })
    const second = fakeMap()
    graph.update({ surface: mapSurface(second.map) })
    second.render()
    expect(graph.lens.get()).toBeNull()
    second.map.remove()
    expect(graph.lens.get()?.at).toEqual({ x: 100, y: 50 })
    graph.update({ surface })
    graph.destroy()
    expect(graph.lens.get()).toBeNull()
  })
})
