import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { defineGraph } from '../define-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type { GraphPositionEvent } from './events'
import { createGraphHost, type GraphInstance } from './mount-graph'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Item {
  readonly id: string
  readonly x?: number
  readonly y?: number
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 80 },
  { id: 'loose' },
]

let dom: FakeDom
let graph: GraphInstance | null = null

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  graph?.destroy()
  graph = null
  dom.restore()
})

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes(items, { x: 'x', y: 'y' })],
        transitions: { positions: 0 },
      }),
      ariaLabel: 'graph',
    },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function at(shown: GraphInstance, key: string) {
  return shown.positions.get(key)
}

describe('positions.reset', () => {
  it('puts every moved node back where its data places it', () => {
    const shown = mount()
    shown.positions.set([
      ['a', { x: 7, y: 9 }],
      ['b', { x: 1, y: 2 }],
    ])
    shown.positions.reset()
    expect(at(shown, 'a')).toEqual({ x: -100, y: 0 })
    expect(at(shown, 'b')).toEqual({ x: 100, y: 0 })
    expect(at(shown, 'c')).toEqual({ x: 0, y: 80 })
  })

  it('puts back only the given keys, ignoring unknown ones', () => {
    const shown = mount()
    shown.positions.set([
      ['a', { x: 7, y: 9 }],
      ['b', { x: 1, y: 2 }],
    ])
    shown.positions.reset(['a', 'nope'])
    expect(at(shown, 'a')).toEqual({ x: -100, y: 0 })
    expect(at(shown, 'b')).toEqual({ x: 1, y: 2 })
  })

  it('leaves a node whose data has no position', () => {
    const shown = mount()
    shown.positions.set([['loose', { x: 40, y: 50 }]])
    shown.positions.reset(['loose'])
    expect(at(shown, 'loose')).toEqual({ x: 40, y: 50 })
  })

  it('emits positionchange for the nodes that moved only', () => {
    const shown = mount()
    shown.positions.set([['a', { x: 7, y: 9 }]])
    const events: GraphPositionEvent[] = []
    shown.on('positionchange', (event) => events.push(event))
    shown.positions.reset()
    expect(events).toHaveLength(1)
    expect(events[0]?.origin).toBe('api')
    expect([...(events[0]?.positions ?? [])]).toEqual([['a', { x: -100, y: 0 }]])
    expect(events[0]?.geo).toBeUndefined()
    shown.positions.reset()
    expect(events).toHaveLength(1)
  })

  it('animates over the duration it is given', () => {
    const shown = mount()
    shown.positions.set([['a', { x: 7, y: 9 }]])
    shown.positions.reset(['a'], { duration: 200 })
    expect(shown.positions.snapshot().get('a')).toEqual({ x: -100, y: 0 })
    expect(at(shown, 'a')).toEqual({ x: 7, y: 9 })
  })

  it('rejects a duration that is not finite', () => {
    const shown = mount()
    expect(() => shown.positions.reset(undefined, { duration: Number.NaN })).toThrow(RangeError)
  })

  it('does nothing once the graph is destroyed', () => {
    const shown = mount()
    shown.destroy()
    expect(() => shown.positions.reset()).not.toThrow()
  })
})

describe('positionchange on a map', () => {
  it('gives the moves in degrees next to the world points', () => {
    const { map } = fakeMap()
    const places = [{ id: 'a', longitude: 2.35, latitude: 48.86 }]
    const shown = mountMapGraph(map, {
      definition: defineGraph({
        marks: [nodes(places, { longitude: 'longitude', latitude: 'latitude' })],
        layout: null,
      }),
      ariaLabel: 'map',
    })
    dom.flushFrames()
    const events: GraphPositionEvent[] = []
    shown.on('positionchange', (event) => events.push(event))
    const target = geoToWorld({ longitude: 13.4, latitude: 52.52 })
    shown.positions.set([['a', target]])
    const geo = events[0]?.geo?.get('a')
    expect(geo?.longitude).toBeCloseTo(13.4, 6)
    expect(geo?.latitude).toBeCloseTo(52.52, 6)
    shown.positions.set([['a', { x: target.x + 512, y: target.y }]])
    expect(events[1]?.geo?.get('a')?.longitude).toBeCloseTo(13.4, 6)
    shown.positions.reset()
    expect(events[2]?.geo?.get('a')?.longitude).toBeCloseTo(2.35, 6)
    expect(events[2]?.geo?.get('a')?.latitude).toBeCloseTo(48.86, 6)
    shown.destroy()
  })
})
