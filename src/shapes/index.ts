import { registerShapeEngine, type ShapeEngine } from '../core/shape-engine'
import { withoutUndefined } from '../core/without-undefined'
import { writeShapesSvg } from '../export/shape-svg'
import type {
  GraphData,
  Key,
  KeyChannel,
  LiveSource,
  MarkLayer,
  MarkName,
  ShapeMark,
  ShapeOptions,
} from '../types'
import { createShapeLayer } from '../webgl/shape-layer'
import { createShapePicker } from './pick'
import { readShape } from './read'

const engine: ShapeEngine = {
  read: readShape,
  layer: createShapeLayer,
  svg: writeShapesSvg,
  picker: createShapePicker,
}

/**
 * A mark that draws one shape per item of a live source, keyed by the `key` of its changes: it takes
 * no `key` option. Shapes draw under containers, hulls, edges and nodes.
 */
export function shapes<T, N extends MarkName = undefined, L extends MarkLayer = undefined>(
  data: LiveSource<T>,
  options?: Omit<ShapeOptions<NoInfer<T>, N, L>, 'key'>,
): ShapeMark<T, N, L>
/**
 * A mark that draws one shape per item, keyed by its `id` field unless `key` says otherwise. Shapes
 * draw under containers, hulls, edges and nodes.
 */
export function shapes<
  T extends { readonly id: Key },
  N extends MarkName = undefined,
  L extends MarkLayer = undefined,
>(data: Iterable<T>, options?: ShapeOptions<NoInfer<T>, N, L>): ShapeMark<T, N, L>
/** A mark that draws one shape per item, keyed by the `key` option. */
export function shapes<T, N extends MarkName = undefined, L extends MarkLayer = undefined>(
  data: Iterable<T>,
  options: ShapeOptions<NoInfer<T>, N, L> & { readonly key: KeyChannel<NoInfer<T>> },
): ShapeMark<T, N, L>
/**
 * A mark that draws one shape per item of a live source, with explicit type arguments: `name` and
 * `layer` are then typed as strings, not as the literals given.
 */
export function shapes<T>(
  data: LiveSource<T>,
  options?: Omit<ShapeOptions<NoInfer<T>>, 'key'>,
): ShapeMark<T, MarkName, MarkLayer>
/**
 * A mark that draws one shape per item keyed by its `id` field, with explicit type arguments:
 * `name` and `layer` are then typed as strings, not as the literals given.
 */
export function shapes<T extends { readonly id: Key }>(
  data: Iterable<T>,
  options?: ShapeOptions<NoInfer<T>>,
): ShapeMark<T, MarkName, MarkLayer>
/**
 * A mark that draws one shape per item keyed by the `key` option, with explicit type arguments:
 * `name` and `layer` are then typed as strings, not as the literals given.
 */
export function shapes<T>(
  data: Iterable<T>,
  options: ShapeOptions<NoInfer<T>> & { readonly key: KeyChannel<NoInfer<T>> },
): ShapeMark<T, MarkName, MarkLayer>
export function shapes<T>(
  data: GraphData<T>,
  options: ShapeOptions<T> = {},
): ShapeMark<T, MarkName, MarkLayer> {
  const mark: ShapeMark<T, MarkName, MarkLayer> = Object.freeze({
    type: 'shapes',
    name: options.name,
    layer: options.layer,
    data,
    options: Object.freeze(withoutUndefined(options)),
  })
  registerShapeEngine(mark, engine)
  return mark
}
