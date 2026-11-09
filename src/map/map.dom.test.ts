import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { defineGraph } from '../define-graph'
import { internalsOf } from '../host/internals'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap, globeInput } from '../testing/map'
import { exportMapPng, mountMapGraph } from '.'

const shared = vi.hoisted(() => ({ made: 0, destroyed: 0 }))

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => {
    shared.made++
    return {
      ...fakeRenderer(),
      destroy: () => {
        shared.destroyed++
      },
    }
  },
}))

interface Place {
  readonly id: string
  readonly longitude: number
  readonly latitude: number
}

interface Route {
  readonly id: string
  readonly from: string
  readonly to: string
}

const places: Place[] = [
  { id: 'a', longitude: 2.35, latitude: 48.86 },
  { id: 'b', longitude: 13.4, latitude: 52.52 },
]
const routes: Route[] = [{ id: 'ab', from: 'a', to: 'b' }]

function definition() {
  return defineGraph({
    marks: [
      edges<Route>(routes, { source: 'from', target: 'to' }),
      nodes<Place>(places, { longitude: 'longitude', latitude: 'latitude', size: () => 20 }),
    ],
    layout: null,
  })
}

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('mountMapGraph', () => {
  it('adds a custom layer, keeps the map flat and gives everything back on destroy', () => {
    const { map, fake, layers, state } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    expect(layers.get('graph')?.type).toBe('custom')
    expect(layers.get('graph')?.renderingMode).toBe('2d')
    expect(fake.dragRotate.enabled).toBe(false)
    expect(fake.touchPitch.enabled).toBe(false)
    expect(state.maxPitch).toBe(0)
    expect(graph.element.parentElement).toBe(map.getContainer())
    graph.destroy()
    expect(layers.size).toBe(0)
    expect(fake.dragRotate.enabled).toBe(true)
    expect(fake.touchPitch.enabled).toBe(true)
    expect(state.maxPitch).toBe(60)
    expect(graph.element.isConnected).toBe(false)
  })

  it('keeps rotation off while another graph still draws on the same map', () => {
    const { map, fake, state } = fakeMap()
    const first = mountMapGraph(map, { definition: definition(), ariaLabel: 'un', id: 'one' })
    const second = mountMapGraph(map, { definition: definition(), ariaLabel: 'deux', id: 'two' })
    first.destroy()
    expect(fake.dragRotate.enabled).toBe(false)
    expect(state.maxPitch).toBe(0)
    second.destroy()
    expect(fake.dragRotate.enabled).toBe(true)
    expect(state.maxPitch).toBe(60)
  })

  it('gives the map canvas its cursor back when destroyed over a node', () => {
    const { map, canvas, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const point = graph.view.toScreen(geoToWorld({ longitude: 2.35, latitude: 48.86 }))
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: point.x,
        clientY: point.y,
        pointerId: 1,
        bubbles: true,
      }),
    )
    expect(canvas.style.cursor).toBe('pointer')
    graph.destroy()
    expect(canvas.style.cursor).toBe('')
  })

  it('adds the layer again when the style changes, until destroy', () => {
    const { map, layers, listeners, emit } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    layers.clear()
    emit('style.load')
    expect(layers.has('graph')).toBe(true)
    graph.destroy()
    emit('style.load')
    emit('data')
    expect(layers.size).toBe(0)
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true)
  })

  it('stays on top when a style object replaces the layers of the basemap', () => {
    const { map, order, setStyle, listeners } = fakeMap(['base', 'labels'])
    shared.made = 0
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    const watching = [...listeners.values()].map((set) => set.size)
    expect(order()).toEqual(['base', 'labels', 'graph'])
    setStyle(['cover'])
    expect(order()).toEqual(['cover', 'graph'])
    setStyle(['cover', 'water', 'roads'])
    expect(order()).toEqual(['cover', 'water', 'roads', 'graph'])
    setStyle(['water', 'cover'], { diff: false })
    expect(order()).toEqual(['water', 'cover', 'graph'])
    expect(shared.made).toBe(2)
    expect([...listeners.values()].map((set) => set.size)).toEqual(watching)
    graph.destroy()
    expect(order()).toEqual(['water', 'cover'])
  })

  it('keeps the layer under beforeId when the style changes', () => {
    const { map, order, setStyle } = fakeMap(['base', 'labels'])
    shared.made = 0
    const graph = mountMapGraph(map, {
      definition: definition(),
      ariaLabel: 'carte',
      beforeId: 'labels',
    })
    expect(order()).toEqual(['base', 'graph', 'labels'])
    setStyle(['base2', 'labels'])
    expect(order()).toEqual(['base2', 'graph', 'labels'])
    setStyle(['cover'])
    expect(order()).toEqual(['cover', 'graph'])
    setStyle(['cover', 'labels'])
    expect(order()).toEqual(['cover', 'graph', 'labels'])
    setStyle(['water', 'labels'], { diff: false })
    expect(order()).toEqual(['water', 'graph', 'labels'])
    expect(shared.made).toBe(2)
    graph.destroy()
  })

  it('leaves the layer where it is when a style change keeps the order', () => {
    const { map, order, setStyle } = fakeMap(['base', 'labels'])
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    const moves = vi.spyOn(map, 'moveLayer')
    setStyle(['base', 'labels', 'extra'])
    setStyle(['base', 'labels'])
    expect(order()).toEqual(['base', 'labels', 'graph'])
    expect(moves).toHaveBeenCalledTimes(1)
    graph.destroy()
  })

  it('survives a lost context after a style change', () => {
    const { map, order, setStyle, emit } = fakeMap(['base'])
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    setStyle(['cover'])
    emit('webglcontextlost')
    emit('webglcontextrestored')
    expect(order()).toEqual(['cover', 'graph'])
    setStyle(['water', 'roads'])
    expect(order()).toEqual(['water', 'roads', 'graph'])
    graph.destroy()
  })

  it('draws again with a new renderer once the map restores a lost context', () => {
    const { map, layers, emit } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    const made = shared.made
    const destroyed = shared.destroyed
    emit('webglcontextlost')
    expect(shared.destroyed).toBe(destroyed + 1)
    layers.clear()
    emit('webglcontextrestored')
    expect(layers.has('graph')).toBe(true)
    expect(shared.made).toBe(made + 1)
    emit('webglcontextlost')
    emit('webglcontextrestored')
    expect(shared.made).toBe(made + 2)
    graph.destroy()
    emit('webglcontextrestored')
    expect(layers.size).toBe(0)
  })

  it('fills containers translucent by default, and as asked with fillOpacity', () => {
    const { map, render } = fakeMap()
    type Member = Place & { readonly parent?: string }
    const members: Member[] = [
      { id: 'g', longitude: 0, latitude: 0 },
      ...places.map((place) => ({ ...place, parent: 'g' })),
    ]
    const look = (fillOpacity?: number) =>
      defineGraph({
        marks: [
          nodes<Member>(members, {
            longitude: 'longitude',
            latitude: 'latitude',
            parent: 'parent',
            container: { fillOpacity },
          }),
        ],
        layout: null,
      })
    const graph = mountMapGraph(map, { definition: look(), ariaLabel: 'carte' })
    render()
    const { scene } = internalsOf(graph, 'test')
    const fill = () => scene.palette.colors[scene.nodes.fill[scene.nodes.keys.indexOf('g')] ?? -1]
    expect(fill()).toMatch(/^color-mix\(in srgb, var\(--graph-group-fill\) \d+%, transparent\)$/)
    graph.update({ definition: look(1) })
    render()
    expect(fill()).toBe('var(--graph-group-fill)')
    graph.destroy()
  })

  it('follows the map camera in Web Mercator', () => {
    const { map, camera, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    const seen: number[] = []
    graph.on('viewchange', ({ view }) => seen.push(view.zoom))
    camera.lng = 13.4
    camera.lat = 52.52
    camera.zoom = 6
    render()
    const center = geoToWorld({ longitude: 13.4, latitude: 52.52 })
    expect(graph.view.get()).toEqual({ x: center.x, y: center.y, zoom: 64 })
    expect(seen).toEqual([64])
    const node = graph.view.toScreen(center)
    expect(node.x).toBeCloseTo(400)
    expect(node.y).toBeCloseTo(300)
    graph.destroy()
  })

  it('moves the map for view calls, after the frame', async () => {
    const { map, state, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const repaints = state.repaints
    graph.view.zoomBy(2)
    expect(state.repaints).toBeGreaterThan(repaints)
    expect(state.jumps).toEqual([])
    render()
    expect(state.jumps).toEqual([])
    await Promise.resolve()
    expect(state.jumps).toHaveLength(1)
    expect(state.jumps[0]?.zoom).toBeCloseTo(5)
    expect(state.jumps[0]?.center[0]).toBeCloseTo(2.35)
    expect(state.jumps[0]?.center[1]).toBeCloseTo(48.86)
    render()
    expect(graph.view.get().zoom).toBeCloseTo(32)
    graph.destroy()
  })

  it('ignores a view given to update', () => {
    const { map, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const before = graph.view.get()
    graph.update({ view: { x: 0, y: 0, zoom: 1 } })
    render()
    expect(graph.view.get()).toEqual(before)
    graph.destroy()
  })

  it('takes the drag from the map while a node moves', () => {
    const { map, fake, canvas, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const point = graph.view.toScreen(geoToWorld({ longitude: 2.35, latitude: 48.86 }))
    const event = { clientX: point.x, clientY: point.y, button: 0, pointerId: 1, bubbles: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', event))
    expect(fake.dragPan.enabled).toBe(false)
    expect(fake.boxZoom.enabled).toBe(false)
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...event, clientX: point.x + 40 }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...event, clientX: point.x + 40 }))
    expect(fake.dragPan.enabled).toBe(true)
    expect(fake.boxZoom.enabled).toBe(true)
    graph.destroy()
  })

  it('leaves the background drag to the map', () => {
    const { map, fake, canvas, render, state } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const before = graph.view.get()
    const event = { clientX: 700, clientY: 500, button: 0, pointerId: 1, bubbles: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', event))
    expect(fake.dragPan.enabled).toBe(true)
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...event, clientX: 600 }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...event, clientX: 600 }))
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 300, bubbles: true }))
    render()
    expect(graph.view.get()).toEqual(before)
    expect(state.jumps).toEqual([])
    graph.destroy()
  })

  it('schedules its frames on the map instead of its own loop', () => {
    const { map, state, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    dom.flushFrames()
    const repaints = state.repaints
    graph.selection.set({ nodes: ['a'] })
    expect(state.repaints).toBe(repaints + 1)
    expect(dom.pendingFrames()).toBe(0)
    graph.destroy()
  })

  it('draws and picks on the globe, never behind it', () => {
    const { map, camera, render } = fakeMap()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const far: Place = { id: 'c', longitude: 110, latitude: 10 }
    const graph = mountMapGraph(map, {
      definition: defineGraph({
        marks: [
          nodes<Place>([...places, far], {
            longitude: 'longitude',
            latitude: 'latitude',
            size: () => 20,
          }),
        ],
        layout: null,
      }),
      ariaLabel: 'carte',
    })
    camera.zoom = 2
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    const paris = graph.view.toScreen(geoToWorld(places[0] ?? far))
    expect(paris.x).toBeCloseTo(400)
    expect(paris.y).toBeCloseTo(300)
    const berlin = graph.view.toScreen(geoToWorld(places[1] ?? far))
    expect(graph.pick(berlin)?.key).toBe('b')
    const back = graph.view.toWorld(berlin)
    expect(back.x).toBeCloseTo(geoToWorld(places[1] ?? far).x, 6)
    const hidden = graph.view.toScreen(geoToWorld(far))
    expect(graph.pick(hidden)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    graph.destroy()
  })

  it('turns layouts down on a map', async () => {
    const { map } = fakeMap()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mountMapGraph(map, {
      definition: defineGraph({
        marks: definition().marks,
        layout: { name: 'still', options: {}, start: () => ({ stop: () => {}, pin: () => {} }) },
      }),
      ariaLabel: 'carte',
    })
    expect(warn).toHaveBeenCalledTimes(1)
    await expect(graph.layout.run()).rejects.toThrow('graph: layouts do not run on a map')
    graph.destroy()
  })

  it('keeps nodes exact far from where the map started', () => {
    const { map, fake, camera, render, canvas } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    camera.lng = 13.4
    camera.lat = 52.52
    camera.zoom = 21
    render()
    const hover = (x: number) =>
      canvas.dispatchEvent(
        new PointerEvent('pointermove', { clientX: x, clientY: 300, pointerId: 1, bubbles: true }),
      )
    hover(400)
    expect(graph.store.get().hovered?.key).toBe('b')
    expect(fake.doubleClickZoom.enabled).toBe(false)
    hover(412)
    expect(graph.store.get().hovered).toBeNull()
    expect(fake.doubleClickZoom.enabled).toBe(true)
    graph.destroy()
  })

  it('resolves drawn after the map draws the layer', async () => {
    const { map, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    let drawn = false
    void graph.drawn().then(() => {
      drawn = true
    })
    dom.flushFrames()
    await Promise.resolve()
    expect(drawn).toBe(false)
    render()
    await Promise.resolve()
    expect(drawn).toBe(true)
    graph.destroy()
  })

  it('leaves the map alone with an aborted signal, and gives it back when the signal aborts', async () => {
    const { map, fake, layers, state } = fakeMap()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stillborn = mountMapGraph(map, {
      definition: definition(),
      ariaLabel: 'carte',
      signal: AbortSignal.abort(),
    })
    expect(stillborn.destroyed).toBe(true)
    expect(layers.size).toBe(0)
    expect(fake.dragRotate.enabled).toBe(true)
    expect(state.maxPitch).toBe(60)
    await expect(exportMapPng(stillborn)).rejects.toThrow('graph: cannot export a destroyed graph')
    const controller = new AbortController()
    const graph = mountMapGraph(map, {
      definition: definition(),
      ariaLabel: 'carte',
      signal: controller.signal,
    })
    expect(layers.has('graph')).toBe(true)
    controller.abort()
    expect(graph.destroyed).toBe(true)
    expect(layers.size).toBe(0)
    expect(fake.dragRotate.enabled).toBe(true)
    await expect(exportMapPng(graph)).rejects.toThrow('graph: cannot export a destroyed graph')
  })
})
