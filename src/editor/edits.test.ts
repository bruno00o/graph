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
  it('copies the item of an add, writes orders, and folds edits of the same key', () => {
    const edits: ShapeEdit[] = [
      { type: 'add', key: 'd', mark: undefined, geometry: box(8), datum: zones[0] },
      { type: 'change', key: 'd', mark: undefined, datum: undefined, geometry: box(9) },
      { type: 'change', key: 'c', mark: undefined, datum: zones[2], order: 3 },
      { type: 'add', key: 'e', mark: undefined, geometry: box(1) },
      { type: 'remove', key: 'e', mark: undefined, datum: undefined },
    ]
    expect(applyShapeEdits(zones, edits, { order: 'rank' })).toEqual([
      zones[0],
      zones[1],
      { id: 'c', name: 'C', geometry: box(4), rank: 3 },
      { id: 'd', name: 'A', geometry: box(9) },
    ])
  })

  it('writes the text of adds and changes to the text field', () => {
    const edits: ShapeEdit[] = [
      { type: 'add', key: 'd', mark: undefined, geometry: box(8), tool: 'text', text: 'one' },
      { type: 'change', key: 'd', mark: undefined, datum: undefined, text: 'two' },
      { type: 'change', key: 'a', mark: undefined, datum: zones[0], text: 'three' },
    ]
    expect(applyShapeEdits(zones, edits, { text: 'note' })).toEqual([
      { ...zones[0], note: 'three' },
      zones[1],
      zones[2],
      { id: 'd', geometry: box(8), note: 'two' },
    ])
  })
})

describe('applyShapeEdits over edits of several batches', () => {
  it('keeps one item when a shape is removed, then added back by an undo', () => {
    const before: ShapeGeometry = { x: 0, y: 0, width: 10, height: 10 }
    const moved: ShapeGeometry = { x: 50, y: 0, width: 10, height: 10 }
    const items: Zone[] = [{ id: 'k', name: 'k', geometry: before }]
    const edits: ShapeEdit[] = [
      { type: 'change', key: 'k', mark: undefined, datum: items[0], geometry: moved },
      { type: 'remove', key: 'k', mark: undefined, datum: items[0] },
      {
        type: 'add',
        key: 'k',
        mark: undefined,
        geometry: moved,
        datum: { id: 'k', name: 'k', geometry: moved },
      },
    ]
    const next = applyShapeEdits(items, edits)
    expect(next.filter((zone) => zone.id === 'k')).toHaveLength(1)
    expect(next.find((zone) => zone.id === 'k')?.geometry).toEqual(moved)
  })
})
