import { createCollection, localOnlyCollectionOptions, type WritableDeep } from '@tanstack/db'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Mark, ShapeGeometry, WritableShapeGeometry } from '../types'
import { applyShapeEdits, type ShapeAddEdit, type ShapeChangeEdit, type ShapeEdit } from './edits'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
}

type Handed = ShapeEdit<Mark, WritableShapeGeometry>

const zones = createCollection(
  localOnlyCollectionOptions<Zone, string>({
    id: 'writable-geometry',
    getKey: (zone) => zone.id,
    initialData: [{ id: 'a', geometry: { x: 0, y: 0, width: 1, height: 1 } }],
  }),
)

function save(edit: Handed): void {
  if (edit.type !== 'change' || edit.geometry === undefined) return
  const geometry = edit.geometry
  zones.update(String(edit.key), (draft) => {
    draft.geometry = geometry
  })
}

function keep(edit: Handed): ShapeGeometry | undefined {
  if (edit.type === 'remove') return undefined
  const geometry: ShapeGeometry | undefined = edit.geometry
  return geometry
}

describe('writable geometry of edits', () => {
  it('assigns to the draft of a TanStack DB collection without a cast', () => {
    save({
      type: 'change',
      key: 'a',
      mark: undefined,
      datum: undefined,
      geometry: { x: 5, y: 0, width: 1, height: 1 },
    })
    expect(zones.get('a')?.geometry).toEqual({ x: 5, y: 0, width: 1, height: 1 })
    const added: Handed = {
      type: 'add',
      key: 'b',
      mark: undefined,
      geometry: { x: 1, y: 1, width: 2, height: 2 },
    }
    expect(keep(added)).toEqual({ x: 1, y: 1, width: 2, height: 2 })
  })

  it('is what a draft holds, and a ShapeGeometry still does not assign to it', () => {
    expectTypeOf<WritableShapeGeometry>().toEqualTypeOf<WritableDeep<ShapeGeometry>>()
    expectTypeOf<WritableShapeGeometry>().toExtend<ShapeGeometry>()
    expectTypeOf<ShapeGeometry>().not.toExtend<WritableShapeGeometry>()
    const check = (draft: WritableDeep<Zone>, read: ShapeGeometry) => {
      // @ts-expect-error
      draft.geometry = read
    }
    expect(check).toBeTypeOf('function')
  })

  it('keeps the edit types constructible from a ShapeGeometry, and applies handed edits', () => {
    const square: ShapeGeometry = { x: 0, y: 0, width: 4, height: 4 }
    const edits: ShapeEdit[] = [
      { type: 'add', key: 'n', mark: undefined, geometry: square },
      { type: 'change', key: 'a', mark: undefined, datum: undefined, geometry: square },
    ]
    const handed: Handed[] = [
      {
        type: 'change',
        key: 'a',
        mark: undefined,
        datum: undefined,
        geometry: { x: 9, y: 9, width: 1, height: 1 },
      },
    ]
    const widened: ShapeEdit[] = handed
    expect(widened).toHaveLength(1)
    expectTypeOf<ShapeAddEdit['geometry']>().toEqualTypeOf<ShapeGeometry>()
    expectTypeOf<ShapeChangeEdit['geometry']>().toEqualTypeOf<ShapeGeometry | undefined>()
    const next = applyShapeEdits<Zone>([{ id: 'a', geometry: square }], [...edits, ...handed], {
      create: (edit) => ({ id: String(edit.key), geometry: edit.geometry }),
    })
    expect(next.map((zone) => zone.id)).toEqual(['a', 'n'])
    expect(next[0]?.geometry).toEqual({ x: 9, y: 9, width: 1, height: 1 })
  })
})
