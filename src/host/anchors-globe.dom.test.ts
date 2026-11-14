import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { defineGraph } from '../define-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap, globeInput } from '../testing/map'

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
})
