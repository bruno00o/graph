import { act, type JSX, StrictMode, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { defineGraph } from '../define-graph'
import type { GraphSurfaceEvent } from '../host/events'
import { type GraphInstance, type GraphSurface, mountGraph } from '../host/mount-graph'
import { grid } from '../layouts'
import { edges, nodes } from '../marks'
import { Graph, type GraphProps, useGraphState } from '../react/index'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { type FakeMap, fakeMap } from '../testing/map'
import { type MapGraphProps, useMapSurface } from './react'

const made = vi.hoisted(() => ({ own: 0, shared: 0 }))

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => {
    made.own++
    return fakeRenderer()
  },
  createSharedRenderer: () => {
    made.shared++
    return fakeRenderer()
  },
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Place {
  readonly id: string
  readonly longitude: number
  readonly latitude: number
}

const places: Place[] = [
  { id: 'a', longitude: 2.35, latitude: 48.86 },
  { id: 'b', longitude: 13.4, latitude: 52.52 },
  { id: 'c', longitude: -3.7, latitude: 40.42 },
]
const links = [{ id: 'ab', from: 'a', to: 'b' }]

const plain = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(places, { name: 'places', size: 12 }),
  ],
  layout: grid(),
})

const onMap = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(places, { name: 'places', size: 12, longitude: 'longitude', latitude: 'latitude' }),
  ],
  layout: null,
})

const paris = geoToWorld({ longitude: 2.35, latitude: 48.86 })

let dom: FakeDom
let root: Root
let container: HTMLElement
let graph: GraphInstance | null = null
let shown: string | undefined
let mounts = 0
let events: GraphSurfaceEvent[] = []

function Child(): null {
  shown = useGraphState((state) => state.surface)
  useEffect(() => {
    mounts++
  }, [])
  return null
}

interface SwitchProps {
  readonly map: FakeMap | null
  readonly onTheMap: boolean
  readonly beforeId?: string
}

function Switch({ map, onTheMap, beforeId }: SwitchProps): JSX.Element {
  const surface = useMapSurface(map?.map, { beforeId })
  const there = onTheMap && surface !== null
  return (
    <Graph
      definition={there ? onMap : plain}
      surface={there ? surface : null}
      ariaLabel="places"
      style={{ width: 800, height: 600 }}
      onSurfaceChange={(event) => events.push(event)}
      ref={(instance) => {
        graph = instance
      }}
    >
      <Child />
    </Graph>
  )
}

function render(element: JSX.Element): void {
  act(() => {
    root.render(element)
  })
  flush()
}

function flush(): void {
  act(() => {
    dom.flushFrames()
    vi.runOnlyPendingTimers()
  })
}

function current(): GraphInstance {
  if (!graph) throw new Error('no graph')
  return graph
}

beforeEach(() => {
  dom = installDom()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  graph = null
  shown = undefined
  mounts = 0
  events = []
  made.own = 0
  made.shared = 0
})

afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
  dom.restore()
  document.body.innerHTML = ''
})

describe('<Graph surface>', () => {
  it('moves one graph onto a map and back by prop, with its children kept', () => {
    const map = fakeMap()
    render(<Switch map={map} onTheMap={false} />)
    const first = current()
    expect(shown).toBe('canvas')
    act(() => first.selection.set({ nodes: ['a'] }))
    render(<Switch map={map} onTheMap />)
    map.render()
    expect(current()).toBe(first)
    expect(shown).toBe('map')
    expect(first.drawsOnMap).toBe(true)
    expect(first.element.previousElementSibling).toBe(map.map.getCanvasContainer())
    expect(map.layers.size).toBe(1)
    expect(first.positions.get('a')?.x).toBeCloseTo(paris.x)
    expect(first.selection.get().nodes).toEqual(['a'])
    render(<Switch map={map} onTheMap={false} />)
    expect(current()).toBe(first)
    expect(shown).toBe('canvas')
    expect(first.drawsOnMap).toBe(false)
    expect(container.contains(first.element)).toBe(true)
    expect(mounts).toBe(1)
    expect(events.map((event) => event.surface)).toEqual(['map', 'canvas'])
    expect(made.own).toBe(1)
    expect(made.shared).toBe(1)
  })

  it('applies the definition and the surface in one update, without a layout run', async () => {
    const map = fakeMap()
    render(<Switch map={map} onTheMap={false} />)
    await act(async () => {
      await Promise.resolve()
    })
    flush()
    const first = current()
    expect(first.store.state.layout.running).toBe(false)
    const update = vi.spyOn(first, 'update')
    const runs: string[] = []
    first.on('layoutstart', () => runs.push('start'))
    render(<Switch map={map} onTheMap />)
    expect(update.mock.calls.filter(([options]) => 'definition' in options)).toEqual([
      [{ definition: onMap, surface: expect.anything() }],
    ])
    render(<Switch map={map} onTheMap={false} />)
    expect(update.mock.calls.filter(([options]) => 'definition' in options)).toHaveLength(2)
    expect(update.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ definition: plain, surface: null }),
    )
    expect(runs).toEqual([])
  })

  it('mounts straight on the map under StrictMode, without a canvas renderer', () => {
    const map = fakeMap()
    render(
      <StrictMode>
        <Switch map={map} onTheMap />
      </StrictMode>,
    )
    map.render()
    flush()
    expect(shown).toBe('map')
    expect(current().destroyed).toBe(false)
    expect(map.layers.size).toBe(1)
    expect(map.map.getContainer().querySelectorAll('[data-graph]')).toHaveLength(1)
    expect(made.own).toBe(0)
    render(
      <StrictMode>
        <Switch map={map} onTheMap={false} />
      </StrictMode>,
    )
    expect(shown).toBe('canvas')
    expect(container.querySelectorAll('[data-graph]')).toHaveLength(1)
  })

  it('takes the surface once the map exists', () => {
    const map = fakeMap()
    render(<Switch map={null} onTheMap />)
    const first = current()
    expect(shown).toBe('canvas')
    render(<Switch map={map} onTheMap />)
    expect(current()).toBe(first)
    expect(shown).toBe('map')
  })

  it('leaves the map and gives back its controls when unmounted on it', () => {
    const map = fakeMap()
    render(<Switch map={map} onTheMap />)
    const first = current()
    expect(map.fake.dragRotate.enabled).toBe(false)
    act(() => root.render(<div />))
    expect(first.destroyed).toBe(true)
    expect(map.layers.size).toBe(0)
    expect(map.fake.dragRotate.enabled).toBe(true)
    expect(map.map.getContainer().querySelector('[data-graph]')).toBeNull()
  })

  it('goes back to its canvas when the map is removed first, and stays usable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const map = fakeMap()
    render(<Switch map={map} onTheMap />)
    const first = current()
    act(() => map.map.remove())
    flush()
    expect(shown).toBe('canvas')
    expect(container.contains(first.element)).toBe(true)
    expect(warn).toHaveBeenCalled()
    render(<Switch map={null} onTheMap />)
    render(<Switch map={null} onTheMap={false} />)
    expect(current()).toBe(first)
    expect(first.destroyed).toBe(false)
    expect(shown).toBe('canvas')
  })

  it('keeps the canvas when the definition changes after the map went away', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const map = fakeMap()
    function Kept({ definition }: { readonly definition: GraphProps['definition'] }) {
      const surface = useMapSurface(map.map)
      return (
        <Graph
          definition={definition}
          surface={surface}
          ariaLabel="places"
          ref={(instance) => {
            graph = instance
          }}
        />
      )
    }
    render(<Kept definition={onMap} />)
    expect(current().store.state.surface).toBe('map')
    act(() => map.map.remove())
    render(<Kept definition={plain} />)
    expect(current().store.state.surface).toBe('canvas')
    expect(current().destroyed).toBe(false)
  })
})

describe('useMapSurface', () => {
  it('releases its surface on unmount, and returns null without a map', () => {
    const map = fakeMap()
    const seen: (GraphSurface | null)[] = []
    function Holder({ given }: { readonly given: FakeMap | null }) {
      seen.push(useMapSurface(given?.map))
      return null
    }
    render(<Holder given={null} />)
    expect(seen.at(-1)).toBeNull()
    render(<Holder given={map} />)
    const surface = seen.at(-1)
    expect(surface?.name).toBe('map')
    render(<Holder given={map} />)
    expect(seen.at(-1)).toBe(surface)
    const mapped = mountGraph(document.createElement('div'), {
      definition: onMap,
      ariaLabel: 'places',
      surface,
    })
    expect(mapped.store.state.surface).toBe('map')
    act(() => root.render(<div />))
    expect(mapped.store.state.surface).toBe('canvas')
    expect(map.layers.size).toBe(0)
    mapped.destroy()
  })

  it('moves the graph to a new surface when beforeId changes, with one layer on the map', () => {
    const map = fakeMap(['labels', 'roads'])
    render(<Switch map={map} onTheMap beforeId="roads" />)
    const first = current()
    expect(map.order()).toEqual(['labels', 'graph', 'roads'])
    render(<Switch map={map} onTheMap beforeId="labels" />)
    expect(current()).toBe(first)
    expect(shown).toBe('map')
    expect(map.layers.size).toBe(1)
    expect(map.order()).toEqual(['graph', 'labels', 'roads'])
    expect(made.own).toBe(0)
    map.render()
    flush()
    expect(first.destroyed).toBe(false)
  })

  it('is typed for the surface prop of <Graph>', () => {
    expectTypeOf(useMapSurface).returns.toEqualTypeOf<GraphSurface | null>()
    expectTypeOf<GraphProps['surface']>().toEqualTypeOf<GraphSurface | null | undefined>()
    expectTypeOf<MapGraphProps>().not.toHaveProperty('surface')
    expectTypeOf(useMapSurface).parameter(0).not.toEqualTypeOf<object>()
  })
})
