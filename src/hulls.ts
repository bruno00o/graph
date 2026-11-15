import { stringCheck } from './core/key-list'
import { withoutUndefined } from './core/without-undefined'
import type {
  Hull,
  HullGroupOptions,
  HullKeysOptions,
  HullMarkOptions,
  HullOptions,
  HullStateOptions,
} from './types'

function atLeastZero(value: number | undefined, name: string): void {
  if (value !== undefined && !(value >= 0 && Number.isFinite(value))) {
    throw new RangeError(`hull: ${name} must be a finite number, 0 or more`)
  }
}

function positive(value: number | undefined, name: string): void {
  if (value !== undefined && !(value > 0 && Number.isFinite(value))) {
    throw new RangeError(`hull: ${name} must be a finite number, more than 0`)
  }
}

function checkLabel(label: HullOptions['label']): void {
  if (typeof label !== 'object' || label === null) return
  positive(label.size, 'label.size')
  atLeastZero(label.maxWidth, 'label.maxWidth')
  const weight = label.weight
  if (typeof weight === 'number' && !(weight >= 1 && weight <= 1000)) {
    throw new RangeError('hull: label.weight must be a finite number from 1 to 1000')
  }
}

const check = stringCheck()

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
  if ('nodes' in given) check(given.nodes, 'hull({ nodes })')
  atLeastZero(given.padding, 'padding')
  atLeastZero(given.strokeWidth, 'strokeWidth')
  checkLabel(given.label)
  const state = 'state' in given ? given.state : null
  const label =
    typeof given.label === 'object' && given.label !== null
      ? Object.freeze(withoutUndefined(given.label))
      : given.label
  const frozen = (label === undefined ? given : { ...given, label }) as HullOptions
  return Object.freeze({ type: 'hull', state, options: Object.freeze(frozen) })
}
