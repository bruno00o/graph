import type { Collection } from '@tanstack/db'
import { describe, expectTypeOf, it } from 'vitest'
import { persistShapes } from '../db'
import type { Mark, NodeMark, ShapeMark, WritableShapeGeometry } from '../types'
import type { ShapeEditor } from './editor'
import type {
  ShapeAddEdit,
  ShapeAddEditOf,
  ShapeChangeEdit,
  ShapeEdit,
  ShapeRemoveEdit,
} from './edits'

interface Zone {
  readonly id: string
  readonly label: string
}

interface Note {
  readonly id: string
  readonly text: string
}

interface Item {
  readonly id: string
}

type Zones = ShapeMark<Zone, 'zones'>
type Notes = ShapeMark<Note, 'notes'>
type Marks = Zones | Notes | NodeMark<Item, 'items'>
type Everything = ShapeAddEdit<Marks> | ShapeChangeEdit<Marks> | ShapeRemoveEdit<Marks>

declare const editor: ShapeEditor<Marks>
declare const zones: Collection<Zone, string>

function narrows(edit: ShapeEdit<Marks>): void {
  if (edit.type === 'add' && edit.mark === 'zones') {
    expectTypeOf(edit.datum).toEqualTypeOf<Zone | undefined>()
  }
  if (edit.type === 'add' && edit.mark === 'notes') {
    expectTypeOf(edit.datum).toEqualTypeOf<Note | undefined>()
  }
  if (edit.type === 'change' && edit.mark === 'notes') {
    expectTypeOf(edit.datum).toEqualTypeOf<Note>()
  }
  if (edit.type === 'remove' && edit.mark === 'zones') {
    expectTypeOf(edit.datum.label).toEqualTypeOf<string>()
  }
  expectTypeOf(edit.type).toEqualTypeOf<'add' | 'change' | 'remove'>()
}

function refuses(edit: ShapeEdit<Marks>): void {
  if (edit.type === 'add' && edit.mark === 'zones') {
    // @ts-expect-error
    edit.datum?.text
  }
}

describe('shape edit types', () => {
  it('narrow the item of an edit by the mark', () => {
    expectTypeOf(narrows).toBeFunction()
  })

  it('refuse a field of another mark', () => {
    expectTypeOf(refuses).toBeFunction()
  })

  it('keep the types of a union of marks for code written before', () => {
    expectTypeOf<ShapeAddEdit<Marks>['datum']>().toEqualTypeOf<Zone | Note | undefined>()
    expectTypeOf<ShapeAddEdit<Marks>['mark']>().toEqualTypeOf<'zones' | 'notes' | undefined>()
    expectTypeOf<ShapeEdit<Marks>>().toExtend<Everything>()
    expectTypeOf<ShapeEdit<Marks>>().toExtend<ShapeEdit>()
    expectTypeOf<ShapeEdit>().toEqualTypeOf<ShapeAddEdit | ShapeChangeEdit | ShapeRemoveEdit>()
    expectTypeOf<ShapeEdit<NodeMark<Item, 'items'>>>().toEqualTypeOf<
      | ShapeAddEdit<NodeMark<Item, 'items'>>
      | ShapeChangeEdit<NodeMark<Item, 'items'>>
      | ShapeRemoveEdit<NodeMark<Item, 'items'>>
    >()
    expectTypeOf<ShapeEdit<Mark>>().toEqualTypeOf<ShapeEdit>()
  })

  it('accept an edit of one mark where the union is expected, and back', () => {
    const wide: ShapeAddEdit<Marks> = {
      type: 'add',
      key: 'k',
      mark: 'zones',
      geometry: {} as never,
    }
    expectTypeOf(wide).toExtend<ShapeAddEdit>()
    const narrow: ShapeEdit<Marks> = {
      type: 'add',
      key: 'k',
      mark: 'zones',
      geometry: {} as never,
    }
    expectTypeOf(narrow).toExtend<Everything>()
  })

  it('narrow the edits with a writable geometry too', () => {
    const writable = (edit: ShapeEdit<Marks, WritableShapeGeometry>): void => {
      if (edit.type === 'add' && edit.mark === 'notes') {
        expectTypeOf(edit.datum).toEqualTypeOf<Note | undefined>()
        expectTypeOf(edit.geometry).toEqualTypeOf<WritableShapeGeometry>()
      }
    }
    expectTypeOf(writable).toBeFunction()
    expectTypeOf<ShapeEdit<Marks, WritableShapeGeometry>>().toExtend<ShapeEdit<Marks>>()
  })

  it('give the new shapes of the marks with the name', () => {
    expectTypeOf<ShapeAddEditOf<Marks, 'zones'>['datum']>().toEqualTypeOf<Zone | undefined>()
    expectTypeOf<ShapeAddEditOf<Marks, 'zones' | 'notes'>['datum']>().toEqualTypeOf<
      Zone | Note | undefined
    >()
    expectTypeOf<ShapeAddEditOf<Marks>>().toEqualTypeOf<ShapeAddEditOf<Marks, 'zones' | 'notes'>>()
  })

  it('narrow the edits that persistShapes creates rows for by its mark', () => {
    const write = (): void => {
      persistShapes(editor, {
        collection: zones,
        mark: 'zones',
        create: (add) => {
          expectTypeOf(add.datum).toEqualTypeOf<Zone | undefined>()
          expectTypeOf(add.geometry).toEqualTypeOf<WritableShapeGeometry>()
          return { id: String(add.key), label: add.datum?.label ?? '' }
        },
      })
      persistShapes(editor, {
        collection: zones,
        create: (add) => {
          expectTypeOf(add.datum).toEqualTypeOf<Zone | Note | undefined>()
          return { id: String(add.key), label: '' }
        },
      })
    }
    expectTypeOf(write).toBeFunction()
  })
})
