import { freeStateNames, maxFreeStates } from './core/state-names'
import type {
  GraphDefinition,
  GraphDefinitionOptions,
  InteractionOptions,
  ResolvedInteraction,
  StateStyles,
} from './types'

const defaultZoomSpeed = 1
const defaultPositionTransition = 120
const defaultLayoutTransition = 400

function resolveInteraction(options: InteractionOptions = {}): ResolvedInteraction {
  const zoom = options.zoom ?? true
  return Object.freeze({
    pan: options.pan ?? true,
    zoom:
      zoom === false
        ? false
        : Object.freeze({ speed: (zoom === true ? undefined : zoom.speed) ?? defaultZoomSpeed }),
    select: options.select ?? 'multiple',
    drag: options.drag ?? true,
    lasso: options.lasso ?? false,
    keyboard: options.keyboard ?? true,
    fold: options.fold ?? true,
  })
}

/**
 * Builds a frozen graph definition from marks, scales, states and options. The names of `states`
 * become the state names accepted by the instance.
 */
export function defineGraph<S extends string = never>(
  options: GraphDefinitionOptions<S>,
): GraphDefinition<S> {
  for (const mark of options.marks) {
    if (mark?.type !== 'nodes' && mark?.type !== 'edges') {
      throw new TypeError('defineGraph: every mark must come from nodes() or edges()')
    }
  }
  if (freeStateNames(options.states ?? {}).length > maxFreeStates) {
    throw new RangeError(
      `defineGraph: at most ${maxFreeStates} states besides selected, hovered and focused`,
    )
  }
  return Object.freeze({
    marks: Object.freeze([...options.marks]),
    scales: Object.freeze({ ...options.scales }),
    states: Object.freeze({ ...options.states }) as StateStyles<S>,
    layout: options.layout ?? null,
    interaction: resolveInteraction(options.interaction),
    transitions: Object.freeze({
      positions: Math.max(0, options.transitions?.positions ?? defaultPositionTransition),
      layout: Math.max(0, options.transitions?.layout ?? defaultLayoutTransition),
    }),
  })
}
