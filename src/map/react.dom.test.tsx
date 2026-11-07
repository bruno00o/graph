import { act, type JSX, type ReactNode, StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import type { GraphInstance } from '../host/mount-graph'
import type { LegendState } from '../legend/index'
import { nodes } from '../marks'
import { Anchor, Legend, Timeline, useGraph, useGraphState, useLegend } from '../react/index'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { type FakeMap, fakeMap } from '../testing/map'
import type { NodeMark } from '../types'
import { MapGraph, type MapGraphProps } from './react'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Place {
  readonly id: string
  readonly longitude: number
  readonly latitude: number
  readonly group: string
  readonly since: number
}

const places: Place[] = [
  { id: 'a', longitude: 2.35, latitude: 48.86, group: 'north', since: 0 },
  { id: 'b', longitude: 13.4, latitude: 52.52, group: 'south', since: 10 },
]

const definition = defineGraph({
  marks: [
    nodes(places, {
      name: 'places',
      longitude: 'longitude',
      latitude: 'latitude',
      color: 'group',
      size: 20,
      time: (place) => place.since,
    }),
  ],
  states: { match: {} },
  layout: null,
})

type Marks = NodeMark<Place, 'places'>

let dom: FakeDom
let root: Root
let container: HTMLElement
let graph: GraphInstance<'match', Marks> | null = null
let width = -1
let legend: LegendState | null = null
let selections: unknown[] = []

function Inside(): JSX.Element {
  const inside = useGraph<'match', Marks>()
  width = useGraphState((state) => state.width)
  legend = useLegend({ highlight: 'match' }).state
  expectTypeOf(inside).toEqualTypeOf<GraphInstance<'match', Marks>>()
  return (
    <Anchor node="a">
      <span data-pinned="">a</span>
    </Anchor>
  )
}

function Scene({ map, children }: { readonly map: FakeMap; readonly children?: ReactNode }) {
  return (
    <MapGraph
      map={map.map}
      definition={definition}
      ariaLabel="carte"
      onSelectionChange={({ selection }) => selections.push(selection)}
      ref={(instance) => {
        graph = instance
      }}
    >
      <Inside />
      {children}
    </MapGraph>
  )
}

function render(element: ReactNode): void {
  act(() => {
    root.render(element)
  })
  act(() => {
    dom.flushFrames()
    vi.runOnlyPendingTimers()
  })
}

beforeEach(() => {
  dom = installDom()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  graph = null
  width = -1
  legend = null
  selections = []
})

afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
  dom.restore()
})

describe('MapGraph', () => {
  it('mounts one graph in the map under StrictMode, with the context of <Graph>', () => {
    const map = fakeMap()
    render(
      <StrictMode>
        <Scene map={map} />
      </StrictMode>,
    )
    map.render()
    act(() => {
      dom.flushFrames()
      vi.runOnlyPendingTimers()
    })
    expect(map.layers.size).toBe(1)
    expect(map.map.getContainer().querySelectorAll('[data-graph]')).toHaveLength(1)
    expect(graph?.destroyed).toBe(false)
    expect(width).toBe(800)
    expect(legend?.color?.type).toBe('categories')
    expect(graph?.element.querySelector('[data-pinned]')).not.toBeNull()
    act(() => graph?.selection.set({ nodes: ['a'] }))
    expect(selections).toEqual([{ nodes: ['a'], edges: [] }])
  })

  it('mounts again on another map, and leaves the map on unmount', () => {
    const first = fakeMap()
    const second = fakeMap()
    render(<Scene map={first} />)
    const before = graph
    render(<Scene map={second} />)
    expect(before?.destroyed).toBe(true)
    expect(first.layers.size).toBe(0)
    expect(second.layers.size).toBe(1)
    act(() => root.render(null))
    expect(second.layers.size).toBe(0)
    expect(graph).toBeNull()
  })

  it('lends its graph to a timeline and a legend outside it', () => {
    const map = fakeMap()
    function Beside() {
      const [shown, setShown] = useState<GraphInstance<'match', Marks> | null>(null)
      const kept = useRef(setShown)
      return (
        <>
          <MapGraph map={map.map} definition={definition} ariaLabel="carte" ref={kept.current} />
          {shown ? <Timeline graph={shown} /> : null}
          {shown ? <Legend graph={shown} highlight="match" /> : null}
        </>
      )
    }
    render(<Beside />)
    expect(container.querySelectorAll('[data-graph-timeline]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-graph-legend]')).toHaveLength(1)
  })

  it('is destroyed before a map removed in a passive effect', () => {
    const order: string[] = []
    function Owner() {
      const [shown, setShown] = useState<FakeMap | null>(null)
      useEffect(() => {
        const made = fakeMap()
        const removeLayer = made.map.removeLayer.bind(made.map)
        Object.assign(made.map, {
          removeLayer: (id: string) => {
            order.push('layer')
            return removeLayer(id)
          },
          remove: () => order.push('map'),
        })
        setShown(made)
        return () => made.map.remove()
      }, [])
      return shown ? <MapGraph map={shown.map} definition={definition} ariaLabel="carte" /> : null
    }
    render(<Owner />)
    act(() => root.render(null))
    expect(order).toEqual(['layer', 'map'])
  })

  it('takes the props of <Graph> without the view', () => {
    expectTypeOf<MapGraphProps>().not.toHaveProperty('view')
    expectTypeOf<MapGraphProps>().not.toHaveProperty('initialView')
    expectTypeOf<MapGraphProps>().not.toHaveProperty('onViewChange')
    expectTypeOf<MapGraphProps>().toHaveProperty('onSelectionChange')
    expectTypeOf<MapGraphProps>().toHaveProperty('beforeId')
  })
})
