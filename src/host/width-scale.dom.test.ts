import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { ShapeGeometry, WidthScale } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -800, y: 0 },
  { id: 'b', x: 800, y: 0 },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

function mount(widthScale: WidthScale, zoom: number): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to', width: 20, widthScale }),
          nodes<Item>(items, { x: 'x', y: 'y', size: 4, units: 'screen' }),
        ],
      }),
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom },
    },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

describe('widthScale', () => {
  it('picks a shrinking edge on its drawn width', () => {
    const screen = mount('screen', 0.25)
    const shrink = mount('shrink', 0.25)
    expect(screen.pick({ x: 400, y: 308 })?.key).toBe('ab')
    expect(shrink.pick({ x: 400, y: 308 })).toBeNull()
    expect(shrink.pick({ x: 400, y: 305 })?.key).toBe('ab')
    shrink.view.set({ x: 0, y: 0, zoom: 1 }, { duration: 0 })
    dom.flushFrames()
    expect(shrink.pick({ x: 400, y: 308 })?.key).toBe('ab')
  })

  it('follows a width scale changed by update', () => {
    const graph = mount('screen', 0.25)
    expect(graph.pick({ x: 400, y: 308 })?.key).toBe('ab')
    graph.update({
      definition: defineGraph({
        marks: [
          edges<Link>(links, {
            source: 'from',
            target: 'to',
            width: 20,
            widthScale: 'shrink',
            minWidth: 12,
          }),
          nodes<Item>(items, { x: 'x', y: 'y', size: 4, units: 'screen' }),
        ],
      }),
    })
    dom.flushFrames()
    expect(graph.pick({ x: 400, y: 308 })?.key).toBe('ab')
    expect(graph.pick({ x: 400, y: 311 })).toBeNull()
    graph.update({
      definition: defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to', width: 20, widthScale: 'shrink' }),
          nodes<Item>(items, { x: 'x', y: 'y', size: 4, units: 'screen' }),
        ],
      }),
    })
    dom.flushFrames()
    expect(graph.pick({ x: 400, y: 308 })).toBeNull()
  })

  it('picks the outline of a shrinking shape on its drawn width', () => {
    const zone: { id: string; geometry: ShapeGeometry } = {
      id: 'z',
      geometry: {
        rings: [
          [
            [-400, -400],
            [400, -400],
            [400, 400],
            [-400, 400],
          ],
        ],
      },
    }
    const mountShapes = (widthScale: WidthScale) => {
      const container = document.createElement('div')
      document.body.append(container)
      const graph = createGraphHost(
        container,
        {
          definition: defineGraph({
            marks: [shapes([zone], { fill: null, strokeWidth: 20, widthScale })],
          }),
          ariaLabel: 'graph',
          initialView: { x: 0, y: 0, zoom: 0.25 },
        },
        fakeRenderer,
      )
      dom.flushFrames()
      return graph
    }
    const at = { x: 400 + 100 + 8, y: 300 }
    expect(mountShapes('screen').pick(at)?.key).toBe('z')
    expect(mountShapes('shrink').pick(at)).toBeNull()
    expect(mountShapes('shrink').pick({ x: 400 + 100 + 5, y: 300 })?.key).toBe('z')
  })
})
