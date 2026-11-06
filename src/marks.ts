import type {
  EdgeMark,
  EdgeOptions,
  GraphData,
  Key,
  KeyChannel,
  LiveSource,
  NodeMark,
  NodeOptions,
} from './types'

/** A mark that draws one node per item of a live source, keyed by its changes. */
export function nodes<T>(data: LiveSource<T>, options?: NodeOptions<NoInfer<T>>): NodeMark<T>
/** A mark that draws one node per item, keyed by its `id` field unless `key` says otherwise. */
export function nodes<T extends { readonly id: Key }>(
  data: Iterable<T>,
  options?: NodeOptions<NoInfer<T>>,
): NodeMark<T>
/** A mark that draws one node per item, keyed by the `key` option. */
export function nodes<T>(
  data: Iterable<T>,
  options: NodeOptions<NoInfer<T>> & { readonly key: KeyChannel<NoInfer<T>> },
): NodeMark<T>
export function nodes<T>(data: GraphData<T>, options: NodeOptions<T> = {}): NodeMark<T> {
  return Object.freeze({ type: 'nodes', data, options: Object.freeze({ ...options }) })
}

/**
 * A mark that draws one edge per item of a live source, keyed by its changes. An edge waits until
 * both of its ends exist.
 */
export function edges<T>(data: LiveSource<T>, options: EdgeOptions<NoInfer<T>>): EdgeMark<T>
/**
 * A mark that draws one edge per item, keyed by its `id` field unless `key` says otherwise. An edge
 * waits until both of its ends exist.
 */
export function edges<T extends { readonly id: Key }>(
  data: Iterable<T>,
  options: EdgeOptions<NoInfer<T>>,
): EdgeMark<T>
/**
 * A mark that draws one edge per item, keyed by the `key` option. An edge waits until both of its
 * ends exist.
 */
export function edges<T>(
  data: Iterable<T>,
  options: EdgeOptions<NoInfer<T>> & { readonly key: KeyChannel<NoInfer<T>> },
): EdgeMark<T>
export function edges<T>(data: GraphData<T>, options: EdgeOptions<T>): EdgeMark<T> {
  return Object.freeze({ type: 'edges', data, options: Object.freeze({ ...options }) })
}
