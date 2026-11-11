import { registerShapeEngine, type ShapeEngine } from '../core/shape-engine'
import { withoutUndefined } from '../core/without-undefined'
import { writeShapesSvg } from '../export/shape-svg'
import type {
  GraphData,
  Key,
  KeyChannel,
  LiveSource,
  MarkName,
  ShapeMark,
  ShapeOptions,
} from '../types'
import { createShapeLayer } from '../webgl/shape-layer'
import { readShape } from './read'

const engine: ShapeEngine = { read: readShape, layer: createShapeLayer, svg: writeShapesSvg }

/**
 * A mark that draws one shape per item of a live source, keyed by the `key` of its changes: it takes
 * no `key` option. Shapes draw under containers, hulls, edges and nodes.
 */
export function shapes<T, N extends MarkName = undefined>(
  data: LiveSource<T>,
  options?: Omit<ShapeOptions<NoInfer<T>, N>, 'key'>,
): ShapeMark<T, N>
/**
 * A mark that draws one shape per item, keyed by its `id` field unless `key` says otherwise. Shapes
 * draw under containers, hulls, edges and nodes.
 */
export function shapes<T extends { readonly id: Key }, N extends MarkName = undefined>(
  data: Iterable<T>,
  options?: ShapeOptions<NoInfer<T>, N>,
): ShapeMark<T, N>
/** A mark that draws one shape per item, keyed by the `key` option. */
export function shapes<T, N extends MarkName = undefined>(
  data: Iterable<T>,
  options: ShapeOptions<NoInfer<T>, N> & { readonly key: KeyChannel<NoInfer<T>> },
): ShapeMark<T, N>
/**
 * A mark that draws one shape per item of a live source, with explicit type arguments: `name` is
 * then typed as a string, not as the literal given.
 */
export function shapes<T>(
  data: LiveSource<T>,
  options?: Omit<ShapeOptions<NoInfer<T>>, 'key'>,
): ShapeMark<T, MarkName>
/**
 * A mark that draws one shape per item keyed by its `id` field, with explicit type arguments:
 * `name` is then typed as a string, not as the literal given.
 */
export function shapes<T extends { readonly id: Key }>(
  data: Iterable<T>,
  options?: ShapeOptions<NoInfer<T>>,
): ShapeMark<T, MarkName>
/**
 * A mark that draws one shape per item keyed by the `key` option, with explicit type arguments:
 * `name` is then typed as a string, not as the literal given.
 */
export function shapes<T>(
  data: Iterable<T>,
  options: ShapeOptions<NoInfer<T>> & { readonly key: KeyChannel<NoInfer<T>> },
): ShapeMark<T, MarkName>
export function shapes<T>(
  data: GraphData<T>,
  options: ShapeOptions<T> = {},
): ShapeMark<T, MarkName> {
  const mark: ShapeMark<T, MarkName> = Object.freeze({
    type: 'shapes',
    name: options.name,
    layer: undefined,
    data,
    options: Object.freeze(withoutUndefined(options)),
  })
  registerShapeEngine(mark, engine)
  return mark
}
