import { describe, expect, it } from 'vitest'
import type { ShapeGeometry } from '../types'
import { applyShapeEdits, type ShapeEdit } from './edits'

interface Zone {
  readonly id: string
  readonly name: string
  readonly geometry: ShapeGeometry
}

const box = (x: number): ShapeGeometry => ({ x, y: 0, width: 1, height: 1 })

const zones: Zone[] = [
  { id: 'a', name: 'A', geometry: box(0) },
  { id: 'b', name: 'B', geometry: box(2) },
  { id: 'c', name: 'C', geometry: box(4) },
]

describe('applyShapeEdits', () => {
  it('returns a new array with copies of the changed items only', () => {
    const edits: ShapeEdit[] = [
      { type: 'change', key: 'a', mark: undefined, datum: zones[0], geometry: box(10) },
      { type: 'remove', key: 'b', mark: undefined, datum: zones[1] },
      { type: 'add', key: 'd', mark: undefined, geometry: box(6) },
    ]
    const next = applyShapeEdits(zones, edits)
    expect(next).not.toBe(zones)
    expect(zones.map((zone) => zone.id)).toEqual(['a', 'b', 'c'])
    expect(next).toEqual([
      { id: 'a', name: 'A', geometry: box(10) },
      { id: 'c', name: 'C', geometry: box(4) },
      { id: 'd', geometry: box(6) },
    ])
    expect(next[1]).toBe(zones[2])
  })

  it('reads keys and writes outlines through the given fields, for one mark', () => {
    const items = [{ code: 'x', outline: box(0) }]
    const edits: ShapeEdit[] = [
      { type: 'change', key: 'x', mark: 'zones', datum: items[0], geometry: box(1) },
      { type: 'change', key: 'x', mark: 'other', datum: items[0], geometry: box(9) },
      { type: 'add', key: 'y', mark: 'zones', geometry: box(2) },
    ]
    const next = applyShapeEdits(items, edits, {
      key: (item) => item.code,
      geometry: 'outline',
      mark: 'zones',
      create: (edit) => ({ code: String(edit.key), outline: edit.geometry }),
    })
    expect(next).toEqual([
      { code: 'x', outline: box(1) },
      { code: 'y', outline: box(2) },
    ])
    expect(applyShapeEdits(items, edits, { key: (item) => item.code })).toHaveLength(1)
  })
})
