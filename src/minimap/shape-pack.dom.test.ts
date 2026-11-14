import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { noColor } from '../core/columns'
import { defineGraph } from '../define-graph'
import { internalsOf } from '../host/internals'
import { createGraphHost } from '../host/mount-graph'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Mark, ShapeGeometry } from '../types'
import { packShapes } from './shape-pack'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly node?: string
}

let dom: FakeDom

function storeOf(marks: readonly Mark[]) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: defineGraph({ marks, states: { gone: { hide: true } } }), ariaLabel: 'graph' },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  const internals = internalsOf(graph, 'test')
  return { graph, internals }
}

function star(points: number, x: number, radius: number): ShapeGeometry {
  return {
    rings: [
      Array.from({ length: points }, (_, k) => {
        const angle = (k / points) * Math.PI * 2
        return [x + Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number]
      }),
    ],
  }
}

const area = { width: 200, height: 150, maxPoints: 200_000 }

describe('packShapes', () => {
  beforeEach(() => {
    dom = installDom(400, 200)
  })

  afterEach(() => {
    dom.restore()
  })

  it('packs shapes in draw order, round ones as polygons and large ones simplified', () => {
    const zones: Zone[] = [
      { id: 'detailed', geometry: star(2000, 0, 1000) },
      { id: 'disc', geometry: { center: { x: 3000, y: 0 }, radius: 400, inner: 200 } },
      { id: 'card', geometry: { x: 4000, y: 0, width: 600, height: 300, cornerRadius: 100 } },
      { id: 'speck', geometry: star(40, 5000, 1) },
    ]
    const { internals } = storeOf([shapes(zones)])
    const packed = packShapes(internals.scene.shapes, internals.positions, internals.sight(), area)
    expect(packed?.count).toBe(4)
    const ringsOf = (shape: number) => [
      packed?.firstRing[shape] ?? 0,
      packed?.firstRing[shape + 1] ?? 0,
    ]
    const pointsOf = (shape: number) => {
      const [from = 0, to = 0] = ringsOf(shape)
      const start = from === 0 ? 0 : (packed?.rings[from - 1] ?? 0)
      return (packed?.rings[to - 1] ?? 0) - start
    }
    expect(pointsOf(0)).toBeLessThan(2000)
    expect(pointsOf(0)).toBeGreaterThanOrEqual(64)
    const [discFrom = 0, discTo = 0] = ringsOf(1)
    expect(discTo - discFrom).toBe(2)
    expect(pointsOf(1)).toBeGreaterThanOrEqual(16)
    expect(pointsOf(2)).toBeGreaterThan(4)
    expect(pointsOf(3)).toBe(4)
    expect(packed?.fill[0]).not.toBe(noColor)
  })

  it('keeps one point per pixel of the minimap', () => {
    const zones: Zone[] = [{ id: 'z', geometry: star(1000, 0, 100) }]
    const { internals } = storeOf([shapes(zones)])
    const packed = packShapes(internals.scene.shapes, internals.positions, internals.sight(), {
      ...area,
      width: 100,
      height: 100,
    })
    const points = (packed?.points.length ?? 0) / 2
    expect(points).toBeGreaterThan(100)
    expect(points).toBeLessThan(400)
  })

  it('draws the shapes past the budget as their boxes, and none at 0', () => {
    const zones: Zone[] = Array.from({ length: 4 }, (_, k) => ({
      id: `z${k}`,
      geometry: star(100, k * 300, 100),
    }))
    const { internals } = storeOf([shapes(zones)])
    const read = (maxPoints: number) =>
      packShapes(internals.scene.shapes, internals.positions, internals.sight(), {
        width: 20_000,
        height: 15_000,
        maxPoints,
      })
    expect(read(1_000)?.points.length).toBe(400 * 2)
    expect(read(150)?.points.length).toBe((100 + 100 + 4 + 4) * 2)
    expect(read(0)).toBeNull()
  })

  it('keeps pinned shapes around their node and hidden shapes for the frame only', () => {
    const zones: Zone[] = [
      { id: 'pin', geometry: { center: { x: 0, y: 0 }, radius: 50 }, node: 'a' },
      { id: 'away', geometry: { x: 500, y: 500, width: 100, height: 100 }, node: 'missing' },
      { id: 'hidden', geometry: { x: -500, y: 0, width: 100, height: 100 } },
    ]
    const { graph, internals } = storeOf([
      shapes(zones, { node: 'node' }),
      nodes([{ id: 'a', x: 100, y: 100 }], { x: 'x', y: 'y' }),
    ])
    graph.states.set('gone', { nodes: [], edges: [], shapes: ['hidden'] })
    dom.flushFrames()
    const packed = packShapes(internals.scene.shapes, internals.positions, internals.sight(), area)
    expect(packed?.count).toBe(2)
    expect(packed?.node[0]).toBe(internals.scene.nodes.alive.indexOf(1))
    expect(Array.from(packed?.boxes.slice(0, 4) ?? [])).toEqual([-50, -50, 50, 50])
    expect(packed?.shown[1]).toBe(0)
    expect(packed?.firstRing[2]).toBe(packed?.firstRing[1])
  })
})
