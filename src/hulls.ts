import { withoutUndefined } from './core/without-undefined'
import type {
  Hull,
  HullGroupOptions,
  HullKeysOptions,
  HullMarkOptions,
  HullOptions,
  HullStateOptions,
} from './types'

/** Draws one hull per value of `by`, around the nodes of a mark that share it. */
export function hull<T>(options: HullGroupOptions<T>): Hull<never>
/** Draws a hull around every node of a mark. */
export function hull<T>(options: HullMarkOptions<T>): Hull<never>
/** Draws a hull around the nodes in a state, and follows the state as it changes. */
export function hull<const N extends string>(options: HullStateOptions<N>): Hull<N>
/** Draws a hull around the nodes of a list of keys. */
export function hull(options: HullKeysOptions): Hull<never>
export function hull(options: HullOptions): Hull {
  const given = withoutUndefined(options)
  const state = 'state' in given ? given.state : null
  return Object.freeze({ type: 'hull', state, options: Object.freeze(given) })
}
