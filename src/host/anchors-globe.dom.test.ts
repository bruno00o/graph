import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { globeScale } from '../core/globe'
import { defineGraph } from '../define-graph'
import { mountMapGraph } from '../map'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { globeCamera } from '../testing/globe'
import { fakeMap, flatInput, globeInput } from '../testing/map'
import type { Point } from '../types'
import type { GraphAnchors } from './anchors'
import { internalsOf } from './internals'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

const place = [{ id: 'a', lng: 2.35, lat: 48.86 }]

interface Spot {
  readonly id: string
  readonly lng: number
  readonly lat: number
  readonly screen?: boolean
}

const spots: Spot[] = [
  { id: 'a', lng: 8, lat: 51 },
  { id: 'b', lng: 11, lat: 49 },
  { id: 'c', lng: -3, lat: 46, screen: true },
  { id: 'far', lng: -170, lat: -40 },
]

const links = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'gone', from: 'a', to: 'far' },
]

function mount(mix = 1) {
  const fake = fakeMap()
  const graph = mountMapGraph(fake.map, {
    definition: defineGraph({
      marks: [
        edges(links, { source: 'from', target: 'to' }),
        nodes(
          spots.filter((spot) => !spot.screen),
          { name: 'world', longitude: 'lng', latitude: 'lat', size: 1.5, units: 'world' },
        ),
        nodes(
          spots.filter((spot) => spot.screen),
          { name: 'screen', longitude: 'lng', latitude: 'lat', size: 20, units: 'screen' },
        ),
      ],
      states: { marked: {} },
      layout: null,
    }),
    ariaLabel: 'map',
  })
  const { camera } = fake
  const input = () => globeInput(camera.lng, camera.lat, camera.zoom, mix)
  fake.render(input())
  const shot = globeCamera({
    longitude: camera.lng,
    latitude: camera.lat,
    zoom: camera.zoom,
    width: 800,
    height: 600,
    mix,
  })
  return { fake, graph, input, shot }
}

function anchored(graph: { readonly anchors: GraphAnchors }, options: object): HTMLElement {
  const element = document.createElement('div')
  graph.anchors.set(element, options as never)
  return element.parentElement as HTMLElement
}

function translated(x: number, y: number): string {
  return `translate(${Math.round(x)}px,${Math.round(y)}px)`
}

function worldOf(spot: Spot): Point {
  return geoToWorld({ longitude: spot.lng, latitude: spot.lat })
}

describe('anchors on a point of the world', () => {
  it('follow the globe, and hide behind its horizon', () => {
    const { map, render, camera } = fakeMap()
    const graph = mountMapGraph(map, {
      definition: defineGraph({
        marks: [nodes(place, { longitude: 'lng', latitude: 'lat' })],
        layout: null,
      }),
      ariaLabel: 'map',
    })
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    const near = geoToWorld({ longitude: 10, latitude: 40 })
    const far = geoToWorld({ longitude: -170, latitude: -40 })
    const front = document.createElement('div')
    const back = document.createElement('div')
    graph.anchors.set(front, { point: near })
    graph.anchors.set(back, { point: far })
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    const wrapper = front.parentElement as HTMLElement
    const target = graph.view.toScreen(near)
    expect(wrapper.style.visibility).toBe('')
    expect(wrapper.style.transform).toBe(
      `translate(${Math.round(target.x)}px,${Math.round(target.y)}px)`,
    )
    expect((back.parentElement as HTMLElement).style.visibility).toBe('hidden')
    graph.destroy()
  })

  it('scales with the globe at the point', () => {
    const { graph, fake, input, shot } = mount()
    const point = worldOf(spots[0] as Spot)
    const wrapper = anchored(graph, { point, scale: true })
    fake.render(input())
    const target = graph.view.toScreen(point)
    expect(wrapper.style.transform).toBe(
      `${translated(target.x, target.y)} scale(${globeScale(shot, point.y)})`,
    )
    expect(globeScale(shot, point.y)).not.toBeCloseTo(graph.view.get().zoom, 1)
    graph.destroy()
  })
})

describe.each([
  ['the globe', 1],
  ['the move from the globe to the flat map', 0.5],
])('anchors on nodes and edges on %s', (_, mix) => {
  it('sit on the drawn node, with its radius at the node', () => {
    const { graph, fake, input, shot } = mount(mix)
    const spot = spots[0] as Spot
    const right = anchored(graph, { node: 'a', side: 'right' })
    const below = anchored(graph, { node: 'a', side: 'bottom' })
    fake.render(input())
    const world = worldOf(spot)
    const center = graph.view.toScreen(world)
    const radius = 0.75 * globeScale(shot, world.y)
    expect(right.style.visibility).toBe('')
    expect(right.style.transform).toBe(translated(center.x + radius + 4, center.y))
    expect(below.style.transform).toBe(translated(center.x, center.y + radius + 4))
    graph.destroy()
  })

  it('keep a radius in pixels for nodes in screen units', () => {
    const { graph, fake, input } = mount(mix)
    const wrapper = anchored(graph, { node: 'c', side: 'top' })
    fake.render(input())
    const center = graph.view.toScreen(worldOf(spots[2] as Spot))
    expect(wrapper.style.transform).toBe(translated(center.x, center.y - 10 - 4))
    graph.destroy()
  })

  it('frame several nodes, or the nodes of a state, on their drawn boxes', () => {
    const { graph, fake, input, shot } = mount(mix)
    const group = anchored(graph, { nodes: ['a', 'b', 'c'], side: 'left', align: 'start' })
    const state = anchored(graph, { state: 'marked', side: 'top', align: 'end' })
    graph.states.set('marked', { nodes: ['a', 'b'] })
    fake.render(input())
    const boxes = (['a', 'b', 'c'] as const).map((id) => {
      const spot = spots.find((each) => each.id === id) as Spot
      const world = worldOf(spot)
      const center = graph.view.toScreen(world)
      const radius = spot.screen ? 10 : 0.75 * globeScale(shot, world.y)
      return [center.x - radius, center.y - radius, center.x + radius, center.y + radius]
    })
    const [a, b, c] = boxes as [number[], number[], number[]]
    const left = Math.min(a[0] ?? 0, b[0] ?? 0, c[0] ?? 0)
    const top = Math.min(a[1] ?? 0, b[1] ?? 0, c[1] ?? 0)
    expect(group.style.transform).toBe(translated(left - 4, top))
    const right = Math.max(a[2] ?? 0, b[2] ?? 0)
    const above = Math.min(a[1] ?? 0, b[1] ?? 0)
    expect(state.style.transform).toBe(translated(right, above - 4))
    graph.destroy()
  })

  it('sit on the middle of an edge between its drawn nodes', () => {
    const { graph, fake, input } = mount(mix)
    const wrapper = anchored(graph, { edge: 'ab' })
    fake.render(input())
    const from = graph.view.toScreen(worldOf(spots[0] as Spot))
    const to = graph.view.toScreen(worldOf(spots[1] as Spot))
    const flat = graph.view.get()
    const flatFrom = (worldOf(spots[0] as Spot).x - flat.x) * flat.zoom
    expect(Math.abs(from.x - (flatFrom + 400))).toBeGreaterThan(1)
    expect(wrapper.style.visibility).toBe('')
    const [x, y] = /translate\((-?[\d.]+)px,(-?[\d.]+)px\)/
      .exec(wrapper.style.transform)
      ?.slice(1)
      .map(Number) ?? [Number.NaN, Number.NaN]
    expect(x).toBeCloseTo((from.x + to.x) / 2, -0.5)
    expect(y).toBeCloseTo((from.y + to.y) / 2, -0.5)
    graph.destroy()
  })

  it('hide when their target is behind the horizon', () => {
    const { graph, fake, input } = mount(mix)
    const node = anchored(graph, { node: 'far' })
    const edge = anchored(graph, { edge: 'gone' })
    const both = anchored(graph, { nodes: ['far'] })
    const shown = anchored(graph, { node: 'a' })
    fake.render(input())
    expect(node.style.visibility).toBe('hidden')
    expect(edge.style.visibility).toBe('hidden')
    expect(both.style.visibility).toBe('hidden')
    expect(shown.style.visibility).toBe('')
    graph.destroy()
  })
})

describe('anchors on a container on the globe', () => {
  it('frame the box that faces the screen, scaled at its center', () => {
    const fake = fakeMap()
    interface Member {
      readonly id: string
      readonly lng: number
      readonly lat: number
      readonly parent?: string
    }
    const members: Member[] = [
      { id: 'g', lng: 0, lat: 0 },
      { id: 'a', lng: 6, lat: 50, parent: 'g' },
      { id: 'b', lng: 9, lat: 47, parent: 'g' },
    ]
    const graph = mountMapGraph(fake.map, {
      definition: defineGraph({
        marks: [nodes(members, { longitude: 'lng', latitude: 'lat', parent: 'parent' })],
        layout: null,
      }),
      ariaLabel: 'map',
    })
    const { camera } = fake
    const input = globeInput(camera.lng, camera.lat, camera.zoom)
    fake.render(input)
    const wrapper = anchored(graph, { node: 'g', side: 'right' })
    fake.render(input)
    const internals = internalsOf(graph, 'test')
    const index = internals.scene.nodes.keys.indexOf('g')
    const boxes = internals.containers()?.boxes
    const center = graph.positions.get('g') as Point
    const shot = globeCamera({
      ...camera,
      longitude: camera.lng,
      latitude: camera.lat,
      width: 800,
      height: 600,
    })
    const screen = graph.view.toScreen(center)
    const half = (boxes?.[index * 4] ?? 0) * globeScale(shot, center.y)
    expect(half).toBeGreaterThan(10)
    expect(wrapper.style.transform).toBe(translated(screen.x + half + 4, screen.y))
    graph.destroy()
  })
})

describe('anchors on a flat map', () => {
  it('keep the flat formula', () => {
    const { graph, fake } = mount()
    const right = anchored(graph, { node: 'a', side: 'right' })
    fake.render(flatInput)
    const view = graph.view.get()
    const world = worldOf(spots[0] as Spot)
    const center = graph.view.toScreen(world)
    expect(center.x).toBeCloseTo((world.x - view.x) * view.zoom + 400, 6)
    expect(right.style.transform).toBe(translated(center.x + 0.75 * view.zoom + 4, center.y))
    graph.destroy()
  })
})
