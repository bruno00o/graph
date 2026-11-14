import { toAccessor } from '../core/accessor'
import type { Accessor, Key, Mark, MarkLayer, MarkName, ShapeGeometry, ShapeMark } from '../types'

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

/** A new shape, from a drawing tool. */
export interface ShapeAddEdit {
  /** Always `'add'`. */
  readonly type: 'add'
  /** Key of the new shape. */
  readonly key: Key
  /** `name` of the mark the shape is meant for, or `undefined`. */
  readonly mark: string | undefined
  /** Outline of the new shape. */
  readonly geometry: ShapeGeometry
}

/** A shape that changes. Only the fields that change are present. */
export interface ShapeChangeEdit<M extends Mark = Mark> {
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
  readonly geometry?: ShapeGeometry
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

/**
 * A change the editor proposes to the data: `'add'`, `'change'` or `'remove'`. Narrow on `type`.
 * `M` is the union of the marks of the graph.
 */
export type ShapeEdit<M extends Mark = Mark> =
  | ShapeAddEdit
  | ShapeChangeEdit<M>
  | ShapeRemoveEdit<M>

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
   * Applies only the edits of the mark with this name. Defaults to every edit, which suits a graph
   * with one shape mark.
   */
  readonly mark?: string | undefined
  /**
   * Makes the item of a new shape. Defaults to an object with the key and geometry fields, when
   * `key` is a field name; without it, new shapes are left out.
   */
  readonly create?: ((edit: ShapeAddEdit) => T) | undefined
}

/**
 * Applies edits to an array of items and returns a new array, leaving `items` as it was. Changed
 * items are copies with the new outline; the others are the same objects.
 */
export function applyShapeEdits<T>(
  items: readonly T[],
  edits: readonly ShapeEdit[],
  fields: ShapeEditFields<T> = {},
): T[] {
  const keyField = fields.key ?? 'id'
  const keyOf = toAccessor<T, Key>(keyField)
  const geometry = fields.geometry ?? 'geometry'
  const create =
    fields.create ??
    (typeof keyField === 'string'
      ? (edit: ShapeAddEdit) => ({ [keyField]: edit.key, [geometry]: edit.geometry }) as T
      : null)
  const changed = new Map<Key, ShapeGeometry>()
  const removed = new Set<Key>()
  const added: T[] = []
  for (const edit of edits) {
    if (fields.mark !== undefined && edit.mark !== fields.mark) continue
    if (edit.type === 'add') {
      if (create) added.push(create(edit))
    } else if (edit.type === 'remove') removed.add(edit.key)
    else if (edit.geometry !== undefined) changed.set(edit.key, edit.geometry)
  }
  const next: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (removed.has(key)) continue
    const outline = changed.get(key)
    next.push(outline === undefined ? item : { ...item, [geometry]: outline })
  }
  next.push(...added)
  return next
}
