import { toAccessor } from './core/accessor'
import { GroupIndex, GroupSource, type GroupSpec, registerGrouping } from './core/group-index'
import { isLiveSource } from './core/live-source'
import { withoutUndefined } from './core/without-undefined'
import type {
  EdgeMark,
  EdgeOptions,
  GraphData,
  GroupOptions,
  Key,
  KeyChannel,
  LiveSource,
  MarkLayer,
  MarkName,
  NodeGroup,
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
    options: Object.freeze(withoutUndefined(options)),
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
    options: Object.freeze(withoutUndefined(options)),
  })
}

interface Derived {
  readonly name: string
  readonly by: unknown
  readonly key: unknown
  readonly parent: unknown
  readonly min: number
  readonly data: readonly NodeGroup<unknown>[] | GroupSource<unknown>
  readonly index: GroupIndex<unknown>
}

const derivations = new WeakMap<object, Derived[]>()

const valueLabel = (group: NodeGroup<unknown>): string => String(group.value)

function derive(data: GraphData<unknown>, spec: GroupSpec, given: GroupOptions<unknown>): Derived {
  const list = derivations.get(data) ?? []
  const found = list.find(
    (known) =>
      known.name === spec.name &&
      Object.is(known.by, given.by) &&
      Object.is(known.key, given.key) &&
      Object.is(known.parent, given.parent) &&
      known.min === spec.min,
  )
  if (found) return found
  const common = {
    name: spec.name,
    by: given.by,
    key: given.key,
    parent: given.parent,
    min: spec.min,
  }
  let derived: Derived
  if (isLiveSource(data)) {
    const source = new GroupSource(data, spec)
    derived = { ...common, data: source, index: source.index }
  } else {
    const index = new GroupIndex<unknown>(spec)
    for (const datum of data) index.add(datum)
    index.takeMoved()
    index.takeTouched()
    derived = { ...common, data: Object.freeze(index.items()), index }
  }
  derivations.set(data, [...list.slice(-3), derived])
  return derived
}

/**
 * A mark that adds one group node per value of `by` among the items, and moves the nodes of those
 * items into it, folded at first. Put it in `marks` next to the mark of the items, and leave it
 * out to ungroup them.
 */
export function groups<T, N extends MarkName = undefined, L extends MarkLayer = undefined>(
  data: GraphData<T>,
  options: GroupOptions<NoInfer<T>, N, L>,
): NodeMark<NodeGroup<T>, N, L>
export function groups<T>(
  data: GraphData<T>,
  options: GroupOptions<T>,
): NodeMark<NodeGroup<T>, MarkName, MarkLayer> {
  const { by, key, parent, min, folded, ...look } = options as GroupOptions<unknown>
  const spec: GroupSpec = {
    name: options.name ?? (typeof by === 'function' ? '' : String(by)),
    by: toAccessor<unknown, unknown>(by),
    key: toAccessor<unknown, unknown>(key ?? 'id'),
    parent: parent === undefined ? null : toAccessor<unknown, unknown>(parent),
    min: min !== undefined && Number.isFinite(min) ? Math.max(1, Math.floor(min)) : 1,
  }
  const derived = derive(data as GraphData<unknown>, spec, options as GroupOptions<unknown>)
  const mark = Object.freeze({
    type: 'nodes',
    name: options.name,
    layer: options.layer,
    data: derived.data,
    options: Object.freeze(
      withoutUndefined({
        label: valueLabel,
        ...withoutUndefined(look),
        key: 'key',
        parent: parent === undefined ? undefined : 'parent',
      }),
    ),
  }) as NodeMark<NodeGroup<T>, MarkName, MarkLayer>
  registerGrouping(mark, { index: derived.index, folded: folded !== false })
  return mark
}
