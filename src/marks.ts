import type {
  EdgeMark,
  EdgeOptions,
  GraphData,
  Key,
  KeyChannel,
  LiveSource,
  MarkLayer,
  MarkName,
  NodeMark,
  NodeOptions,
} from './types'

/** A mark that draws one node per item of a live source, keyed by its changes. */
export function nodes<T, N extends MarkName = undefined, L extends MarkLayer = undefined>(
  data: LiveSource<T>,
  options?: NodeOptions<NoInfer<T>, N, L>,
): NodeMark<T, N, L>
/** A mark that draws one node per item, keyed by its `id` field unless `key` says otherwise. */
export function nodes<
  T extends { readonly id: Key },
  N extends MarkName = undefined,
  L extends MarkLayer = undefined,
>(data: Iterable<T>, options?: NodeOptions<NoInfer<T>, N, L>): NodeMark<T, N, L>
/** A mark that draws one node per item, keyed by the `key` option. */
export function nodes<T, N extends MarkName = undefined, L extends MarkLayer = undefined>(
  data: Iterable<T>,
  options: NodeOptions<NoInfer<T>, N, L> & { readonly key: KeyChannel<NoInfer<T>> },
): NodeMark<T, N, L>
export function nodes<T>(
  data: GraphData<T>,
  options: NodeOptions<T> = {},
): NodeMark<T, MarkName, MarkLayer> {
  return Object.freeze({
    type: 'nodes',
    name: options.name,
    layer: options.layer,
    data,
    options: Object.freeze({ ...options }),
  })
}

/**
 * A mark that draws one edge per item of a live source, keyed by its changes. An edge waits until
 * both of its ends exist.
 */
export function edges<T, N extends MarkName = undefined, L extends MarkLayer = undefined>(
  data: LiveSource<T>,
  options: EdgeOptions<NoInfer<T>, N, L>,
): EdgeMark<T, N, L>
/**
 * A mark that draws one edge per item, keyed by its `id` field unless `key` says otherwise. An edge
 * waits until both of its ends exist.
 */
export function edges<
  T extends { readonly id: Key },
  N extends MarkName = undefined,
  L extends MarkLayer = undefined,
>(data: Iterable<T>, options: EdgeOptions<NoInfer<T>, N, L>): EdgeMark<T, N, L>
/**
 * A mark that draws one edge per item, keyed by the `key` option. An edge waits until both of its
 * ends exist.
 */
export function edges<T, N extends MarkName = undefined, L extends MarkLayer = undefined>(
  data: Iterable<T>,
  options: EdgeOptions<NoInfer<T>, N, L> & { readonly key: KeyChannel<NoInfer<T>> },
): EdgeMark<T, N, L>
export function edges<T>(
  data: GraphData<T>,
  options: EdgeOptions<T>,
): EdgeMark<T, MarkName, MarkLayer> {
  return Object.freeze({
    type: 'edges',
    name: options.name,
    layer: options.layer,
    data,
    options: Object.freeze({ ...options }),
  })
}
