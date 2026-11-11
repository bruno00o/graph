import { describe, expect, it } from 'vitest'
import { createGraphModel } from '../core/graph-model'
import { Positions } from '../core/positions'
import { createScene } from '../core/scene'
import type { ShapePickQuery } from '../core/shape-engine'
import { defineGraph } from '../define-graph'
import type { Mark, ShapeGeometry } from '../types'
import { shapes } from './index'
import { createShapePicker } from './pick'

type Zone = { id: string; geometry: ShapeGeometry; rank?: number }

function setup(marks: readonly Mark[]) {
  const model = createGraphModel()
  const scene = createScene()
  const definition = defineGraph({ marks })
  model.setMarks(definition.marks)
  scene.setDefinition(definition)
  scene.apply(model, model.flush())
  const store = scene.shapes
  const positions = new Positions()
  const picker = createShapePicker(store, positions)
  const keyAt = (index: number) => (index < 0 ? null : (store.keys[index] ?? null))
  const query = (x: number, y: number, more: Partial<ShapePickQuery> = {}): ShapePickQuery => ({
    x,
    y,
    scale: 1,
    tolerance: 4,
    current: true,
    shown: () => true,
    raised: () => false,
    ...more,
  })
  const pick = (x: number, y: number, more: Partial<ShapePickQuery> = {}) =>
    keyAt(picker.pick(query(x, y, more)))
  const inside = (polygon: readonly [number, number][]) =>
    picker
      .inside(
        polygon.map(([x, y]) => ({ x, y })),
        () => true,
      )
      .map(keyAt)
  return { model, scene, store, picker, pick, inside, positions }
}

const square = (id: string, x: number, y: number, size: number): Zone => ({
  id,
  geometry: { x, y, width: size, height: size },
})

describe('the shape picker', () => {
  it('tests fills with the even-odd rule over every ring, holes included', () => {
    const { pick } = setup([
      shapes([
        {
          id: 'donut',
          geometry: {
            rings: [
              [
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
              ],
              [
                [30, 30],
                [70, 30],
                [70, 70],
                [30, 70],
              ],
            ],
          },
        },
      ]),
    ])
    expect(pick(10, 10)).toBe('donut')
    expect(pick(50, 50)).toBeNull()
    expect(pick(31, 50)).toBe('donut')
    expect(pick(-10, 50)).toBeNull()
  })

  it('reaches strokes by half their width plus the tolerance, in screen pixels', () => {
    const { pick } = setup([
      shapes(
        [
          {
            id: 'path',
            geometry: {
              points: [
                [0, 0],
                [100, 0],
                [100, 100],
              ],
            },
          },
        ],
        { strokeWidth: 10 },
      ),
    ])
    expect(pick(50, 8)).toBe('path')
    expect(pick(50, 10)).toBeNull()
    expect(pick(50, 4, { scale: 2 })).toBe('path')
    expect(pick(50, 5, { scale: 2 })).toBeNull()
    expect(pick(50, 50)).toBeNull()
    expect(pick(0, 100)).toBeNull()
  })

  it('picks rounded rectangles and rings by their exact outline', () => {
    const { pick } = setup([
      shapes(
        [
          { id: 'rounded', geometry: { x: 0, y: 0, width: 100, height: 100, cornerRadius: 40 } },
          { id: 'ring', geometry: { center: [300, 50], radius: 50, inner: 20 } },
        ],
        { stroke: null },
      ),
    ])
    expect(pick(50, 50)).toBe('rounded')
    expect(pick(3, 3)).toBeNull()
    expect(pick(15, 15)).toBe('rounded')
    expect(pick(300, 50)).toBeNull()
    expect(pick(300, 15)).toBe('ring')
    expect(pick(300, -2)).toBeNull()
  })

  it('finds shapes that span many cells, and prefers the last drawn, then the raised', () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      square(`s${i}`, (i % 20) * 20, Math.floor(i / 20) * 20, 5),
    )
    const { pick, store } = setup([
      shapes([...many, { ...square('wide', -50, -50, 500), rank: -1 }], { order: 'rank' }),
    ])
    expect(pick(2, 2)).toBe('s0')
    expect(pick(12, 12)).toBe('wide')
    expect(pick(397, 397)).toBe('wide')
    const wide = store.keys.indexOf('wide')
    expect(pick(2, 2, { raised: (index) => index === wide })).toBe('wide')
    expect(pick(2, 2, { shown: (index) => index === wide })).toBe('wide')
  })

  it('leaves out shapes with pick false, and fills of stroke-only shapes', () => {
    const { pick } = setup([
      shapes([square('ghost', 0, 0, 100)], { pick: false }),
      shapes([square('frame', 200, 0, 100)], { pick: 'stroke' }),
      shapes([square('bare', 400, 0, 100)], { fill: null }),
      shapes([square('blank', 600, 0, 100)], { fill: null, strokeWidth: 0 }),
    ])
    expect(pick(50, 50)).toBeNull()
    expect(pick(250, 50)).toBeNull()
    expect(pick(250, 1)).toBe('frame')
    expect(pick(450, 50)).toBeNull()
    expect(pick(400, 50)).toBe('bare')
    expect(pick(600, 50)).toBeNull()
  })

  it('rebuilds after a change of geometry or style', () => {
    const { model, scene, pick } = setup([shapes([square('a', 0, 0, 10)])])
    expect(pick(5, 5)).toBe('a')
    const definition = defineGraph({ marks: [shapes([square('a', 100, 0, 10)])] })
    model.setMarks(definition.marks)
    scene.setDefinition(definition)
    scene.apply(model, model.flush())
    expect(pick(5, 5)).toBeNull()
    expect(pick(105, 5)).toBe('a')
  })

  it('lists the shapes wholly inside a polygon', () => {
    const { inside } = setup([
      shapes([
        square('in', 10, 10, 10),
        square('across', 45, 10, 10),
        { id: 'disc', geometry: { center: [30, 40], radius: 5 } },
        { id: 'big', geometry: { center: [30, 40], radius: 30 } },
      ]),
    ])
    expect(
      inside([
        [0, 0],
        [50, 0],
        [50, 50],
        [0, 50],
      ]),
    ).toEqual(['in', 'disc'])
  })
})
