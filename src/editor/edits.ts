import { toAccessor } from '../core/accessor'
import type { Accessor, Key, Mark, MarkLayer, MarkName, ShapeGeometry, ShapeMark } from '../types'
import type { ShapeDrawTool } from './draw'

/**
 * Names of the shape marks among the marks `M`: `string` for the plain `Mark` type, and nothing for
 * marks without a name.
 */
export type ShapeMarkName<M extends Mark = Mark> = M extends {
  readonly type: 'shapes'
  readonly name: infer N extends MarkName
}
  ? Exclude<N, undefined>
  : M extends { readonly name: unknown }
    ? never
    : string

/** Items of the shape marks among the marks `M`: `unknown` for the plain `Mark` type. */
export type ShapeItem<M extends Mark = Mark> =
  M extends ShapeMark<infer T, infer _N, MarkLayer>
    ? T
    : M extends { readonly name: unknown }
      ? never
      : unknown

/**
 * A new shape: drawn, duplicated, or brought back by an undo. `M` is one shape mark for exact
 * types, or the union of the marks, where `mark` and `datum` are unions: `ShapeEdit<M>` splits that
 * union by mark. `G` is the type of the geometry: the editor hands out `WritableShapeGeometry`.
 */
export interface ShapeAddEdit<M extends Mark = Mark, G extends ShapeGeometry = ShapeGeometry> {
  /** Always `'add'`. */
  readonly type: 'add'
  /** Key of the new shape. */
  readonly key: Key
  /** `name` of the mark the shape is meant for, or `undefined`. */
  readonly mark: ShapeMarkName<M> | undefined
  /** Outline of the new shape, in world units or in degrees, as the `units` option says. */
  readonly geometry: G
  /**
   * Item the new shape copies: the original of a duplicate, or the removed item an undo brings
   * back. Absent for a drawn shape.
   */
  readonly datum?: ShapeItem<M> | undefined
  /** Tool that drew the shape. Absent for a duplicate and for an undo. */
  readonly tool?: ShapeDrawTool | undefined
  /** Text typed into a shape drawn by the text tool, or brought back by an undo. */
  readonly text?: string | undefined
}

/**
 * A shape that changes. Only the fields that change are present. `G` is the type of the geometry:
 * the editor hands out `WritableShapeGeometry`.
 */
export interface ShapeChangeEdit<M extends Mark = Mark, G extends ShapeGeometry = ShapeGeometry> {
  /** Always `'change'`. */
  readonly type: 'change'
  /** Key of the shape. */
  readonly key: Key
  /** `name` of the mark of the shape, or `undefined` for a mark without one. */
  readonly mark: ShapeMarkName<M> | undefined
  /** The item of the shape before the change. */
  readonly datum: ShapeItem<M>
  /**
   * New outline, in the format of the old one: same kind of points, the closing point of a
   * GeoJSON ring repeated, degrees for degrees, with longitudes from -180 to 180.
   */
  readonly geometry?: G | undefined
  /** New drawing order within the mark, from `raise`, `lower` or an undo of them. */
  readonly order?: number | undefined
  /** New text of the label, plain text where `\n` starts a line. */
  readonly text?: string | undefined
}

/** A shape to remove. */
export interface ShapeRemoveEdit<M extends Mark = Mark> {
  /** Always `'remove'`. */
  readonly type: 'remove'
  /** Key of the shape. */
  readonly key: Key
  /** `name` of the mark of the shape, or `undefined` for a mark without one. */
  readonly mark: ShapeMarkName<M> | undefined
  /** The item of the shape. */
  readonly datum: ShapeItem<M>
}

type EditsOfMark<M extends Mark, G extends ShapeGeometry> = M extends { readonly type: 'shapes' }
  ? ShapeAddEdit<M, G> | ShapeChangeEdit<M, G> | ShapeRemoveEdit<M>
  : never

type AddsOfMark<M extends Mark, G extends ShapeGeometry> = M extends { readonly type: 'shapes' }
  ? ShapeAddEdit<M, G>
  : never

type MarksNamed<M extends Mark, N> = M extends {
  readonly type: 'shapes'
  readonly name: infer Name
}
  ? Exclude<Name, undefined> extends N
    ? M
    : never
  : never

/**
 * A change the editor proposes to the data: `'add'`, `'change'` or `'remove'`. Narrow on `type`,
 * then on `mark`: with several shape marks, each edit carries the `datum` type of its own mark.
 * `M` is the union of the marks of the graph. `G` is the type of the geometries: the editor hands
 * out `WritableShapeGeometry`, which assigns to the draft of `collection.update` without a cast.
 */
export type ShapeEdit<M extends Mark = Mark, G extends ShapeGeometry = ShapeGeometry> = [
  EditsOfMark<M, G>,
] extends [never]
  ? ShapeAddEdit<M, G> | ShapeChangeEdit<M, G> | ShapeRemoveEdit<M>
  : EditsOfMark<M, G>

/**
 * The new shapes of the marks named `N` among the marks `M`, one type per mark. `N` is a name or a
 * union of names; without a match, the new shapes of every mark. `G` is the type of the geometry.
 */
export type ShapeAddEditOf<
  M extends Mark = Mark,
  N extends string = ShapeMarkName<M>,
  G extends ShapeGeometry = ShapeGeometry,
> = [AddsOfMark<MarksNamed<M, N>, G>] extends [never]
  ? ShapeAddEdit<M, G>
  : AddsOfMark<MarksNamed<M, N>, G>

/** Options of `applyShapeEdits`. `T` is the type of the items. */
export interface ShapeEditFields<T> {
  /**
   * Field or function that gives the key of an item, as in `shapes()`.
   * @default 'id'
   */
  readonly key?: string | Accessor<T, Key> | undefined
  /**
   * Field the outline is written to. A mark that reads its outline through a function needs its
   * own writer.
   * @default 'geometry'
   */
  readonly geometry?: string | undefined
  /**
   * Field the drawing order is written to, for the mark to read through its `order` option.
   * @default 'order'
   */
  readonly order?: string | undefined
  /**
   * Field the text is written to, for the mark to read through its `label` option.
   * @default 'text'
   */
  readonly text?: string | undefined
  /**
   * Applies only the edits of the mark with this name. Defaults to every edit, which suits a graph
   * with one shape mark.
   */
  readonly mark?: string | undefined
  /**
   * Makes the item of a new shape. Defaults, when `key` is a field name, to a copy of the item the
   * edit copies, or else to a new object, with the key and geometry fields set; without it, new
   * shapes are left out.
   */
  readonly create?: ((edit: ShapeAddEdit) => T) | undefined
}

/**
 * Applies edits to an array of items and returns a new array, leaving `items` as it was. Changed
 * items are copies with the new outline, order or text; the others are the same objects.
 */
export function applyShapeEdits<T>(
  items: readonly T[],
  edits: readonly ShapeEdit[],
  fields: ShapeEditFields<T> = {},
): T[] {
  const keyField = fields.key ?? 'id'
  const keyOf = toAccessor<T, Key>(keyField)
  const geometry = fields.geometry ?? 'geometry'
  const order = fields.order ?? 'order'
  const text = fields.text ?? 'text'
  const create =
    fields.create ??
    (typeof keyField === 'string'
      ? (edit: ShapeAddEdit) => {
          const base = typeof edit.datum === 'object' && edit.datum !== null ? edit.datum : {}
          const typed = edit.text === undefined ? {} : { [text]: edit.text }
          return { ...base, [keyField]: edit.key, [geometry]: edit.geometry, ...typed } as T
        }
      : null)
  const changed = new Map<Key, Record<string, unknown>>()
  const removed = new Set<Key>()
  const added = new Map<Key, ShapeAddEdit>()
  for (const edit of edits) {
    if (fields.mark !== undefined && edit.mark !== fields.mark) continue
    if (edit.type === 'add') {
      removed.delete(edit.key)
      changed.delete(edit.key)
      added.set(edit.key, edit)
    } else if (edit.type === 'remove') {
      if (!added.delete(edit.key)) removed.add(edit.key)
      changed.delete(edit.key)
    } else {
      const fresh = added.get(edit.key)
      if (fresh) {
        added.set(edit.key, {
          ...fresh,
          ...(edit.geometry === undefined ? {} : { geometry: edit.geometry }),
          ...(edit.text === undefined ? {} : { text: edit.text }),
        })
        continue
      }
      const fieldsOf = { ...changed.get(edit.key) }
      if (edit.geometry !== undefined) fieldsOf[geometry] = edit.geometry
      if (edit.order !== undefined) fieldsOf[order] = edit.order
      if (edit.text !== undefined) fieldsOf[text] = edit.text
      changed.set(edit.key, fieldsOf)
    }
  }
  const next: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (removed.has(key)) continue
    const update = changed.get(key)
    next.push(update === undefined ? item : { ...item, ...update })
  }
  if (create) for (const edit of added.values()) next.push(create(edit))
  return next
}
